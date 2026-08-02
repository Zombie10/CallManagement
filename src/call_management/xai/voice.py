"""xAI Voice Agent API helpers (model, voices, session tools).

Aligned with Speech-to-Speech docs:
https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
"""

from __future__ import annotations

import json
import os
from typing import Any

from call_management.config import (
    get_model_config,
    normalize_xai_voice,
)
from call_management.xai.mcp import load_remote_mcp_config
from call_management.xai.tools import get_xai_tools_config

XAI_REALTIME_WS = "wss://api.x.ai/v1/realtime"
XAI_CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets"
# Flagship speech-to-speech model (docs.x.ai Speech to Speech).
# grok-voice-latest moves from think-fast-1.0 → think-fast-2.0 on 2026-08-05.
DEFAULT_REALTIME_MODEL = "grok-voice-think-fast-2.0"
THINK_FAST_MODELS = frozenset(
    {
        "grok-voice-latest",
        "grok-voice-think-fast-1.0",
        "grok-voice-think-fast-2.0",
    }
)

# Locale → BCP-47 language_hint. Spanish/Portuguese must be regional variants.
_LOCALE_LANGUAGE_HINTS = {
    "en": "en",
    "es": "es-MX",
    "es-mx": "es-MX",
    "es-es": "es-ES",
    "pt": "pt-BR",
    "pt-br": "pt-BR",
    "pt-pt": "pt-PT",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "ja": "ja",
    "ko": "ko",
    "zh": "zh",
    "hi": "hi",
    "multi": None,
}


def language_hint_for_locale(locale: str | None) -> str | None:
    if not locale:
        return None
    code = locale.strip()
    if not code or code.lower() == "multi":
        return None
    mapped = _LOCALE_LANGUAGE_HINTS.get(code.lower())
    if mapped is not None or code.lower() in _LOCALE_LANGUAGE_HINTS:
        return mapped
    # Already a BCP-47 tag from voice_language options (e.g. es-MX, ar-SA).
    return code


def language_hint_for_agent(agent_name: str) -> str | None:
    from call_management.agent_store import get_voice_language_for_agent

    return get_voice_language_for_agent(agent_name)


def build_voice_tools(agent_name: str) -> list[dict[str, Any]]:
    """Build xAI Voice Agent API tool definitions for an agent profile."""
    from call_management.agent_store import get_mcp_profile, get_tool_profile

    cfg = get_xai_tools_config()
    tools: list[dict[str, Any]] = []

    for tool_name in get_tool_profile(agent_name):
        if tool_name == "web_search" and cfg.enable_web_search:
            tools.append({"type": "web_search"})
        elif tool_name == "x_search" and cfg.enable_x_search:
            entry: dict[str, Any] = {"type": "x_search"}
            if cfg.allowed_x_handles:
                entry["allowed_x_handles"] = cfg.allowed_x_handles
            tools.append(entry)
        elif tool_name == "file_search" and cfg.enable_file_search and cfg.vector_store_ids:
            tools.append(
                {
                    "type": "file_search",
                    "vector_store_ids": cfg.vector_store_ids,
                    "max_num_results": cfg.max_file_search_results or 10,
                }
            )
        elif tool_name == "code_interpreter" and cfg.enable_code_interpreter:
            tools.append({"type": "code_interpreter"})

    mcp_cfg = load_remote_mcp_config()
    if mcp_cfg.enabled:
        by_id = {server.id: server for server in mcp_cfg.servers}
        for server_id in get_mcp_profile(agent_name):
            server = by_id.get(server_id)
            if not server:
                continue
            entry = {
                "type": "mcp",
                "server_url": server.server_url,
                "server_label": server.server_label,
            }
            if server.server_description:
                entry["server_description"] = server.server_description
            if server.allowed_tools:
                entry["allowed_tools"] = server.allowed_tools
            tools.append(entry)

    from call_management.agent_store import get_function_tool_profile
    from call_management.agents.registry import build_voice_function_tools

    tools.extend(build_voice_function_tools(agent_name, get_function_tool_profile(agent_name)))
    return tools


