"""SQL for face_photos and faces (cloud/migrations). Functions take an open psycopg connection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import psycopg

from faces.config import Settings
from faces.pipeline import Face

DONE_STATUSES = ("indexed", "no_faces")


def to_vector(v: np.ndarray) -> str:
    """pgvector text literal, sent as a parameter and cast with ::vector (no client-side adapter needed)."""
    return "[" + ",".join(f"{x:.8g}" for x in np.asarray(v, dtype=np.float32).tolist()) + "]"


@dataclass(frozen=True)
class StoredPhoto:
    id: int
    generation: int
    status: str
    model_name: str
    detector: str


def get_photo(conn: psycopg.Connection, bucket: str, name: str) -> StoredPhoto | None:
    row = conn.execute(
        "SELECT id, generation, status, model_name, detector FROM face_photos WHERE bucket = %s AND object_name = %s",
        (bucket, name),
    ).fetchone()
    return StoredPhoto(*row) if row else None


def skip_reason(stored: StoredPhoto | None, generation: int, settings: Settings) -> str | None:
    """Why an event needs no work, or None. Eventarc delivers at least once, so repeats are normal."""
    if stored is None:
        return None
    if stored.generation > generation:
        return "stale event: a newer generation is already stored"
    if (
        stored.generation == generation
        and stored.status in DONE_STATUSES
        and stored.model_name == settings.model_name
        and stored.detector == settings.detector_backend
    ):
        return "generation already indexed"
    return None


def save_photo(
    conn: psycopg.Connection,
    *,
    bucket: str,
    name: str,
    generation: int,
    trip_id: str,
    status: str,
    settings: Settings,
    width: int | None = None,
    height: int | None = None,
    faces: Sequence[Face] = (),
    error: str | None = None,
) -> int | None:
    """Upserts the photo row and replaces its faces in one transaction. Returns the photo id, or None when a
    newer generation of the object is already stored (the event is stale and nothing changes)."""
    with conn.transaction():
        row = conn.execute(
            """
            INSERT INTO face_photos (bucket, object_name, generation, trip_id, width, height, face_count, status, error,
                                     model_name, detector, indexed_at)
            VALUES (%(bucket)s, %(name)s, %(generation)s, %(trip_id)s, %(width)s, %(height)s, %(face_count)s,
                    %(status)s, %(error)s, %(model)s, %(detector)s, now())
            ON CONFLICT (bucket, object_name) DO UPDATE SET
              generation = EXCLUDED.generation, trip_id = EXCLUDED.trip_id, width = EXCLUDED.width,
              height = EXCLUDED.height, face_count = EXCLUDED.face_count, status = EXCLUDED.status,
              error = EXCLUDED.error, model_name = EXCLUDED.model_name, detector = EXCLUDED.detector,
              indexed_at = EXCLUDED.indexed_at
            WHERE face_photos.generation <= EXCLUDED.generation
            RETURNING id
            """,
            {
                "bucket": bucket, "name": name, "generation": generation, "trip_id": trip_id, "width": width,
                "height": height, "face_count": len(faces), "status": status, "error": error,
                "model": settings.model_name, "detector": settings.detector_backend,
            },
        ).fetchone()
        if row is None:
            return None
        photo_id = row[0]
        conn.execute("DELETE FROM faces WHERE photo_id = %s", (photo_id,))
        if faces:
            with conn.cursor() as cur:
                cur.executemany(
                    """
                    INSERT INTO faces (photo_id, trip_id, x, y, w, h, det_confidence, embedding, model_name, detector)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s, %s)
                    """,
                    [
                        (photo_id, trip_id, f.box.x, f.box.y, f.box.w, f.box.h, f.confidence, to_vector(f.embedding),
                         settings.model_name, settings.detector_backend)
                        for f in faces
                    ],
                )
        return photo_id


def delete_photo(conn: psycopg.Connection, bucket: str, name: str, generation: int) -> int:
    """Removes the photo (faces cascade) unless a newer generation replaced it. GCS also sends `deleted` for
    the old generation when an object is overwritten, which must not remove the new one."""
    with conn.transaction():
        cur = conn.execute(
            "DELETE FROM face_photos WHERE bucket = %s AND object_name = %s AND generation <= %s",
            (bucket, name, generation),
        )
        return cur.rowcount


# --- Search ---

# One selfie embedding against one trip. The materialized CTE is the ANN step: ORDER BY embedding <=> q LIMIT k
# is the shape the HNSW index serves. With hnsw.iterative_scan the index scan keeps going until k rows pass the
# trip_id filter (or hnsw.max_scan_tuples), instead of stopping after hnsw.ef_search candidates. relaxed_order
# can return rows slightly out of order, so the outer query sorts again.
NEAREST_SQL = """
WITH nearest AS MATERIALIZED (
  SELECT f.id, f.photo_id, f.x, f.y, f.w, f.h, f.embedding <=> %(q)s::vector AS distance
  FROM faces f
  WHERE f.trip_id = %(trip_id)s AND f.model_name = %(model)s AND f.detector = %(detector)s
  ORDER BY f.embedding <=> %(q)s::vector
  LIMIT %(k)s
)
SELECT n.id, n.photo_id, n.x, n.y, n.w, n.h, n.distance, p.bucket, p.object_name, p.generation, p.width, p.height
FROM nearest n JOIN face_photos p ON p.id = n.photo_id
ORDER BY n.distance
"""


@dataclass
class FaceHit:
    face_id: int
    photo_id: int
    x: int
    y: int
    w: int
    h: int
    distance: float
    bucket: str
    object_name: str
    generation: int
    width: int | None
    height: int | None


@dataclass
class PhotoMatch:
    photo_id: int
    bucket: str
    object_name: str
    generation: int
    width: int | None
    height: int | None
    distance: float
    faces: list[FaceHit] = field(default_factory=list)

    def as_json(self) -> dict:
        return {
            "bucket": self.bucket,
            "object_name": self.object_name,
            "generation": str(self.generation),
            "width": self.width,
            "height": self.height,
            "distance": round(self.distance, 4),
            "faces": [
                {"x": f.x, "y": f.y, "w": f.w, "h": f.h, "distance": round(f.distance, 4)} for f in self.faces
            ],
        }


def set_scan_options(conn: psycopg.Connection, settings: Settings) -> None:
    # SET LOCAL lasts until the end of the current transaction only, so pooled connections stay clean.
    conn.execute(f"SET LOCAL hnsw.ef_search = {int(settings.hnsw_ef_search)}")
    conn.execute("SELECT set_config('hnsw.iterative_scan', %s, true)", (settings.hnsw_iterative_scan,))
    conn.execute(f"SET LOCAL hnsw.max_scan_tuples = {int(settings.hnsw_max_scan_tuples)}")


def nearest_faces(conn: psycopg.Connection, query: np.ndarray, trip_id: str, k: int, settings: Settings) -> list[FaceHit]:
    rows = conn.execute(
        NEAREST_SQL,
        {"q": to_vector(query), "trip_id": trip_id, "k": k, "model": settings.model_name,
         "detector": settings.detector_backend},
    ).fetchall()
    return [FaceHit(*r) for r in rows]


def matches_for_selfie(
    conn: psycopg.Connection, query: np.ndarray, trip_id: str, settings: Settings
) -> tuple[list[FaceHit], bool]:
    """Every face in the trip closer than the threshold. Returns (hits, truncated).

    If all k nearest faces are matches there may be more beyond k, so k doubles and the query runs again.
    Only SEARCH_MAX_K stops it, and then truncated is True (never a silent drop).
    """
    k = settings.search_initial_k
    while True:
        hits = nearest_faces(conn, query, trip_id, k, settings)
        matched = [h for h in hits if h.distance < settings.match_threshold]
        if len(hits) < k or len(matched) < len(hits):
            return matched, False
        if k >= settings.search_max_k:
            return matched, True
        k = min(k * 2, settings.search_max_k)


def group_by_photo(per_selfie: Iterable[list[FaceHit]]) -> list[PhotoMatch]:
    """Merges selfies: a face's distance is its minimum across selfies; a photo's is its closest face."""
    best: dict[int, FaceHit] = {}
    for hits in per_selfie:
        for h in hits:
            if h.face_id not in best or h.distance < best[h.face_id].distance:
                best[h.face_id] = h
    photos: dict[int, PhotoMatch] = {}
    for h in best.values():
        p = photos.get(h.photo_id)
        if p is None:
            p = photos[h.photo_id] = PhotoMatch(h.photo_id, h.bucket, h.object_name, h.generation, h.width, h.height, h.distance)
        p.faces.append(h)
        p.distance = min(p.distance, h.distance)
    for p in photos.values():
        p.faces.sort(key=lambda f: f.distance)
    return sorted(photos.values(), key=lambda p: (p.distance, p.object_name))


def search(
    conn: psycopg.Connection, queries: Sequence[np.ndarray], trip_id: str, settings: Settings
) -> tuple[list[PhotoMatch], bool]:
    with conn.transaction():
        set_scan_options(conn, settings)
        per_selfie, truncated = [], False
        for q in queries:
            hits, cut = matches_for_selfie(conn, q, trip_id, settings)
            per_selfie.append(hits)
            truncated = truncated or cut
    return group_by_photo(per_selfie), truncated
