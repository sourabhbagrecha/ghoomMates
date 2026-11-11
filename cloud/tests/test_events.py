"""Event parsing, routing (what gets indexed), config and search request validation."""

from __future__ import annotations

import base64

import pytest

from faces.config import Settings
from faces.indexer import FINALIZED, parse_event, route
from faces.search import InvalidRequest, decode_selfie, parse_embeddings, parse_request
from tests.conftest import TRIP_A

OBJECT = {"bucket": "ghoomates", "name": f"trips/{TRIP_A}/photos/a.jpg", "generation": "1730000000000001",
          "contentType": "image/jpeg", "size": "12345"}


def test_parse_binary_mode_event():
    e = parse_event({"ce-id": "42", "ce-type": FINALIZED}, OBJECT)
    assert (e.id, e.type, e.bucket, e.name, e.generation, e.content_type, e.size) == (
        "42", FINALIZED, "ghoomates", OBJECT["name"], 1730000000000001, "image/jpeg", 12345)


def test_parse_structured_mode_event():
    e = parse_event({}, {"specversion": "1.0", "id": "7", "type": FINALIZED, "data": OBJECT})
    assert e.id == "7" and e.generation == 1730000000000001


def test_content_type_parameters_are_stripped():
    e = parse_event({"ce-type": FINALIZED}, {**OBJECT, "contentType": "Image/JPEG; charset=binary"})
    assert e.content_type == "image/jpeg"


@pytest.mark.parametrize("body", [None, {}, {"bucket": "b"}, {"name": "n"}, "text"])
def test_events_without_an_object_are_rejected(body):
    with pytest.raises((ValueError, TypeError)):
        parse_event({"ce-type": FINALIZED}, body)


@pytest.mark.parametrize(
    "name,content_type,expected",
    [
        (f"trips/{TRIP_A}/photos/a.jpg", "image/jpeg", TRIP_A),
        (f"trips/{TRIP_A.upper()}/photos/A.JPG", "image/jpeg", TRIP_A),
        (f"trips/{TRIP_A}/photos/a.heic", "image/heic", TRIP_A),
        (f"trips/{TRIP_A}/receipts/a.jpg", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/thumbs/a.jpg", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/a.pdf", "application/pdf", None),
        (f"trips/{TRIP_A}/photos/a.jpg", "application/pdf", None),
        (f"trips/{TRIP_A}/photos/a.pdf", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/a.jpg", "", None),
        ("users/u1/selfie.jpg", "image/jpeg", None),
        ("selfies/x.jpg", "image/jpeg", None),
        ("thumbnails/trips/x.jpg", "image/jpeg", None),
        ("healthcheck/x.jpg", "image/jpeg", None),
        ("trips/not-a-uuid/photos/a.jpg", "image/jpeg", None),
    ],
)
def test_route_only_indexes_trip_photos(name, content_type, expected):
    trip_id, reason = route(name, content_type, Settings())
    assert trip_id == expected
    assert (reason is None) == (expected is not None)


def test_skip_prefixes_win_over_the_include_pattern():
    s = Settings.from_env({"SKIP_PREFIXES": "trips/", "INCLUDE_PATTERN": r"^trips/(?P<scope>[0-9a-f-]{36})/photos/[^/]+$"})
    assert route(f"trips/{TRIP_A}/photos/a.jpg", "image/jpeg", s) == (None, "skip prefix trips/")


def test_settings_from_env_overrides_defaults():
    s = Settings.from_env({"MATCH_THRESHOLD": "0.35", "MIN_FACE_PX": "48", "ALIGN": "false",
                           "SKIP_PREFIXES": " Selfies/ , tmp/ ", "SERVICE": "Search", "MAX_IMAGE_SIDE": ""})
    assert (s.match_threshold, s.min_face_px, s.align, s.service) == (0.35, 48, False, "search")
    assert s.skip_prefixes == ("selfies/", "tmp/")
    assert s.max_image_side == 1600


def test_defaults_match_the_notebook():
    s = Settings()
    assert (s.model_name, s.detector_backend, s.align, s.enforce_detection) == ("Facenet512", "retinaface", True, True)
    assert (s.max_image_side, s.min_face_px, s.min_face_confidence, s.match_threshold) == (1600, 40, 0.90, 0.40)


def test_search_k_never_exceeds_the_atlas_vector_search_cap():
    s = Settings.from_env({"SEARCH_MAX_K": "50000", "SEARCH_INITIAL_K": "20000"})
    assert (s.search_initial_k, s.search_max_k) == (10000, 10000)
    assert Settings.from_env({"MONGODB_CONNECTION_STRING": " mongodb://h/ "}).mongodb_connection_string == "mongodb://h/"
    assert Settings().mongodb_db == "ghoomates"


def test_opening_the_database_does_not_connect():
    from faces.db import open_db

    # A dead host (or an unresolvable mongodb+srv name) must not fail or block startup.
    db = open_db(Settings(mongodb_connection_string="mongodb+srv://u:p@nowhere.invalid/", mongodb_db="x"))
    assert db.name == "x"
    db.client.close()


def test_selfies_accept_base64_and_data_urls(settings):
    raw = b"\xff\xd8\xff selfie"
    b64 = base64.b64encode(raw).decode()
    assert decode_selfie(b64, 0, settings) == raw
    assert decode_selfie(f"data:image/jpeg;base64,{b64}", 0, settings) == raw


@pytest.mark.parametrize(
    "body,code",
    [
        (None, "VALIDATION_ERROR"),
        ({"trip_id": "nope", "selfies": ["aGk="]}, "VALIDATION_ERROR"),
        ({"trip_id": TRIP_A, "selfies": []}, "VALIDATION_ERROR"),
        ({"trip_id": TRIP_A, "selfies": ["aGk="] * 4}, "VALIDATION_ERROR"),
        ({"trip_id": TRIP_A, "selfies": ["%%%"]}, "VALIDATION_ERROR"),
        ({"trip_id": TRIP_A, "selfies": ["data:image/jpeg,abc"]}, "VALIDATION_ERROR"),
    ],
)
def test_invalid_search_requests(body, code, settings):
    with pytest.raises(InvalidRequest) as err:
        parse_request(body, settings)
    assert err.value.code == code


def test_oversized_selfies_are_rejected():
    s = Settings.from_env({"MAX_SELFIE_BYTES": "30"})
    with pytest.raises(InvalidRequest) as err:
        decode_selfie(base64.b64encode(b"x" * 100).decode(), 0, s)
    assert err.value.status == 413


def test_embeddings_are_validated_and_normalized(settings):
    out = parse_embeddings({"embeddings": [[3.0] + [0.0] * 511]}, settings)
    assert len(out) == 1 and out[0].shape == (512,) and abs(float(out[0][0]) - 1.0) < 1e-6


@pytest.mark.parametrize(
    "embeddings",
    [None, [], [[0.1] * 511], [[0.0] * 512], [["x"] * 512], [[True] * 512], [[0.1] * 512] * 4, "nope"],
)
def test_invalid_embeddings_are_rejected(embeddings, settings):
    with pytest.raises(InvalidRequest) as err:
        parse_embeddings({"embeddings": embeddings}, settings)
    assert err.value.code == "VALIDATION_ERROR"
