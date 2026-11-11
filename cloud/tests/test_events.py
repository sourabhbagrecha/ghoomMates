"""Event parsing, routing (what gets indexed) and config."""

from __future__ import annotations

import pytest

from faces.config import Settings
from faces.indexer import FINALIZED, parse_event, route
from tests.conftest import TRIP_A

USER = "usr_0123456789abcdef"

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
        (f"trips/{TRIP_A}/photos/a.jpg", "image/jpeg", ("photo", TRIP_A)),
        (f"trips/{TRIP_A.upper()}/photos/A.JPG", "image/jpeg", ("photo", TRIP_A)),
        (f"trips/{TRIP_A}/photos/a.heic", "image/heic", ("photo", TRIP_A)),
        (f"trips/{TRIP_A}/receipts/a.jpg", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/thumbs/a.jpg", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/a.pdf", "application/pdf", None),
        (f"trips/{TRIP_A}/photos/a.jpg", "application/pdf", None),
        (f"trips/{TRIP_A}/photos/a.pdf", "image/jpeg", None),
        (f"trips/{TRIP_A}/photos/a.jpg", "", None),
        ("users/u1/selfie.jpg", "image/jpeg", None),
        (f"users/{USER}/avatars/a.jpg", "image/jpeg", None),
        (f"users/{USER}/selfies/a.jpg", "image/jpeg", ("selfie", USER)),
        (f"users/{USER}/selfies/a.png", "image/png", ("selfie", USER)),
        (f"users/{USER}/selfies/a.jpg", "application/pdf", None),
        (f"users/{USER}/selfies/nested/a.jpg", "image/jpeg", None),
        ("users/not-a-user/selfies/a.jpg", "image/jpeg", None),
        ("selfies/x.jpg", "image/jpeg", None),
        ("thumbnails/trips/x.jpg", "image/jpeg", None),
        ("healthcheck/x.jpg", "image/jpeg", None),
        ("trips/not-a-uuid/photos/a.jpg", "image/jpeg", None),
    ],
)
def test_route_only_indexes_trip_photos_and_profile_selfies(name, content_type, expected):
    target, reason = route(name, content_type, Settings())
    assert (target.kind, target.scope) == expected if expected else target is None
    assert (reason is None) == (expected is not None)


def test_skip_prefixes_win_over_the_include_pattern():
    s = Settings.from_env({"SKIP_PREFIXES": "trips/", "INCLUDE_PATTERN": r"^trips/(?P<scope>[0-9a-f-]{36})/photos/[^/]+$"})
    assert route(f"trips/{TRIP_A}/photos/a.jpg", "image/jpeg", s) == (None, "skip prefix trips/")


def test_settings_from_env_overrides_defaults():
    s = Settings.from_env({"MATCH_THRESHOLD": "0.35", "MIN_FACE_PX": "48", "ALIGN": "false",
                           "SKIP_PREFIXES": " Selfies/ , tmp/ ", "MAX_IMAGE_SIDE": ""})
    assert (s.match_threshold, s.min_face_px, s.align) == (0.35, 48, False)
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

