import os
import re
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from typing import List, Dict, Any

FONTS_DIR = os.path.join(os.path.dirname(__file__), "storage", "fonts")
os.makedirs(FONTS_DIR, exist_ok=True)

THAI_CHAR = re.compile(r"[\u0E00-\u0E7F]")


class Typesetter:
    @staticmethod
    def render_typesetting(
        base_img_bgr: np.ndarray,
        bubbles: List[Dict[str, Any]],
        font_name: str = "default",
        target_lang: str = "th",
    ) -> np.ndarray:
        pil_img = Image.fromarray(cv2.cvtColor(base_img_bgr, cv2.COLOR_BGR2RGB))
        draw = ImageDraw.Draw(pil_img)
        font_path = Typesetter._resolve_font_path(font_name, target_lang)

        for bubble in bubbles:
            text = bubble.get("translated_text", "").strip()
            if not text:
                continue
            Typesetter._render_bubble(draw, bubble, text, font_path, target_lang)

        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

    @staticmethod
    def _render_bubble(
        draw: ImageDraw.ImageDraw,
        bubble: Dict[str, Any],
        text: str,
        font_path: str,
        target_lang: str,
    ) -> None:
        bx, by, bw, bh = bubble["x"], bubble["y"], bubble["w"], bubble["h"]
        margin_x = max(8, int(bw * 0.1))
        margin_y = max(8, int(bh * 0.1))
        tx = bx + margin_x
        ty = by + margin_y
        tw = bw - margin_x * 2
        th = bh - margin_y * 2
        if tw <= 10 or th <= 10:
            return

        text_color = bubble.get("text_color", "#141414")
        stroke_color = bubble.get("stroke_color", "#ffffff")
        stroke_width = int(bubble.get("stroke_width", 0) or 0)
        align = bubble.get("align", "center")
        line_spacing = float(bubble.get("line_spacing", 1.16) or 1.16)
        manual_size = int(bubble.get("font_size", 0) or 0)
        hint_size = manual_size if manual_size > 0 else int(bubble.get("estimated_font_size", 0) or 0)

        font, lines = Typesetter._fit_horizontal_layout(
            draw, text, font_path, tw, th, hint_size, target_lang, line_spacing
        )
        if not lines:
            return

        line_metrics = [draw.textbbox((0, 0), line, font=font) for line in lines]
        line_heights = [box[3] - box[1] for box in line_metrics]
        line_widths = [box[2] - box[0] for box in line_metrics]
        gap = max(3, int(max(line_heights) * (line_spacing - 1.0)))
        total_h = sum(line_heights) + gap * max(0, len(lines) - 1)
        start_y = ty + max(0, (th - total_h) // 2)
        current_y = start_y

        for index, line in enumerate(lines):
            line_w = line_widths[index]
            line_h = line_heights[index]
            if align == "left":
                start_x = tx
            elif align == "right":
                start_x = tx + tw - line_w
            else:
                start_x = tx + max(0, (tw - line_w) // 2)

            draw.text(
                (start_x, current_y),
                line,
                font=font,
                fill=text_color,
                stroke_fill=stroke_color if stroke_width > 0 else None,
                stroke_width=stroke_width if stroke_width > 0 else 0,
            )
            current_y += line_h + gap

    @staticmethod
    def _fit_horizontal_layout(
        draw: ImageDraw.ImageDraw,
        text: str,
        font_path: str,
        max_w: int,
        max_h: int,
        hint_size: int,
        target_lang: str,
        line_spacing: float,
    ):
        low = max(14, hint_size - 2) if hint_size else 14
        high = max(low + 1, min(54, hint_size + 12 if hint_size else 46))
        best_font = None
        best_lines = [text]

        for size in range(high, low - 1, -1):
            try:
                font = ImageFont.truetype(font_path, size)
            except Exception:
                font = ImageFont.load_default()

            lines = Typesetter._wrap_text(draw, text, font, max_w, target_lang)
            metrics = [draw.textbbox((0, 0), line, font=font) for line in lines]
            if any((box[2] - box[0]) > max_w for box in metrics):
                continue

            line_heights = [box[3] - box[1] for box in metrics]
            gap = max(3, int(max(line_heights) * (line_spacing - 1.0)))
            total_h = sum(line_heights) + gap * max(0, len(lines) - 1)
            if total_h <= max_h:
                return font, lines

            best_font = font
            best_lines = lines

        return best_font or ImageFont.load_default(), best_lines

    @staticmethod
    def _text_units(text: str, target_lang: str) -> List[str]:
        if " " in text.strip():
            return text.split()
        if target_lang.lower() == "th" or THAI_CHAR.search(text):
            return Typesetter._thai_units(text)
        return list(text)

    @staticmethod
    def _resolve_font_path(font_name: str, target_lang: str) -> str:
        font_file_map = {
            "kanit": "Kanit-Regular.ttf",
            "sarabun": "Sarabun-Regular.ttf",
            "prompt": "Prompt-Regular.ttf",
        }
        filename = font_file_map.get(font_name.lower())
        if filename:
            custom_path = os.path.join(FONTS_DIR, filename)
            if os.path.exists(custom_path):
                return custom_path

        thai_fonts = [
            os.path.join(FONTS_DIR, "Kanit-Regular.ttf"),
            os.path.join(FONTS_DIR, "Sarabun-Regular.ttf"),
            "C:\\Windows\\Fonts\\LeelawUI.ttf",
            "C:\\Windows\\Fonts\\Tahoma.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf",
        ]
        if target_lang.lower() == "th" or font_name.lower() == "default":
            for font_path in thai_fonts:
                if os.path.exists(font_path):
                    return font_path

        sys_fonts = [
            "C:\\Windows\\Fonts\\arial.ttf",
            "C:\\Windows\\Fonts\\segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for font_path in sys_fonts:
            if os.path.exists(font_path):
                return font_path
        return "arial.ttf"

    @staticmethod
    def _wrap_text(
        draw: ImageDraw.ImageDraw,
        text: str,
        font: ImageFont.ImageFont,
        max_w: int,
        target_lang: str,
    ) -> List[str]:
        units = Typesetter._text_units(text, target_lang)
        joiner = " " if " " in text.strip() else ""
        lines: List[str] = []
        current = ""
        for unit in units:
            test_line = f"{current}{joiner}{unit}" if current else unit
            bbox = draw.textbbox((0, 0), test_line, font=font)
            if bbox[2] - bbox[0] <= max_w:
                current = test_line
            else:
                if current:
                    lines.append(current)
                current = unit
        if current:
            lines.append(current)
        return lines

    @staticmethod
    def _thai_units(text: str) -> List[str]:
        parts = re.findall(r"\S+|\s+", text)
        units: List[str] = []
        for part in parts:
            if part.isspace():
                if units:
                    units[-1] += part
                continue
            if len(part) <= 12:
                units.append(part)
            else:
                units.extend(list(part))
        return units or list(text)
