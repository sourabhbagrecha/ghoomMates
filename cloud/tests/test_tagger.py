"""Gemini photo tagging with fakes for HTTP, credentials and the daily budget. No network, no database."""

from __future__ import annotations

import base64
import io
import json
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image
from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError

from faces.config import Settings
from faces.pipeline import prepare
from faces.tagger import (
    BUDGET_KEY, Tagger, ist_day, jpeg_for_tags, normalise_tags, parse_response, take_daily, vertex_url,
)
from tests.conftest import jpeg_bytes

ON = Settings(vertex_project="proj-1")


def gemini_reply(payload, thought: str | None = None) -> str:
    parts = [{"text": "thinking...", "thought": True}] if thought else []
    parts.append({"text": payload if isinstance(payload, str) else json.dumps(payload)})
    return json.dumps({"candidates": [{"content": {"role": "model", "parts": parts}, "finishReason": "STOP"}]})


class FakePost:
    def __init__(self, status=200, text=None, error: Exception | None = None):
        self.status, self.error = status, error
        self.text = text if text is not None else gemini_reply({"caption": "Friends on a beach.", "tags": ["beach"]})
        self.calls: list[tuple] = []

    def __call__(self, url, headers, body, timeout):
        self.calls.append((url, headers, body, timeout))
        if self.error:
            raise self.error
        return self.status, self.text


def tagger(settings=ON, post=None, take=lambda: True, token=lambda: "tok-123"):
    return Tagger(settings, post=post or FakePost(), token=token, take=take)


def test_tags_and_caption_are_parsed_and_normalised():
    post = FakePost(text=gemini_reply({
        "caption": "  A group  dances at a haldi ceremony in a courtyard. " + "x" * 300,
        "tags": ["Haldi", "dancing ", "haldi", "", "  ", "y" * 41, 7, "Courtyard"] + [f"tag {i}" for i in range(20)],
    }, thought="..."))
    result = tagger(post=post).tag(b"jpeg")
    assert result.status == "tagged" and result.error is None
    assert result.caption.startswith("A group dances at a haldi ceremony in a courtyard. xxx")
    assert len(result.caption) == 200
    assert result.tags[:3] == ["haldi", "dancing", "courtyard"]
    assert len(result.tags) == 15


def test_request_matches_the_backends_vertex_call():
    post = FakePost()
    tagger(post=post).tag(b"\xff\xd8jpeg")
    ((url, headers, body, timeout),) = post.calls
    assert url == ("https://aiplatform.googleapis.com/v1/projects/proj-1/locations/global/publishers/google/models/"
                   "gemini-3.5-flash-lite:generateContent")
    assert headers["Authorization"] == "Bearer tok-123"
    assert timeout == 30
    image, prompt = body["contents"][0]["parts"]
    assert image["inlineData"] == {"mimeType": "image/jpeg", "data": base64.b64encode(b"\xff\xd8jpeg").decode()}
    assert "never guess who anyone is" in prompt["text"]
    config = body["generationConfig"]
    assert config["responseMimeType"] == "application/json" and config["temperature"] == 0.2
    assert config["responseSchema"]["required"] == ["caption", "tags"]
    assert config["thinkingConfig"] == {"thinkingLevel": "minimal"}


def test_regional_vertex_host():
    s = Settings(vertex_project="p", vertex_location="asia-south1", tags_model="gemini-2.5-flash-lite")
    assert vertex_url(s) == ("https://asia-south1-aiplatform.googleapis.com/v1/projects/p/locations/asia-south1/"
                             "publishers/google/models/gemini-2.5-flash-lite:generateContent")


def test_spent_budget_skips_without_calling_gemini():
    post = FakePost()
    result = tagger(post=post, take=lambda: False).tag(b"jpeg")
    assert result.status == "skipped" and "budget" in result.error
    assert post.calls == []


