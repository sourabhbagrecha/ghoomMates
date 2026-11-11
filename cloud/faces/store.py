"""MongoDB reads and writes for face_photos and faces (indexes in faces/migrate.py). Functions take a pymongo
Database."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence

import numpy as np
from bson import ObjectId
from bson.binary import Binary, BinaryVectorDtype
from pymongo import ReturnDocument
from pymongo.client_session import ClientSession
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from faces.config import VECTOR_SEARCH_MAX, Settings
from faces.pipeline import Face

DONE_STATUSES = ("indexed", "no_faces")
VECTOR_INDEX = "faces_embedding"


def to_vector(v: np.ndarray) -> Binary:
    """BSON float32 vector: a third of the size of a double array, and what the vector index reads directly."""
    return Binary.from_vector(np.asarray(v, dtype=np.float32).tolist(), BinaryVectorDtype.FLOAT32)


@dataclass(frozen=True)
class StoredPhoto:
    id: ObjectId
    generation: int
    status: str
    model_name: str
    detector: str


def get_photo(db: Database, bucket: str, name: str) -> StoredPhoto | None:
    doc = db.face_photos.find_one(
        {"bucket": bucket, "object_name": name},
        {"generation": 1, "status": 1, "model_name": 1, "detector": 1},
    )
    if doc is None:
        return None
    return StoredPhoto(doc["_id"], doc["generation"], doc["status"], doc["model_name"], doc["detector"])


def skip_reason(
    stored: StoredPhoto | None, generation: int, settings: Settings, done: tuple[str, ...] = DONE_STATUSES,
) -> str | None:
    """Why an event needs no work, or None. Eventarc delivers at least once, so repeats are normal."""
    if stored is None:
        return None
    if stored.generation > generation:
        return "stale event: a newer generation is already stored"
    if (
        stored.generation == generation
        and stored.status in done
        and stored.model_name == settings.model_name
        and stored.detector == settings.detector_backend
    ):
        return "generation already indexed"
    return None


def save_photo(
    db: Database,
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
) -> ObjectId | None:
    """Upserts the photo and replaces its faces in one transaction. Returns the photo id, or None when a newer
    generation of the object is already stored (the event is stale and nothing changes)."""
    now = datetime.now(timezone.utc)
    photo = {
        "generation": generation, "trip_id": trip_id, "width": width, "height": height, "face_count": len(faces),
        "status": status, "error": error, "model_name": settings.model_name, "detector": settings.detector_backend,
        "indexed_at": now,
    }

    def write(session: ClientSession) -> ObjectId:
        # A stored newer generation fails the filter, so the upsert inserts a second (bucket, object_name) and the
        # unique index rejects it: DuplicateKeyError means stale. It aborts the transaction; caught below.
        doc = db.face_photos.find_one_and_update(
            {"bucket": bucket, "object_name": name, "generation": {"$lte": generation}},
            {"$set": photo, "$setOnInsert": {"bucket": bucket, "object_name": name}},
            projection={"_id": 1}, upsert=True, return_document=ReturnDocument.AFTER, session=session,
        )
        photo_id = doc["_id"]
        db.faces.delete_many({"photo_id": photo_id}, session=session)
        if faces:
            # Photo fields are copied onto each face so search needs no join.
            db.faces.insert_many([
                {
                    "photo_id": photo_id, "trip_id": trip_id, "x": int(f.box.x), "y": int(f.box.y),
                    "w": int(f.box.w), "h": int(f.box.h), "det_confidence": float(f.confidence),
                    "embedding": to_vector(f.embedding), "model_name": settings.model_name,
                    "detector": settings.detector_backend, "created_at": now, "bucket": bucket, "object_name": name,
                    "generation": generation, "width": width, "height": height,
                }
                for f in faces
            ], session=session)
        return photo_id

    with db.client.start_session() as session:
        try:
            return session.with_transaction(write)
        except DuplicateKeyError:
            return None


def delete_photo(db: Database, bucket: str, name: str, generation: int) -> int:
    """Removes the photo and its faces unless a newer generation replaced it. GCS also sends `deleted` for the old
    generation when an object is overwritten, which must not remove the new one."""

    def write(session: ClientSession) -> int:
        doc = db.face_photos.find_one_and_delete(
            {"bucket": bucket, "object_name": name, "generation": {"$lte": generation}},
            projection={"_id": 1}, session=session,
        )
        if doc is None:
            return 0
        db.faces.delete_many({"photo_id": doc["_id"]}, session=session)
        return 1

    with db.client.start_session() as session:
        return session.with_transaction(write)


# --- Profile selfies ---
#
# One selfie_faces document per uploaded selfie object (users/<userId>/selfies/<uuid>.<ext>), keyed by object_name.
# The backend's find-me reads the embedding of the user's current selfie (users.selfie_key) and sends it to
# face-search as a query vector. The embedding is a plain array of floats, so the backend can pass it on as JSON.

SELFIE_DONE_STATUSES = ("indexed", "no_face")


def get_selfie(db: Database, name: str) -> StoredPhoto | None:
    doc = db.selfie_faces.find_one(
        {"object_name": name}, {"generation": 1, "status": 1, "model_name": 1, "detector": 1},
    )
    if doc is None:
        return None
    return StoredPhoto(doc["_id"], doc.get("generation", 0), doc["status"], doc.get("model_name", ""), doc.get("detector", ""))


def save_selfie(
    db: Database,
    *,
    bucket: str,
    name: str,
    generation: int,
    user_id: str,
    status: str,
    settings: Settings,
    face: Face | None = None,
    error: str | None = None,
) -> bool:
    """Upserts the selfie's embedding. False when a newer generation is already stored (a stale event)."""
    doc = {
        "bucket": bucket, "user_id": user_id, "generation": generation, "status": status, "error": error,
        "embedding": face.embedding.astype(float).tolist() if face is not None else None,
        "confidence": float(face.confidence) if face is not None else None,
        "model_name": settings.model_name, "detector": settings.detector_backend,
        "indexed_at": datetime.now(timezone.utc),
    }
    try:
        # A newer stored generation fails the filter, so the upsert inserts a duplicate object_name: stale.
        db.selfie_faces.update_one(
            {"object_name": name, "generation": {"$lte": generation}},
            {"$set": doc, "$setOnInsert": {"object_name": name}},
            upsert=True,
        )
        return True
    except DuplicateKeyError:
        return False