def get_agent_instructions(agent_name: str) -> str:
    from call_management.agent_store import get_effective_instructions

    return get_effective_instructions(agent_name, for_voice=True)


def parse_voice_keyterms() -> list[str]:
    """Domain terms to bias ASR (max 100, each ≤50 chars). Comma-separated env."""
    raw = os.getenv("GROK_VOICE_KEYTERMS", "").strip()
    if not raw:
        return []
    terms: list[str] = []
    for part in raw.split(","):
        term = part.strip()[:50]
        if term and term not in terms:
            terms.append(term)
        if len(terms) >= 100:
            break
    return terms


def parse_voice_replace() -> dict[str, str]:
    """Pronunciation map applied before TTS (spoken audio only). JSON object env."""
    raw = os.getenv("GROK_VOICE_REPLACE", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if str(k).strip() and str(v).strip()}


def _env_int(name: str, default: int | None) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default


async def create_ephemeral_voice_token(*, expires_seconds: int = 300) -> dict[str, Any]:
    import aiohttp

    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        raise ValueError("XAI_API_KEY is required for voice sessions")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            XAI_CLIENT_SECRETS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"expires_after": {"seconds": expires_seconds}},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as response:
            if response.status != 200:
                body = await response.text()
                raise ValueError(f"xAI client_secrets failed ({response.status}): {body[:300]}")
            data = await response.json()
            if "value" not in data:
                raise ValueError("Invalid ephemeral token response from xAI")
            return data


def build_voice_session_payload(agent_name: str = "receptionist") -> dict[str, Any]:
    """Browser/API session config for Grok Speech-to-Speech (Think Fast 2.0)."""
    from call_management.agent_store import get_profile

    cfg = get_model_config()
    profile = get_profile(agent_name)
    voice = normalize_xai_voice(profile.voice if profile else cfg.grok_realtime_voice)
    model = cfg.grok_realtime_model or DEFAULT_REALTIME_MODEL
    language_hint = language_hint_for_agent(agent_name)

    threshold = _env_float("GROK_VOICE_VAD_THRESHOLD", 0.85)
    threshold = max(0.1, min(0.9, threshold))
    silence_ms = _env_int("GROK_VOICE_SILENCE_MS", 700) or 700
    silence_ms = max(0, min(10_000, silence_ms))
    prefix_ms = _env_int("GROK_VOICE_PREFIX_PADDING_MS", 333) or 333
    prefix_ms = max(0, min(10_000, prefix_ms))
    # Re-engage silent callers after assistant finishes (call-center default 10s).
    idle_ms = _env_int("GROK_VOICE_IDLE_TIMEOUT_MS", 10_000)
    if idle_ms is not None and idle_ms <= 0:
        idle_ms = None

    speed = _env_float("GROK_VOICE_OUTPUT_SPEED", 1.0)
    speed = max(0.7, min(1.5, speed))

    resumption = os.getenv("GROK_VOICE_RESUMPTION", "true").lower() == "true"
    keyterms = parse_voice_keyterms()
    replace = parse_voice_replace()
    disclosure = os.getenv("GROK_VOICE_RECORDING_DISCLOSURE", "").strip()

    turn_detection: dict[str, Any] = {
        "type": "server_vad",
        "threshold": threshold,
        "silence_duration_ms": silence_ms,
        "prefix_padding_ms": prefix_ms,
    }
    if idle_ms is not None:
        turn_detection["idle_timeout_ms"] = idle_ms

    payload: dict[str, Any] = {
        "model": model,
        "voice": voice,
        "agent": agent_name,
        "instructions": get_agent_instructions(agent_name),
        "language_hint": language_hint,
        "tools": build_voice_tools(agent_name),
        "turn_detection": turn_detection,
        # session.update uses reasoning.effort (high | none); default high for Think Fast.
        "reasoning_effort": "high" if model in THINK_FAST_MODELS else None,
        "keyterms": keyterms or None,
        "replace": replace or None,
        "output_speed": speed,
        "resumption_enabled": resumption,
        "recording_disclosure": disclosure or None,
    }
    return payload
