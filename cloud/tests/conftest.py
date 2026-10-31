from __future__ import annotations

import io
import os
import uuid
from typing import Any

import numpy as np
import psycopg
import pytest
from PIL import Image

from faces.config import Settings
from faces.db import normalize_dsn
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


# --- Database fixtures: a throwaway database per test session, with the migrations applied ---


@pytest.fixture(scope="session")
def database_url() -> Any:
    admin_url = os.environ.get("TEST_DATABASE_URL")
    if not admin_url:
        pytest.skip("TEST_DATABASE_URL is not set (run the db tests with docker compose, see README)")
    from urllib.parse import urlsplit, urlunsplit

    from faces.migrate import migrate

    name = f"faces_test_{uuid.uuid4().hex[:10]}"
    with psycopg.connect(normalize_dsn(admin_url), autocommit=True) as conn:
        conn.execute(f'CREATE DATABASE "{name}"')
    parts = urlsplit(admin_url)
    url = urlunsplit(parts._replace(path=f"/{name}"))
    migrate(url)
    yield url
    with psycopg.connect(normalize_dsn(admin_url), autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')


@pytest.fixture(scope="session")
def pool(database_url: str) -> Any:
    from psycopg_pool import ConnectionPool

    p = ConnectionPool(normalize_dsn(database_url), min_size=1, max_size=2, open=True)
    yield p
    p.close()


@pytest.fixture
def clean_db(pool: Any) -> Any:
    with pool.connection() as conn:
        conn.execute("TRUNCATE face_photos, faces RESTART IDENTITY")
    return pool
