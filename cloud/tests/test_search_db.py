"""Search SQL against a real pgvector database with synthetic embeddings: scoping, threshold, multiple selfies,
grouping by photo, no silent truncation, and that the query uses the HNSW index."""

from __future__ import annotations

import numpy as np
import psycopg
import pytest

from faces import store
from faces.config import Settings
from faces.pipeline import Box
from tests.conftest import TRIP_A, TRIP_B, cosine_distance, fake_face, near, unit

pytestmark = pytest.mark.db


def add(pool, name, trip, faces, settings=None, generation=1):
    with pool.connection() as conn:
        store.save_photo(conn, bucket="ghoomates", name=name, generation=generation, trip_id=trip, status="indexed",
                         settings=settings or Settings(), width=1000, height=800, faces=faces)


def run(pool, queries, trip, settings=None):
    with pool.connection() as conn:
        return store.search(conn, queries, trip, settings or Settings())


@pytest.fixture
def rng():
    return np.random.default_rng(1234)


def test_finds_only_the_person_in_the_trip(clean_db, rng):
    me, stranger = unit(rng.normal(size=512)), unit(rng.normal(size=512))
    add(clean_db, "trips/a/photos/1.jpg", TRIP_A, [fake_face(near(me, rng), Box(1, 2, 50, 60))])
    add(clean_db, "trips/a/photos/2.jpg", TRIP_A, [fake_face(stranger)])
    add(clean_db, "trips/b/photos/3.jpg", TRIP_B, [fake_face(near(me, rng))])
    matches, truncated = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["trips/a/photos/1.jpg"]
    assert truncated is False
    face = matches[0].faces[0]
    assert (face.x, face.y, face.w, face.h) == (1, 2, 50, 60)
    assert 0 <= face.distance < 0.40


def orthogonal(me, rng):
    r = rng.normal(size=512)
    return unit(r - np.dot(r, me) * me)


def at_distance(me, other, d):
    """Unit vector at cosine distance d from me, in the plane of me and other (other is orthogonal to me)."""
    cos = 1 - d
    return unit(cos * me + np.sqrt(1 - cos**2) * other)


def test_threshold_applies(clean_db, rng):
    me = unit(rng.normal(size=512))
    other = orthogonal(me, rng)
    add(clean_db, "inside.jpg", TRIP_A, [fake_face(at_distance(me, other, 0.395))])
    add(clean_db, "outside.jpg", TRIP_A, [fake_face(at_distance(me, other, 0.405))])
    matches, _ = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["inside.jpg"]
    assert matches[0].distance == pytest.approx(0.395, abs=1e-4)


def test_multiple_selfies_take_the_minimum_distance(clean_db, rng):
    me = unit(rng.normal(size=512))
    other = orthogonal(me, rng)
    side_selfie = at_distance(me, other, 0.30)
    side_photo = at_distance(me, other, 0.55)  # too far from selfie 1, close to selfie 2
    add(clean_db, "front.jpg", TRIP_A, [fake_face(near(me, rng))])
    add(clean_db, "side.jpg", TRIP_A, [fake_face(side_photo)])
    single, _ = run(clean_db, [me], TRIP_A)
    both, _ = run(clean_db, [me, side_selfie], TRIP_A)
    assert [m.object_name for m in single] == ["front.jpg"]
    by_name = {m.object_name: m.distance for m in both}
    assert set(by_name) == {"front.jpg", "side.jpg"}
    assert by_name["side.jpg"] == pytest.approx(cosine_distance(side_selfie, side_photo), abs=1e-4)
    assert by_name["side.jpg"] < 0.1


def test_results_group_by_photo_and_sort_by_distance(clean_db, rng):
    me, stranger = unit(rng.normal(size=512)), unit(rng.normal(size=512))
    add(clean_db, "far.jpg", TRIP_A, [fake_face(near(me, rng, 0.03))])
    add(clean_db, "group.jpg", TRIP_A, [
        fake_face(near(me, rng, 0.002), Box(0, 0, 50, 50)),
        fake_face(near(me, rng, 0.02), Box(100, 0, 50, 50)),  # the same person twice (a mirror, a poster)
        fake_face(stranger, Box(200, 0, 50, 50)),
    ])
    matches, _ = run(clean_db, [me], TRIP_A)
    assert [m.object_name for m in matches] == ["group.jpg", "far.jpg"]
    group = matches[0]
    assert [f.x for f in group.faces] == [0, 100]
    assert group.distance == group.faces[0].distance
    assert group.as_json()["faces"][0]["distance"] <= group.as_json()["faces"][1]["distance"]


