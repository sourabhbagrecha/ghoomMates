"""Indexer HTTP handler against a real MongoDB with a fake face engine: idempotency, generations,
deletes, permanent vs transient failures."""

from __future__ import annotations

import numpy as np
import pytest
from pymongo import MongoClient

from faces.config import Settings
from faces.indexer import DELETED, FINALIZED, create_app
from faces.pipeline import BadImage, Box, NoFace, PhotoFaces
from faces.storage import ObjectGone
from tests.conftest import TRIP_A, fake_face, jpeg_bytes

pytestmark = pytest.mark.db

NAME = f"trips/{TRIP_A}/photos/p1.jpg"
USER = "usr_0123456789abcdef"
SELFIE = f"users/{USER}/selfies/0b8a4c2e-1111-4222-8333-944455556666.jpg"


class FakeEngine:
    def __init__(self):
        self.calls = 0
        self.faces_per_call: list[int] = []
        self.error: Exception | None = None

    def analyze(self, data: bytes) -> PhotoFaces:
        self.calls += 1
        if self.error:
            raise self.error
        n = self.faces_per_call.pop(0) if self.faces_per_call else 2
        rng = np.random.default_rng(self.calls)
        return PhotoFaces(4000, 3000, [fake_face(rng.normal(size=512), Box(10 * i, 20, 50, 60)) for i in range(n)])

    def selfie_embedding(self, data: bytes):
        faces = self.analyze(data).faces
        if not faces:
            raise NoFace("No face found in the selfie")
        return faces[0]


class FakeReader:
    def __init__(self):
        self.objects: dict[str, bytes] = {NAME: jpeg_bytes(10, 10), SELFIE: jpeg_bytes(10, 10)}
        self.error: Exception | None = None

    def read(self, bucket, name, generation):
        if self.error:
            raise self.error
        if name not in self.objects:
            raise ObjectGone(name)
        return self.objects[name]


@pytest.fixture
def env(clean_db):
    engine, reader = FakeEngine(), FakeReader()
    app = create_app(Settings(), engine, clean_db, reader)
    return app.test_client(), engine, reader, clean_db


def send(client, generation, event_type=FINALIZED, name=NAME, content_type="image/jpeg", size=100):
    return client.post(
        "/",
        json={"bucket": "ghoomates", "name": name, "generation": str(generation), "contentType": content_type,
              "size": str(size)},
        headers={"ce-id": f"id-{generation}", "ce-type": event_type},
    )


def rows(db):
    photos = [
        tuple(p[k] for k in ("generation", "status", "face_count", "width", "height", "trip_id", "model_name", "detector", "error"))
        for p in db.face_photos.find()
    ]
    faces = [
        (f["x"], f["y"], f["w"], f["h"], f["model_name"], f["detector"], len(f["embedding"].as_vector().data))
        for f in db.faces.find().sort("x")
    ]
    return photos, faces


def test_finalized_indexes_faces(env):
    client, engine, _, db = env
    assert send(client, 1).status_code == 204
    photos, faces = rows(db)
    assert photos == [(1, "indexed", 2, 4000, 3000, TRIP_A, "Facenet512", "retinaface", None)]
    assert faces == [(0, 20, 50, 60, "Facenet512", "retinaface", 512), (10, 20, 50, 60, "Facenet512", "retinaface", 512)]
    # Photo fields are denormalized onto each face, so search needs no join.
    photo_id = db.face_photos.find_one()["_id"]
    for f in db.faces.find():
        assert (f["photo_id"], f["trip_id"], f["bucket"], f["object_name"], f["generation"], f["width"], f["height"]) == (
            photo_id, TRIP_A, "ghoomates", NAME, 1, 4000, 3000)


def test_redelivery_of_the_same_generation_is_skipped(env):
    client, engine, _, db = env
    send(client, 1)
    assert send(client, 1).status_code == 204
    assert engine.calls == 1
    assert len(rows(db)[1]) == 2


def test_new_generation_replaces_faces(env):
    client, engine, _, db = env
    engine.faces_per_call = [2, 3]
    send(client, 1)
    send(client, 2)
    photos, faces = rows(db)
    assert [(p[0], p[2]) for p in photos] == [(2, 3)]
    assert len(faces) == 3


def test_older_generation_event_is_ignored(env):
    client, engine, _, db = env
    engine.faces_per_call = [3, 1]
    send(client, 5)
    assert send(client, 4).status_code == 204
    assert engine.calls == 1
    assert rows(db)[0][0][0] == 5


def test_error_status_is_retried_on_redelivery(env):
    client, engine, _, db = env
    engine.error = BadImage("broken")
    send(client, 1)
    engine.error = None
    send(client, 1)
    assert engine.calls == 2 and rows(db)[0][0][1] == "indexed"


def test_model_change_reindexes_the_same_generation(env):
    client, engine, reader, db = env
    send(client, 1)
    other = create_app(Settings(model_name="Facenet512-v2"), engine, db, reader).test_client()
    send(other, 1)
    assert engine.calls == 2
    assert rows(db)[0][0][6] == "Facenet512-v2"


def test_corrupt_image_is_recorded_and_acknowledged(env):
    client, engine, _, db = env
    engine.error = BadImage("cannot identify image file")
    assert send(client, 1).status_code == 204
    photos, faces = rows(db)
    assert photos[0][1] == "error" and "cannot identify" in photos[0][8] and faces == []


