"""LiveKit room + agent dispatch for admin voice playground (production pipeline)."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from livekit import api

from call_management.dev_check import check_livekit_env

VALID_PLAYGROUND_AGENTS = frozenset(
    {"receptionist", "support", "sales", "technical", "escalation", "banking_support"}
)
AGENT_DISPATCH_NAME = "call-management"


def livekit_playground_ready() -> tuple[bool, list[str]]:
    issues = check_livekit_env()
    if not os.getenv("XAI_API_KEY", "").strip():
        issues.append("XAI_API_KEY is required for voice agents")
    return (len(issues) == 0, issues)


async def create_livekit_playground_session(
    *,
    initial_agent: str = "receptionist",
    phone_number: str = "+15551234567",
    customer_name: str | None = None,
    tenant_id: str | None = None,
    agent_instance_id: str | None = None,
    vip: bool = False,
) -> dict[str, Any]:
    """Create a LiveKit room, dispatch the production agent, return a user join token."""
    if initial_agent not in VALID_PLAYGROUND_AGENTS:
        raise ValueError(f"Invalid agent '{initial_agent}'")

    ready, issues = livekit_playground_ready()
    if not ready:
        raise ValueError(
            "LiveKit playground not configured. "
            + "; ".join(issues)
            + ". Run `uv run -m call_management.server dev` in another terminal."
        )

    url = os.environ["LIVEKIT_URL"]
    api_key = os.environ["LIVEKIT_API_KEY"]
    api_secret = os.environ["LIVEKIT_API_SECRET"]

    room_name = f"admin-voice-{uuid.uuid4().hex[:12]}"
    call_id = f"call_{uuid.uuid4().hex[:12]}"
    metadata = json.dumps(
        {
            "department": initial_agent,
            "phone_number": phone_number,
            "customer_name": customer_name,
            "vip": vip,
            "tenant_id": tenant_id,
            "agent_instance_id": agent_instance_id,
            "call_id": call_id,
        }
    )

    async with api.LiveKitAPI(url, api_key, api_secret) as lkapi:
        await lkapi.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                empty_timeout=300,
                departure_timeout=30,
            )
        )
        dispatch = await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name=AGENT_DISPATCH_NAME,
                room=room_name,
                metadata=metadata,
            )
        )

    identity = f"admin-{uuid.uuid4().hex[:8]}"
    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(identity)
        .with_name(customer_name or "Admin User")
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            )
        )
        .to_jwt()
    )

    from call_management.config import get_model_config

    cfg = get_model_config()

    return {
        "call_id": call_id,
        "room_name": room_name,
        "token": token,
        "url": url,
        "identity": identity,
        "initial_agent": initial_agent,
        "dispatch_id": dispatch.id,
        "agent_name": AGENT_DISPATCH_NAME,
        "provider": cfg.provider,
        "model": cfg.grok_realtime_model if cfg.use_grok_realtime else cfg.xai_llm_model,
        "pipeline": "grok_realtime" if cfg.use_grok_realtime else "classic",
    }