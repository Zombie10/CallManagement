"""Local recording file storage and URL helpers."""

from __future__ import annotations

import os
import re
from pathlib import Path

from call_management.admin.env_store import PROJECT_ROOT

SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]+$")

RECORDINGS_ROOT = Path(
    os.getenv("RECORDINGS_DIR", str(PROJECT_ROOT / "data" / "recordings")),
)


def _safe_segment(value: str) -> str:
    cleaned = (value or "default").strip()
    if not SAFE_ID.match(cleaned):
        raise ValueError(f"Invalid id: {value!r}")
    return cleaned


def recording_dir(tenant_id: str | None) -> Path:
    tid = _safe_segment(tenant_id or "global")
    path = RECORDINGS_ROOT / tid
    path.mkdir(parents=True, exist_ok=True)
    return path


def recording_path(tenant_id: str | None, call_id: str, *, ext: str = "webm") -> Path:
    cid = _safe_segment(call_id)
    return recording_dir(tenant_id) / f"{cid}.{ext.lstrip('.')}"


def recording_api_url(call_id: str) -> str:
    return f"/api/calls/{call_id}/recording"


def find_recording_file(tenant_id: str | None, call_id: str) -> Path | None:
    base = recording_dir(tenant_id)
    cid = _safe_segment(call_id)
    for ext in ("webm", "ogg", "mp4", "m4a", "wav"):
        candidate = base / f"{cid}.{ext}"
        if candidate.is_file() and candidate.stat().st_size > 0:
            return candidate
    return None


def save_recording_bytes(
    tenant_id: str | None,
    call_id: str,
    data: bytes,
    *,
    ext: str = "webm",
) -> Path:
    if not data:
        raise ValueError("Recording vacío")
    path = recording_path(tenant_id, call_id, ext=ext)
    path.write_bytes(data)
    return path


def guess_media_type(path: Path) -> str:
    ext = path.suffix.lower()
    return {
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".mp4": "audio/mp4",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
    }.get(ext, "application/octet-stream")