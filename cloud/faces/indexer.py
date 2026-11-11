"""face-indexer: receives Eventarc Cloud Storage events and keeps face_photos / faces (trip photos) and
selfie_faces (profile selfies) in sync with the bucket.

Response codes drive Eventarc retries:
- 2xx: done, skipped, or failed permanently (status recorded). Eventarc will not redeliver.
- 5xx: transient failure (database or download). Eventarc redelivers with backoff.
"""

from __future__ import annotations

import logging
import posixpath
import time
from dataclasses import dataclass
from typing import Any

from flask import Flask, Response, jsonify, request
from pymongo.database import Database

from faces import store
from faces.config import Settings
from faces.logs import log
from faces.pipeline import BadImage, FaceEngine, NoFace
from faces.storage import ObjectGone, ObjectReader

logger = logging.getLogger("face-indexer")

FINALIZED = "google.cloud.storage.object.v1.finalized"
DELETED = "google.cloud.storage.object.v1.deleted"


@dataclass(frozen=True)
class StorageEvent:
    id: str
    type: str
    bucket: str
    name: str
    generation: int | None
    content_type: str
    size: int | None


def parse_event(headers: Any, body: Any) -> StorageEvent:
    """Accepts binary mode (ce-* headers + object JSON body, what Eventarc sends) and structured mode."""
    if isinstance(body, dict) and "specversion" in body:
        ce_id, ce_type, data = body.get("id", ""), body.get("type", ""), body.get("data") or {}
    else:
        ce_id, ce_type, data = headers.get("ce-id", ""), headers.get("ce-type", ""), body or {}
    if not isinstance(data, dict) or not data.get("bucket") or not data.get("name"):
        raise ValueError("event data needs bucket and name")
    generation = data.get("generation")
    size = data.get("size")
    return StorageEvent(
        id=str(ce_id),
        type=str(ce_type),
        bucket=str(data["bucket"]),
        name=str(data["name"]),
        generation=int(generation) if generation not in (None, "") else None,
        content_type=str(data.get("contentType") or "").split(";")[0].strip().lower(),
        size=int(size) if size not in (None, "") else None,
    )


@dataclass(frozen=True)
class Target:
    kind: str  # "photo" (scope = trip id) or "selfie" (scope = user id)
    scope: str


def route(name: str, content_type: str, settings: Settings) -> tuple[Target | None, str | None]:
    """Returns (target, None) for objects to index, or (None, reason) for objects to ignore.

    Only trip photos and profile selfies are indexed. Receipts, avatars, thumbnails and anything this pipeline might
    ever write are ignored, so no upload can trigger itself in a loop.
    """
    lowered = name.lower()
    selfie = settings.selfie_regex.match(name)
    if selfie:
        target = Target("selfie", selfie.group("user"))
    else:
        for prefix in settings.skip_prefixes:
            if lowered.startswith(prefix):
                return None, f"skip prefix {prefix}"
        match = settings.include_regex.match(name)
        if not match:
            return None, "outside INCLUDE_PATTERN"
        target = Target("photo", match.group("scope").lower())
    ext = posixpath.splitext(lowered)[1].lstrip(".")
    if ext not in settings.image_extensions:
        return None, f"extension .{ext} is not an image"
    if content_type not in settings.image_content_types:
        return None, f"content type {content_type or '(none)'} is not an image"
    return target, None


