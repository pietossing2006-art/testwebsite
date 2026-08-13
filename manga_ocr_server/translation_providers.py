"""Translation backends: Gemini, OpenRouter, and OpenAI-compatible APIs."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import requests

import config
from translation_response import TranslationParseError, build_translation_prompt, parse_translation_response


class TranslationError(RuntimeError):
    pass


TARGET_NAMES = {
    "th": "Thai",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Simplified Chinese",
}

PROVIDER_LABELS = {
    "gemini": "Google Gemini",
    "openrouter": "OpenRouter",
    "openai_compatible": "OpenAI-compatible",
}

GEMINI_RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "translation": {"type": "string"},
        },
        "required": ["id", "translation"],
    },
}


@dataclass(frozen=True)
class TranslationSettings:
    provider: str
    api_key: str
    model: str
    base_url: str = ""


def list_providers() -> List[Dict[str, Any]]:
    return [
        _provider_info("gemini", config.GEMINI_MODEL or "gemini-2.0-flash"),
        _provider_info("openrouter", config.OPENROUTER_MODEL),
        _provider_info("openai_compatible", config.OPENAI_COMPAT_MODEL, requires_base_url=True),
    ]


def _provider_info(provider_id: str, default_model: str, requires_base_url: bool = False) -> Dict[str, Any]:
    available = provider_is_available(provider_id)
    info = {
        "id": provider_id,
        "label": PROVIDER_LABELS[provider_id],
        "default_model": default_model,
        "available": available,
    }
    if requires_base_url:
        info["configured"] = bool(config.OPENAI_COMPAT_BASE_URL)
    return info


def provider_is_available(provider_id: str) -> bool:
    if provider_id == "gemini":
        return bool(config.GEMINI_API_KEY or config.TRANSLATION_API_KEY)
    if provider_id == "openrouter":
        return bool(config.OPENROUTER_API_KEY or config.TRANSLATION_API_KEY)
    if provider_id == "openai_compatible":
        return bool(
            config.OPENAI_COMPAT_BASE_URL
            and (config.OPENAI_COMPAT_API_KEY or config.TRANSLATION_API_KEY)
        )
    return False


def resolve_settings(
    provider: str | None = None,
) -> TranslationSettings:
    selected = (provider or config.TRANSLATION_PROVIDER or "gemini").strip().lower()
    if selected not in PROVIDER_LABELS:
        raise TranslationError(f"Unsupported translation provider: {provider}")

    if selected == "gemini":
        resolved_key = (config.GEMINI_API_KEY or config.TRANSLATION_API_KEY).strip()
        resolved_model = (config.GEMINI_MODEL or "gemini-2.0-flash").strip()
        if not resolved_key:
            raise TranslationError("Gemini API key is not configured on the server.")
        return TranslationSettings(selected, resolved_key, resolved_model)

    if selected == "openrouter":
        resolved_key = (config.OPENROUTER_API_KEY or config.TRANSLATION_API_KEY).strip()
        resolved_model = config.OPENROUTER_MODEL.strip()
        if not resolved_key:
            raise TranslationError("OpenRouter API key is not configured on the server.")
        return TranslationSettings(
            selected,
            resolved_key,
            resolved_model,
            config.OPENROUTER_BASE_URL.rstrip("/"),
        )

    resolved_key = (config.OPENAI_COMPAT_API_KEY or config.TRANSLATION_API_KEY).strip()
    resolved_model = config.OPENAI_COMPAT_MODEL.strip()
    base_url = config.OPENAI_COMPAT_BASE_URL.rstrip("/")
    if not base_url:
        raise TranslationError(
            "OpenAI-compatible provider is not configured on the server. Set OPENAI_COMPAT_BASE_URL."
        )
    if not resolved_key:
        raise TranslationError("OpenAI-compatible API key is not configured on the server.")
    return TranslationSettings(selected, resolved_key, resolved_model, base_url)


def translate_payload(
    payload: List[Dict[str, Any]],
    target: str,
    settings: TranslationSettings,
) -> Dict[str, str]:
    if not settings.api_key:
        label = PROVIDER_LABELS.get(settings.provider, settings.provider)
        raise TranslationError(f"{label} API key is not configured on the server.")

    prompt = build_translation_prompt(payload, TARGET_NAMES[target])
    if settings.provider == "gemini":
        return _translate_with_gemini(prompt, payload, settings)
    prompt = build_translation_prompt(payload, TARGET_NAMES[target], json_object=True)
    return _translate_with_chat_completions(prompt, payload, settings)


def _translate_with_gemini(
    prompt: str,
    payload: List[Dict[str, Any]],
    settings: TranslationSettings,
) -> Dict[str, str]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.model}:generateContent"
    )
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": GEMINI_RESPONSE_SCHEMA,
        },
    }
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = requests.post(url, params={"key": settings.api_key}, json=body, timeout=60)
        except requests.RequestException as exc:
            raise TranslationError("Could not reach Gemini. Check the network and try again.") from exc
        if not response.ok:
            raise TranslationError(f"Gemini translation failed: {_extract_api_error(response)}")
        try:
            raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            return parse_translation_response(raw, payload)
        except TranslationParseError as exc:
            last_error = exc
            if attempt == 0:
                body["generationConfig"]["temperature"] = 0.0
                continue
            raise TranslationError(str(exc)) from exc
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise TranslationError("Gemini returned an unreadable translation response.") from exc
    if last_error:
        raise TranslationError(str(last_error))
    raise TranslationError("Gemini returned an unreadable translation response.")


def _translate_with_chat_completions(
    prompt: str,
    payload: List[Dict[str, Any]],
    settings: TranslationSettings,
) -> Dict[str, str]:
    if settings.provider == "openrouter":
        url = f"{settings.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": config.OPENROUTER_REFERER or "https://www.vxpers.com",
            "X-Title": config.OPENROUTER_APP_NAME or "VxperS MangaOCR",
        }
    else:
        url = f"{settings.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        }

    body = {
        "model": settings.model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an expert manga translator. "
                    "Always answer with valid JSON only."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    provider_label = PROVIDER_LABELS.get(settings.provider, settings.provider)
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = requests.post(url, headers=headers, json=body, timeout=90)
        except requests.RequestException as exc:
            raise TranslationError(
                f"Could not reach {provider_label}. Check the network and try again."
            ) from exc
        if not response.ok:
            raise TranslationError(f"{provider_label} translation failed: {_extract_api_error(response)}")
        try:
            raw = response.json()["choices"][0]["message"]["content"]
            return parse_translation_response(raw, payload)
        except TranslationParseError as exc:
            last_error = exc
            body["temperature"] = 0.0
            body.pop("response_format", None)
            continue
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise TranslationError(f"{provider_label} returned an unreadable translation response.") from exc
    if last_error:
        raise TranslationError(str(last_error))
    raise TranslationError(f"{provider_label} returned an unreadable translation response.")


def _extract_api_error(response: requests.Response) -> str:
    try:
        data = response.json()
        if isinstance(data, dict):
            if "error" in data and isinstance(data["error"], dict):
                return str(data["error"].get("message", "Request rejected"))
            if "detail" in data:
                return str(data["detail"])
        return str(data)[:240]
    except ValueError:
        text = response.text.strip()
        return text[:240] if text else "Request rejected"
