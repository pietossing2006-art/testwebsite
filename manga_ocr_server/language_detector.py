"""Lightweight script detection for uploaded manga pages."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Any, Dict, Tuple

import cv2
import numpy as np

from image_processor import ImageProcessor
from upload_manager import UploadManager

SCRIPT_LABELS = {
    "jp": "Japanese",
    "kr": "Korean",
    "cn": "Chinese",
    "en": "English",
}

HANGUL = re.compile(r"[\uAC00-\uD7AF]")
KANA = re.compile(r"[\u3040-\u309F\u30A0-\u30FF]")
CJK = re.compile(r"[\u4E00-\u9FFF]")
LATIN = re.compile(r"[A-Za-z]")


class LanguageDetector:
    @staticmethod
    def detect_from_job(job_id: str) -> Dict[str, Any]:
        paths = UploadManager.get_job_paths(job_id)
        image_path = paths.get("original_image")
        if not image_path:
            raise FileNotFoundError("Upload not found or it has expired.")
        image = ImageProcessor.load_image(image_path)
        if image is None or image.size == 0:
            raise ValueError("The uploaded file is not a readable image.")
        return LanguageDetector.detect_from_image(image)

    @staticmethod
    def detect_from_image(img_bgr: np.ndarray) -> Dict[str, Any]:
        working = LanguageDetector._resize_for_detection(img_bgr)
        script_scores = LanguageDetector._score_scripts(working)
        ocr_scores = LanguageDetector._score_easyocr(working)
        combined = {
            key: script_scores.get(key, 0) * 0.45 + ocr_scores.get(key, 0) * 0.55
            for key in SCRIPT_LABELS
        }
        detected = max(combined, key=combined.get)
        confidence = LanguageDetector._confidence(combined, detected)
        return {
            "language": detected,
            "label": SCRIPT_LABELS[detected],
            "confidence": confidence,
            "scores": {key: round(value, 3) for key, value in combined.items()},
        }

    @staticmethod
    def _resize_for_detection(img_bgr: np.ndarray) -> np.ndarray:
        height, width = img_bgr.shape[:2]
        longest = max(height, width)
        if longest <= 1200:
            return img_bgr
        scale = 1200.0 / longest
        return cv2.resize(
            img_bgr,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )

    @staticmethod
    def _score_scripts(img_bgr: np.ndarray) -> Dict[str, float]:
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ink = cv2.dilate(ink, np.ones((2, 2), np.uint8), iterations=1)
        sample_text = LanguageDetector._quick_manga_ocr(img_bgr)
        if not sample_text.strip():
            sample_text = LanguageDetector._quick_easyocr(img_bgr)
        counts = LanguageDetector._count_scripts(sample_text)
        density = float(cv2.countNonZero(ink)) / float(max(1, ink.size))
        if not any(counts.values()):
            return {"jp": 0.35 + density, "kr": 0.2, "cn": 0.25, "en": 0.2}
        total = max(1.0, float(sum(counts.values())))
        return {key: counts[key] / total for key in counts}

    @staticmethod
    def _score_easyocr(img_bgr: np.ndarray) -> Dict[str, float]:
        reader = _get_easyocr_reader(("ja", "ko", "ch_sim", "en"))
        detections = reader.readtext(img_bgr, detail=1, paragraph=True)
        scores = {"jp": 0.0, "kr": 0.0, "cn": 0.0, "en": 0.0}
        for item in detections:
            if len(item) < 3:
                continue
            text = str(item[1] or "")
            confidence = float(item[2] or 0.0)
            if not text.strip():
                continue
            weights = LanguageDetector._count_scripts(text)
            weight_total = max(1.0, float(sum(weights.values())))
            for key, value in weights.items():
                scores[key] += confidence * (value / weight_total)
        if not any(scores.values()):
            return {"jp": 0.4, "kr": 0.15, "cn": 0.25, "en": 0.2}
        total = max(1.0, float(sum(scores.values())))
        return {key: scores[key] / total for key in scores}

    @staticmethod
    def _count_scripts(text: str) -> Dict[str, float]:
        counts = {"jp": 0.0, "kr": 0.0, "cn": 0.0, "en": 0.0}
        for ch in text:
            if HANGUL.match(ch):
                counts["kr"] += 1.2
            elif KANA.match(ch):
                counts["jp"] += 1.4
            elif CJK.match(ch):
                counts["jp"] += 0.35
                counts["cn"] += 0.85
            elif LATIN.match(ch):
                counts["en"] += 1.0
        if counts["jp"] > 0 and counts["cn"] > 0 and KANA.search(text):
            counts["cn"] *= 0.35
        return counts

    @staticmethod
    def _quick_manga_ocr(img_bgr: np.ndarray) -> str:
        try:
            from PIL import Image

            engine = _get_manga_ocr()
            image = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
            return str(engine(image)).strip()
        except Exception:
            return ""

    @staticmethod
    def _quick_easyocr(img_bgr: np.ndarray) -> str:
        try:
            reader = _get_easyocr_reader(("ja", "ko", "ch_sim", "en"))
            detections = reader.readtext(img_bgr, detail=1, paragraph=True)
            return " ".join(str(item[1]).strip() for item in detections if len(item) > 1)
        except Exception:
            return ""

    @staticmethod
    def _confidence(scores: Dict[str, float], detected: str) -> float:
        ordered = sorted(scores.values(), reverse=True)
        if len(ordered) < 2:
            return 0.5
        gap = max(0.0, ordered[0] - ordered[1])
        return round(min(0.99, 0.55 + gap), 2)


@lru_cache(maxsize=1)
def _get_manga_ocr():
    from manga_ocr import MangaOcr

    return MangaOcr()


@lru_cache(maxsize=1)
def _get_easyocr_reader(languages: Tuple[str, ...]):
    import easyocr

    return easyocr.Reader(list(languages), gpu=False, verbose=False)
