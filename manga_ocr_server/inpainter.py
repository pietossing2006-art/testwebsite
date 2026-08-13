from __future__ import annotations

from typing import Any, Dict, List, Tuple

import cv2
import numpy as np


class Inpainter:
    @staticmethod
    def inpaint_speech_bubbles(img_bgr: np.ndarray, bubbles: List[Dict[str, Any]]) -> np.ndarray:
        cleaned = img_bgr.copy()
        height, width = cleaned.shape[:2]
        for bubble in bubbles:
            x = max(0, int(bubble["x"]))
            y = max(0, int(bubble["y"]))
            right = min(width, x + max(1, int(bubble["w"])))
            bottom = min(height, y + max(1, int(bubble["h"])))
            if right - x < 4 or bottom - y < 4:
                continue

            crop = cleaned[y:bottom, x:right].copy()
            is_light = bool(bubble.get("is_light_bubble", Inpainter._is_light_bubble(crop)))
            text_mask = Inpainter._build_text_mask(crop, is_light)
            if cv2.countNonZero(text_mask) == 0:
                continue

            restored = Inpainter._restore_region(crop, text_mask, is_light)
            cleaned[y:bottom, x:right] = restored
        return cleaned

    @staticmethod
    def _is_light_bubble(crop: np.ndarray) -> bool:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        border = max(2, min(crop.shape[:2]) // 14)
        if crop.shape[0] <= border * 2 or crop.shape[1] <= border * 2:
            samples = gray.reshape(-1)
        else:
            edge = np.concatenate([
                gray[:border, :].reshape(-1),
                gray[-border:, :].reshape(-1),
                gray[:, :border].reshape(-1),
                gray[:, -border:].reshape(-1),
            ])
            samples = edge
        return float(np.mean(samples)) >= 168.0

    @staticmethod
    def _build_text_mask(crop: np.ndarray, is_light: bool) -> np.ndarray:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        if is_light:
            blurred = cv2.GaussianBlur(gray, (3, 3), 0)
            _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            border = max(3, min(crop.shape[:2]) // 12)
            mask[:border, :] = 0
            mask[-border:, :] = 0
            mask[:, :border] = 0
            mask[:, -border:] = 0
        else:
            mask = cv2.adaptiveThreshold(
                gray,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV,
                17,
                7,
            )

        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8), iterations=1)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8), iterations=1)
        mask = Inpainter._filter_small_components(mask, min_area=18)
        mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=2)
        return mask

    @staticmethod
    def _filter_small_components(mask: np.ndarray, min_area: int) -> np.ndarray:
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        filtered = np.zeros_like(mask)
        for index in range(1, count):
            if stats[index, cv2.CC_STAT_AREA] >= min_area:
                filtered[labels == index] = 255
        return filtered

    @staticmethod
    def _restore_region(crop: np.ndarray, text_mask: np.ndarray, is_light: bool) -> np.ndarray:
        radius = max(5, min(crop.shape[:2]) // 18)
        inpainted = cv2.inpaint(crop, text_mask, radius, cv2.INPAINT_NS)
        inpainted = cv2.inpaint(inpainted, text_mask, max(3, radius // 2), cv2.INPAINT_TELEA)

        soft = cv2.GaussianBlur(text_mask.astype(np.float32) / 255.0, (0, 0), 2.2)
        soft = np.clip(soft, 0.0, 1.0)[..., None]

        if is_light:
            fill = Inpainter._local_background_plane(crop, text_mask)
            merged = (inpainted.astype(np.float32) * (1.0 - soft) + fill.astype(np.float32) * soft)
        else:
            merged = inpainted.astype(np.float32)

        merged = np.clip(merged, 0, 255).astype(np.uint8)
        merged = Inpainter._smooth_inpainted_zone(merged, crop, text_mask)
        return Inpainter._feather_edges(merged, crop, text_mask)

    @staticmethod
    def _local_background_plane(crop: np.ndarray, text_mask: np.ndarray) -> np.ndarray:
        h, w = crop.shape[:2]
        border = max(3, min(h, w) // 12)
        bg_samples = []
        if h > border * 2 and w > border * 2:
            for ring in (crop[:border, :], crop[-border:, :], crop[:, :border], crop[:, -border:]):
                bg_samples.append(ring.reshape(-1, 3))
        if bg_samples:
            bg = np.median(np.vstack(bg_samples), axis=0)
        else:
            bg = np.median(crop.reshape(-1, 3), axis=0)

        plane = np.tile(bg, (h, w, 1)).astype(np.float32)
        # Preserve subtle screen tone by mixing in lightly blurred original outside text.
        blurred = cv2.GaussianBlur(crop, (0, 0), 1.1).astype(np.float32)
        tone = cv2.bitwise_not(cv2.bitwise_not(text_mask))
        tone = cv2.GaussianBlur(tone.astype(np.float32) / 255.0, (0, 0), 4.0)[..., None]
        return plane * (1.0 - tone * 0.35) + blurred * (tone * 0.35)

    @staticmethod
    def _smooth_inpainted_zone(result: np.ndarray, original: np.ndarray, text_mask: np.ndarray) -> np.ndarray:
        zone = cv2.dilate(text_mask, np.ones((5, 5), np.uint8), iterations=1)
        smoothed = cv2.bilateralFilter(result, 7, 35, 35)
        alpha = cv2.GaussianBlur(zone.astype(np.float32) / 255.0, (0, 0), 2.5)[..., None]
        blended = result.astype(np.float32) * (1.0 - alpha) + smoothed.astype(np.float32) * alpha
        return np.clip(blended, 0, 255).astype(np.uint8)

    @staticmethod
    def _feather_edges(result: np.ndarray, original: np.ndarray, text_mask: np.ndarray) -> np.ndarray:
        edge = cv2.dilate(text_mask, np.ones((7, 7), np.uint8), iterations=1)
        edge = cv2.subtract(edge, cv2.erode(text_mask, np.ones((3, 3), np.uint8), iterations=1))
        if cv2.countNonZero(edge) == 0:
            return result
        alpha = cv2.GaussianBlur(edge.astype(np.float32) / 255.0, (0, 0), 1.6)[..., None]
        merged = result.astype(np.float32) * alpha + original.astype(np.float32) * (1.0 - alpha)
        output = original.copy()
        output[text_mask > 0] = merged[text_mask > 0]
        return output
