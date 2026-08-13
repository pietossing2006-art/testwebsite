from __future__ import annotations

import os
import re
from io import BytesIO
from typing import Any, Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

import config
from queue_worker import QueueWorker
from translation_providers import TranslationError, list_providers, resolve_settings
from upload_manager import UploadManager
from language_detector import LanguageDetector

app = FastAPI(title="MangaOCR API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3001"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

VALID_SOURCE_LANGUAGES = {"jp", "ja", "kr", "ko", "cn", "zh", "en"}
VALID_TARGET_LANGUAGES = {"th", "en", "ja", "ko", "zh"}
VALID_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
JOB_ID_PATTERN = re.compile(r"^job_\d+_[a-f0-9]{8}$")


class ProcessRequest(BaseModel):
    job_id: str
    source_lang: str = "jp"
    target_lang: str = "th"
    font_style: str = "default"
    translation_provider: Optional[str] = Field(default=None, max_length=32)


class RetypesetRequest(BaseModel):
    job_id: str
    bubbles: List[Dict[str, Any]] = Field(min_length=1, max_length=300)
    font_style: str = "default"
    target_lang: str = "th"


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "mangaocr"}


@app.get("/api/capabilities")
def capabilities() -> Dict[str, Any]:
    return {
        "source_languages": sorted(VALID_SOURCE_LANGUAGES),
        "target_languages": sorted(VALID_TARGET_LANGUAGES),
        "max_upload_bytes": config.MAX_UPLOAD_BYTES,
        "translation_provider": config.TRANSLATION_PROVIDER,
        "translation_providers": list_providers(),
    }


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)) -> Dict[str, Any]:
    filename = file.filename or ""
    suffix = os.path.splitext(filename)[1].lower()
    if suffix not in VALID_IMAGE_SUFFIXES:
        raise HTTPException(status_code=415, detail="Use a PNG, JPG, JPEG, or WEBP image.")
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="The upload must be an image.")
    content = await file.read(config.MAX_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(content) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 25 MB upload limit.")
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid image.") from exc
    job_id = UploadManager.create_session()
    saved = UploadManager.save_uploaded_file(job_id, filename, content)
    return {"success": True, "job_id": job_id, "file_name": saved["original_filename"], "file_size": saved["file_size"]}


class DetectLanguageRequest(BaseModel):
    job_id: str


@app.post("/api/detect-language")
async def detect_language(payload: DetectLanguageRequest) -> Dict[str, Any]:
    _validate_job_id(payload.job_id)
    paths = UploadManager.get_job_paths(payload.job_id)
    if not paths["original_image"] or not os.path.exists(paths["original_image"]):
        raise HTTPException(status_code=404, detail="Upload not found or it has expired.")
    try:
        result = LanguageDetector.detect_from_job(payload.job_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return {"success": True, "job_id": payload.job_id, **result}


@app.post("/api/process")
async def process_manga_page(payload: ProcessRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    _validate_job_id(payload.job_id)
    source, target = payload.source_lang.lower(), payload.target_lang.lower()
    if source == "auto":
        try:
            source = LanguageDetector.detect_from_job(payload.job_id)["language"]
        except (FileNotFoundError, ValueError) as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    if source not in VALID_SOURCE_LANGUAGES or target not in VALID_TARGET_LANGUAGES:
        raise HTTPException(status_code=422, detail="Unsupported source or target language.")
    try:
        settings = resolve_settings(provider=payload.translation_provider)
    except TranslationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    paths = UploadManager.get_job_paths(payload.job_id)
    if not paths["original_image"] or not os.path.exists(paths["original_image"]):
        raise HTTPException(status_code=404, detail="Upload not found or it has expired.")
    current = QueueWorker.get_job_status(payload.job_id)
    if current and current.get("status") == "PROCESSING":
        raise HTTPException(status_code=409, detail="This page is already processing.")
    QueueWorker._set(payload.job_id, "QUEUED", 1, "QUEUED", "Waiting to start…")
    background_tasks.add_task(
        QueueWorker.process_job,
        payload.job_id,
        source,
        target,
        payload.font_style,
        payload.translation_provider,
    )
    return {"success": True, "job_id": payload.job_id, "status": "QUEUED", "detected_source_lang": source}


@app.get("/api/status/{job_id}")
def get_status(job_id: str) -> Dict[str, Any]:
    _validate_job_id(job_id)
    status = QueueWorker.get_job_status(job_id)
    if not status:
        paths = UploadManager.get_job_paths(job_id)
        if not paths["original_image"]:
            raise HTTPException(status_code=404, detail="Job not found or expired.")
        return {"job_id": job_id, "status": "UPLOADED", "progress": 0, "current_step": "UPLOADED", "step_description": "Ready to process.", "bubbles": []}
    return status


@app.post("/api/retypeset")
async def retypeset_bubbles(payload: RetypesetRequest) -> Dict[str, Any]:
    _validate_job_id(payload.job_id)
    try:
        result = QueueWorker.retypeset_job(
            payload.job_id, payload.bubbles, payload.font_style, payload.target_lang
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"success": True, "job_id": payload.job_id, "final_image_url": f"/api/image/{payload.job_id}/final?v={int(os.path.getmtime(result))}"}


@app.get("/api/image/{job_id}/{image_type}")
def get_image(job_id: str, image_type: str):
    _validate_job_id(job_id)
    paths = UploadManager.get_job_paths(job_id)
    mapping = {"original": paths["original_image"], "cleaned": paths["cleaned_image"], "final": paths["final_image"]}
    file_path = mapping.get(image_type)
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requested image is not available yet.")
    return FileResponse(file_path, media_type="image/png" if image_type != "original" else None)


@app.get("/api/download/{job_id}")
def download_result(job_id: str):
    _validate_job_id(job_id)
    result = UploadManager.get_job_paths(job_id)["final_image"]
    if not os.path.exists(result):
        raise HTTPException(status_code=404, detail="No completed result is available for this job.")
    return FileResponse(result, media_type="image/png", filename=f"mangaocr-{job_id}.png")


def _validate_job_id(job_id: str) -> None:
    if not JOB_ID_PATTERN.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Job not found.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=9444, reload=True)
