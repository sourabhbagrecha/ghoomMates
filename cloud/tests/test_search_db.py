"""Search against a real MongoDB with Atlas Vector Search and synthetic embeddings: scoping, threshold, multiple
selfies, grouping by photo, no silent truncation, and that the trip filter keeps ANN results complete."""

from __future__ import annotations

from datetime import datetime, timezone

import numpy as np
import pytest
from pymongo import MongoClient

from faces import store
from faces.config import Settings
from faces.pipeline import Box
from faces.search import create_app
from tests.conftest import TRIP_A, TRIP_B, cosine_distance, fake_face, near, unit, wait_searchable

pytestmark = pytest.mark.db


def add(db, name, trip, faces, settings=None, generation=1):
    store.save_photo(db, bucket="ghoomates", name=name, generation=generation, trip_id=trip, status="indexed",
                     settings=settings or Settings(), width=1000, height=800, faces=faces)


def run(db, queries, trip, settings=None):
    wait_searchable(db)
    return store.search(db, queries, trip, settings or Settings())


@pytest.fixture
def rng():
    return np.random.default_rng(1234)


def test_finds_only_the_person_in_the_trip(clean_db, rng):
    me, stranger = unit(rng.normal(size=512)), unit(rng.normal(size=512))
    add(clean_db, "trips/a/photos/1.jpg", TRIP_A, [fake_face(near(me, rng), Box(1, 2, 50, 60))])
    add(clean_db, "trips/a/photos/2.jpg", TRIP_A, [fake_face(stranger)])
    add(clean_db, "trips/b/photos/3.jpg", TRIP_B, [fake_face(near(me, rng))])
    matches, truncated = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["trips/a/photos/1.jpg"]
    assert truncated is False
    face = matches[0].faces[0]
    assert (face.x, face.y, face.w, face.h) == (1, 2, 50, 60)
    assert 0 <= face.distance < 0.40


def orthogonal(me, rng):
    r = rng.normal(size=512)
    return unit(r - np.dot(r, me) * me)


def at_distance(me, other, d):
    """Unit vector at cosine distance d from me, in the plane of me and other (other is orthogonal to me)."""
    cos = 1 - d
    return unit(cos * me + np.sqrt(1 - cos**2) * other)


def test_threshold_applies(clean_db, rng):
    me = unit(rng.normal(size=512))
    other = orthogonal(me, rng)
    add(clean_db, "inside.jpg", TRIP_A, [fake_face(at_distance(me, other, 0.395))])
    add(clean_db, "outside.jpg", TRIP_A, [fake_face(at_distance(me, other, 0.405))])
    matches, _ = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["inside.jpg"]
    assert matches[0].distance == pytest.approx(0.395, abs=1e-4)


def test_multiple_selfies_take_the_minimum_distance(clean_db, rng):
    me = unit(rng.normal(size=512))
    other = orthogonal(me, rng)
    side_selfie = at_distance(me, other, 0.30)
    side_photo = at_distance(me, other, 0.55)  # too far from selfie 1, close to selfie 2
    add(clean_db, "front.jpg", TRIP_A, [fake_face(near(me, rng))])
    add(clean_db, "side.jpg", TRIP_A, [fake_face(side_photo)])
    single, _ = run(clean_db, [me], TRIP_A)
    both, _ = run(clean_db, [me, side_selfie], TRIP_A)
    assert [m.object_name for m in single] == ["front.jpg"]
    by_name = {m.object_name: m.distance for m in both}
    assert set(by_name) == {"front.jpg", "side.jpg"}
    assert by_name["side.jpg"] == pytest.approx(cosine_distance(side_selfie, side_photo), abs=1e-4)
    assert by_name["side.jpg"] < 0.1


