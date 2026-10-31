"""Sends a fake GCS `finalized` (or `deleted`) CloudEvent to the local face-indexer for a local image.

Copies the image into ./local-bucket/<object name> (what the compose indexer reads as its bucket), then POSTs a
binary-mode CloudEvent like Eventarc does.

  python scripts/send_event.py path/to/photo.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001
  python scripts/send_event.py path/to/photo.jpg --trip <uuid> --deleted
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import shutil
import time
import urllib.request
import uuid
from pathlib import Path

CLOUD_DIR = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("image", type=Path, help="local image file")
    parser.add_argument("--trip", default="6f1c7f9e-0000-4000-8000-000000000001", help="trip id (UUID) for the object path")
    parser.add_argument("--name", help="object name; default trips/<trip>/photos/<image file name>")
    parser.add_argument("--bucket", default="ghoomates")
    parser.add_argument("--generation", type=int, help="object generation; default: current time in microseconds")
    parser.add_argument("--url", default="http://localhost:8081/", help="indexer URL")
    parser.add_argument("--deleted", action="store_true", help="send object.v1.deleted instead of finalized")
    args = parser.parse_args()

    name = args.name or f"trips/{args.trip}/photos/{args.image.name}"
    generation = args.generation or time.time_ns() // 1000
    content_type = mimetypes.guess_type(args.image.name)[0] or "application/octet-stream"
    if args.image.suffix.lower() in (".heic", ".heif"):
        content_type = f"image/{args.image.suffix.lower().lstrip('.')}"

    if not args.deleted:
        target = CLOUD_DIR / "local-bucket" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.image, target)

    event_type = "google.cloud.storage.object.v1." + ("deleted" if args.deleted else "finalized")
    body = {
        "bucket": args.bucket,
        "name": name,
        "generation": str(generation),
        "metageneration": "1",
        "contentType": content_type,
        "size": str(args.image.stat().st_size),
    }
    request = urllib.request.Request(
        args.url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "ce-specversion": "1.0",
            "ce-id": str(uuid.uuid4()),
            "ce-type": event_type,
            "ce-source": f"//storage.googleapis.com/projects/_/buckets/{args.bucket}",
            "ce-subject": f"objects/{name}",
            "ce-time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=300) as response:
        print(f"{event_type} {name} generation={generation} -> HTTP {response.status} "
              f"in {time.monotonic() - started:.1f}s (details in the indexer logs)")


if __name__ == "__main__":
    main()
