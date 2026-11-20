"""Indexes photos that were uploaded before face-indexer existed (or while it was down), and catches up photos
whose faces or tags are out of date.

Lists the bucket and sends every object through the same indexer handler in-process, so the routing, idempotency
and status rules are identical: per photo, faces run again when the model, detector or ATTRS_VERSION changed (e.g.
emotions were added), and tags run when the photo has none, they failed or were skipped (daily budget), or
TAGS_VERSION changed. Photos with nothing to do are skipped, so it is safe to rerun.

  BUCKET=ghoomates PREFIX=trips/ VERTEX_PROJECT=<project> MONGODB_CONNECTION_STRING=... python -m faces.backfill
"""

from __future__ import annotations

import os

from faces import logs
from faces.config import Settings
from faces.db import open_db
from faces.indexer import FINALIZED, create_app, route
from faces.pipeline import FaceEngine
from faces.storage import GcsReader


def main() -> None:
    settings = Settings.from_env()
    logs.setup(settings.log_level)
    bucket = os.environ.get("BUCKET", "ghoomates")
    prefix = os.environ.get("PREFIX", "trips/")

    from google.cloud import storage

    engine = FaceEngine(settings)
    engine.warm_up()
    db = open_db(settings)
    db.command("ping")  # fail fast on a bad connection string instead of 500 on every photo
    print(f"faces: emotions={settings.emotions} attrs_version={settings.attrs_version}; "
          f"tags: {'on, ' + settings.tags_model if settings.tagging else 'off (set VERTEX_PROJECT)'}", flush=True)
    client = create_app(settings, engine, db, GcsReader()).test_client()
    counts: dict[int, int] = {}
    for blob in storage.Client().list_blobs(bucket, prefix=prefix):
        if route(blob.name, (blob.content_type or "").lower(), settings)[0] is None:
            continue
        response = client.post(
            "/",
            json={"bucket": bucket, "name": blob.name, "generation": str(blob.generation),
                  "contentType": blob.content_type, "size": str(blob.size)},
            headers={"ce-id": "backfill", "ce-type": FINALIZED},
        )
        counts[response.status_code] = counts.get(response.status_code, 0) + 1
        print(f"{response.status_code} {blob.name}", flush=True)
    db.client.close()
    print(f"done: {counts or 'no trip photos found'}")


if __name__ == "__main__":
    main()
