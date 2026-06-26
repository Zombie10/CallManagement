"""xAI Voice Agent API helpers (model, voices, session tools)."""

from __future__ import annotations

import os
from typing import Any

from call_management.config import (
    get_language_instruction_for_agent,
    get_model_config,
    normalize_xai_voice,
)
from call_management.xai.mcp import load_remote_mcp_config
from call_management.xai.tools import get_xai_tools_config

XAI_REALTIME_WS = "wss://api.x.ai/v1/realtime"
XAI_CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets"
DEFAULT_REALTIME_MODEL = "grok-voice-latest"

_LOCALE_LANGUAGE_HINTS = {
    "en": "en",
    "es": "es-MX",
    "multi": None,
}


def language_hint_for_locale(locale: str | None) -> str | None:
    if not locale:
        return None
    return _LOCALE_LANGUAGE_HINTS.get(locale)


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
    from call_management.agent_store import get_profile

    cfg = get_model_config()
    profile = get_profile(agent_name)
    voice = normalize_xai_voice(profile.voice if profile else cfg.grok_realtime_voice)
    model = cfg.grok_realtime_model or DEFAULT_REALTIME_MODEL
    language_hint = language_hint_for_agent(agent_name)

    return {
        "model": model,
        "voice": voice,
        "agent": agent_name,
        "instructions": get_agent_instructions(agent_name),
        "language_hint": language_hint,
        "tools": build_voice_tools(agent_name),
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.85,
            "silence_duration_ms": 700,
            "prefix_padding_ms": 333,
        },
        "reasoning_effort": "high" if model in {DEFAULT_REALTIME_MODEL, "grok-voice-think-fast-1.0"} else None,
    }