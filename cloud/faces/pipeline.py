"""Face pipeline: Pillow preprocessing, DeepFace detection + embedding, filtering, bbox scaling, per-face emotion.

Matches the prototype notebook: exif_transpose, RGB, thumbnail to 1600 px, then
DeepFace.represent(Facenet512, retinaface, align=True, enforce_detection=True). Each kept face's crop (padded 10%)
then goes through DeepFace's Emotion model. DeepFace and TensorFlow are imported lazily so the pure helpers (and
their tests) do not need them.
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
# DeepFace.analyze-compatible callable for one face crop (BGR): a result dict, or a list of them.
Analyze = Callable[[np.ndarray], "dict[str, Any] | list[dict[str, Any]]"]

EMOTIONS = ("angry", "disgust", "fear", "happy", "sad", "surprise", "neutral")
# Padding around the detector's box when cropping a face for the emotion model, as a fraction of its size.
CROP_PAD = 0.10


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
    emotion: str | None = None  # dominant emotion, one of EMOTIONS; None when not analyzed or it failed
    smile: float | None = None  # the "happy" probability, 0..1 (3 dp)


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


def crop_face(pixels: np.ndarray, area: dict[str, Any], pad: float = CROP_PAD) -> np.ndarray | None:
    """The face's pixels from the downscaled image, padded by `pad` on every side and clamped to the image."""
    img_h, img_w = pixels.shape[:2]
    x, y = float(area.get("x", 0)), float(area.get("y", 0))
    w, h = float(area.get("w", 0)), float(area.get("h", 0))
    x0 = max(0, int(round(x - w * pad)))
    y0 = max(0, int(round(y - h * pad)))
    x1 = min(img_w, int(round(x + w * (1 + pad))))
    y1 = min(img_h, int(round(y + h * (1 + pad))))
    if x1 <= x0 or y1 <= y0:
        return None
    return pixels[y0:y1, x0:x1]


def read_emotion(result: Any) -> tuple[str | None, float | None]:
    """(dominant emotion, smile 0..1) from a DeepFace.analyze result (a dict or a one-item list)."""
    if isinstance(result, list):
        result = result[0] if result else None
    if not isinstance(result, dict):
        return None, None
    dominant = result.get("dominant_emotion")
    emotion = dominant if dominant in EMOTIONS else None
    happy = (result.get("emotion") or {}).get("happy")
    smile = None
    if happy is not None and np.isfinite(float(happy)):
        smile = round(min(max(float(happy) / 100.0, 0.0), 1.0), 3)
    return emotion, smile


def face_emotion(pixels: np.ndarray, area: dict[str, Any], analyze: Analyze) -> tuple[str | None, float | None]:
    """Never raises: a failure on one face leaves its emotion empty, it never fails the photo."""
    try:
        crop = crop_face(pixels, area)
        if crop is None:
            return None, None
        return read_emotion(analyze(crop))
    except Exception:
        return None, None


def to_faces(
    results: list[dict[str, Any]], prepared: Prepared, settings: Settings, analyze: Analyze | None = None,
) -> list[Face]:
    """Drops faces under MIN_FACE_PX (in the detector's downscaled image) or MIN_FACE_CONFIDENCE. With `analyze`,
    each kept face also gets its emotion."""
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
        emotion, smile = face_emotion(prepared.pixels, area, analyze) if analyze else (None, None)
        faces.append(Face(box=scale_box(area, prepared), confidence=confidence, embedding=embedding,
                          detected_area=w * h, emotion=emotion, smile=smile))
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


def deepface_analyze(crop: np.ndarray) -> Any:
    from deepface import DeepFace

    # The crop already is the face: no detection, just the Emotion model.
    return DeepFace.analyze(img_path=crop, actions=["emotion"], detector_backend="skip", enforce_detection=False,
                            silent=True)


class FaceEngine:
    """Owns the models. Build one per process, at startup."""

    def __init__(self, settings: Settings, represent: Represent | None = None, analyze: Analyze | None = None):
        self.settings = settings
        self._represent = represent or deepface_represent
        self._analyze = analyze or deepface_analyze

    def warm_up(self) -> None:
        """Loads (and on first run downloads) the models and runs one forward pass, so requests don't pay for it."""
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
        if self.settings.emotions:
            DeepFace.build_model(model_name="Emotion", task="facial_attribute")
            deepface_analyze(np.zeros((48, 48, 3), dtype=np.uint8))

    def prepare(self, data: bytes) -> Prepared:
        """Decodes and downscales once; the indexer shares the result between faces and tagging. Raises BadImage."""
        return prepare(data, self.settings.max_image_side)

    def faces(self, prepared: Prepared, emotions: bool = True) -> PhotoFaces:
        analyze = self._analyze if emotions and self.settings.emotions else None
        faces = to_faces(self._represent(prepared.pixels, self.settings), prepared, self.settings, analyze)
        return PhotoFaces(width=prepared.width, height=prepared.height, faces=faces)

    def analyze(self, data: bytes, emotions: bool = True) -> PhotoFaces:
        return self.faces(self.prepare(data), emotions)

    def selfie_embedding(self, data: bytes) -> Face:
        """The largest usable face in a selfie. Raises BadImage or NoFace. Selfies skip the emotion model."""
        faces = self.analyze(data, emotions=False).faces
        if not faces:
            raise NoFace("No face found in the selfie")
        return max(faces, key=lambda f: f.detected_area)
