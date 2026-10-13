"""FastAPI entrypoint for the Mistral OCR test bench."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db
from .ocr import MAX_BYTES, run_ocr_from_bytes, run_ocr_from_url

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_PATH)

app = FastAPI(title="Mistral OCR Test Bench", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class UrlOcrRequest(BaseModel):
    url: str = Field(..., min_length=8)


@app.on_event("startup")
def on_startup() -> None:
    db.init_db()
    if not os.getenv("MISTRAL_API_KEY", "").strip():
        # Soft warning only — endpoints will fail with a clear French message.
        print(
            "AVERTISSEMENT: MISTRAL_API_KEY absente. "
            "Copie backend/.env.example vers backend/.env et renseigne ta clé."
        )


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "api_key_configured": bool(os.getenv("MISTRAL_API_KEY", "").strip()),
        "model": os.getenv("OCR_MODEL", "mistral-ocr-latest"),
        "usd_per_page": float(os.getenv("OCR_USD_PER_PAGE", "0.004")),
    }


@app.post("/api/ocr")
async def ocr_endpoint(
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
) -> dict:
    """Accept either a multipart file upload or a document URL (form or JSON)."""
    try:
        if file is not None and file.filename:
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail="Fichier vide.")
            if len(content) > MAX_BYTES:
                raise HTTPException(
                    status_code=400, detail="Fichier trop volumineux (max 50 Mo)."
                )
            result = run_ocr_from_bytes(file.filename, content)
        elif url and url.strip():
            result = run_ocr_from_url(url.strip())
        else:
            raise HTTPException(
                status_code=400,
                detail="Fournis un fichier (PDF/image) ou une URL publique.",
            )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Erreur interne : {exc}"
        ) from exc

    run_id = db.insert_run(result)
    return {"id": run_id, **result}


@app.post("/api/ocr/url")
def ocr_url(body: UrlOcrRequest) -> dict:
    try:
        result = run_ocr_from_url(body.url.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Erreur interne : {exc}"
        ) from exc

    run_id = db.insert_run(result)
    return {"id": run_id, **result}


@app.get("/api/runs")
def get_runs() -> dict:
    return {"runs": db.list_runs(), "totals": db.totals()}


@app.get("/api/runs/{run_id}")
def get_run(run_id: int) -> dict:
    run = db.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run introuvable.")
    return run
