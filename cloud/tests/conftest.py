from __future__ import annotations

import io
import os
import time
import uuid
from typing import Any

import numpy as np
import pytest
from PIL import Image

from faces.config import Settings
from faces.pipeline import Box, Face

TRIP_A = "6f1c7f9e-0000-4000-8000-00000000000a"
TRIP_B = "6f1c7f9e-0000-4000-8000-00000000000b"


@pytest.fixture
def settings() -> Settings:
    return Settings()


def jpeg_bytes(width: int, height: int, color: tuple[int, int, int] = (200, 30, 30), exif: Image.Exif | None = None) -> bytes:
    buf = io.BytesIO()
    kwargs: dict[str, Any] = {"exif": exif} if exif is not None else {}
    Image.new("RGB", (width, height), color).save(buf, format="JPEG", **kwargs)
    return buf.getvalue()


def unit(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=np.float32)
    return v / np.linalg.norm(v)


def fake_face(embedding: np.ndarray, box: Box = Box(10, 20, 50, 60), confidence: float = 0.99) -> Face:
    return Face(box=box, confidence=confidence, embedding=unit(embedding), detected_area=box.w * box.h)


def near(base: np.ndarray, rng: np.random.Generator, noise: float = 0.01) -> np.ndarray:
    """A vector at a small cosine distance from base (same person)."""
    return unit(base + rng.normal(0, noise, base.shape[0]))


def cosine_distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(1 - np.dot(unit(a), unit(b)))


# --- Database fixtures: a throwaway database per test session, with the indexes created ---


@pytest.fixture(scope="session")
def db() -> Any:
    url = os.environ.get("TEST_MONGODB_CONNECTION_STRING")
    if not url:
        pytest.skip("TEST_MONGODB_CONNECTION_STRING is not set (run the db tests with docker compose, see README)")
    from faces.db import open_db
    from faces.migrate import migrate

    settings = Settings(mongodb_connection_string=url, mongodb_db=f"faces_test_{uuid.uuid4().hex[:10]}")
    database = open_db(settings)
    migrate(database, settings)
    yield database
    database.client.drop_database(database.name)
    database.client.close()


@pytest.fixture
def clean_db(db: Any) -> Any:
    db.face_photos.delete_many({})
    db.faces.delete_many({})
    db.selfie_faces.delete_many({})
    return db


def wait_searchable(db: Any, timeout: float = 60) -> None:
    """$vectorSearch is eventually consistent (mongot tails the oplog): wait until an exact search returns
    exactly the faces in the collection, per (trip, model, detector), and nothing that was deleted."""
    from faces.store import VECTOR_INDEX

    groups: dict[tuple, set] = {}
    for f in db.faces.find({}, {"trip_id": 1, "model_name": 1, "detector": 1}):
        groups.setdefault((f["trip_id"], f["model_name"], f["detector"]), set()).add(f["_id"])
    deadline = time.monotonic() + timeout
    for (trip_id, model, detector), ids in groups.items():
        while True:
            found = {d["_id"] for d in db.faces.aggregate([
                {"$vectorSearch": {
                    "index": VECTOR_INDEX, "path": "embedding", "queryVector": [1.0] * 512, "exact": True,
                    "limit": len(ids) + 1,
                    "filter": {"$and": [{"trip_id": {"$eq": trip_id}}, {"model_name": {"$eq": model}},
                                        {"detector": {"$eq": detector}}]},
                }},
                {"$project": {"_id": 1}},
            ])}
            if found == ids:
                break
            if time.monotonic() > deadline:
                raise TimeoutError(f"vector index still has {len(found)} of {len(ids)} faces for trip {trip_id}")
            time.sleep(0.2)