def delete_selfie(db: Database, name: str, generation: int) -> int:
    return db.selfie_faces.delete_one({"object_name": name, "generation": {"$lte": generation}}).deleted_count


# --- Search ---


@dataclass
class FaceHit:
    face_id: ObjectId
    photo_id: ObjectId
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
    photo_id: ObjectId
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


def nearest_faces(db: Database, query: np.ndarray, trip_id: str, k: int, settings: Settings) -> list[FaceHit]:
    """The k nearest faces of one trip (ANN). The trip/model filter runs inside the index scan, so k results
    come back whenever the trip has k faces, however many other trips there are."""
    pipeline = [
        {"$vectorSearch": {
            "index": VECTOR_INDEX,
            "path": "embedding",
            "queryVector": np.asarray(query, dtype=np.float32).tolist(),
            "numCandidates": min(max(10 * k, 100), VECTOR_SEARCH_MAX),
            "limit": k,
            "filter": {"$and": [
                {"trip_id": {"$eq": trip_id}},
                {"model_name": {"$eq": settings.model_name}},
                {"detector": {"$eq": settings.detector_backend}},
            ]},
        }},
        {"$project": {
            "photo_id": 1, "x": 1, "y": 1, "w": 1, "h": 1, "bucket": 1, "object_name": 1, "generation": 1,
            "width": 1, "height": 1, "score": {"$meta": "vectorSearchScore"},
        }},
    ]
    hits = [
        # Atlas cosine score is (1 + cos) / 2; distance = 1 - cos keeps MATCH_THRESHOLD's meaning.
        FaceHit(d["_id"], d["photo_id"], d["x"], d["y"], d["w"], d["h"], 2 * (1 - d["score"]), d["bucket"],
                d["object_name"], d["generation"], d.get("width"), d.get("height"))
        for d in db.faces.aggregate(pipeline)
    ]
    return sorted(hits, key=lambda h: h.distance)


def matches_for_selfie(db: Database, query: np.ndarray, trip_id: str, settings: Settings) -> tuple[list[FaceHit], bool]:
    """Every face in the trip closer than the threshold. Returns (hits, truncated).

    If all k nearest faces are matches there may be more beyond k, so k doubles and the query runs again.
    Only SEARCH_MAX_K stops it, and then truncated is True (never a silent drop).
    """
    k = settings.search_initial_k
    while True:
        hits = nearest_faces(db, query, trip_id, k, settings)
        matched = [h for h in hits if h.distance < settings.match_threshold]
        if len(hits) < k or len(matched) < len(hits):
            return matched, False
        if k >= settings.search_max_k:
            return matched, True
        k = min(k * 2, settings.search_max_k)


def group_by_photo(per_selfie: Iterable[list[FaceHit]]) -> list[PhotoMatch]:
    """Merges selfies: a face's distance is its minimum across selfies; a photo's is its closest face."""
    best: dict[ObjectId, FaceHit] = {}
    for hits in per_selfie:
        for h in hits:
            if h.face_id not in best or h.distance < best[h.face_id].distance:
                best[h.face_id] = h
    photos: dict[ObjectId, PhotoMatch] = {}
    for h in best.values():
        p = photos.get(h.photo_id)
        if p is None:
            p = photos[h.photo_id] = PhotoMatch(h.photo_id, h.bucket, h.object_name, h.generation, h.width, h.height, h.distance)
        p.faces.append(h)
        p.distance = min(p.distance, h.distance)
    for p in photos.values():
        p.faces.sort(key=lambda f: f.distance)
    return sorted(photos.values(), key=lambda p: (p.distance, p.object_name))


def search(db: Database, queries: Sequence[np.ndarray], trip_id: str, settings: Settings) -> tuple[list[PhotoMatch], bool]:
    per_selfie, truncated = [], False
    for q in queries:
        hits, cut = matches_for_selfie(db, q, trip_id, settings)
        per_selfie.append(hits)
        truncated = truncated or cut
    return group_by_photo(per_selfie), truncated
