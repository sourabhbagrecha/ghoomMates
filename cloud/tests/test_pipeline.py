"""Preprocessing, bbox scaling and face filtering. No models needed: DeepFace is replaced by a fake."""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from faces.config import Settings
from faces.pipeline import (
    BadImage, Box, FaceEngine, NoFace, crop_face, l2_normalize, prepare, read_emotion, scale_box, to_faces,
)
from tests.conftest import jpeg_bytes


def result(x=0, y=0, w=100, h=100, confidence=0.99, embedding=None, dim=512):
    rng = np.random.default_rng(x + 7 * y + 13 * w)
    return {
        "embedding": list(rng.normal(size=dim)) if embedding is None else embedding,
        "facial_area": {"x": x, "y": y, "w": w, "h": h, "left_eye": None, "right_eye": None},
        "face_confidence": confidence,
    }


# --- prepare ---


def test_thumbnail_caps_longest_side_and_keeps_original_size():
    p = prepare(jpeg_bytes(4000, 3000), 1600)
    assert p.pixels.shape == (1200, 1600, 3)
    assert (p.width, p.height) == (4000, 3000)
    assert p.scale_x == pytest.approx(2.5) and p.scale_y == pytest.approx(2.5)


def test_small_images_are_not_upscaled():
    p = prepare(jpeg_bytes(800, 600), 1600)
    assert p.pixels.shape == (600, 800, 3)
    assert p.scale_x == 1.0 and p.scale_y == 1.0


def test_pixels_are_bgr_uint8():
    p = prepare(jpeg_bytes(64, 64, color=(255, 0, 0)), 1600)
    assert p.pixels.dtype == np.uint8
    b, g, r = p.pixels[32, 32]
    assert r > 200 and b < 50  # red stays red once read as BGR


def test_exif_orientation_is_applied_before_everything():
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise on display
    p = prepare(jpeg_bytes(3200, 1000, exif=exif), 1600)
    assert (p.width, p.height) == (1000, 3200)
    assert p.pixels.shape == (1600, 500, 3)


@pytest.mark.parametrize("mode", ["RGBA", "L", "P", "CMYK", "I;16"])
def test_other_modes_become_three_channel(mode):
    buf = io.BytesIO()
    Image.new(mode, (50, 40)).save(buf, format="TIFF" if mode in ("CMYK", "I;16") else "PNG")
    p = prepare(buf.getvalue(), 1600)
    assert p.pixels.shape == (40, 50, 3)


def test_heic_opens():
    buf = io.BytesIO()
    try:
        Image.new("RGB", (120, 80), (10, 200, 10)).save(buf, format="HEIF")
    except (KeyError, OSError, ValueError) as exc:
        pytest.skip(f"this pillow-heif build cannot encode HEIF: {exc}")
    p = prepare(buf.getvalue(), 1600)
    assert (p.width, p.height) == (120, 80)


@pytest.mark.parametrize("data", [b"", b"not an image", jpeg_bytes(400, 300)[:300]])
def test_corrupt_or_truncated_images_raise_bad_image(data):
    with pytest.raises(BadImage):
        prepare(data, 1600)


# --- bbox scaling ---


def test_boxes_scale_back_to_original_coordinates():
    p = prepare(jpeg_bytes(4000, 3000), 1600)
    assert scale_box({"x": 100, "y": 40, "w": 80, "h": 60}, p) == Box(250, 100, 200, 150)


def test_boxes_use_separate_x_and_y_scales():
    p = prepare(jpeg_bytes(3001, 1000), 1600)  # rounding makes the two scales differ slightly
    box = scale_box({"x": 1599, "y": 532, "w": 1, "h": 1}, p)
    assert box.x == round(1599 * p.scale_x) and box.y == round(532 * p.scale_y)


def test_boxes_are_clamped_inside_the_image():
    p = prepare(jpeg_bytes(4000, 3000), 1600)
    box = scale_box({"x": -5, "y": 1150, "w": 1700, "h": 100}, p)
    assert box.x == 0 and box.y + box.h <= 3000 and box.x + box.w <= 4000 and box.w > 0 and box.h > 0


# --- filtering and normalization ---


def test_small_and_low_confidence_faces_are_dropped(settings):
    p = prepare(jpeg_bytes(400, 400), 1600)
    results = [
        result(w=39, h=100),
        result(w=100, h=39),
        result(confidence=0.899),
        result(x=1, w=40, h=40, confidence=0.90),  # exactly at the limits: kept
        result(x=2, embedding=[0.0] * 512),  # zero vector cannot be normalized
        result(x=3, embedding=[1.0] * 128),  # wrong dimension
    ]
    faces = to_faces(results, p, settings)
    assert [f.box.x for f in faces] == [1]


def test_size_limit_applies_to_the_detector_image(settings):
    p = prepare(jpeg_bytes(4000, 3000), 1600)  # a 39 px face here is 97 px in the original
    assert to_faces([result(w=39, h=39)], p, settings) == []


def test_embeddings_are_l2_normalized(settings):
    p = prepare(jpeg_bytes(400, 400), 1600)
    (face,) = to_faces([result(embedding=[3.0] * 512)], p, settings)
    assert face.embedding.dtype == np.float32
    assert np.linalg.norm(face.embedding) == pytest.approx(1.0, abs=1e-6)


