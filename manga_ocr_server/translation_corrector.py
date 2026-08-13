import re

class TranslationCorrector:
    @staticmethod
    def post_process_thai(text: str) -> str:
        if not text:
            return ""
        
        # Clean double spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Normalize Thai punctuation
        text = text.replace(' !', '!').replace(' ?', '?').replace('...', '...')
        
        # Clean trailing quote artifacts
        text = text.strip('"\'')
        
        return text

    @staticmethod
    def post_process_english(text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'\s+', ' ', text).strip()
        return text.strip('"\'')
