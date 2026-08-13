import cv2
import numpy as np
from PIL import Image
from typing import Tuple

class ImageProcessor:
    @staticmethod
    def load_image(image_path: str) -> np.ndarray:
        img = cv2.imread(image_path)
        if img is None:
            # Fallback PIL load
            pil_img = Image.open(image_path).convert("RGB")
            img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        return img

    @staticmethod
    def preprocess_for_detection(img_bgr: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Returns (gray, threshold_binary) for speech bubble contour detection."""
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        
        # Contrast adjustment (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        enhanced = clahe.apply(gray)
        
        # Bilateral filter to reduce noise while keeping bubble edges sharp
        filtered = cv2.bilateralFilter(enhanced, 9, 75, 75)
        
        # Adaptive thresholding
        binary = cv2.adaptiveThreshold(
            filtered, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 15, 4
        )
        return gray, binary
