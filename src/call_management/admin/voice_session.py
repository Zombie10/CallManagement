"""Admin API helpers for browser-native xAI Voice Agent sessions."""

from __future__ import annotations

from typing import Any

from call_management.xai.voice import build_voice_session_payload, create_ephemeral_voice_token

VALID_VOICE_AGENTS = {"receptionist", "support", "sales", "technical", "escalation"}


async def create_browser_voice_session(*, agent_name: str = "receptionist") -> dict[str, Any]:
    if agent_name not in VALID_VOICE_AGENTS:
        raise ValueError(f"Invalid agent '{agent_name}'")

    token_data = await create_ephemeral_voice_token()
    session = build_voice_session_payload(agent_name)

    return {
        "client_secret": {
            "value": token_data["value"],
            "expires_at": token_data.get("expires_at"),
        },
        **session,
        "ws_url": "wss://api.x.ai/v1/realtime",
    }