def test_l2_normalize_accepts_deepface_batch_shapes():
    assert l2_normalize(np.ones((1, 512)), 512).shape == (512,)
    assert l2_normalize([float("nan")] * 512, 512) is None


# --- engine with a fake DeepFace ---


def test_engine_passes_downscaled_bgr_pixels_and_scales_results():
    seen = {}

    def represent(pixels, settings):
        seen["shape"] = pixels.shape
        return [result(x=100, y=100, w=80, h=80)]

    out = FaceEngine(Settings(), represent).analyze(jpeg_bytes(3200, 2400))
    assert seen["shape"] == (1200, 1600, 3)
    assert (out.width, out.height) == (3200, 2400)
    assert out.faces[0].box == Box(200, 200, 160, 160)


def test_selfie_uses_the_largest_face():
    faces = [result(x=0, w=60, h=60), result(x=200, w=150, h=140), result(x=400, w=90, h=200, confidence=0.5)]
    face = FaceEngine(Settings(), lambda px, s: faces).selfie_embedding(jpeg_bytes(800, 800))
    assert face.box.x == 200


def test_selfie_without_a_usable_face_raises():
    with pytest.raises(NoFace):
        FaceEngine(Settings(), lambda px, s: []).selfie_embedding(jpeg_bytes(300, 300))
    with pytest.raises(NoFace):
        FaceEngine(Settings(), lambda px, s: [result(w=20, h=20)]).selfie_embedding(jpeg_bytes(300, 300))


# --- emotion (fake DeepFace.analyze) ---


def emotion_result(dominant="happy", happy=87.6543):
    scores = {e: 1.0 for e in ("angry", "disgust", "fear", "sad", "surprise", "neutral")}
    scores["happy"] = happy
    return {"emotion": scores, "dominant_emotion": dominant, "region": {}, "face_confidence": 0}


class FakeAnalyze:
    def __init__(self, *results):
        self.results = list(results)
        self.crops = []

    def __call__(self, crop):
        self.crops.append(crop.shape)
        r = self.results.pop(0) if self.results else emotion_result()
        if isinstance(r, Exception):
            raise r
        return r


def test_each_face_gets_emotion_and_smile():
    analyze = FakeAnalyze(emotion_result("happy", 87.6543), [emotion_result("sad", 2.0)])  # dict, then list
    faces = [result(x=100, y=100, w=80, h=80), result(x=400, y=100, w=60, h=60)]
    out = FaceEngine(Settings(), lambda px, s: faces, analyze).analyze(jpeg_bytes(3200, 2400))
    assert [(f.emotion, f.smile) for f in out.faces] == [("happy", 0.877), ("sad", 0.02)]
    # Crops come from the downscaled image the detector saw, padded 10% on each side.
    assert analyze.crops == [(96, 96, 3), (72, 72, 3)]


def test_dropped_faces_are_not_analyzed():
    analyze = FakeAnalyze()
    FaceEngine(Settings(), lambda px, s: [result(w=20, h=20)], analyze).analyze(jpeg_bytes(400, 400))
    assert analyze.crops == []


def test_crop_is_padded_and_clamped_to_the_image():
    pixels = np.zeros((100, 200, 3), dtype=np.uint8)
    assert crop_face(pixels, {"x": 50, "y": 30, "w": 40, "h": 20}).shape == (24, 48, 3)
    assert crop_face(pixels, {"x": 0, "y": 0, "w": 40, "h": 40}).shape == (44, 44, 3)  # no negative start
    assert crop_face(pixels, {"x": 180, "y": 90, "w": 40, "h": 40}).shape == (14, 24, 3)  # cut at the edges
    assert crop_face(pixels, {"x": 300, "y": 0, "w": 10, "h": 10}) is None  # outside the image


def test_emotion_failure_leaves_the_face_without_emotion():
    analyze = FakeAnalyze(RuntimeError("model exploded"), emotion_result("neutral", 5))
    faces = [result(x=0, w=80, h=80), result(x=200, w=80, h=80)]
    out = FaceEngine(Settings(), lambda px, s: faces, analyze).analyze(jpeg_bytes(800, 800))
    assert [(f.emotion, f.smile) for f in out.faces] == [(None, None), ("neutral", 0.05)]
    assert all(f.embedding is not None for f in out.faces)


def test_read_emotion_handles_odd_results():
    assert read_emotion([]) == (None, None)
    assert read_emotion(None) == (None, None)
    assert read_emotion({"dominant_emotion": "bored", "emotion": {"happy": 150}}) == (None, 1.0)
    assert read_emotion({"dominant_emotion": "fear", "emotion": {"happy": float("nan")}}) == ("fear", None)


def test_emotions_off_skips_the_model():
    analyze = FakeAnalyze()
    engine = FaceEngine(Settings(emotions=False), lambda px, s: [result(w=80, h=80)], analyze)
    out = engine.analyze(jpeg_bytes(400, 400))
    assert analyze.crops == [] and (out.faces[0].emotion, out.faces[0].smile) == (None, None)


def test_selfies_never_run_the_emotion_model():
    analyze = FakeAnalyze()
    face = FaceEngine(Settings(), lambda px, s: [result(w=80, h=80)], analyze).selfie_embedding(jpeg_bytes(400, 400))
    assert analyze.crops == [] and face.emotion is None
