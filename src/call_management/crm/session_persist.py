"""Persist completed agent interactions (calls, chat, voice playground) to CRM."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from call_management.crm.database import CallRecord
from call_management.utils.summary import generate_call_summary
from call_management.utils.time import utc_now_iso
from call_management.utils.transcript import transcript_from_agent_session, transcript_from_lines

if TYPE_CHECKING:
    from call_management.agents.base import CallContext

logger = logging.getLogger("call-management.crm.persist")


def _calculate_duration_seconds(start_time: str, end_time: str) -> int | None:
    from datetime import UTC, datetime

    try:
        start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)
        return max(0, int((end - start).total_seconds()))
    except ValueError:
        return None


async def finalize_interaction(
    call_ctx: CallContext,
    *,
    enable_summary: bool = True,
    outcome: str | None = None,
) -> bool:
    """Write call/chat/voice record with full transcript. Returns True if saved."""
    if call_ctx.call_persisted:
        return False
    if not call_ctx.crm:
        logger.warning("No CRM on call_ctx — skipping persist for %s", call_ctx.call_id)
        return False

    end_time = utc_now_iso()
    call_ctx.outcome = outcome or call_ctx.outcome or "completed"

    transcript: str | None = None
    session = getattr(call_ctx, "agent_session", None)
    if session is not None:
        agent = getattr(session, "current_agent", None)
        agent_name = getattr(agent, "agent_name", None) if agent else None
        transcript = transcript_from_agent_session(session, agent_name=agent_name)
    if not transcript and call_ctx.transcript_lines:
        transcript = transcript_from_lines(call_ctx.transcript_lines)

    channel = getattr(call_ctx, "channel", "sip")
    if not (transcript or "").strip() and channel in ("chat", "voice_xai"):
        logger.info("Skipping persist without transcript for %s (%s)", call_ctx.call_id, channel)
        call_ctx.call_persisted = True
        return False

    duration_seconds = _calculate_duration_seconds(call_ctx.start_time, end_time)

    if enable_summary:
        call_ctx.post_call_summary = await generate_call_summary(call_ctx)
    else:
        from call_management.utils.summary import build_structured_summary

        call_ctx.post_call_summary = build_structured_summary(call_ctx)

    summary = call_ctx.post_call_summary
    if channel != "sip" and transcript:
        summary = f"[{channel}] {summary or ''}".strip()

    record = CallRecord(
        call_id=call_ctx.call_id,
        room_name=call_ctx.room_name,
        from_number=call_ctx.from_number,
        to_number=call_ctx.to_number,
        start_time=call_ctx.start_time,
        end_time=end_time,
        outcome=call_ctx.outcome,
        summary=summary,
        agent_notes="\n".join(call_ctx.call_notes) if call_ctx.call_notes else None,
        transferred_to=call_ctx.previous_agent_name,
        duration_seconds=duration_seconds,
        transcript=transcript or None,
        recording_url=call_ctx.recording_url,
        agent_instance_id=call_ctx.agent_instance_id,
        channel=channel,
    )
    await call_ctx.crm.create_call_record(record)
    call_ctx.call_persisted = True
    logger.info(
        "Interaction persisted call_id=%s channel=%s transcript_chars=%s",
        call_ctx.call_id,
        channel,
        len(transcript or ""),
    )

    if call_ctx.tenant_id:
        from call_management.tenancy.webhooks import emit_event

        await emit_event(
            call_ctx.tenant_id,
            "call.ended",
            {
                "call_id": call_ctx.call_id,
                "channel": channel,
                "from_number": call_ctx.from_number,
                "to_number": call_ctx.to_number,
                "outcome": call_ctx.outcome,
                "duration_seconds": duration_seconds,
                "summary": call_ctx.post_call_summary,
                "has_transcript": bool(transcript),
            },
        )

    return True