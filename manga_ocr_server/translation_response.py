"""Shared JSON parsing for translation provider responses."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List


class TranslationParseError(ValueError):
    pass


def build_translation_prompt(payload: List[Dict[str, Any]], target_name: str, *, json_object: bool = False) -> str:
    shape = (
        'Return ONLY valid JSON as {"translations":[{"id":"...","translation":"..."}]}'
        if json_object else
        "Return ONLY valid JSON as an array of objects with keys id and translation"
    )
    return (
        f"Translate this manga page dialogue list into natural, readable {target_name}. "
        "Items are listed in page reading order. "
        "Translate EACH item on its own: one input id must map to exactly one output translation. "
        "Do NOT merge dialogue from different bubbles. "
        "Do NOT split one bubble into multiple items. "
        "Keep the same id for every item. "
        "Preserve speaker tone, emotion, nuance, and story context across the page. "
        "Write dialogue that reads naturally in horizontal lines, not vertical Japanese layout. "
        f"{shape}.\n\n"
        f"Input: {json.dumps(payload, ensure_ascii=False)}"
    )


def parse_translation_response(raw: str, payload: List[Dict[str, Any]]) -> Dict[str, str]:
    decoded = decode_json_payload(raw)
    normalized = normalize_translation_map(decoded, payload)
    if normalized:
        return normalized
    raise TranslationParseError("The model did not return the expected JSON translation.")


def decode_json_payload(raw: str) -> Any:
    text = str(raw or "").strip()
    if not text:
        raise TranslationParseError("The model did not return the expected JSON translation.")

    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        text = fenced.group(1).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    for pattern in (r"\[.*\]", r"\{.*\}"):
        match = re.search(pattern, text, re.DOTALL)
        if not match:
            continue
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            continue

    raise TranslationParseError("The model returned invalid JSON translation.")


def normalize_translation_map(decoded: Any, payload: List[Dict[str, Any]]) -> Dict[str, str]:
    expected_ids = {str(item["id"]) for item in payload}
    output: Dict[str, str] = {}

    if isinstance(decoded, list):
        for item in decoded:
            if not isinstance(item, dict):
                continue
            item_id = _pick_field(item, ("id", "region_id", "bubble_id", "key"))
            text = _pick_field(item, ("translation", "translated_text", "text", "value"))
            if item_id and text:
                output[str(item_id)] = str(text).strip()
        return output

    if isinstance(decoded, dict):
        if "translations" in decoded and isinstance(decoded["translations"], list):
            return normalize_translation_map(decoded["translations"], payload)
        if "items" in decoded and isinstance(decoded["items"], list):
            return normalize_translation_map(decoded["items"], payload)

        for key, value in decoded.items():
            key_text = str(key).strip()
            if key_text in expected_ids:
                output[key_text] = _extract_translation_value(value)
            elif isinstance(value, dict):
                item_id = _pick_field(value, ("id", "region_id", "bubble_id"))
                text = _pick_field(value, ("translation", "translated_text", "text", "value"))
                if item_id and text:
                    output[str(item_id)] = str(text).strip()

        if output:
            return output

        for key, value in decoded.items():
            if str(key).strip().isdigit():
                text = _extract_translation_value(value)
                if text:
                    output[str(key).strip()] = text
    return output


def _pick_field(item: Dict[str, Any], names: tuple[str, ...]) -> str:
    for name in names:
        value = item.get(name)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _extract_translation_value(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return _pick_field(value, ("translation", "translated_text", "text", "value"))
    if isinstance(value, list):
        parts = [_extract_translation_value(item) for item in value]
        return " ".join(part for part in parts if part).strip()
    if value is None:
        return ""
    return str(value).strip()
