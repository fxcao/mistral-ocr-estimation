"""Local (non-billed) token estimates for OCR markdown output."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=1)
def _get_tekkenizer():
    """Load a Tekkenizer for raw text encoding (no sentencepiece dependency)."""
    try:
        from mistral_common.tokens.tokenizers.mistral import MistralTokenizer
        from mistral_common.tokens.tokenizers.tekken import Tekkenizer

        data_dir = Path(MistralTokenizer._data_path())
        # Prefer newer bundled tekken vocab when available.
        for name in ("tekken_240911.json", "tekken_240718.json"):
            candidate = data_dir / name
            if candidate.is_file():
                return Tekkenizer.from_file(str(candidate))
    except Exception:
        return None
    return None


def estimate_text_tokens(text: str) -> int:
    """Estimate token count for a markdown string (local, not billed)."""
    if not text:
        return 0

    tokenizer = _get_tekkenizer()
    if tokenizer is not None:
        try:
            ids = tokenizer.encode(text, bos=False, eos=False)
            return len(ids)
        except Exception:
            pass

    # Rough fallback ~4 chars per token
    return max(1, len(text) // 4) if text.strip() else 0


def estimate_pages_tokens(markdowns: list[str]) -> tuple[list[int], int]:
    """Return per-page token estimates and the document total."""
    per_page = [estimate_text_tokens(md) for md in markdowns]
    return per_page, sum(per_page)
