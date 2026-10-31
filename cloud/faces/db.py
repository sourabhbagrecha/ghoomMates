"""Postgres connection pool for one Cloud Run instance (concurrency 1, so two connections are plenty)."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from psycopg_pool import ConnectionPool

from faces.config import Settings


def normalize_dsn(url: str) -> str:
    """Accepts the backend's DATABASE_URL as is.

    node-postgres understands sslmode=no-verify (encrypt, skip certificate checks); libpq does not. Its
    equivalent is sslmode=require, which encrypts without verifying the server certificate.
    """
    if not url:
        raise ValueError("DATABASE_URL is not set")
    parts = urlsplit(url)
    query = [(k, "require" if k == "sslmode" and v == "no-verify" else v) for k, v in parse_qsl(parts.query, keep_blank_values=True)]
    return urlunsplit(parts._replace(query=urlencode(query)))


def open_pool(settings: Settings) -> ConnectionPool:
    pool = ConnectionPool(
        normalize_dsn(settings.database_url),
        min_size=settings.db_pool_min,
        max_size=settings.db_pool_max,
        kwargs={"connect_timeout": settings.db_connect_timeout, "application_name": f"face-{settings.service}"},
        # Cloud SQL drops idle connections; check before handing one out instead of failing a request.
        check=ConnectionPool.check_connection,
        max_idle=300,
        timeout=30,
        open=False,
        name=f"face-{settings.service}",
    )
    # Don't block startup on the database: a down database fails requests (and Eventarc retries), not boot.
    pool.open(wait=False)
    return pool
