"""Per-photo scene tags and a caption from Gemini (Vertex AI REST), for photo search ("haldi", "beach", "sunset").

One generateContent call per photo with the downscaled JPEG inline and a JSON response schema. The call is counted
against a daily budget in usage_counters, the same counter scheme as the backend's limits.ts (mongoCounters.take),
so a bulk upload can't run up the bill. Every network, auth and parsing piece is injectable for tests.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from PIL import Image
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from faces.config import Settings
from faces.pipeline import Prepared

logger = logging.getLogger("face-tagger")

BUDGET_KEY = "gemini:photo-tags"
MAX_TAGS = 15
MAX_TAG_CHARS = 40
MAX_CAPTION_CHARS = 200
IST = timedelta(hours=5, minutes=30)

PROMPT = """Describe this photo for search in a group-travel app.
caption: one short sentence (at most 20 words) about what is happening and where. Never name or identify people and never guess who anyone is.
tags: 5 to 12 lowercase English tags, singular, 1 to 3 words each, covering:
- activity (hiking, dancing, swimming, eating, selfie)
- setting or place type (mountain, beach, lake, temple, palace, street market, conference hall, hotel room, restaurant)
- occasion or event when visible (haldi, mehendi, sangeet, wedding, birthday, conference, festival)
- time of day (sunset, night)
- notable objects
Include an Indian ceremony tag only when it is clearly visible (e.g. haldi: turmeric paste, yellow outfits)."""

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {"caption": {"type": "STRING"}, "tags": {"type": "ARRAY", "items": {"type": "STRING"}}},
    "required": ["caption", "tags"],
}

# (url, headers, json body, timeout seconds) -> (HTTP status, response text)
Post = Callable[[str, dict[str, str], dict[str, Any], float], tuple[int, str]]
# () -> OAuth access token for Vertex AI
Token = Callable[[], str]
# () -> True when today's budget has room (and counts this call)
Take = Callable[[], bool]


@dataclass(frozen=True)
class TagResult:
    status: str  # tagged | skipped (budget spent or tagging off) | error
    caption: str = ""
    tags: list[str] = field(default_factory=list)
    error: str | None = None


# --- pure helpers ---


def ist_day(now: datetime) -> str:
    """The app's days run on India time (UTC+5:30), like the backend's limits.ts."""
    return (now.astimezone(timezone.utc) + IST).strftime("%Y-%m-%d")


def vertex_url(settings: Settings) -> str:
    loc = settings.vertex_location
    host = "aiplatform.googleapis.com" if loc == "global" else f"{loc}-aiplatform.googleapis.com"
    return (f"https://{host}/v1/projects/{settings.vertex_project}/locations/{loc}"
            f"/publishers/google/models/{settings.tags_model}:generateContent")


def jpeg_for_tags(prepared: Prepared, max_side: int) -> bytes:
    """The prepared (upright, downscaled, BGR) image as a smaller JPEG for Gemini."""
    img = Image.fromarray(prepared.pixels[:, :, ::-1])
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def request_body(jpeg: bytes, settings: Settings) -> dict[str, Any]:
    generation: dict[str, Any] = {
        "responseMimeType": "application/json", "responseSchema": RESPONSE_SCHEMA, "temperature": 0.2,
    }
    if settings.tags_model.startswith("gemini-3"):
        # Gemini 3 models think by default; minimal thinking keeps this fast and cheap (as the backend does).
        generation["thinkingConfig"] = {"thinkingLevel": "minimal"}
    return {
        "contents": [{"role": "user", "parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(jpeg).decode("ascii")}},
            {"text": PROMPT},
        ]}],
        "generationConfig": generation,
    }


def normalise_tags(raw: Any) -> list[str]:
    """Lowercase, trimmed, deduplicated, no empty or over-long tags, at most MAX_TAGS."""
    if not isinstance(raw, list):
        return []
    tags: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        tag = " ".join(item.strip().lower().split())
        if tag and len(tag) <= MAX_TAG_CHARS and tag not in tags:
            tags.append(tag)
        if len(tags) == MAX_TAGS:
            break
    return tags


def parse_response(text: str) -> tuple[str, list[str]]:
    """(caption, tags) from a generateContent response. Raises ValueError when there is no usable answer."""
    try:
        data = json.loads(text)
        candidate = data["candidates"][0]
        parts = candidate["content"]["parts"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"no candidate in the response ({type(exc).__name__})") from exc
    answer = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought"))
    try:
        payload = json.loads(answer)
    except ValueError as exc:
        raise ValueError(f"answer is not JSON: {answer[:100]!r}") from exc
    if not isinstance(payload, dict):
        raise ValueError("answer is not a JSON object")
    caption = payload.get("caption")
    caption = " ".join(caption.split())[:MAX_CAPTION_CHARS] if isinstance(caption, str) else ""
    return caption, normalise_tags(payload.get("tags"))


# --- defaults for the injectable pieces ---


def take_daily(db: Database, key: str, limit: int, now: datetime) -> bool:
    """Counts one use of `key` today; False once `limit` is reached. Same documents as the backend's
    mongoCounters.take: {_id: '<key>:<IST day>', count, expires_at} (a TTL index on expires_at, from schema.ts)."""
    if limit <= 0:
        return False  # the upsert below would still insert count 1 on a fresh day
    try:
        # A full counter fails the filter, so the upsert tries to insert a second document with its _id: E11000.
        db.usage_counters.update_one(
            {"_id": f"{key}:{ist_day(now)}", "count": {"$lt": limit}},
            {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(days=2)}},
            upsert=True,
        )
        return True
    except DuplicateKeyError:
        return False
    except Exception as exc:
        # The database is down: let the call through rather than lose the tags (the instance cap still applies).
        logger.warning("could not count %s: %s", key, exc)
        return True


def requests_post(url: str, headers: dict[str, str], body: dict[str, Any], timeout: float) -> tuple[int, str]:
    import requests

    res = requests.post(url, headers=headers, json=body, timeout=timeout)
    return res.status_code, res.text


class GoogleToken:
    """Application Default Credentials (the Cloud Run service account, or your gcloud ADC locally), refreshed when
    they expire."""

    def __init__(self) -> None:
        self._credentials: Any = None
        self._lock = threading.Lock()

    def __call__(self) -> str:
        import google.auth
        from google.auth.transport.requests import Request

        with self._lock:
            if self._credentials is None:
                self._credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
            if not self._credentials.valid:
                self._credentials.refresh(Request())
            return self._credentials.token


class Tagger:
    """tag(jpeg) -> TagResult. Never raises: failures come back as status 'error' with the message."""

    def __init__(
        self,
        settings: Settings,
        db: Database | None = None,
        *,
        post: Post | None = None,
        token: Token | None = None,
        take: Take | None = None,
        now: Callable[[], datetime] | None = None,
    ):
        self.settings = settings
        self._post = post or requests_post
        self._token = token or GoogleToken()
        clock = now or (lambda: datetime.now(timezone.utc))
        if take is None:
            def take() -> bool:
                if db is None:
                    return True
                return take_daily(db, BUDGET_KEY, settings.photo_tags_per_day, clock())
        self._take = take

    @property
    def enabled(self) -> bool:
        return self.settings.tagging

    def tag_prepared(self, prepared: Prepared) -> TagResult:
        try:
            jpeg = jpeg_for_tags(prepared, self.settings.tags_image_side)
        except Exception as exc:
            return TagResult("error", error=f"{type(exc).__name__}: {exc}"[:1000])
        return self.tag(jpeg)

    def tag(self, jpeg: bytes) -> TagResult:
        if not self.enabled:
            return TagResult("skipped", error="tagging is off (TAGS_ENABLED / VERTEX_PROJECT)")
        if not self._take():
            return TagResult("skipped", error=f"daily photo tag budget spent ({self.settings.photo_tags_per_day})")
        try:
            headers = {"Authorization": f"Bearer {self._token()}", "Content-Type": "application/json"}
            status, text = self._post(vertex_url(self.settings), headers, request_body(jpeg, self.settings),
                                      float(self.settings.tags_timeout))
            if status != 200:
                return TagResult("error", error=f"Gemini {status}: {text[:300]}")
            caption, tags = parse_response(text)
        except Exception as exc:
            return TagResult("error", error=f"{type(exc).__name__}: {exc}"[:1000])
        return TagResult("tagged", caption=caption, tags=tags)
