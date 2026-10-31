"""WSGI entry point. SERVICE=indexer or SERVICE=search picks the app; models load here, once per instance."""

from __future__ import annotations

import logging

from faces import logs
from faces.config import Settings
from faces.db import open_pool
from faces.pipeline import FaceEngine


def build_app():
    settings = Settings.from_env()
    logs.setup(settings.log_level)
    engine = FaceEngine(settings)
    engine.warm_up()
    pool = open_pool(settings)
    logs.log(logging.getLogger("face-main"), logging.INFO, "models loaded", service=settings.service,
             model_name=settings.model_name, detector=settings.detector_backend)
    if settings.service == "search":
        from faces import search

        return search.create_app(settings, engine, pool)
    if settings.service == "indexer":
        from faces import indexer
        from faces.storage import make_reader

        return indexer.create_app(settings, engine, pool, make_reader(settings))
    raise ValueError(f"SERVICE must be indexer or search, not {settings.service!r}")


app = build_app()
