"""Mistral OCR client helpers."""

from __future__ import annotations

import base64
import mimetypes
import os
import time
from datetime import datetime, timezone
from typing import Any

from mistralai.client import Mistral

from .pricing import estimate_cost_usd
from .tokens import estimate_pages_tokens

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_BYTES = 50 * 1024 * 1024  # 50 MiB


def get_api_key() -> str:
    key = os.getenv("MISTRAL_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "Clé API manquante. Définis MISTRAL_API_KEY dans backend/.env."
        )
    return key


def get_model() -> str:
    return os.getenv("OCR_MODEL", "mistral-ocr-latest").strip() or "mistral-ocr-latest"


def _mime_for(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    if mime:
        return mime
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


def validate_filename(filename: str) -> str:
    name = os.path.basename(filename or "document")
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Format non supporté ({ext or 'inconnu'}). "
            "Formats acceptés : PDF, PNG, JPEG, WEBP."
        )
    return name


def _build_result(
    *,
    source_name: str,
    source_type: str,
    ocr_response: Any,
    duration_ms: int,
) -> dict[str, Any]:
    usage = getattr(ocr_response, "usage_info", None)
    pages_processed = int(getattr(usage, "pages_processed", 0) or 0)
    doc_size_bytes = getattr(usage, "doc_size_bytes", None)
    if doc_size_bytes is not None:
        doc_size_bytes = int(doc_size_bytes)

    raw_pages = list(getattr(ocr_response, "pages", []) or [])
    markdowns = [getattr(p, "markdown", "") or "" for p in raw_pages]
    per_page_tokens, output_tokens = estimate_pages_tokens(markdowns)

    pages_out: list[dict[str, Any]] = []
    for idx, page in enumerate(raw_pages):
        index = getattr(page, "index", idx)
        md = markdowns[idx]
        pages_out.append(
            {
                "index": index,
                "markdown": md,
                "output_tokens_estimated": per_page_tokens[idx],
            }
        )

    model = getattr(ocr_response, "model", None) or get_model()
    markdown_full = "\n\n---\n\n".join(markdowns)

    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_name": source_name,
        "source_type": source_type,
        "model": model,
        "pages_processed": pages_processed or len(pages_out),
        "doc_size_bytes": doc_size_bytes,
        "prompt_tokens_estimated": 0,
        "output_tokens_estimated": output_tokens,
        "cost_usd": estimate_cost_usd(pages_processed or len(pages_out)),
        "duration_ms": duration_ms,
        "pages": pages_out,
        "markdown_full": markdown_full,
        "error": None,
    }


def _friendly_mistral_error(exc: Exception) -> str:
    msg = str(exc)
    lower = msg.lower()
    if "401" in msg or "unauthorized" in lower or "invalid api" in lower:
        return "Clé API Mistral invalide ou refusée (401)."
    if "403" in msg or "forbidden" in lower:
        return "Accès refusé par Mistral (403). Vérifie les droits du workspace."
    if "429" in msg or "rate" in lower:
        return "Limite de débit Mistral atteinte (429). Réessaie plus tard."
    if "413" in msg or "too large" in lower:
        return "Fichier trop volumineux pour l'API Mistral."
    return f"Erreur Mistral OCR : {msg}"


def run_ocr_from_url(url: str, source_name: str | None = None) -> dict[str, Any]:
    api_key = get_api_key()
    model = get_model()
    name = source_name or url.rsplit("/", 1)[-1] or url
    client = Mistral(api_key=api_key)

    document: dict[str, Any]
    lower = url.lower()
    if any(lower.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp")):
        document = {"type": "image_url", "image_url": url}
    else:
        document = {"type": "document_url", "document_url": url}

    started = time.perf_counter()
    try:
        response = client.ocr.process(
            model=model,
            document=document,
            include_image_base64=False,
        )
    except Exception as exc:
        raise RuntimeError(_friendly_mistral_error(exc)) from exc
    duration_ms = int((time.perf_counter() - started) * 1000)

    return _build_result(
        source_name=name,
        source_type="url",
        ocr_response=response,
        duration_ms=duration_ms,
    )


def run_ocr_from_bytes(filename: str, content: bytes) -> dict[str, Any]:
    if len(content) > MAX_BYTES:
        raise ValueError("Fichier trop volumineux (max 50 Mo).")

    name = validate_filename(filename)
    api_key = get_api_key()
    model = get_model()
    client = Mistral(api_key=api_key)
    ext = os.path.splitext(name)[1].lower()
    mime = _mime_for(name)

    uploaded_id: str | None = None
    started = time.perf_counter()
    try:
        if ext == ".pdf":
            uploaded = client.files.upload(
                file={"file_name": name, "content": content},
                purpose="ocr",
            )
            uploaded_id = uploaded.id
            signed = client.files.get_signed_url(file_id=uploaded.id, expiry=1)
            document = {
                "type": "document_url",
                "document_url": signed.url,
            }
        else:
            b64 = base64.b64encode(content).decode("ascii")
            document = {
                "type": "image_url",
                "image_url": f"data:{mime};base64,{b64}",
            }

        response = client.ocr.process(
            model=model,
            document=document,
            include_image_base64=False,
        )
    except ValueError:
        raise
    except Exception as exc:
        raise RuntimeError(_friendly_mistral_error(exc)) from exc
    finally:
        if uploaded_id is not None:
            try:
                client.files.delete(file_id=uploaded_id)
            except Exception:
                pass

    duration_ms = int((time.perf_counter() - started) * 1000)
    result = _build_result(
        source_name=name,
        source_type="upload",
        ocr_response=response,
        duration_ms=duration_ms,
    )
    if result.get("doc_size_bytes") is None:
        result["doc_size_bytes"] = len(content)
    return result
