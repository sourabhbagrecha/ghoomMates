"""One MongoClient per process. pymongo pools connections itself (Cloud Run concurrency is 1, so a few are plenty)."""

from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

from faces.config import Settings


def open_db(settings: Settings) -> Database:
    if not settings.mongodb_connection_string:
        raise ValueError("MONGODB_CONNECTION_STRING is not set")
    client: MongoClient = MongoClient(
        settings.mongodb_connection_string,
        # Don't block startup on the database (not even the mongodb+srv DNS lookup): a down database fails
        # requests (and Eventarc retries), not boot.
        connect=False,
        serverSelectionTimeoutMS=settings.db_connect_timeout * 1000,
        maxPoolSize=4,
        appname="face-indexer",
    )
    return client[settings.mongodb_db]
