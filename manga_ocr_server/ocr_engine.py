"""OCR adapters used by the page pipeline.

Uses line-level detection, preprocessing, and multi-pass recognition to get
the most accurate dialogue text from each speech bubble.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np

from ocr_corrector import OcrCorrector
from ocr_preprocess import crop_line_region, normalize_for_ocr, ocr_variants


class OcrEngineUnavailable(RuntimeError):
    pass


LANGUAGE_MAP = {
    "jp": ["ja"],
    "ja": ["ja"],
    "kr": ["ko"],
    "ko": ["ko"],
    "cn": ["ch_sim"],
    "zh": ["ch_sim"],
    "en": ["en"],
}


@dataclass
class LineBox:
    x1: int
    y1: int
    x2: int
    y2: int
    confidence: float

    @property
    def width(self) -> int:
        return max(1, self.x2 - self.x1)

    @property
    def height(self) -> int:
        return max(1, self.y2 - self.y1)

    @property
    def center_x(self) -> float:
        return (self.x1 + self.x2) / 2.0

    @property
    def center_y(self) -> float:
        return (self.y1 + self.y2) / 2.0


@dataclass
class OcrCandidate:
    text: str
    confidence: float
    source: str


class OcrEngine:
    @staticmethod
    def process_bubbles_ocr(
        img_bgr: np.ndarray, bubbles: List[Dict[str, Any]], lang: str = "jp"
    ) -> List[Dict[str, Any]]:
        if not bubbles:
            return []

        source = lang.lower()
        if source not in LANGUAGE_MAP:
            raise ValueError(f"Unsupported OCR language: {lang}")

        results: List[Dict[str, Any]] = []
        for bubble in bubbles:
            crop = OcrEngine._crop(img_bgr, bubble)
            raw_text, confidence, line_count = OcrEngine._run_ocr_crop(crop, source)
            cleaned_text = OcrEngine._clean(raw_text, source)
            style = OcrEngine._analyze_bubble_style(crop)
            layout = OcrEngine._analyze_text_layout(crop, source, line_count)
            style.update(layout)
            result = dict(bubble)
            result.update({
                "raw_ocr": raw_text,
                "clean_ocr": cleaned_text,
                "ocr_confidence": confidence,
                "translated_text": "",
                "font_size": layout.get("estimated_font_size", 0),
                "text_color": style["text_color"],
                "stroke_color": style["stroke_color"],
                "stroke_width": style["stroke_width"],
                "align": style["align"],
                "layout": layout.get("layout", "horizontal"),
                "text_bounds": layout.get("text_bounds"),
                "original_line_count": layout.get("original_line_count", 1),
                "line_spacing": layout.get("line_spacing", 1.15),
                "is_light_bubble": style.get("is_light_bubble", True),
            })
            results.append(result)
        return results

    @staticmethod
    def _crop(img_bgr: np.ndarray, bubble: Dict[str, Any]) -> np.ndarray:
        height, width = img_bgr.shape[:2]
        x, y = max(0, int(bubble["x"])), max(0, int(bubble["y"]))
        right = min(width, x + max(1, int(bubble["w"])))
        bottom = min(height, y + max(1, int(bubble["h"])))
        return img_bgr[y:bottom, x:right]

    @staticmethod
    def _run_ocr_crop(crop_bgr: np.ndarray, lang: str) -> Tuple[str, float, int]:
        if crop_bgr.size == 0:
            return "", 0.0, 0

        prepared = normalize_for_ocr(crop_bgr)
        line_boxes = OcrEngine._detect_line_boxes(prepared, lang)
        if line_boxes:
            text, confidence = OcrEngine._ocr_line_boxes(prepared, line_boxes, lang)
            if text.strip():
                return text, confidence, len(line_boxes)

        candidates: List[OcrCandidate] = []
        if lang in {"jp", "ja"}:
            candidates.extend(OcrEngine._japanese_candidates(prepared))
        candidates.extend(OcrEngine._easyocr_block_candidates(prepared, lang))

        best = OcrEngine._pick_best_candidate(candidates, lang)
        if best.text.strip():
            return best.text, best.confidence, max(1, len(line_boxes))

        return "", 0.0, len(line_boxes)

    @staticmethod
    def _detect_line_boxes(crop_bgr: np.ndarray, lang: str) -> List[LineBox]:
        reader = _get_easyocr_reader(tuple(LANGUAGE_MAP[lang]))
        detections = reader.readtext(crop_bgr, detail=1, paragraph=False)
        lines: List[LineBox] = []
        height, width = crop_bgr.shape[:2]
        for item in detections:
            if len(item) < 3:
                continue
            bbox, _text, confidence = item[0], item[1], float(item[2])
            if confidence < 0.2:
                continue
            xs = [int(point[0]) for point in bbox]
            ys = [int(point[1]) for point in bbox]
            x1 = max(0, min(xs))
            y1 = max(0, min(ys))
            x2 = min(width, max(xs))
            y2 = min(height, max(ys))
            if x2 - x1 < 4 or y2 - y1 < 4:
                continue
            lines.append(LineBox(x1, y1, x2, y2, confidence))
        return OcrEngine._sort_line_boxes(lines, crop_bgr.shape[1], crop_bgr.shape[0])

    @staticmethod
    def _sort_line_boxes(lines: List[LineBox], width: int, height: int) -> List[LineBox]:
        if len(lines) <= 1:
            return lines

        avg_w = sum(line.width for line in lines) / len(lines)
        avg_h = sum(line.height for line in lines) / len(lines)
        vertical = height > width * 1.05 and avg_h >= avg_w * 0.9
        if vertical:
            columns: Dict[int, List[LineBox]] = {}
            bucket = max(8, int(avg_w * 0.75))
            for line in lines:
                key = int(line.center_x // bucket)
                columns.setdefault(key, []).append(line)
            ordered: List[LineBox] = []
            for key in sorted(columns.keys(), reverse=True):
                ordered.extend(sorted(columns[key], key=lambda item: item.y1))
            return ordered
        return sorted(lines, key=lambda item: (item.y1, item.x1))

    @staticmethod
    def _ocr_line_boxes(crop_bgr: np.ndarray, line_boxes: List[LineBox], lang: str) -> Tuple[str, float]:
        chunks: List[str] = []
        scores: List[float] = []
        joiner = "" if lang in {"jp", "ja", "cn", "zh"} else " "

        for line in line_boxes:
            line_crop = crop_line_region(crop_bgr, line.x1, line.y1, line.x2, line.y2)
            if line_crop.size == 0:
                continue
            if lang in {"jp", "ja"}:
                text, confidence = OcrEngine._run_manga_ocr(line_crop)
                if confidence < 0.35:
                    alt_text, alt_conf = OcrEngine._run_easyocr_single(line_crop, lang)
                    if alt_conf > confidence and len(alt_text) >= len(text):
                        text, confidence = alt_text, alt_conf
            else:
                text, confidence = OcrEngine._run_easyocr_single(line_crop, lang)
            cleaned = OcrEngine._clean(text, lang)
            if cleaned:
                chunks.append(cleaned)
                scores.append(max(confidence, line.confidence, OcrCorrector.score_text(cleaned, lang)))

        if not chunks:
            return "", 0.0
        return joiner.join(chunks), round(sum(scores) / len(scores), 3)

    @staticmethod
    def _japanese_candidates(crop_bgr: np.ndarray) -> List[OcrCandidate]:
        candidates: List[OcrCandidate] = []
        for _name, variant in ocr_variants(crop_bgr):
            text, confidence = OcrEngine._run_manga_ocr(variant)
            cleaned = OcrCorrector.clean_japanese_ocr(text)
            if cleaned:
                candidates.append(OcrCandidate(
                    text=cleaned,
                    confidence=max(confidence, OcrCorrector.score_text(cleaned, "jp")),
                    source="manga-ocr",
                ))
        return candidates

    @staticmethod
    def _easyocr_block_candidates(crop_bgr: np.ndarray, lang: str) -> List[OcrCandidate]:
        candidates: List[OcrCandidate] = []
        for _name, variant in ocr_variants(crop_bgr):
            reader = _get_easyocr_reader(tuple(LANGUAGE_MAP[lang]))
            detections = reader.readtext(variant, detail=1, paragraph=False)
            if not detections:
                continue
            line_boxes = []
            for item in detections:
                if len(item) < 3 or float(item[2]) < 0.18:
                    continue
                bbox = item[0]
                xs = [int(point[0]) for point in bbox]
                ys = [int(point[1]) for point in bbox]
                line_boxes.append(LineBox(min(xs), min(ys), max(xs), max(ys), float(item[2])))
            if not line_boxes:
                continue
            ordered = OcrEngine._sort_line_boxes(line_boxes, variant.shape[1], variant.shape[0])
            text, confidence = OcrEngine._ocr_line_boxes(variant, ordered, lang)
            cleaned = OcrEngine._clean(text, lang)
            if cleaned:
                candidates.append(OcrCandidate(
                    text=cleaned,
                    confidence=confidence,
                    source="easyocr-lines",
                ))
        return candidates

    @staticmethod
    def _run_manga_ocr(crop_bgr: np.ndarray) -> Tuple[str, float]:
        if crop_bgr.size == 0:
            return "", 0.0
        try:
            from PIL import Image

            if len(crop_bgr.shape) == 2:
                image = Image.fromarray(crop_bgr)
            else:
                image = Image.fromarray(cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB))
            text = str(_get_manga_ocr()(image)).strip()
            cleaned = OcrCorrector.clean_japanese_ocr(text)
            return cleaned, OcrCorrector.score_text(cleaned, "jp")
        except Exception:
            return "", 0.0

    @staticmethod
    def _run_easyocr_single(crop_bgr: np.ndarray, lang: str) -> Tuple[str, float]:
        if crop_bgr.size == 0:
            return "", 0.0
        reader = _get_easyocr_reader(tuple(LANGUAGE_MAP[lang]))
        detections = reader.readtext(crop_bgr, detail=1, paragraph=False)
        if not detections:
            return "", 0.0
        best_text = ""
        best_score = 0.0
        for item in detections:
            if len(item) < 3:
                continue
            text = str(item[1]).strip()
            confidence = float(item[2])
            cleaned = OcrEngine._clean(text, lang)
            score = max(confidence, OcrCorrector.score_text(cleaned, lang))
            if score > best_score and cleaned:
                best_text = cleaned
                best_score = score
        return best_text, round(best_score, 3)

    @staticmethod
    def _pick_best_candidate(candidates: List[OcrCandidate], lang: str) -> OcrCandidate:
        if not candidates:
            return OcrCandidate("", 0.0, "none")

        def rank(item: OcrCandidate) -> Tuple[float, int]:
            return (item.confidence + OcrCorrector.score_text(item.text, lang) * 0.35, len(item.text))

        return max(candidates, key=rank)

    @staticmethod
    def _clean(text: str, lang: str) -> str:
        if lang in {"jp", "ja"}:
            return OcrCorrector.clean_japanese_ocr(text)
        if lang in {"kr", "ko"}:
            return OcrCorrector.clean_korean_ocr(text)
        if lang in {"cn", "zh"}:
            return OcrCorrector.clean_chinese_ocr(text)
        return OcrCorrector.clean_english_ocr(text)

    @staticmethod
    def _analyze_bubble_style(crop_bgr: np.ndarray) -> Dict[str, Any]:
        if crop_bgr.size == 0:
            return {
                "text_color": "#111111",
                "stroke_color": "#ffffff",
                "stroke_width": 0,
                "align": "center",
                "is_light_bubble": True,
            }

        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        border = max(2, min(crop_bgr.shape[:2]) // 14)
        if crop_bgr.shape[0] > border * 2 and crop_bgr.shape[1] > border * 2:
            edge = np.concatenate([
                gray[:border, :].reshape(-1),
                gray[-border:, :].reshape(-1),
                gray[:, :border].reshape(-1),
                gray[:, -border:].reshape(-1),
            ])
            bg_brightness = float(np.mean(edge))
        else:
            bg_brightness = float(np.mean(gray))

        is_light = bg_brightness >= 168.0
        if is_light:
            text_color = "#141414"
            stroke_color = "#ffffff"
            stroke_width = 0
        else:
            text_color = "#f4f4f4"
            stroke_color = "#111111"
            stroke_width = 1

        return {
            "text_color": text_color,
            "stroke_color": stroke_color,
            "stroke_width": stroke_width,
            "align": "center",
            "is_light_bubble": is_light,
        }

    @staticmethod
    def _analyze_text_layout(crop_bgr: np.ndarray, lang: str, line_count: int) -> Dict[str, Any]:
        height, width = crop_bgr.shape[:2]
        defaults = {
            "layout": "horizontal",
            "text_bounds": {
                "x": int(width * 0.1),
                "y": int(height * 0.1),
                "w": max(12, int(width * 0.8)),
                "h": max(12, int(height * 0.8)),
            },
            "original_line_count": max(1, line_count),
            "estimated_font_size": max(14, min(height, width) // 7),
            "line_spacing": 1.16,
        }
        if crop_bgr.size == 0:
            return defaults

        line_boxes = OcrEngine._detect_line_boxes(normalize_for_ocr(crop_bgr), lang)
        if not line_boxes:
            ink_bounds = OcrEngine._estimate_ink_bounds(crop_bgr)
            if ink_bounds:
                defaults["text_bounds"] = ink_bounds
                defaults["estimated_font_size"] = max(
                    14, min(ink_bounds["h"], ink_bounds["w"]) // 6
                )
            return defaults

        tx1 = min(line.x1 for line in line_boxes)
        ty1 = min(line.y1 for line in line_boxes)
        tx2 = max(line.x2 for line in line_boxes)
        ty2 = max(line.y2 for line in line_boxes)
        pad_x = max(3, int((tx2 - tx1) * 0.06))
        pad_y = max(3, int((ty2 - ty1) * 0.06))
        text_bounds = {
            "x": max(0, tx1 - pad_x),
            "y": max(0, ty1 - pad_y),
            "w": min(width, tx2 + pad_x) - max(0, tx1 - pad_x),
            "h": min(height, ty2 + pad_y) - max(0, ty1 - pad_y),
        }
        sizes = sorted(line.height for line in line_boxes)
        est_font = max(14, int(sizes[len(sizes) // 2] * 0.9))
        return {
            "layout": "horizontal",
            "text_bounds": text_bounds,
            "original_line_count": max(1, len(line_boxes)),
            "estimated_font_size": est_font,
            "line_spacing": 1.16,
        }

    @staticmethod
    def _estimate_ink_bounds(crop_bgr: np.ndarray) -> Dict[str, int] | None:
        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        border = max(2, min(crop_bgr.shape[:2]) // 12)
        mask[:border, :] = 0
        mask[-border:, :] = 0
        mask[:, :border] = 0
        mask[:, -border:] = 0
        points = cv2.findNonZero(mask)
        if points is None:
            return None
        x, y, w, h = cv2.boundingRect(points)
        return {"x": x, "y": y, "w": max(8, w), "h": max(8, h)}


@lru_cache(maxsize=1)
def _get_manga_ocr():
    try:
        from manga_ocr import MangaOcr
    except ImportError as exc:
        raise ImportError("manga-ocr is unavailable") from exc
    return MangaOcr()


@lru_cache(maxsize=4)
def _get_easyocr_reader(languages: tuple[str, ...]):
    try:
        import easyocr
    except ImportError as exc:
        raise ImportError("easyocr is unavailable") from exc
    return easyocr.Reader(list(languages), gpu=False, verbose=False)
