from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, Dict, List, Optional

import cv2

from image_processor import ImageProcessor
from inpainter import Inpainter
from ocr_engine import OcrEngine
from text_detector import TextDetector
from translation_ai import TranslationAI
from typesetter import Typesetter
from upload_manager import UploadManager

JOB_STORE: Dict[str, Dict[str, Any]] = {}


class QueueWorker:
    @staticmethod
    def get_job_status(job_id: str) -> Optional[Dict[str, Any]]:
        return JOB_STORE.get(job_id)

    @staticmethod
    async def process_job(
        job_id: str, source_lang: str = "jp", target_lang: str = "th",
        font_style: str = "default",
        translation_provider: Optional[str] = None,
    ) -> None:
        paths = UploadManager.get_job_paths(job_id)
        if not paths["original_image"]:
            return QueueWorker._fail(job_id, "Uploaded image no longer exists.")
        QueueWorker._set(job_id, "PROCESSING", 5, "VALIDATING", "Validating uploaded image…")
        try:
            QueueWorker._set(job_id, "PROCESSING", 15, "IMAGE_PROCESS", "Preparing image for OCR…")
            image = ImageProcessor.load_image(paths["original_image"])
            if image is None or image.size == 0:
                raise ValueError("The uploaded file is not a readable image.")

            QueueWorker._set(job_id, "PROCESSING", 30, "TEXT_DETECTION", "Finding dialogue regions…")
            regions = await asyncio.to_thread(TextDetector.detect_speech_bubbles, image, source_lang)
            if not regions:
                raise ValueError("No text regions were found. Try a clearer manga page or crop to the dialogue.")

            QueueWorker._set(job_id, "PROCESSING", 48, "OCR", "Reading dialogue…")
            bubbles = await asyncio.to_thread(OcrEngine.process_bubbles_ocr, image, regions, source_lang)
            readable = [bubble for bubble in bubbles if bubble.get("clean_ocr")]
            if not readable:
                raise ValueError("OCR could not read text from the detected regions.")

            QueueWorker._set(job_id, "PROCESSING", 68, "TRANSLATION", "Translating page context with Gemini…")
            bubbles = await asyncio.to_thread(
                TranslationAI.translate_bubbles,
                bubbles,
                target_lang,
                translation_provider,
            )

            QueueWorker._set(job_id, "PROCESSING", 82, "INPAINTING", "Removing original text…")
            cleaned = await asyncio.to_thread(Inpainter.inpaint_speech_bubbles, image, bubbles)
            QueueWorker._write_image(paths["cleaned_image"], cleaned)

            QueueWorker._set(job_id, "PROCESSING", 94, "TYPESETTING", "Placing translated dialogue…")
            final = await asyncio.to_thread(
                Typesetter.render_typesetting, cleaned, bubbles, font_style, target_lang
            )
            QueueWorker._write_image(paths["final_image"], final)
            QueueWorker._write_bubbles(paths["data_json"], bubbles)
            JOB_STORE[job_id].update({
                "status": "COMPLETED", "progress": 100, "current_step": "COMPLETED",
                "step_description": "Translation is ready to review and download.", "bubbles": bubbles,
                "error": None, "updated_at": time.time(),
            })
        except Exception as exc:  # The API returns the safe, actionable message to the UI.
            QueueWorker._fail(job_id, str(exc))

    @staticmethod
    def retypeset_job(
        job_id: str,
        bubbles: List[Dict[str, Any]],
        font_style: str = "default",
        target_lang: str = "th",
    ) -> str:
        paths = UploadManager.get_job_paths(job_id)
        if not os.path.exists(paths["cleaned_image"]):
            raise FileNotFoundError("The cleaned page is not available. Process the page before editing it.")
        cleaned = ImageProcessor.load_image(paths["cleaned_image"])
        final = Typesetter.render_typesetting(cleaned, bubbles, font_style, target_lang)
        QueueWorker._write_image(paths["final_image"], final)
        QueueWorker._write_bubbles(paths["data_json"], bubbles)
        if job_id in JOB_STORE:
            JOB_STORE[job_id].update({"bubbles": bubbles, "updated_at": time.time()})
        return paths["final_image"]

    @staticmethod
    def _set(job_id: str, status: str, progress: int, step: str, description: str) -> None:
        current = JOB_STORE.setdefault(job_id, {"job_id": job_id, "bubbles": [], "error": None})
        current.update({"status": status, "progress": progress, "current_step": step, "step_description": description, "updated_at": time.time()})

    @staticmethod
    def _fail(job_id: str, error: str) -> None:
        QueueWorker._set(job_id, "FAILED", 0, "FAILED", error)
        JOB_STORE[job_id]["error"] = error

    @staticmethod
    def _write_image(path: str, image: Any) -> None:
        if not cv2.imwrite(path, image):
            raise OSError("Unable to save the processed image.")

    @staticmethod
    def _write_bubbles(path: str, bubbles: List[Dict[str, Any]]) -> None:
        with open(path, "w", encoding="utf-8") as output:
            json.dump(bubbles, output, ensure_ascii=False, indent=2)