def test_tagging_off_without_a_vertex_project():
    post, taken = FakePost(), []
    result = tagger(Settings(), post=post, take=lambda: taken.append(1) or True).tag(b"jpeg")
    assert result.status == "skipped" and post.calls == [] and taken == []
    assert Settings(vertex_project="p", tags_enabled=False).tagging is False
    assert Settings.from_env({"VERTEX_PROJECT": "p"}).tagging is True


@pytest.mark.parametrize("post, message", [
    (FakePost(status=500, text="internal"), "Gemini 500: internal"),
    (FakePost(text="<html>not json"), "no candidate"),
    (FakePost(text=json.dumps({"candidates": []})), "no candidate"),
    (FakePost(text=gemini_reply("the photo shows a beach")), "not JSON"),
    (FakePost(text=gemini_reply([1, 2])), "not a JSON object"),
    (FakePost(error=ConnectionError("timed out")), "ConnectionError: timed out"),
])
def test_failures_become_error_results(post, message):
    result = tagger(post=post).tag(b"jpeg")
    assert result.status == "error" and message in result.error
    assert result.tags == [] and result.caption == ""


def test_credential_failure_is_an_error_not_an_exception():
    def token():
        raise RuntimeError("no ADC")

    assert tagger(token=token).tag(b"jpeg").status == "error"


def test_missing_fields_give_empty_values():
    assert parse_response(gemini_reply({"tags": "beach"})) == ("", [])
    assert normalise_tags(None) == []


def test_ist_day_rolls_over_at_1830_utc():
    assert ist_day(datetime(2026, 11, 20, 18, 29, 59, tzinfo=timezone.utc)) == "2026-11-20"
    assert ist_day(datetime(2026, 11, 20, 18, 30, tzinfo=timezone.utc)) == "2026-11-21"


class FakeCounters:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls: list[tuple] = []

    def update_one(self, filter, update, upsert=False):
        self.calls.append((filter, update, upsert))
        if self.error:
            raise self.error


class FakeDb:
    def __init__(self, counters):
        self.usage_counters = counters


def test_budget_counter_matches_the_backends_documents():
    counters = FakeCounters()
    now = datetime(2026, 11, 20, 20, 0, tzinfo=timezone.utc)
    assert take_daily(FakeDb(counters), BUDGET_KEY, 1500, now) is True
    ((filter, update, upsert),) = counters.calls
    assert filter == {"_id": "gemini:photo-tags:2026-11-21", "count": {"$lt": 1500}}
    assert update == {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(days=2)}}
    assert upsert is True


def test_full_counter_says_no_and_a_down_database_says_yes():
    now = datetime.now(timezone.utc)
    assert take_daily(FakeDb(FakeCounters(DuplicateKeyError("E11000"))), BUDGET_KEY, 1, now) is False
    assert take_daily(FakeDb(FakeCounters(ServerSelectionTimeoutError("down"))), BUDGET_KEY, 1, now) is True


def test_default_budget_uses_the_database_counter():
    counters = FakeCounters(DuplicateKeyError("E11000"))
    post = FakePost()
    result = Tagger(ON, FakeDb(counters), post=post, token=lambda: "t").tag(b"jpeg")
    assert result.status == "skipped" and post.calls == [] and len(counters.calls) == 1


def test_tag_image_is_a_small_upright_jpeg():
    prepared = prepare(jpeg_bytes(3200, 1600, color=(255, 0, 0)), 1600)
    jpeg = jpeg_for_tags(prepared, 768)
    with Image.open(io.BytesIO(jpeg)) as img:
        assert img.format == "JPEG" and img.size == (768, 384)
        r, g, b = img.convert("RGB").getpixel((10, 10))
    assert r > 200 and b < 50  # BGR pixels are turned back into RGB


def test_tag_prepared_sends_the_downscaled_jpeg():
    post = FakePost()
    result = tagger(post=post).tag_prepared(prepare(jpeg_bytes(2000, 1000), 1600))
    assert result.status == "tagged"
    data = base64.b64decode(post.calls[0][2]["contents"][0]["parts"][0]["inlineData"]["data"])
    with Image.open(io.BytesIO(data)) as img:
        assert max(img.size) == 768