def test_results_group_by_photo_and_sort_by_distance(clean_db, rng):
    me, stranger = unit(rng.normal(size=512)), unit(rng.normal(size=512))
    add(clean_db, "far.jpg", TRIP_A, [fake_face(near(me, rng, 0.03))])
    add(clean_db, "group.jpg", TRIP_A, [
        fake_face(near(me, rng, 0.002), Box(0, 0, 50, 50)),
        fake_face(near(me, rng, 0.02), Box(100, 0, 50, 50)),  # the same person twice (a mirror, a poster)
        fake_face(stranger, Box(200, 0, 50, 50)),
    ])
    matches, _ = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["group.jpg", "far.jpg"]
    group = matches[0]
    assert [f.x for f in group.faces] == [0, 100]
    assert group.distance == group.faces[0].distance
    assert group.as_json()["faces"][0]["distance"] <= group.as_json()["faces"][1]["distance"]


def test_someone_in_hundreds_of_photos_is_never_cut_off(clean_db, rng):
    me = unit(rng.normal(size=512))
    for i in range(120):
        add(clean_db, f"p{i:03}.jpg", TRIP_A, [fake_face(near(me, rng))])
    for i in range(30):
        add(clean_db, f"s{i:03}.jpg", TRIP_A, [fake_face(rng.normal(size=512))])
    small_k = Settings(search_initial_k=16)
    matches, truncated = run(clean_db, [me], TRIP_A, small_k)
    assert len(matches) == 120 and truncated is False
    capped = Settings(search_initial_k=16, search_max_k=32)
    matches, truncated = run(clean_db, [me], TRIP_A, capped)
    assert len(matches) == 32 and truncated is True


def test_faces_from_another_model_are_not_compared(clean_db, rng):
    me = unit(rng.normal(size=512))
    add(clean_db, "old.jpg", TRIP_A, [fake_face(near(me, rng))], settings=Settings(model_name="OldModel"))
    assert run(clean_db, [me], TRIP_A)[0] == []


def bulk_noise(db, rng, trip_id, n):
    """n random faces (strangers) on one photo, inserted directly."""
    now = datetime.now(timezone.utc)
    photo = {"bucket": "ghoomates", "object_name": f"noise-{trip_id}.jpg", "generation": 1, "trip_id": trip_id,
             "width": None, "height": None, "model_name": "Facenet512", "detector": "retinaface"}
    photo_id = db.face_photos.insert_one({**photo, "face_count": n, "status": "indexed", "error": None,
                                          "indexed_at": now}).inserted_id
    db.faces.insert_many([
        {**photo, "photo_id": photo_id, "x": 0, "y": 0, "w": 50, "h": 50, "det_confidence": 0.99,
         "embedding": store.to_vector(unit(v)), "created_at": now}
        for v in rng.normal(size=(n, 512))
    ])


def test_trip_filter_finds_the_match_among_other_trips_and_noise(clean_db, rng):
    """The trip filter runs inside the ANN scan, not after it: the one match in trip A is found even though trip B
    holds many closer lookalikes (global nearest neighbours a post-filter would drop) and both trips hold thousands
    of strangers. Nothing from trip B ever comes back."""
    me = unit(rng.normal(size=512))
    add(clean_db, "a.jpg", TRIP_A, [fake_face(near(me, rng, 0.03))])
    for i in range(200):
        add(clean_db, f"b{i:03}.jpg", TRIP_B, [fake_face(near(me, rng, 0.002))])
    bulk_noise(clean_db, rng, TRIP_A, 1500)
    bulk_noise(clean_db, rng, TRIP_B, 1500)
    small_k = Settings(search_initial_k=40)
    matches, truncated = run(clean_db, [me], TRIP_A, small_k)
    assert [m.object_name for m in matches] == ["a.jpg"] and truncated is False
    hits = store.nearest_faces(clean_db, me, TRIP_A, 40, small_k)
    assert len(hits) == 40 and hits[0].object_name == "a.jpg"
    assert {h.object_name for h in hits} <= {"a.jpg", f"noise-{TRIP_A}.jpg"}


def test_database_failure_is_unavailable():
    dead = MongoClient("mongodb://127.0.0.1:1/?directConnection=true", serverSelectionTimeoutMS=500, connect=False)
    try:
        client = create_app(Settings(), None, dead["none"]).test_client()
        response = client.post("/search", json={"trip_id": TRIP_A, "embeddings": [[1.0] * 512]})
        assert response.status_code == 503 and response.get_json()["error"]["code"] == "SEARCH_UNAVAILABLE"
    finally:
        dead.close()
