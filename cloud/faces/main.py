"""WSGI entry point for face-indexer; models load here, once per instance."""

from __future__ import annotations

import logging

from faces import indexer, logs
from faces.config import Settings
from faces.db import open_db
from faces.pipeline import FaceEngine
from faces.storage import make_reader


def build_app():
    settings = Settings.from_env()
    logs.setup(settings.log_level)
    engine = FaceEngine(settings)
    engine.warm_up()
    db = open_db(settings)
    logs.log(logging.getLogger("face-main"), logging.INFO, "models loaded",
             model_name=settings.model_name, detector=settings.detector_backend)
    return indexer.create_app(settings, engine, db, make_reader(settings))


app = build_app()
