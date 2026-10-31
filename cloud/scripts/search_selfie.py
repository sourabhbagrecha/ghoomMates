"""Calls face-search with 1 to 3 selfies and prints the matching photos.

  python scripts/search_selfie.py me.jpg --trip 6f1c7f9e-0000-4000-8000-000000000001
  python scripts/search_selfie.py me.jpg me2.jpg --trip <uuid> --url https://face-search-xxxx.a.run.app --token "$(gcloud auth print-identity-token)"
"""

from __future__ import annotations

import argparse
import base64
import json
import time
import urllib.error
import urllib.request
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("selfies", nargs="+", type=Path, help="1 to 3 selfie images")
    parser.add_argument("--trip", default="6f1c7f9e-0000-4000-8000-000000000001", help="trip id (UUID)")
    parser.add_argument("--url", default="http://localhost:8082", help="face-search base URL")
    parser.add_argument("--token", help="ID token for a deployed (private) service")
    args = parser.parse_args()

    body = {"trip_id": args.trip, "selfies": [base64.b64encode(p.read_bytes()).decode() for p in args.selfies]}
    headers = {"Content-Type": "application/json"}
    if args.token:
        headers["Authorization"] = f"Bearer {args.token}"
    request = urllib.request.Request(f"{args.url.rstrip('/')}/search", data=json.dumps(body).encode(), headers=headers)
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode()}")
        raise SystemExit(1)
    print(f"{len(result['matches'])} photo(s) in {time.monotonic() - started:.1f}s, threshold {result['threshold']}"
          + (" (TRUNCATED)" if result["truncated"] else ""))
    for match in result["matches"]:
        boxes = ", ".join(f"[{f['x']},{f['y']} {f['w']}x{f['h']} d={f['distance']}]" for f in match["faces"])
        print(f"  {match['distance']:.4f}  {match['object_name']}  {boxes}")


if __name__ == "__main__":
    main()
