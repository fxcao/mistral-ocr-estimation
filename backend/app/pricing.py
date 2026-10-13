"""OCR cost calculation from public page-based pricing."""

from __future__ import annotations

import os


def usd_per_page() -> float:
    raw = os.getenv("OCR_USD_PER_PAGE", "0.004")
    try:
        return float(raw)
    except ValueError:
        return 0.004


def estimate_cost_usd(pages_processed: int) -> float:
    return round(pages_processed * usd_per_page(), 6)
