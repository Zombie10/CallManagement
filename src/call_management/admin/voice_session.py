"""Admin API helpers for browser-native xAI Voice Agent sessions."""

from __future__ import annotations

import uuid
from typing import Any

from call_management.agents.catalog import is_valid_template, normalize_template
from call_management.agents.runtime import build_runtime_agent, runtime_to_voice_payload
from call_management.utils.time import utc_now_iso
from call_management.xai.voice import create_ephemeral_voice_token


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

    agent_name = normalize_template(agent_name)
    if not is_valid_template(agent_name):
        raise ValueError(f"Invalid agent '{agent_name}'")

    token_data = await create_ephemeral_voice_token()
    runtime = build_runtime_agent(instance=instance, template_id=agent_name, for_voice=True)
    session = runtime_to_voice_payload(runtime)

    return {
        "call_id": f"voice_{uuid.uuid4().hex[:12]}",
        "start_time": utc_now_iso(),
        "client_secret": {
            "value": token_data["value"],
            "expires_at": token_data.get("expires_at"),
        },
        **session,
        "tenant_id": tenant_id,
        "agent_instance_id": agent_instance_id or runtime.instance_id,
        "ws_url": "wss://api.x.ai/v1/realtime",
    }
