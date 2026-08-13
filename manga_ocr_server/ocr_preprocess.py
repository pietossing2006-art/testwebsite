"""Image preprocessing helpers that improve OCR accuracy on comic pages."""

from __future__ import annotations

from typing import List, Tuple

import cv2
import numpy as np


def pad_crop(crop_bgr: np.ndarray, ratio: float = 0.04) -> np.ndarray:
    if crop_bgr.size == 0:
        return crop_bgr
    height, width = crop_bgr.shape[:2]
    pad_x = max(2, int(width * ratio))
    pad_y = max(2, int(height * ratio))
    return cv2.copyMakeBorder(
        crop_bgr, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_REPLICATE
    )


def upscale_if_small(crop_bgr: np.ndarray, min_side: int = 96) -> np.ndarray:
    height, width = crop_bgr.shape[:2]
    shortest = min(height, width)
    if shortest >= min_side:
        return crop_bgr
    scale = float(min_side) / float(max(1, shortest))
    scale = min(scale, 3.0)
    return cv2.resize(
        crop_bgr,
        (max(1, int(width * scale)), max(1, int(height * scale))),
        interpolation=cv2.INTER_CUBIC,
    )


def clahe_bgr(crop_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
    enhanced = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def sharpen_bgr(crop_bgr: np.ndarray) -> np.ndarray:
    blurred = cv2.GaussianBlur(crop_bgr, (0, 0), 1.0)
    return cv2.addWeighted(crop_bgr, 1.45, blurred, -0.45, 0)


def normalize_for_ocr(crop_bgr: np.ndarray) -> np.ndarray:
    padded = pad_crop(crop_bgr)
    upscaled = upscale_if_small(padded)
    return sharpen_bgr(clahe_bgr(upscaled))


def ocr_variants(crop_bgr: np.ndarray) -> List[Tuple[str, np.ndarray]]:
    if crop_bgr.size == 0:
        return []
    base = normalize_for_ocr(crop_bgr)
    variants: List[Tuple[str, np.ndarray]] = [("normalized", base)]
    height, width = base.shape[:2]
    if max(height, width) < 420:
        variants.append(("upscaled", upscale_if_small(base, min_side=160)))
    return variants


def crop_line_region(
    crop_bgr: np.ndarray,
    x1: int,
    y1: int,
    x2: int,
    y2: int,
    pad_ratio: float = 0.12,
) -> np.ndarray:
    height, width = crop_bgr.shape[:2]
    lw = max(1, x2 - x1)
    lh = max(1, y2 - y1)
    pad_x = max(2, int(lw * pad_ratio))
    pad_y = max(2, int(lh * pad_ratio))
    left = max(0, x1 - pad_x)
    top = max(0, y1 - pad_y)
    right = min(width, x2 + pad_x)
    bottom = min(height, y2 + pad_y)
    return crop_bgr[top:bottom, left:right]
