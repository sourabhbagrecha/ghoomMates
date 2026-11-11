"""Creates the indexes of face_photos, faces and selfie_faces, including the Atlas Vector Search index. Idempotent:
run it before the first deploy and again whenever it changes. The backend's schema.ts leaves these collections alone.

Usage: MONGODB_CONNECTION_STRING=... python -m faces.migrate
"""

from __future__ import annotations

import sys
import time

from pymongo import ASCENDING, IndexModel
from pymongo.database import Database
from pymongo.operations import SearchIndexModel

from faces.config import Settings
from faces.db import open_db
from faces.store import VECTOR_INDEX


def vector_index_definition(settings: Settings) -> dict:
    return {"fields": [
        {"type": "vector", "path": "embedding", "numDimensions": settings.embedding_dim, "similarity": "cosine"},
        # Pre-filters: applied inside the ANN scan, so a trip's faces are found among every other trip's.
        {"type": "filter", "path": "trip_id"},
        {"type": "filter", "path": "model_name"},
        {"type": "filter", "path": "detector"},
    ]}


def migrate(db: Database, settings: Settings, wait: float = 300) -> None:
    """Waits up to `wait` seconds for the vector index to be queryable (it builds asynchronously)."""
    # Linked to the backend's trip_photos by object name (object_name = trip_photos.object_key), not by id: the
    # upload event usually arrives before the backend registers the photo.
    db.face_photos.create_indexes([
        IndexModel([("bucket", ASCENDING), ("object_name", ASCENDING)], unique=True),
        IndexModel([("trip_id", ASCENDING)]),
        # The backend's trips faceIndex() looks photos up by object_name within a trip (incl. a $lookup).
        IndexModel([("object_name", ASCENDING), ("trip_id", ASCENDING)]),
    ])
    db.faces.create_indexes([IndexModel([("photo_id", ASCENDING)]), IndexModel([("trip_id", ASCENDING)])])
    # Profile selfie embeddings: the indexer upserts by object_name, the backend reads by object_name (the user's
    # current selfie_key) and clears a user's rows by user_id when the selfie changes or is deleted.
    db.selfie_faces.create_indexes([
        IndexModel([("object_name", ASCENDING)], unique=True),
        IndexModel([("user_id", ASCENDING)]),
    ])
    if not list(db.faces.list_search_indexes(VECTOR_INDEX)):
        db.faces.create_search_index(
            SearchIndexModel(vector_index_definition(settings), name=VECTOR_INDEX, type="vectorSearch")
        )
    deadline = time.monotonic() + wait
    while not all(i.get("queryable") for i in db.faces.list_search_indexes(VECTOR_INDEX)):
        if time.monotonic() > deadline:
            raise TimeoutError(f"{VECTOR_INDEX} is not queryable after {wait:.0f}s")
        time.sleep(1)


if __name__ == "__main__":
    settings = Settings.from_env()
    if not settings.mongodb_connection_string:
        sys.exit("Set MONGODB_CONNECTION_STRING")
    db = open_db(settings)
    migrate(db, settings)
    print(f"face indexes ready in {settings.mongodb_db}: face_photos, faces, selfie_faces, {VECTOR_INDEX}")
    db.client.close()