def create_app(settings: Settings, engine: FaceEngine, db: Database, reader: ObjectReader) -> Flask:
    app = Flask("face-indexer")

    @app.get("/healthz")
    def healthz() -> Response:
        return jsonify(status="ok", service="indexer")

    @app.post("/")
    def receive() -> tuple[Response | str, int]:
        started = time.monotonic()
        try:
            event = parse_event(request.headers, request.get_json(silent=True))
        except (ValueError, TypeError) as exc:
            # A malformed event never becomes valid; retrying it would loop for a day.
            log(logger, logging.ERROR, "malformed event ignored", error=str(exc), ce_id=request.headers.get("ce-id"))
            return "", 204
        fields: dict[str, Any] = {
            "event_id": event.id, "event_type": event.type, "bucket": event.bucket, "object": event.name,
            "generation": event.generation,
        }
        if event.type not in (FINALIZED, DELETED):
            log(logger, logging.INFO, "event type ignored", **fields)
            return "", 204
        target, reason = route(event.name, event.content_type, settings)
        if target is None:
            log(logger, logging.INFO, "object ignored", reason=reason, **fields)
            return "", 204
        if event.generation is None:
            log(logger, logging.ERROR, "event without generation ignored", **fields)
            return "", 204
        try:
            if target.kind == "selfie":
                fields["user_id"] = target.scope
                if event.type == DELETED:
                    return handle_selfie_deleted(event, fields, started)
                return handle_selfie_finalized(event, target.scope, fields, started)
            fields["trip_id"] = target.scope
            if event.type == DELETED:
                return handle_deleted(event, fields, started)
            return handle_finalized(event, target.scope, fields, started)
        except Exception:
            # Database or storage trouble: let Eventarc retry.
            fields["timings_ms"] = {"total": ms(started)}
            log(logger, logging.ERROR, "transient failure, will retry", exc_info=True, **fields)
            return "", 500

    def handle_deleted(event: StorageEvent, fields: dict[str, Any], started: float) -> tuple[str, int]:
        removed = store.delete_photo(db, event.bucket, event.name, event.generation)
        fields["timings_ms"] = {"total": ms(started)}
        log(logger, logging.INFO, "photo removed" if removed else "nothing to remove", **fields)
        return "", 204

    def handle_finalized(event: StorageEvent, trip_id: str, fields: dict[str, Any], started: float) -> tuple[str, int]:
        timings: dict[str, int] = {}
        fields["timings_ms"] = timings

        def save(status: str, **kwargs: Any) -> None:
            t = time.monotonic()
            saved = store.save_photo(
                db, bucket=event.bucket, name=event.name, generation=event.generation, trip_id=trip_id,
                status=status, settings=settings, **kwargs,
            )
            timings["db_write"] = ms(t)
            if saved is None:
                fields["skipped"] = "stale event: a newer generation is already stored"

        t = time.monotonic()
        reason = store.skip_reason(store.get_photo(db, event.bucket, event.name), event.generation, settings)
        timings["db_read"] = ms(t)
        if reason:
            timings["total"] = ms(started)
            log(logger, logging.INFO, "event skipped", reason=reason, **fields)
            return "", 204

        if event.size is not None and event.size > settings.max_image_bytes:
            save("error", error=f"object is {event.size} bytes, over MAX_IMAGE_BYTES")
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "photo too large", status="error", **fields)
            return "", 204

        t = time.monotonic()
        try:
            data = reader.read(event.bucket, event.name, event.generation)
        except ObjectGone as exc:
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "object gone before indexing", error=str(exc), **fields)
            return "", 204
        timings["download"] = ms(t)

        t = time.monotonic()
        try:
            result = engine.analyze(data)
        except BadImage as exc:
            timings["analyze"] = ms(t)
            save("error", error=str(exc)[:1000])
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "unreadable image", status="error", error=str(exc), **fields)
            return "", 204
        except Exception as exc:
            # A model failure on one image repeats on every retry; record it instead of retrying for a day.
            timings["analyze"] = ms(t)
            save("error", error=f"{type(exc).__name__}: {exc}"[:1000])
            timings["total"] = ms(started)
            log(logger, logging.ERROR, "face pipeline failed", exc_info=True, status="error", **fields)
            return "", 204
        timings["analyze"] = ms(t)

        status = "indexed" if result.faces else "no_faces"
        save(status, width=result.width, height=result.height, faces=result.faces)
        timings["total"] = ms(started)
        log(logger, logging.INFO, "photo indexed", status=status, face_count=len(result.faces), **fields)
        return "", 204

    def handle_selfie_deleted(event: StorageEvent, fields: dict[str, Any], started: float) -> tuple[str, int]:
        removed = store.delete_selfie(db, event.name, event.generation)
        fields["timings_ms"] = {"total": ms(started)}
        log(logger, logging.INFO, "selfie removed" if removed else "nothing to remove", **fields)
        return "", 204

    def handle_selfie_finalized(event: StorageEvent, user_id: str, fields: dict[str, Any], started: float) -> tuple[str, int]:
        """Embeds the largest face of a new profile selfie, so a find-me search only has to run the vector query."""
        timings: dict[str, int] = {}
        fields["timings_ms"] = timings

        def save(status: str, **kwargs: Any) -> None:
            t = time.monotonic()
            saved = store.save_selfie(
                db, bucket=event.bucket, name=event.name, generation=event.generation, user_id=user_id,
                status=status, settings=settings, **kwargs,
            )
            timings["db_write"] = ms(t)
            if not saved:
                fields["skipped"] = "stale event: a newer generation is already stored"

        reason = store.skip_reason(store.get_selfie(db, event.name), event.generation, settings, store.SELFIE_DONE_STATUSES)
        if reason:
            timings["total"] = ms(started)
            log(logger, logging.INFO, "event skipped", reason=reason, **fields)
            return "", 204

        if event.size is not None and event.size > settings.max_selfie_bytes:
            save("error", error=f"object is {event.size} bytes, over MAX_SELFIE_BYTES")
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "selfie too large", status="error", **fields)
            return "", 204

        t = time.monotonic()
        try:
            data = reader.read(event.bucket, event.name, event.generation)
        except ObjectGone as exc:
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "object gone before indexing", error=str(exc), **fields)
            return "", 204
        timings["download"] = ms(t)

        t = time.monotonic()
        try:
            face = engine.selfie_embedding(data)
        except NoFace:
            timings["analyze"] = ms(t)
            save("no_face")
            timings["total"] = ms(started)
            log(logger, logging.INFO, "selfie indexed", status="no_face", **fields)
            return "", 204
        except BadImage as exc:
            timings["analyze"] = ms(t)
            save("error", error=str(exc)[:1000])
            timings["total"] = ms(started)
            log(logger, logging.WARNING, "unreadable selfie", status="error", error=str(exc), **fields)
            return "", 204
        except Exception as exc:
            timings["analyze"] = ms(t)
            save("error", error=f"{type(exc).__name__}: {exc}"[:1000])
            timings["total"] = ms(started)
            log(logger, logging.ERROR, "face pipeline failed", exc_info=True, status="error", **fields)
            return "", 204
        timings["analyze"] = ms(t)

        save("indexed", face=face)
        timings["total"] = ms(started)
        log(logger, logging.INFO, "selfie indexed", status="indexed", confidence=round(face.confidence, 4), **fields)
        return "", 204

    return app


def ms(since: float) -> int:
    return round((time.monotonic() - since) * 1000)
