"""face-search: private HTTP API the backend calls with a trip id and 1 to 3 selfies (or their cached embeddings).

Selfies are decoded, embedded and dropped in memory. They are never written to storage, the database or logs.
"""

from __future__ import annotations

import base64
import binascii
import logging
import time
import uuid
from typing import Any

import numpy as np

from flask import Flask, Response, jsonify, request
from pymongo.database import Database

from faces import store
from faces.config import Settings
from faces.logs import log
from faces.pipeline import BadImage, FaceEngine, NoFace, l2_normalize

logger = logging.getLogger("face-search")


class InvalidRequest(Exception):
    def __init__(self, code: str, message: str, status: int = 400, **extra: Any):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra


def decode_selfie(value: Any, index: int, settings: Settings) -> bytes:
    """Accepts plain base64 or a data URL (data:image/jpeg;base64,...), as stored in users.picture."""
    if not isinstance(value, str) or not value:
        raise InvalidRequest("VALIDATION_ERROR", f"selfies[{index}] must be a base64 string or data URL")
    if value.startswith("data:"):
        header, _, value = value.partition(",")
        if ";base64" not in header:
            raise InvalidRequest("VALIDATION_ERROR", f"selfies[{index}] data URL must be base64 encoded")
    if len(value) > (settings.max_selfie_bytes * 4) // 3 + 4:
        raise InvalidRequest("SELFIE_TOO_LARGE", f"selfies[{index}] is over {settings.max_selfie_bytes} bytes", 413)
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise InvalidRequest("VALIDATION_ERROR", f"selfies[{index}] is not valid base64") from exc


def parse_request(body: Any, settings: Settings) -> tuple[str, list[bytes]]:
    if not isinstance(body, dict):
        raise InvalidRequest("VALIDATION_ERROR", "Send a JSON body: { trip_id, selfies: [base64, ...] }")
    try:
        trip_id = str(uuid.UUID(str(body.get("trip_id", ""))))
    except ValueError as exc:
        raise InvalidRequest("VALIDATION_ERROR", "trip_id must be a UUID") from exc
    selfies = body.get("selfies")
    if not isinstance(selfies, list) or not 1 <= len(selfies) <= settings.max_selfies:
        raise InvalidRequest("VALIDATION_ERROR", f"selfies must be a list of 1 to {settings.max_selfies} images")
    return trip_id, [decode_selfie(s, i, settings) for i, s in enumerate(selfies)]


def parse_embeddings(body: dict[str, Any], settings: Settings) -> list[np.ndarray]:
    """Query vectors computed earlier by this service (the `embedding` of a /search response)."""
    raw = body.get("embeddings")
    if not isinstance(raw, list) or not 1 <= len(raw) <= settings.max_selfies:
        raise InvalidRequest("VALIDATION_ERROR", f"embeddings must be a list of 1 to {settings.max_selfies} vectors")
    out = []
    for i, vector in enumerate(raw):
        if not isinstance(vector, list) or not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in vector):
            raise InvalidRequest("VALIDATION_ERROR", f"embeddings[{i}] must be a list of numbers")
        normalized = l2_normalize(vector, settings.embedding_dim)
        if normalized is None:
            raise InvalidRequest("VALIDATION_ERROR", f"embeddings[{i}] must be {settings.embedding_dim} finite numbers")
        out.append(normalized)
    return out


def create_app(settings: Settings, engine: FaceEngine, db: Database) -> Flask:
    app = Flask("face-search")
    # Base64 adds a third; this stays under Cloud Run's 32 MiB request limit with the defaults.
    app.config["MAX_CONTENT_LENGTH"] = settings.max_selfies * ((settings.max_selfie_bytes * 4) // 3 + 1024) + 4096

    @app.errorhandler(InvalidRequest)
    def invalid(exc: InvalidRequest) -> tuple[Response, int]:
        return jsonify(error={"code": exc.code, "message": exc.message, **exc.extra}), exc.status

    @app.errorhandler(413)
    def too_large(_exc: Any) -> tuple[Response, int]:
        return jsonify(error={"code": "BODY_TOO_LARGE", "message": "Request body is too large"}), 413

    @app.get("/healthz")
    def healthz() -> Response:
        return jsonify(status="ok", service="search")

    @app.post("/search")
    def search() -> tuple[Response, int]:
        started = time.monotonic()
        body = request.get_json(silent=True)
        selfie_faces: list[dict[str, Any]] = []
        embed_ms = 0
        if isinstance(body, dict) and "embeddings" in body:
            # Vectors from an earlier /search: skips detection and embedding entirely.
            try:
                trip_id = str(uuid.UUID(str(body.get("trip_id", ""))))
            except ValueError as exc:
                raise InvalidRequest("VALIDATION_ERROR", "trip_id must be a UUID") from exc
            queries = parse_embeddings(body, settings)
        else:
            trip_id, selfies = parse_request(body, settings)
            t = time.monotonic()
            queries = []
            for i, data in enumerate(selfies):
                try:
                    face = engine.selfie_embedding(data)
                except BadImage as exc:
                    raise InvalidRequest("INVALID_IMAGE", f"selfies[{i}] is not a readable image", 422, selfie=i) from exc
                except NoFace as exc:
                    raise InvalidRequest("NO_FACE", f"No face found in selfies[{i}]", 422, selfie=i) from exc
                queries.append(face.embedding)
                # The embedding is returned so the backend can cache it and search by vector next time.
                selfie_faces.append({"confidence": round(face.confidence, 4), "embedding": face.embedding.tolist()})
            del selfies
            embed_ms = round((time.monotonic() - t) * 1000)

        t = time.monotonic()
        try:
            photos, truncated = store.search(db, queries, trip_id, settings)
        except Exception:
            log(logger, logging.ERROR, "search query failed", exc_info=True, trip_id=trip_id)
            return jsonify(error={"code": "SEARCH_UNAVAILABLE", "message": "Search is temporarily unavailable"}), 503
        query_ms = round((time.monotonic() - t) * 1000)

        timings = {"embed": embed_ms, "query": query_ms, "total": round((time.monotonic() - started) * 1000)}
        log(
            logger, logging.WARNING if truncated else logging.INFO, "search done", trip_id=trip_id,
            selfies=len(queries), matches=len(photos), truncated=truncated, timings_ms=timings,
        )
        return jsonify(
            trip_id=trip_id,
            model_name=settings.model_name,
            detector=settings.detector_backend,
            threshold=settings.match_threshold,
            selfies=selfie_faces,
            matches=[p.as_json() for p in photos],
            truncated=truncated,
        ), 200

    return app
