"""Persist browser xAI voice playground sessions with full transcript."""

from __future__ import annotations

import uuid
from typing import Any

from call_management.agents.base import CallContext
from call_management.crm.session_persist import finalize_interaction
from call_management.utils.time import utc_now_iso


async def complete_voice_xai_session(
    *,
    call_id: str,
    agent: str,
    phone_number: str,
    transcript: str,
    customer_name: str | None = None,
    tenant_id: str | None = None,
    agent_instance_id: str | None = None,
    start_time: str | None = None,
) -> dict[str, Any]:
    from call_management.tenancy.context import resolve_crm_for_tenant

    if not transcript.strip():
        raise ValueError("Transcript vacío — nada que guardar")

    if tenant_id:
        crm = await resolve_crm_for_tenant(tenant_id)
    else:
        from call_management.crm.database import get_crm

        crm = await get_crm()

    customer = await crm.get_or_create_customer(phone_number)
    if customer_name:
        customer.name = customer_name
        await crm.update_customer(customer)

    call_ctx = CallContext(
        call_id=call_id or f"voice_{uuid.uuid4().hex[:12]}",
        room_name="admin-voice-xai",
        from_number=phone_number,
        customer_name=customer.name or customer_name,
        customer_email=customer.email,
        is_vip=customer.vip,
        crm=crm,
        start_time=start_time or utc_now_iso(),
        tenant_id=tenant_id,
        agent_instance_id=agent_instance_id,
        channel="voice_xai",
    )
    for line in transcript.splitlines():
        stripped = line.strip()
        if stripped:
            call_ctx.transcript_lines.append(stripped)

    call_ctx.call_notes.append(f"Agente inicial: {agent}")
    await finalize_interaction(call_ctx, enable_summary=True)

    return {
        "saved": True,
        "call_id": call_ctx.call_id,
        "transcript_lines": len(call_ctx.transcript_lines),
    }