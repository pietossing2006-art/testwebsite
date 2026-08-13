import re


class OcrCorrector:
    JP_NOISE = re.compile(r"[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF]")
    EN_WORD = re.compile(r"[A-Za-z']+")
    MULTISPACE = re.compile(r"\s+")

    @staticmethod
    def clean_japanese_ocr(text: str) -> str:
        compact = re.sub(r"\s+", "", text or "")
        compact = OcrCorrector.JP_NOISE.sub("", compact)
        return compact.strip()

    @staticmethod
    def clean_korean_ocr(text: str) -> str:
        return OcrCorrector.MULTISPACE.sub(" ", text or "").strip()

    @staticmethod
    def clean_chinese_ocr(text: str) -> str:
        return re.sub(r"\s+", "", text or "").strip()

    @staticmethod
    def clean_english_ocr(text: str) -> str:
        raw = OcrCorrector.MULTISPACE.sub(" ", text or "").strip()
        if not raw:
            return ""

        def normalize_word(match: re.Match[str]) -> str:
            word = match.group(0)
            upper = sum(1 for ch in word if ch.isupper())
            if upper >= max(2, len(word) - 1):
                return word.upper()
            if word.isupper() and len(word) <= 4:
                return word.upper()
            return word[0].upper() + word[1:].lower() if word else word

        return OcrCorrector.EN_WORD.sub(normalize_word, raw)

    @staticmethod
    def score_text(text: str, lang: str) -> float:
        cleaned = text.strip()
        if not cleaned:
            return 0.0
        source = lang.lower()
        if source in {"jp", "ja"}:
            jp_chars = len(re.findall(r"[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]", cleaned))
            return min(1.0, jp_chars / max(1, len(cleaned)))
        if source in {"kr", "ko"}:
            ko_chars = len(re.findall(r"[\uAC00-\uD7AF]", cleaned))
            return min(1.0, ko_chars / max(1, len(cleaned)))
        if source in {"cn", "zh"}:
            cn_chars = len(re.findall(r"[\u4E00-\u9FFF]", cleaned))
            return min(1.0, cn_chars / max(1, len(cleaned)))
        letters = len(re.findall(r"[A-Za-z]", cleaned))
        return min(1.0, letters / max(1, len(cleaned)))
