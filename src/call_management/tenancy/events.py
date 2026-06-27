"""Fire-and-forget platform events from sync or async contexts."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from call_management.tenancy.webhooks import emit_event

logger = logging.getLogger("call-management.events")


def schedule_event(tenant_id: str | None, event: str, payload: dict[str, Any]) -> None:
    if not tenant_id:
        return
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(emit_event(tenant_id, event, payload))
    except RuntimeError:
        logger.debug("No event loop — skipping webhook %s", event)


async def emit_handoff(
    tenant_id: str | None,
    *,
    call_id: str,
    from_agent: str,
    to_agent: str,
    reason: str,
    channel: str = "sip",
) -> None:
    if not tenant_id:
        return
    await emit_event(
        tenant_id,
        "agent.handoff",
        {
            "call_id": call_id,
            "from_agent": from_agent,
            "to_agent": to_agent,
            "reason": reason,
            "channel": channel,
        },
    )