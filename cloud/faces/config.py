"""Every tunable constant of the face services. Each one can be overridden with an env var of the same name.

The face pipeline defaults match the prototype notebook. Changing MODEL_NAME, DETECTOR_BACKEND, ALIGN or the
preprocessing changes the embedding space: re-index every photo afterwards (documents keep model_name and detector).
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Mapping


def _str(env: Mapping[str, str], name: str, default: str) -> str:
    value = env.get(name)
    return default if value is None or value.strip() == "" else value.strip()


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    return int(_str(env, name, str(default)))


def _float(env: Mapping[str, str], name: str, default: float) -> float:
    return float(_str(env, name, str(default)))


def _bool(env: Mapping[str, str], name: str, default: bool) -> bool:
    return _str(env, name, "true" if default else "false").lower() in ("1", "true", "yes", "on")


def _list(env: Mapping[str, str], name: str, default: str) -> tuple[str, ...]:
    return tuple(item.strip().lower() for item in _str(env, name, default).split(",") if item.strip())


# Atlas Vector Search's maximum for $vectorSearch limit and numCandidates.
VECTOR_SEARCH_MAX = 10_000


@dataclass(frozen=True)
class Settings:
    # Which app the container serves: "indexer" or "search".
    service: str = "indexer"
    port: int = 8080
    log_level: str = "INFO"

    # Face pipeline (must match the notebook).
    model_name: str = "Facenet512"
    detector_backend: str = "retinaface"
    align: bool = True
    enforce_detection: bool = True
    embedding_dim: int = 512
    max_image_side: int = 1600
    min_face_px: int = 40
    min_face_confidence: float = 0.90
    # Cosine distance below which a gallery face counts as the selfie's person.
    # Measured: same person 0.16 to 0.34, closest stranger 0.80.
    match_threshold: float = 0.40

    # Which uploads get indexed. The scope (trip id) is the named group "scope" of INCLUDE_PATTERN.
    include_pattern: str = r"^trips/(?P<scope>[0-9a-fA-F-]{36})/photos/[^/]+$"
    skip_prefixes: tuple[str, ...] = ("users/", "selfies/", "thumbnails/", "healthcheck/")
    image_extensions: tuple[str, ...] = ("jpg", "jpeg", "png", "webp", "gif", "heic", "heif")
    image_content_types: tuple[str, ...] = (
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    )
    max_image_bytes: int = 30 * 1024 * 1024

    # Selfie search input limits. 3 base64 selfies of 6 MiB stay under Cloud Run's 32 MiB request limit.
    max_selfies: int = 3
    max_selfie_bytes: int = 6 * 1024 * 1024

    # Search: first fetch SEARCH_INITIAL_K nearest faces per selfie; if all of them are matches, double k
    # until a non-match shows up or SEARCH_MAX_K is reached (then the response says truncated: true).
    # Atlas Vector Search caps limit and numCandidates at 10000, so a larger SEARCH_MAX_K is lowered to that.
    search_initial_k: int = 500
    search_max_k: int = 10000

    # MongoDB Atlas (mongodb+srv:// URL, same cluster as the backend) and the database the face collections live in.
    mongodb_connection_string: str = ""
    mongodb_db: str = "ghoomates"
    # Seconds to find a reachable server before a request fails (indexer 500, search 503).
    db_connect_timeout: int = 10

    # Local development: read objects from this directory (LOCAL_MEDIA_DIR/<object name>) instead of GCS.
    local_media_dir: str = ""

    include_regex: re.Pattern[str] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "include_regex", re.compile(self.include_pattern))
        max_k = min(self.search_max_k, VECTOR_SEARCH_MAX)
        object.__setattr__(self, "search_max_k", max_k)
        object.__setattr__(self, "search_initial_k", min(self.search_initial_k, max_k))

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if env is None else env
        d = cls()
        return cls(
            service=_str(env, "SERVICE", d.service).lower(),
            port=_int(env, "PORT", d.port),
            log_level=_str(env, "LOG_LEVEL", d.log_level).upper(),
            model_name=_str(env, "MODEL_NAME", d.model_name),
            detector_backend=_str(env, "DETECTOR_BACKEND", d.detector_backend),
            align=_bool(env, "ALIGN", d.align),
            enforce_detection=_bool(env, "ENFORCE_DETECTION", d.enforce_detection),
            embedding_dim=_int(env, "EMBEDDING_DIM", d.embedding_dim),
            max_image_side=_int(env, "MAX_IMAGE_SIDE", d.max_image_side),
            min_face_px=_int(env, "MIN_FACE_PX", d.min_face_px),
            min_face_confidence=_float(env, "MIN_FACE_CONFIDENCE", d.min_face_confidence),
            match_threshold=_float(env, "MATCH_THRESHOLD", d.match_threshold),
            include_pattern=_str(env, "INCLUDE_PATTERN", d.include_pattern),
            skip_prefixes=_list(env, "SKIP_PREFIXES", ",".join(d.skip_prefixes)),
            image_extensions=_list(env, "IMAGE_EXTENSIONS", ",".join(d.image_extensions)),
            image_content_types=_list(env, "IMAGE_CONTENT_TYPES", ",".join(d.image_content_types)),
            max_image_bytes=_int(env, "MAX_IMAGE_BYTES", d.max_image_bytes),
            max_selfies=_int(env, "MAX_SELFIES", d.max_selfies),
            max_selfie_bytes=_int(env, "MAX_SELFIE_BYTES", d.max_selfie_bytes),
            search_initial_k=_int(env, "SEARCH_INITIAL_K", d.search_initial_k),
            search_max_k=_int(env, "SEARCH_MAX_K", d.search_max_k),
            mongodb_connection_string=_str(env, "MONGODB_CONNECTION_STRING", d.mongodb_connection_string),
            mongodb_db=_str(env, "MONGODB_DB", d.mongodb_db),
            db_connect_timeout=_int(env, "DB_CONNECT_TIMEOUT", d.db_connect_timeout),
            local_media_dir=_str(env, "LOCAL_MEDIA_DIR", d.local_media_dir),
        )