def test_unexpected_model_failure_is_permanent(env):
    client, engine, _, db = env
    engine.error = RuntimeError("tensor shape mismatch")
    assert send(client, 1).status_code == 204
    assert rows(db)[0][0][1] == "error"


def test_no_faces_is_recorded_and_not_repeated(env):
    client, engine, _, db = env
    engine.faces_per_call = [0]
    assert send(client, 1).status_code == 204
    send(client, 1)
    assert engine.calls == 1
    assert rows(db)[0][0][1:3] == ("no_faces", 0)


def test_too_large_objects_are_recorded_without_download(env):
    client, engine, reader, db = env
    reader.error = AssertionError("must not download")
    assert send(client, 1, size=Settings().max_image_bytes + 1).status_code == 204
    assert rows(db)[0][0][1] == "error" and engine.calls == 0


def test_object_gone_is_acknowledged(env):
    client, engine, reader, db = env
    reader.objects.clear()
    assert send(client, 1).status_code == 204
    assert rows(db) == ([], [])


def test_download_failure_is_retried(env):
    client, engine, reader, db = env
    reader.error = ConnectionError("GCS unavailable")
    assert send(client, 1).status_code == 500
    assert rows(db) == ([], [])


def test_database_failure_is_retried():
    dead = MongoClient("mongodb://127.0.0.1:1/?directConnection=true", serverSelectionTimeoutMS=500, connect=False)
    try:
        client = create_app(Settings(), FakeEngine(), dead["none"], FakeReader()).test_client()
        assert send(client, 1).status_code == 500
    finally:
        dead.close()


def test_ignored_objects_never_reach_the_engine(env):
    client, engine, _, db = env
    for name, ctype in [(f"trips/{TRIP_A}/receipts/r.jpg", "image/jpeg"), ("users/u1/selfie.jpg", "image/jpeg"),
                        (f"trips/{TRIP_A}/photos/v.mp4", "video/mp4")]:
        assert send(client, 1, name=name, content_type=ctype).status_code == 204
    assert client.post("/", json=OBJECT_WITHOUT_NAME, headers={"ce-type": FINALIZED}).status_code == 204
    assert client.post("/", json={"bucket": "b", "name": NAME}, headers={"ce-type": "other.type"}).status_code == 204
    assert engine.calls == 0 and rows(db) == ([], [])


OBJECT_WITHOUT_NAME = {"bucket": "ghoomates"}


def test_delete_removes_photo_and_faces(env):
    client, _, _, db = env
    send(client, 3)
    assert send(client, 3, event_type=DELETED).status_code == 204
    assert rows(db) == ([], [])


def test_delete_of_an_overwritten_generation_keeps_the_new_one(env):
    client, _, _, db = env
    send(client, 3)
    assert send(client, 2, event_type=DELETED).status_code == 204
    assert rows(db)[0][0][0] == 3 and len(rows(db)[1]) == 2


def test_delete_of_an_unknown_object_is_fine(env):
    client, _, _, _ = env
    assert send(client, 1, event_type=DELETED).status_code == 204


# --- Profile selfies (users/<userId>/selfies/<uuid>.jpg) ---


def selfie_rows(db):
    return [
        (d["object_name"], d["user_id"], d["generation"], d["status"], len(d["embedding"] or []), d["model_name"])
        for d in db.selfie_faces.find()
    ]


def test_selfie_upload_is_embedded(env):
    client, engine, _, db = env
    assert send(client, 1, name=SELFIE).status_code == 204
    assert selfie_rows(db) == [(SELFIE, USER, 1, "indexed", 512, "Facenet512")]
    # Stored as plain floats, unit length, so the backend can use it as the $vectorSearch query vector.
    vector = np.array(db.selfie_faces.find_one()["embedding"])
    assert abs(np.linalg.norm(vector) - 1) < 1e-6
    # Selfies never become gallery faces.
    assert rows(db) == ([], []) and engine.calls == 1


def test_selfie_redelivery_is_skipped(env):
    client, engine, _, db = env
    send(client, 1, name=SELFIE)
    send(client, 1, name=SELFIE)
    assert engine.calls == 1 and len(selfie_rows(db)) == 1


def test_selfie_without_a_face_is_recorded(env):
    client, engine, _, db = env
    engine.faces_per_call = [0]
    assert send(client, 1, name=SELFIE).status_code == 204
    assert selfie_rows(db) == [(SELFIE, USER, 1, "no_face", 0, "Facenet512")]


def test_unreadable_selfie_is_recorded(env):
    client, engine, _, db = env
    engine.error = BadImage("nope")
    assert send(client, 1, name=SELFIE).status_code == 204
    assert selfie_rows(db)[0][3] == "error"


def test_selfie_embedded_by_the_backend_first_is_replaced(env):
    # The backend's find-me fallback stores generation 0 when it embeds a selfie before this event arrives.
    client, engine, _, db = env
    db.selfie_faces.insert_one({"object_name": SELFIE, "user_id": USER, "generation": 0, "status": "indexed", "embedding": [0.0] * 512})
    assert send(client, 5, name=SELFIE).status_code == 204
    assert selfie_rows(db) == [(SELFIE, USER, 5, "indexed", 512, "Facenet512")]


def test_selfie_delete_removes_the_embedding(env):
    client, _, _, db = env
    send(client, 2, name=SELFIE)
    assert send(client, 2, event_type=DELETED, name=SELFIE).status_code == 204
    assert selfie_rows(db) == []
