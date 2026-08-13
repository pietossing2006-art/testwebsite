"""Runtime configuration for the MangaOCR service.

All API keys and model names are read from environment variables
(`manga_ocr_server/.env` is loaded automatically on startup).
Users may choose a translation provider in the web UI, but keys/models
never come from the browser.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent
load_dotenv(_BASE_DIR / ".env", override=False)

MAX_UPLOAD_BYTES = int(os.getenv("MANGAOCR_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))
JOB_RETENTION_HOURS = int(os.getenv("MANGAOCR_JOB_RETENTION_HOURS", "24"))

# Default provider when the UI does not override it: gemini | openrouter | openai_compatible
TRANSLATION_PROVIDER = os.getenv("TRANSLATION_PROVIDER", "gemini").strip().lower()

# Optional shared fallback key for any provider below
TRANSLATION_API_KEY = os.getenv("TRANSLATION_API_KEY", "").strip()

# Google Gemini (https://ai.google.dev)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", TRANSLATION_API_KEY).strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash").strip()

# OpenRouter (https://openrouter.ai)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", TRANSLATION_API_KEY).strip()
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-001").strip()
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").strip()
OPENROUTER_REFERER = os.getenv("OPENROUTER_REFERER", "https://www.vxpers.com").strip()
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "VxperS MangaOCR").strip()

# Any OpenAI-compatible API (OpenAI, Together, Groq, LM Studio, etc.)
OPENAI_COMPAT_API_KEY = os.getenv("OPENAI_COMPAT_API_KEY", TRANSLATION_API_KEY).strip()
OPENAI_COMPAT_MODEL = os.getenv("OPENAI_COMPAT_MODEL", "gpt-4o-mini").strip()
OPENAI_COMPAT_BASE_URL = os.getenv("OPENAI_COMPAT_BASE_URL", "").strip()
