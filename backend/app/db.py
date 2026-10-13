"""SQLite persistence for OCR test runs."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "runs.sqlite"


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                source_name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                model TEXT NOT NULL,
                pages_processed INTEGER NOT NULL,
                doc_size_bytes INTEGER,
                prompt_tokens_estimated INTEGER NOT NULL,
                output_tokens_estimated INTEGER NOT NULL,
                cost_usd REAL NOT NULL,
                duration_ms INTEGER NOT NULL,
                pages_json TEXT NOT NULL,
                markdown_full TEXT NOT NULL,
                error TEXT
            )
            """
        )
        conn.commit()


def insert_run(payload: dict[str, Any]) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO runs (
                created_at, source_name, source_type, model,
                pages_processed, doc_size_bytes,
                prompt_tokens_estimated, output_tokens_estimated,
                cost_usd, duration_ms, pages_json, markdown_full, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["created_at"],
                payload["source_name"],
                payload["source_type"],
                payload["model"],
                payload["pages_processed"],
                payload.get("doc_size_bytes"),
                payload["prompt_tokens_estimated"],
                payload["output_tokens_estimated"],
                payload["cost_usd"],
                payload["duration_ms"],
                json.dumps(payload["pages"], ensure_ascii=False),
                payload["markdown_full"],
                payload.get("error"),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)


def list_runs() -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, source_name, source_type, model,
                   pages_processed, doc_size_bytes,
                   prompt_tokens_estimated, output_tokens_estimated,
                   cost_usd, duration_ms
            FROM runs
            ORDER BY id DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_run(run_id: int) -> dict[str, Any] | None:
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM runs WHERE id = ?", (run_id,)
        ).fetchone()
    if row is None:
        return None
    data = dict(row)
    data["pages"] = json.loads(data.pop("pages_json"))
    return data


def totals() -> dict[str, Any]:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS run_count,
                COALESCE(SUM(pages_processed), 0) AS pages_total,
                COALESCE(SUM(cost_usd), 0) AS cost_total_usd,
                COALESCE(SUM(output_tokens_estimated), 0) AS output_tokens_total
            FROM runs
            """
        ).fetchone()
    return dict(row)
