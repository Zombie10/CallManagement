"""Admin API helpers for browser-native xAI Voice Agent sessions."""

from __future__ import annotations

from typing import Any

from call_management.xai.voice import build_voice_session_payload, create_ephemeral_voice_token

VALID_VOICE_AGENTS = {"receptionist", "support", "sales", "technical", "escalation", "banking_support"}


async def create_browser_voice_session(
    *,
    agent_name: str = "receptionist",
    agent_instance_id: str | None = None,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    from call_management.tenancy.platform_store import get_platform_store

    instance = None
    if agent_instance_id:
        instance = get_platform_store().get_agent(agent_instance_id)
        if instance:
            agent_name = instance.template_id
            tenant_id = instance.tenant_id

    if agent_name not in VALID_VOICE_AGENTS:
        raise ValueError(f"Invalid agent '{agent_name}'")

    token_data = await create_ephemeral_voice_token()
    session = build_voice_session_payload(agent_name)
    if instance:
        session["voice"] = instance.voice
        if instance.custom_instructions.strip():
            session["instructions"] = instance.custom_instructions

    return {
        "client_secret": {
            "value": token_data["value"],
            "expires_at": token_data.get("expires_at"),
        },
        **session,
        "tenant_id": tenant_id,
        "agent_instance_id": agent_instance_id,
        "ws_url": "wss://api.x.ai/v1/realtime",
    }