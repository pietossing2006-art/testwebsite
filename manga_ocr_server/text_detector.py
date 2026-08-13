"""Text-region detection for comic pages.

EasyOCR localization is the primary signal because it tracks actual dialogue
lines.  Detected lines are grouped into bubble-sized regions and snapped to
white speech-bubble contours when those are visible on the page.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np

from ocr_engine import LANGUAGE_MAP


class TextDetector:
    @staticmethod
    def detect_speech_bubbles(img_bgr: np.ndarray, lang: str = "jp") -> List[Dict[str, Any]]:
        image_height, image_width = img_bgr.shape[:2]
        working = TextDetector._resize_for_detection(img_bgr)
        scale_x = image_width / working.shape[1]
        scale_y = image_height / working.shape[0]

        line_boxes = TextDetector._detect_easyocr_lines(working, lang)
        line_boxes = TextDetector._scale_boxes(line_boxes, scale_x, scale_y)
        grouped = TextDetector._group_line_boxes(line_boxes, image_width, image_height)

        white_boxes = TextDetector._detect_white_bubbles(working)
        white_boxes = TextDetector._scale_boxes(white_boxes, scale_x, scale_y)

        merged = TextDetector._snap_to_white_bubbles(grouped, white_boxes)
        merged.extend(TextDetector._unused_white_bubbles(merged, white_boxes, working, scale_x, scale_y))

        if not merged:
            for preset in (
                {"block_size": 31, "c": 10},
                {"block_size": 21, "c": 8},
            ):
                ink_boxes = TextDetector._detect_from_ink(working, preset)
                merged.extend(TextDetector._scale_boxes(ink_boxes, scale_x, scale_y))
            merged = TextDetector._merge_boxes(merged)

        merged = TextDetector._filter_boxes(merged, image_width, image_height)
        merged = [TextDetector._refine_box_with_ink(img_bgr, box) for box in merged]
        merged = TextDetector._filter_boxes(merged, image_width, image_height)
        merged.sort(key=lambda box: (box["y"] // max(40, image_height // 12), -box["x"]))
        for index, box in enumerate(merged, start=1):
            box["id"] = index
        return merged

    @staticmethod
    def _resize_for_detection(img_bgr: np.ndarray) -> np.ndarray:
        height, width = img_bgr.shape[:2]
        longest = max(height, width)
        if longest <= 2400:
            return img_bgr
        scale = 2400.0 / longest
        return cv2.resize(
            img_bgr,
            (max(1, int(width * scale)), max(1, int(height * scale))),
            interpolation=cv2.INTER_AREA,
        )

    @staticmethod
    def _scale_boxes(boxes: List[Dict[str, Any]], scale_x: float, scale_y: float) -> List[Dict[str, Any]]:
        if abs(scale_x - 1.0) < 0.001 and abs(scale_y - 1.0) < 0.001:
            return boxes
        scaled: List[Dict[str, Any]] = []
        for box in boxes:
            scaled.append({
                "x": int(round(box["x"] * scale_x)),
                "y": int(round(box["y"] * scale_y)),
                "w": max(1, int(round(box["w"] * scale_x))),
                "h": max(1, int(round(box["h"] * scale_y))),
                "confidence": box.get("confidence", 0.5),
            })
        return scaled

    @staticmethod
    def _detect_easyocr_lines(img_bgr: np.ndarray, lang: str) -> List[Dict[str, Any]]:
        source = lang.lower()
        languages = LANGUAGE_MAP.get(source, ["ja"])
        reader = _get_easyocr_reader(tuple(languages))
        detections = reader.readtext(img_bgr, detail=1, paragraph=False)

        boxes: List[Dict[str, Any]] = []
        for item in detections:
            if len(item) < 3:
                continue
            bbox, _text, confidence = item[0], item[1], float(item[2])
            if confidence < 0.16:
                continue
            xs = [point[0] for point in bbox]
            ys = [point[1] for point in bbox]
            x1, y1 = int(min(xs)), int(min(ys))
            x2, y2 = int(max(xs)), int(max(ys))
            w = max(8, x2 - x1)
            h = max(8, y2 - y1)
            pad_x = max(4, w // 8)
            pad_y = max(4, h // 6)
            boxes.append({
                "x": max(0, x1 - pad_x),
                "y": max(0, y1 - pad_y),
                "w": w + pad_x * 2,
                "h": h + pad_y * 2,
                "confidence": round(confidence, 2),
            })
        return boxes

    @staticmethod
    def _group_line_boxes(
        boxes: List[Dict[str, Any]],
        image_width: int,
        image_height: int,
    ) -> List[Dict[str, Any]]:
        if not boxes:
            return []

        pending = sorted(boxes, key=lambda box: (box["x"] + box["w"], box["y"]))
        groups: List[Dict[str, Any]] = []

        while pending:
            current = pending.pop(0)
            changed = True
            while changed:
                changed = False
                kept: List[Dict[str, Any]] = []
                for other in pending:
                    if TextDetector._should_group_lines(current, other):
                        current = TextDetector._union_box(current, other)
                        changed = True
                    else:
                        kept.append(other)
                pending = kept
            groups.append(current)

        return TextDetector._merge_boxes(groups)

    @staticmethod
    def _should_group_lines(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
        ax1, ay1 = a["x"], a["y"]
        ax2, ay2 = ax1 + a["w"], ay1 + a["h"]
        bx1, by1 = b["x"], b["y"]
        bx2, by2 = bx1 + b["w"], by1 + b["h"]

        overlap_x = max(0, min(ax2, bx2) - max(ax1, bx1))
        overlap_y = max(0, min(ay2, by2) - max(ay1, by1))
        min_w = max(1, min(a["w"], b["w"]))
        min_h = max(1, min(a["h"], b["h"]))

        vertical_gap = max(0, max(by1 - ay2, ay1 - by2))
        horizontal_gap = max(0, max(bx1 - ax2, ax1 - bx2))

        # Vertical columns inside one bubble only when lines are close together.
        if overlap_x / min_w >= 0.42 and vertical_gap <= min_h * 0.85:
            return True
        # Horizontal lines inside one bubble.
        if overlap_y / min_h >= 0.42 and horizontal_gap <= min_w * 0.65:
            return True
        return False

    @staticmethod
    def _union_box(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
        x1 = min(a["x"], b["x"])
        y1 = min(a["y"], b["y"])
        x2 = max(a["x"] + a["w"], b["x"] + b["w"])
        y2 = max(a["y"] + a["h"], b["y"] + b["h"])
        return {
            "x": x1,
            "y": y1,
            "w": x2 - x1,
            "h": y2 - y1,
            "confidence": max(float(a.get("confidence", 0.5)), float(b.get("confidence", 0.5))),
        }

    @staticmethod
    def _snap_to_white_bubbles(
        text_boxes: List[Dict[str, Any]],
        white_boxes: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        if not text_boxes:
            return []

        snapped: List[Dict[str, Any]] = []
        for text_box in text_boxes:
            best = None
            best_score = 0.0
            for white in white_boxes:
                score = TextDetector._containment_score(text_box, white)
                if score > best_score:
                    best_score = score
                    best = white
            if best is not None and best_score >= 0.55:
                snapped.append(TextDetector._inner_box(best))
            else:
                snapped.append(dict(text_box))
        return TextDetector._merge_boxes(snapped)

    @staticmethod
    def _containment_score(inner: Dict[str, Any], outer: Dict[str, Any]) -> float:
        ix1, iy1 = inner["x"], inner["y"]
        ix2, iy2 = ix1 + inner["w"], iy1 + inner["h"]
        ox1, oy1 = outer["x"], outer["y"]
        ox2, oy2 = ox1 + outer["w"], oy1 + outer["h"]
        overlap = max(0, min(ix2, ox2) - max(ix1, ox1)) * max(0, min(iy2, oy2) - max(iy1, oy1))
        inner_area = max(1, inner["w"] * inner["h"])
        return overlap / inner_area

    @staticmethod
    def _inner_box(box: Dict[str, Any]) -> Dict[str, Any]:
        margin_x = max(6, int(box["w"] * 0.06))
        margin_y = max(6, int(box["h"] * 0.06))
        return {
            "x": box["x"] + margin_x,
            "y": box["y"] + margin_y,
            "w": max(12, box["w"] - margin_x * 2),
            "h": max(12, box["h"] - margin_y * 2),
            "confidence": box.get("confidence", 0.5),
        }

    @staticmethod
    def _unused_white_bubbles(
        existing: List[Dict[str, Any]],
        white_boxes: List[Dict[str, Any]],
        working: np.ndarray,
        scale_x: float,
        scale_y: float,
    ) -> List[Dict[str, Any]]:
        if not white_boxes:
            return []

        gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
        ink = cv2.adaptiveThreshold(
            cv2.GaussianBlur(gray, (3, 3), 0),
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            31,
            9,
        )
        extras: List[Dict[str, Any]] = []
        for white in white_boxes:
            if any(TextDetector._containment_score(white, item) >= 0.5 for item in existing):
                continue
            x, y, w, h = white["x"], white["y"], white["w"], white["h"]
            sx = int(round(x / scale_x)) if scale_x else x
            sy = int(round(y / scale_y)) if scale_y else y
            sw = max(1, int(round(w / scale_x))) if scale_x else w
            sh = max(1, int(round(h / scale_y))) if scale_y else h
            sx2, sy2 = min(working.shape[1], sx + sw), min(working.shape[0], sy + sh)
            if sx2 - sx < 8 or sy2 - sy < 8:
                continue
            density = cv2.countNonZero(ink[sy:sy2, sx:sx2]) / float(max(1, sw * sh))
            if density < 0.015:
                continue
            extras.append(TextDetector._inner_box(white))
        return extras

    @staticmethod
    def _detect_white_bubbles(img_bgr: np.ndarray) -> List[Dict[str, Any]]:
        image_height, image_width = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        bright = cv2.inRange(gray, 180, 255)
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (max(11, image_width // 70), max(9, image_height // 100)),
        )
        bright = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, kernel, iterations=2)
        bright = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)
        contours, _ = cv2.findContours(bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        page_area = image_height * image_width
        candidates: List[Dict[str, Any]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area < page_area * 0.0003 or area > page_area * 0.22:
                continue
            if w < 24 or h < 20 or w > image_width * 0.85 or h > image_height * 0.5:
                continue
            candidates.append({
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "confidence": 0.72,
            })
        return candidates

    @staticmethod
    def _detect_from_ink(img_bgr: np.ndarray, preset: Dict[str, int]) -> List[Dict[str, Any]]:
        image_height, image_width = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        normalized = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
        block_size = preset["block_size"] | 1
        ink = cv2.adaptiveThreshold(
            normalized,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            block_size,
            preset["c"],
        )
        kernel = cv2.getStructuringElement(
            cv2.MORPH_RECT,
            (max(9, image_width // 90), max(7, image_height // 130)),
        )
        joined = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours, _ = cv2.findContours(joined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        return TextDetector._boxes_from_contours(contours, ink, image_width, image_height)

    @staticmethod
    def _boxes_from_contours(
        contours: List[Any],
        ink: np.ndarray,
        image_width: int,
        image_height: int,
    ) -> List[Dict[str, Any]]:
        page_area = image_height * image_width
        candidates: List[Dict[str, Any]] = []
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            area = w * h
            if area < page_area * 0.0002 or area > page_area * 0.2:
                continue
            if w < 18 or h < 16:
                continue
            density = cv2.countNonZero(ink[y:y + h, x:x + w]) / float(area)
            if density < 0.02 or density > 0.75:
                continue
            candidates.append({
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "confidence": round(min(0.95, 0.35 + density), 2),
            })
        return candidates

    @staticmethod
    def _filter_boxes(
        boxes: List[Dict[str, Any]],
        image_width: int,
        image_height: int,
    ) -> List[Dict[str, Any]]:
        page_area = image_height * image_width
        filtered: List[Dict[str, Any]] = []
        for box in boxes:
            w = int(box["w"])
            h = int(box["h"])
            area = w * h
            if area < page_area * 0.00015 or area > page_area * 0.28:
                continue
            if w < 14 or h < 12:
                continue
            filtered.append(box)
        return TextDetector._merge_boxes(filtered)

    @staticmethod
    def _merge_boxes(boxes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        pending = sorted(boxes, key=lambda box: box["w"] * box["h"], reverse=True)
        merged: List[Dict[str, Any]] = []
        while pending:
            current = pending.pop(0)
            x1, y1 = current["x"], current["y"]
            x2, y2 = x1 + current["w"], y1 + current["h"]
            kept = []
            for other in pending:
                ox1, oy1 = other["x"], other["y"]
                ox2, oy2 = ox1 + other["w"], oy1 + other["h"]
                intersection = max(0, min(x2, ox2) - max(x1, ox1)) * max(0, min(y2, oy2) - max(y1, oy1))
                smaller = min(current["w"] * current["h"], other["w"] * other["h"])
                if smaller and intersection / smaller >= 0.62:
                    x1, y1 = min(x1, ox1), min(y1, oy1)
                    x2, y2 = max(x2, ox2), max(y2, oy2)
                    current.update({"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1})
                    current["confidence"] = max(
                        float(current.get("confidence", 0.5)),
                        float(other.get("confidence", 0.5)),
                    )
                else:
                    kept.append(other)
            pending = kept
            merged.append(current)
        return merged

    @staticmethod
    def _refine_box_with_ink(img_bgr: np.ndarray, box: Dict[str, Any]) -> Dict[str, Any]:
        height, width = img_bgr.shape[:2]
        x = max(0, int(box["x"]))
        y = max(0, int(box["y"]))
        right = min(width, x + max(1, int(box["w"])))
        bottom = min(height, y + max(1, int(box["h"])))
        crop = img_bgr[y:bottom, x:right]
        if crop.size == 0:
            return box

        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        border = max(2, min(crop.shape[:2]) // 14)
        mask[:border, :] = 0
        mask[-border:, :] = 0
        mask[:, :border] = 0
        mask[:, -border:] = 0
        points = cv2.findNonZero(mask)
        if points is None:
            return box

        rx, ry, rw, rh = cv2.boundingRect(points)
        pad_x = max(4, int(rw * 0.08))
        pad_y = max(4, int(rh * 0.08))
        nx = max(x, x + rx - pad_x)
        ny = max(y, y + ry - pad_y)
        nright = min(right, x + rx + rw + pad_x)
        nbottom = min(bottom, y + ry + rh + pad_y)
        if nright - nx < 12 or nbottom - ny < 12:
            return box
        refined = dict(box)
        refined.update({
            "x": nx,
            "y": ny,
            "w": nright - nx,
            "h": nbottom - ny,
        })
        return refined


@lru_cache(maxsize=4)
def _get_easyocr_reader(languages: tuple[str, ...]):
    import easyocr

    return easyocr.Reader(list(languages), gpu=False, verbose=False)
