"""End to end with the real models: index sample photos through the indexer endpoint into Postgres, then find
them through the search endpoint with a selfie.

Sample images come from the deepface repository's test dataset (pinned commit), downloaded once into
SAMPLE_CACHE_DIR. Identities, measured with this pipeline (cosine distance within a person 0.06 to 0.35, closest
strangers 0.59 and up):
  person A: img1, img2, img4, img5, img6, img7, img11    person B: img8, img9    person C: img22, img23
  person D: img18, img19    one-offs: img3, img17, img20
"""

from __future__ import annotations

import base64
import os
import urllib.request
from pathlib import Path

import pytest

from faces.config import Settings
from faces.indexer import FINALIZED
from faces.indexer import create_app as create_indexer
from faces.search import create_app as create_search
from faces.storage import LocalReader
from tests.conftest import TRIP_A, TRIP_B

pytestmark = [pytest.mark.db, pytest.mark.integration]

DATASET = "https://raw.githubusercontent.com/serengil/deepface/00429d0894309436e5503dd6ef8734cd70c297ad/tests/unit/dataset"
GALLERY = {  # image -> trip
    "img2.jpg": TRIP_A, "img11.jpg": TRIP_A, "img3.jpg": TRIP_A, "img8.jpg": TRIP_A, "img22.jpg": TRIP_A,
    "img18.jpg": TRIP_A, "img7.jpg": TRIP_B, "img9.jpg": TRIP_B,
}
SELFIES = ["img1.jpg", "img9.jpg", "img23.jpg"]


@pytest.fixture(scope="module")
def samples() -> Path:
    try:
        import deepface  # noqa: F401
    except ImportError:
        pytest.skip("deepface is not installed (run the integration test in the test container)")
    cache = Path(os.environ.get("SAMPLE_CACHE_DIR", "/tmp/face-samples"))
    cache.mkdir(parents=True, exist_ok=True)
    for name in [*GALLERY, *SELFIES]:
        target = cache / name
        if not target.exists():
            try:
                urllib.request.urlretrieve(f"{DATASET}/{name}", target)
            except OSError as exc:
                pytest.skip(f"cannot download sample images: {exc}")
    return cache


@pytest.fixture(scope="module")
def engine():
    from faces.pipeline import FaceEngine

    e = FaceEngine(Settings())
    e.warm_up()
    return e


@pytest.fixture(scope="module")
def clients(samples, engine, pool, tmp_path_factory):
    with pool.connection() as conn:
        conn.execute("TRUNCATE face_photos, faces RESTART IDENTITY")
    bucket_dir = tmp_path_factory.mktemp("bucket")
    for name, trip in GALLERY.items():
        target = bucket_dir / f"trips/{trip}/photos/{name}"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((samples / name).read_bytes())
    settings = Settings()
    indexer = create_indexer(settings, engine, pool, LocalReader(str(bucket_dir))).test_client()
    search = create_search(settings, engine, pool).test_client()
    for i, (name, trip) in enumerate(GALLERY.items(), start=1):
        response = indexer.post(
            "/",
            json={"bucket": "ghoomates", "name": f"trips/{trip}/photos/{name}", "generation": str(i),
                  "contentType": "image/jpeg", "size": str((samples / name).stat().st_size)},
            headers={"ce-id": f"e{i}", "ce-type": FINALIZED},
        )
        assert response.status_code == 204
    return indexer, search


def find(search, samples, trip, *selfies):
    body = {"trip_id": trip, "selfies": [base64.b64encode((samples / s).read_bytes()).decode() for s in selfies]}
    response = search.post("/search", json=body)
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def names(result):
    return {m["object_name"].rsplit("/", 1)[1] for m in result["matches"]}


def test_every_gallery_photo_was_indexed_with_faces(clients, pool):
    with pool.connection() as conn:
        rows = conn.execute("SELECT object_name, status, face_count, width, height FROM face_photos").fetchall()
    assert len(rows) == len(GALLERY)
    for object_name, status, face_count, width, height in rows:
        assert status == "indexed" and face_count >= 1, object_name
        assert width > 0 and height > 0


def test_selfie_finds_the_same_person_only(clients, samples):
    _, search = clients
    result = find(search, samples, TRIP_A, "img1.jpg")
    assert names(result) == {"img2.jpg", "img11.jpg"}
    for match in result["matches"]:
        assert match["distance"] < 0.40
        for face in match["faces"]:
            assert 0 <= face["x"] < match["width"] and 0 <= face["y"] < match["height"]
            assert face["x"] + face["w"] <= match["width"] and face["y"] + face["h"] <= match["height"]


def test_other_people_are_found_too(clients, samples):
    _, search = clients
    assert names(find(search, samples, TRIP_A, "img9.jpg")) == {"img8.jpg"}
    assert names(find(search, samples, TRIP_A, "img23.jpg")) == {"img22.jpg"}


def test_search_is_scoped_to_the_trip(clients, samples):
    _, search = clients
    assert names(find(search, samples, TRIP_B, "img1.jpg")) == {"img7.jpg"}
    assert names(find(search, samples, TRIP_B, "img9.jpg")) == {"img9.jpg"}


def test_multiple_selfies_union_their_matches(clients, samples):
    _, search = clients
    assert names(find(search, samples, TRIP_A, "img1.jpg", "img9.jpg")) == {"img2.jpg", "img11.jpg", "img8.jpg"}


def test_selfie_without_a_face_is_rejected(clients):
    import io

    from PIL import Image

    _, search = clients
    buf = io.BytesIO()
    Image.new("RGB", (400, 400), (120, 160, 200)).save(buf, format="JPEG")
    response = search.post("/search", json={"trip_id": TRIP_A, "selfies": [base64.b64encode(buf.getvalue()).decode()]})
    assert response.status_code == 422 and response.get_json()["error"]["code"] == "NO_FACE"