def test_someone_in_hundreds_of_photos_is_never_cut_off(clean_db, rng):
    me = unit(rng.normal(size=512))
    for i in range(120):
        add(clean_db, f"p{i:03}.jpg", TRIP_A, [fake_face(near(me, rng))])
    for i in range(30):
        add(clean_db, f"s{i:03}.jpg", TRIP_A, [fake_face(rng.normal(size=512))])
    small_k = Settings(search_initial_k=16, hnsw_ef_search=10)
    matches, truncated = run(clean_db, [me], TRIP_A, small_k)
    assert len(matches) == 120 and truncated is False
    capped = Settings(search_initial_k=16, search_max_k=32)
    matches, truncated = run(clean_db, [me], TRIP_A, capped)
    assert len(matches) == 32 and truncated is True


def test_faces_from_another_model_are_not_compared(clean_db, rng):
    me = unit(rng.normal(size=512))
    add(clean_db, "old.jpg", TRIP_A, [fake_face(near(me, rng))], settings=Settings(model_name="OldModel"))
    assert run(clean_db, [me], TRIP_A)[0] == []


def bulk_noise(conn, rng, trip_id, n):
    """n random faces (strangers) on one photo, inserted with COPY."""
    photo_id = conn.execute(
        "INSERT INTO face_photos (bucket, object_name, generation, trip_id, status, model_name, detector) "
        "VALUES ('ghoomates', %s, 1, %s, 'indexed', 'Facenet512', 'retinaface') RETURNING id",
        (f"noise-{trip_id}.jpg", trip_id),
    ).fetchone()[0]
    with conn.cursor().copy(
        "COPY faces (photo_id, trip_id, x, y, w, h, det_confidence, embedding, model_name, detector) FROM STDIN"
    ) as copy:
        for v in rng.normal(size=(n, 512)):
            copy.write_row((photo_id, trip_id, 0, 0, 50, 50, 0.99, store.to_vector(unit(v)), "Facenet512", "retinaface"))


def plan_for(conn, k, trip_id=TRIP_A):
    params = {"q": store.to_vector(unit(np.ones(512))), "trip_id": trip_id, "k": k, "model": "Facenet512",
              "detector": "retinaface"}
    # Client-side binding: EXPLAIN gets the query vector as a literal.
    rows = psycopg.ClientCursor(conn).execute("EXPLAIN " + store.NEAREST_SQL, params).fetchall()
    return "\n".join(r[0] for r in rows)


def test_planner_uses_hnsw_for_a_broad_scope(clean_db, rng):
    with clean_db.connection() as conn:
        bulk_noise(conn, rng, TRIP_A, 3000)
        conn.execute("ANALYZE faces")
        conn.commit()
        with conn.transaction():
            store.set_scan_options(conn, Settings())
            assert "faces_embedding_hnsw_idx" in plan_for(conn, 40)


def test_iterative_scan_keeps_filtered_hnsw_results_complete(clean_db, rng):
    """The two gotchas on the HNSW path: without iterative scan, the index stops after ef_search candidates, and
    the trip filter then removes the other trip's lookalikes, so most matches vanish silently."""
    me = unit(rng.normal(size=512))
    for i in range(120):
        add(clean_db, f"a{i:03}.jpg", TRIP_A, [fake_face(near(me, rng))])
    for i in range(200):  # the same person in another trip: global nearest neighbours that the filter drops
        add(clean_db, f"b{i:03}.jpg", TRIP_B, [fake_face(near(me, rng))])
    with clean_db.connection() as conn:
        bulk_noise(conn, rng, TRIP_A, 1500)
        bulk_noise(conn, rng, TRIP_B, 1500)
        conn.execute("ANALYZE faces")
        conn.commit()
        with conn.transaction():
            # Force the HNSW path (Postgres would pick the exact trip_id btree here); DDL rolls back at the end.
            conn.execute("DROP INDEX faces_trip_idx")
            conn.execute("SET LOCAL enable_seqscan = off")
            store.set_scan_options(conn, Settings())
            assert "faces_embedding_hnsw_idx" in plan_for(conn, 40)

            naive = Settings(hnsw_iterative_scan="off", hnsw_ef_search=40, search_initial_k=40)
            matches, truncated = store.search(conn, [me], TRIP_A, naive)
            assert len(matches) < 120 and truncated is False  # silently incomplete

            matches, truncated = store.search(conn, [me], TRIP_A, Settings(search_initial_k=40))
            assert len(matches) == 120 and truncated is False
            raise psycopg.Rollback()  # undo DROP INDEX
