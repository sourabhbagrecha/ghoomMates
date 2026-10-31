"""Reads uploaded objects: from GCS in production, from LOCAL_MEDIA_DIR in local development."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from faces.config import Settings


class ObjectGone(Exception):
    """The object (at that generation) no longer exists: deleted or overwritten since the event. Permanent."""


class ObjectReader(Protocol):
    def read(self, bucket: str, name: str, generation: int | None) -> bytes: ...


class GcsReader:
    def __init__(self) -> None:
        from google.cloud import storage

        self._client = storage.Client()

    def read(self, bucket: str, name: str, generation: int | None) -> bytes:
        from google.api_core.exceptions import NotFound

        try:
            # Pinning the generation reads exactly the version the event is about, never a later overwrite.
            return self._client.bucket(bucket).blob(name, generation=generation).download_as_bytes()
        except NotFound as exc:
            raise ObjectGone(f"gs://{bucket}/{name}#{generation} not found") from exc


class LocalReader:
    def __init__(self, root: str):
        self._root = Path(root).resolve()

    def read(self, bucket: str, name: str, generation: int | None) -> bytes:
        path = (self._root / name).resolve()
        if not path.is_relative_to(self._root):
            raise ObjectGone(f"{name} is outside {self._root}")
        try:
            return path.read_bytes()
        except FileNotFoundError as exc:
            raise ObjectGone(f"{path} not found") from exc


def make_reader(settings: Settings) -> ObjectReader:
    return LocalReader(settings.local_media_dir) if settings.local_media_dir else GcsReader()
