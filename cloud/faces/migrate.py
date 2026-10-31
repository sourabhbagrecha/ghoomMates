"""Applies cloud/migrations/*.sql in filename order, each in its own transaction, once per database.

Tracked in face_schema_migrations, separate from the backend's schema_migrations, so the two runners never
interfere. Usage: DATABASE_URL=... python -m faces.migrate
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg

from faces.db import normalize_dsn

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
LOCK_ID = 7_253_611  # the backend uses 7_253_610


def migrate(database_url: str, directory: Path = MIGRATIONS_DIR) -> list[str]:
    applied_now = []
    with psycopg.connect(normalize_dsn(database_url), autocommit=True, connect_timeout=15) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS face_schema_migrations "
                "(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
            )
            applied = {r[0] for r in conn.execute("SELECT name FROM face_schema_migrations").fetchall()}
            for path in sorted(directory.glob("*.sql")):
                if path.name in applied:
                    continue
                with conn.transaction():
                    conn.execute(path.read_text())
                    conn.execute("INSERT INTO face_schema_migrations (name) VALUES (%s)", (path.name,))
                applied_now.append(path.name)
                print(f"applied {path.name}")
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
    return applied_now


if __name__ == "__main__":
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        sys.exit("Set DATABASE_URL")
    done = migrate(url)
    print(f"{len(done)} migration(s) applied" if done else "face migrations already up to date")
