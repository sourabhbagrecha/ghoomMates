"""Face pipeline: Pillow preprocessing, DeepFace detection + embedding, filtering, bbox scaling.

Matches the prototype notebook: exif_transpose, RGB, thumbnail to 1600 px, then
DeepFace.represent(Facenet512, retinaface, align=True, enforce_detection=True). DeepFace and TensorFlow are
imported lazily so the pure helpers (and their tests) do not need them.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
import pillow_heif
from PIL import Image, ImageOps

from faces.config import Settings

pillow_heif.register_heif_opener()

# DeepFace.represent-compatible callable: (bgr_pixels, settings) -> list of result dicts.
Represent = Callable[[np.ndarray, Settings], list[dict[str, Any]]]


class BadImage(Exception):
    """The bytes are not an image Pillow can decode (corrupt, truncated, unsupported). Permanent."""


class NoFace(Exception):
    """No usable face in a selfie."""


@dataclass(frozen=True)
class Prepared:
    # BGR uint8 pixels of the downscaled copy, the layout DeepFace expects for arrays (as cv2.imread).
    pixels: np.ndarray
    # Size of the original image after EXIF orientation, i.e. as browsers display it.
    width: int
    height: int
    # Multiply downscaled coordinates by these to get original coordinates.
    scale_x: float
    scale_y: float


@dataclass(frozen=True)
class Box:
    x: int
    y: int
    w: int
    h: int


@dataclass(frozen=True)
class Face:
    box: Box  # in original image coordinates
    confidence: float
    embedding: np.ndarray  # L2-normalized float32, shape (embedding_dim,)
    detected_area: int  # w * h in the downscaled image, used to pick the largest selfie face


@dataclass(frozen=True)
class PhotoFaces:
    width: int
    height: int
    faces: list[Face]


def prepare(data: bytes, max_side: int) -> Prepared:
    try:
        with Image.open(io.BytesIO(data)) as opened:
            img = ImageOps.exif_transpose(opened)
            img = img.convert("RGB")
            width, height = img.size
            img.thumbnail((max_side, max_side))
            pixels = np.asarray(img, dtype=np.uint8)[:, :, ::-1].copy()
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombError) as exc:
        raise BadImage(f"{type(exc).__name__}: {exc}") from exc
    small_h, small_w = pixels.shape[:2]
    return Prepared(pixels=pixels, width=width, height=height, scale_x=width / small_w, scale_y=height / small_h)


def scale_box(area: dict[str, Any], prepared: Prepared) -> Box:
    """Maps a facial_area from the downscaled copy back to original image coordinates, clamped to the image."""
    x = round(float(area["x"]) * prepared.scale_x)
    y = round(float(area["y"]) * prepared.scale_y)
    w = round(float(area["w"]) * prepared.scale_x)
    h = round(float(area["h"]) * prepared.scale_y)
    x = min(max(x, 0), prepared.width - 1)
    y = min(max(y, 0), prepared.height - 1)
    w = max(1, min(w, prepared.width - x))
    h = max(1, min(h, prepared.height - y))
    return Box(x, y, w, h)


def l2_normalize(vector: Any, dim: int) -> np.ndarray | None:
    v = np.asarray(vector, dtype=np.float32).reshape(-1)
    if v.shape[0] != dim or not np.all(np.isfinite(v)):
        return None
    norm = float(np.linalg.norm(v))
    return None if norm == 0.0 else v / norm


def to_faces(results: list[dict[str, Any]], prepared: Prepared, settings: Settings) -> list[Face]:
    """Drops faces under MIN_FACE_PX (in the detector's downscaled image) or MIN_FACE_CONFIDENCE."""
    faces = []
    for r in results:
        area = r.get("facial_area") or {}
        w, h = int(area.get("w", 0)), int(area.get("h", 0))
        confidence = float(r.get("face_confidence") or 0.0)
        if w < settings.min_face_px or h < settings.min_face_px or confidence < settings.min_face_confidence:
            continue
        embedding = l2_normalize(r.get("embedding"), settings.embedding_dim)
        if embedding is None:
            continue
        faces.append(Face(box=scale_box(area, prepared), confidence=confidence, embedding=embedding, detected_area=w * h))
    return faces


def deepface_represent(pixels: np.ndarray, settings: Settings) -> list[dict[str, Any]]:
    from deepface import DeepFace

    try:
        return DeepFace.represent(
            img_path=pixels,
            model_name=settings.model_name,
            detector_backend=settings.detector_backend,
            align=settings.align,
            enforce_detection=settings.enforce_detection,
        )
    except ValueError:
        # DeepFace raises ValueError when enforce_detection is on and no face is found.
        return []


class FaceEngine:
    """Owns the models. Build one per process, at startup."""

    def __init__(self, settings: Settings, represent: Represent | None = None):
        self.settings = settings
        self._represent = represent or deepface_represent

    def warm_up(self) -> None:
        """Loads (and on first run downloads) both models and runs one forward pass, so requests don't pay for it."""
        from deepface import DeepFace

        DeepFace.build_model(model_name=self.settings.model_name, task="facial_recognition")
        DeepFace.build_model(model_name=self.settings.detector_backend, task="face_detector")
        DeepFace.represent(
            img_path=np.zeros((160, 160, 3), dtype=np.uint8),
            model_name=self.settings.model_name,
            detector_backend=self.settings.detector_backend,
            align=self.settings.align,
            enforce_detection=False,
        )

    def analyze(self, data: bytes) -> PhotoFaces:
        prepared = prepare(data, self.settings.max_image_side)
        faces = to_faces(self._represent(prepared.pixels, self.settings), prepared, self.settings)
        return PhotoFaces(width=prepared.width, height=prepared.height, faces=faces)

    def selfie_embedding(self, data: bytes) -> Face:
        """The largest usable face in a selfie. Raises BadImage or NoFace."""
        faces = self.analyze(data).faces
        if not faces:
            raise NoFace("No face found in the selfie")
        return max(faces, key=lambda f: f.detected_area)
