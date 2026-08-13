# MangaOCR backend

This service accepts one manga page, detects text regions, extracts dialogue,
translates the whole page with Gemini, removes the original text, and renders
the translation onto the cleaned image. It does not use mock OCR, dictionary
translations, or demo images.

## Requirements

- Python 3.11 or 3.12 (recommended for the OCR model dependencies)
- Translation API keys configured on the server in `manga_ocr_server/.env`
  (Gemini, OpenRouter, or any OpenAI-compatible endpoint). Users choose the
  provider in the web UI, but keys are never accepted from the browser.

From this directory, install and start the service:

```powershell
py -3 -m pip install -r requirements.txt
py -3 -m uvicorn main:app --host 127.0.0.1 --port 9444 --reload
```

Then start the Node server and client as usual. The Node server exposes the
browser-facing `/api/mangaocr/*` endpoints and forwards them to this service.
The OCR packages download their language-model files the first time they are
used, so that first page needs an internet connection and can take longer.

## Privacy and storage

The uploaded source image and its results are stored beneath `storage/` for
the current server instance. That directory is ignored by Git. Translation
API keys live only in server environment variables and are never sent from
the browser or stored in job JSON.

## Operations notes

Jobs are currently kept in memory and are intended for a single local server
process. Restarting the service clears job progress; previously generated
images remain on disk until manually cleaned up. Configure a process-level
`GEMINI_API_KEY` for a shared installation instead of giving users a shared
browser key field.
