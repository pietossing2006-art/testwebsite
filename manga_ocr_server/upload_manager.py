import os
import uuid
import time
import shutil
from typing import Dict, Any, Optional

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "storage", "uploads")
RESULTS_DIR = os.path.join(os.path.dirname(__file__), "storage", "results")

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(RESULTS_DIR, exist_ok=True)

class UploadManager:
    @staticmethod
    def create_session() -> str:
        job_id = f"job_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        job_upload_dir = os.path.join(UPLOADS_DIR, job_id)
        job_result_dir = os.path.join(RESULTS_DIR, job_id)
        os.makedirs(job_upload_dir, exist_ok=True)
        os.makedirs(job_result_dir, exist_ok=True)
        return job_id

    @staticmethod
    def save_uploaded_file(job_id: str, file_name: str, content: bytes) -> Dict[str, Any]:
        ext = os.path.splitext(file_name)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
            ext = ".png"
        
        save_name = f"original{ext}"
        save_path = os.path.join(UPLOADS_DIR, job_id, save_name)
        
        with open(save_path, "wb") as f:
            f.write(content)
            
        return {
            "job_id": job_id,
            "original_filename": file_name,
            "saved_filename": save_name,
            "file_path": save_path,
            "file_size": len(content),
            "created_at": time.time()
        }

    @staticmethod
    def get_job_paths(job_id: str) -> Dict[str, str]:
        upload_dir = os.path.join(UPLOADS_DIR, job_id)
        result_dir = os.path.join(RESULTS_DIR, job_id)
        
        orig_file = None
        if os.path.exists(upload_dir):
            for f in os.listdir(upload_dir):
                if f.startswith("original"):
                    orig_file = os.path.join(upload_dir, f)
                    break

        return {
            "upload_dir": upload_dir,
            "result_dir": result_dir,
            "original_image": orig_file,
            "cleaned_image": os.path.join(result_dir, "cleaned.png"),
            "final_image": os.path.join(result_dir, "final.png"),
            "data_json": os.path.join(result_dir, "bubbles.json")
        }
