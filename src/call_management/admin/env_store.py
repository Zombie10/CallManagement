"""Read and write project .env configuration for the admin panel."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = Path(os.getenv("ENV_FILE", PROJECT_ROOT / ".env"))

SECRET_MARKERS = ("KEY", "SECRET", "TOKEN", "PASSWORD", "WEBHOOK")

SETTING_SECTIONS: dict[str, list[dict[str, Any]]] = {
    "livekit": [
        {"key": "LIVEKIT_URL", "label": "LiveKit URL", "type": "text"},
        {"key": "LIVEKIT_API_KEY", "label": "API Key", "type": "secret"},
        {"key": "LIVEKIT_API_SECRET", "label": "API Secret", "type": "secret"},
    ],
    "xai_models": [
        {
            "key": "MODEL_PROVIDER",
            "label": "Provider",
            "type": "select",
            "options": ["xai", "inference", "direct"],
        },
        {"key": "USE_GROK_REALTIME", "label": "Grok Realtime", "type": "boolean"},
        {"key": "GROK_REALTIME_MODEL", "label": "Realtime Model", "type": "text"},
        {"key": "GROK_REALTIME_VOICE", "label": "Realtime Voice", "type": "text"},
        {"key": "XAI_STT_MODEL", "label": "STT Model", "type": "text"},
        {"key": "XAI_LLM_MODEL", "label": "LLM Model", "type": "text"},
        {"key": "XAI_TTS_MODEL", "label": "TTS Model", "type": "text"},
        {"key": "XAI_TTS_VOICE", "label": "TTS Voice", "type": "text"},
        {"key": "XAI_API_KEY", "label": "xAI API Key", "type": "secret"},
    ],
    "xai_tools": [
        {"key": "XAI_ENABLE_WEB_SEARCH", "label": "Web Search", "type": "boolean"},
        {"key": "XAI_ENABLE_X_SEARCH", "label": "X Search", "type": "boolean"},
        {"key": "XAI_ENABLE_FILE_SEARCH", "label": "File Search", "type": "boolean"},
        {"key": "XAI_ENABLE_CODE_INTERPRETER", "label": "Code Interpreter", "type": "boolean"},
        {"key": "XAI_VECTOR_STORE_IDS", "label": "Vector Store IDs", "type": "text"},
        {"key": "XAI_ALLOWED_X_HANDLES", "label": "Allowed X Handles", "type": "text"},
        {"key": "XAI_MAX_FILE_SEARCH_RESULTS", "label": "Max File Results", "type": "number"},
    ],
    "xai_mcp": [
        {"key": "XAI_ENABLE_REMOTE_MCP", "label": "Remote MCP", "type": "boolean"},
        {"key": "XAI_MCP_SERVERS", "label": "MCP Servers (JSON)", "type": "json"},
    ],
    "inference": [
        {"key": "STT_MODEL", "label": "STT Model", "type": "text"},
        {"key": "LLM_MODEL", "label": "LLM Model", "type": "text"},
        {"key": "TTS_MODEL", "label": "TTS Model", "type": "text"},
        {"key": "TTS_VOICE", "label": "TTS Voice", "type": "text"},
        {"key": "STT_LANGUAGE", "label": "STT Language", "type": "text"},
    ],
    "telephony": [
        {"key": "SIP_TRUNK_ID", "label": "SIP Trunk ID", "type": "text"},
        {"key": "WARM_TRANSFER_WAIT_SECONDS", "label": "Warm Transfer Wait (s)", "type": "number"},
    ],
    "application": [
        {
            "key": "LOG_LEVEL",
            "label": "Log Level",
            "type": "select",
            "options": ["DEBUG", "INFO", "WARNING", "ERROR"],
        },
        {"key": "CRM_DB_PATH", "label": "CRM DB Path", "type": "text"},
        {
            "key": "DEFAULT_LOCALE",
            "label": "Default Locale",
            "type": "select",
            "options": ["en", "es", "multi"],
        },
        {"key": "VIP_SKIP_RECEPTIONIST", "label": "VIP Skip Receptionist", "type": "boolean"},
        {"key": "ENABLE_POST_CALL_SUMMARY", "label": "Post-call Summary", "type": "boolean"},
        {"key": "SUMMARY_LLM_MODEL", "label": "Summary LLM Model", "type": "text"},
        {"key": "MAX_TOOL_STEPS", "label": "Max Tool Steps", "type": "number"},
        {"key": "PREEMPTIVE_GENERATION", "label": "Preemptive Generation", "type": "boolean"},
    ],
    "notifications": [
        {"key": "ESCALATION_WEBHOOK_URL", "label": "Escalation Webhook", "type": "secret"},
        {"key": "SLACK_WEBHOOK_URL", "label": "Slack Webhook", "type": "secret"},
    ],
}


def _is_secret_key(key: str) -> bool:
    upper = key.upper()
    return any(marker in upper for marker in SECRET_MARKERS)


def _mask_value(value: str | None) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••••••"
    return f"{value[:4]}••••{value[-4:]}"


def _normalize_bool(value: str) -> str:
    return "true" if value.lower() in ("true", "1", "yes", "on") else "false"


def load_settings() -> dict[str, Any]:
    values = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    sections: dict[str, list[dict[str, Any]]] = {}

    for section_id, fields in SETTING_SECTIONS.items():
        section_fields = []
        for field in fields:
            key = field["key"]
            raw = values.get(key, "")
            value = "" if raw is None else str(raw)
            is_secret = field["type"] == "secret" or _is_secret_key(key)
            section_fields.append(
                {
                    "key": key,
                    "label": field["label"],
                    "type": field["type"],
                    "options": field.get("options"),
                    "value": _mask_value(value) if is_secret and value else value,
                    "is_secret": is_secret,
                    "has_value": bool(value),
                }
            )
        sections[section_id] = section_fields

    return {"env_path": str(ENV_PATH), "sections": sections}


def save_settings(updates: dict[str, str]) -> dict[str, str]:
    existing_lines: list[str] = []
    if ENV_PATH.exists():
        existing_lines = ENV_PATH.read_text(encoding="utf-8").splitlines()

    current = dotenv_values(ENV_PATH) if ENV_PATH.exists() else {}
    merged = {k: ("" if v is None else str(v)) for k, v in current.items()}

    for key, value in updates.items():
        if value in ("", None):
            continue
        if "••••" in str(value):
            continue
        field_meta = next(
            (f for fields in SETTING_SECTIONS.values() for f in fields if f["key"] == key),
            None,
        )
        if field_meta and field_meta["type"] == "boolean":
            merged[key] = _normalize_bool(str(value))
        else:
            merged[key] = str(value).strip()

    known_keys = {f["key"] for fields in SETTING_SECTIONS.values() for f in fields}
    extra = {k: v for k, v in merged.items() if k not in known_keys and v}

    lines: list[str] = []
    written: set[str] = set()

    for line in existing_lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            lines.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in merged:
            lines.append(f"{key}={merged[key]}")
            written.add(key)
        else:
            lines.append(line)

    for key in sorted(set(merged) | set(extra)):
        if key in written:
            continue
        val = merged.get(key) or extra.get(key, "")
        if val:
            lines.append(f"{key}={val}")

    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"status": "saved", "path": str(ENV_PATH)}