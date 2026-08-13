"""Translation orchestration for manga dialogue bubbles."""

from __future__ import annotations

from typing import Any, Dict, List

from translation_corrector import TranslationCorrector
from translation_providers import (
    TARGET_NAMES,
    TranslationError,
    resolve_settings,
    translate_payload,
)


class TranslationAI:
    @staticmethod
    def translate_bubbles(
        bubbles: List[Dict[str, Any]],
        target_lang: str = "th",
        provider: str | None = None,
    ) -> List[Dict[str, Any]]:
        meaningful = [bubble for bubble in bubbles if bubble.get("clean_ocr", "").strip()]
        if not meaningful:
            return bubbles

        target = target_lang.lower()
        if target not in TARGET_NAMES:
            raise TranslationError(f"Unsupported target language: {target_lang}")

        settings = resolve_settings(provider=provider)
        payload = [
            {
                "id": str(bubble["id"]),
                "order": index,
                "text": bubble["clean_ocr"],
            }
            for index, bubble in enumerate(meaningful, start=1)
        ]
        translated = translate_payload(payload, target, settings)
        missing = [item["id"] for item in payload if item["id"] not in translated]
        if missing:
            raise TranslationError(
                f"The translation provider did not return translations for regions: {', '.join(missing)}"
            )

        output = []
        for bubble in bubbles:
            updated = dict(bubble)
            value = translated.get(str(bubble["id"]), "").strip()
            if value:
                updated["translated_text"] = (
                    TranslationCorrector.post_process_thai(value)
                    if target == "th"
                    else TranslationCorrector.post_process_english(value)
                )
            output.append(updated)
        return output
