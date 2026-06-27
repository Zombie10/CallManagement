"""Persist completed agent interactions (calls, chat, voice playground) to CRM."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from call_management.crm.database import CallRecord
from call_management.utils.summary import generate_call_summary
from call_management.utils.time import utc_now_iso
from call_management.utils.transcript import transcript_from_agent_session, transcript_from_lines

if TYPE_CHECKING:
    from call_management.agents.base import CallContext

logger = logging.getLogger("call-management.crm.persist")

_EGRESS_WAIT_SEC = 8.0


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


async def _resolve_recording_url(call_ctx: CallContext) -> str | None:
    """Try to resolve egress recording quickly; never block call persist for long."""
    if call_ctx.recording_url:
        return call_ctx.recording_url

    if call_ctx.egress_id:
        from call_management.recordings.livekit_egress import (
            mirror_egress_recording_locally,
            resolve_egress_recording_url,
        )

        try:
            egress_url = await asyncio.wait_for(
                resolve_egress_recording_url(call_ctx.egress_id, timeout_sec=_EGRESS_WAIT_SEC),
                timeout=_EGRESS_WAIT_SEC + 2,
            )
        except (asyncio.TimeoutError, Exception):
            logger.warning(
                "Egress not ready in time for %s (egress_id=%s) — saving call without recording",
                call_ctx.call_id,
                call_ctx.egress_id,
            )
            egress_url = None
        if egress_url:
            local_url = await mirror_egress_recording_locally(
                egress_url,
                tenant_id=call_ctx.tenant_id,
                call_id=call_ctx.call_id,
            )
            return local_url or egress_url

    if call_ctx.tenant_id:
        from call_management.recordings.store import find_recording_file, recording_api_url

        if find_recording_file(call_ctx.tenant_id, call_ctx.call_id):
            return recording_api_url(call_ctx.call_id)
    return None


async def _background_attach_recording(call_ctx: CallContext) -> None:
    """Late-bind recording URL after egress finishes (SIP calls)."""
    if not call_ctx.egress_id or not call_ctx.crm:
        return
    if call_ctx.recording_url:
        return
    from call_management.recordings.livekit_egress import (
        mirror_egress_recording_locally,
        resolve_egress_recording_url,
    )

    try:
        egress_url = await resolve_egress_recording_url(call_ctx.egress_id, timeout_sec=60.0)
        if not egress_url:
            return
        local_url = await mirror_egress_recording_locally(
            egress_url,
            tenant_id=call_ctx.tenant_id,
            call_id=call_ctx.call_id,
        )
        url = local_url or egress_url
        await call_ctx.crm.update_call_recording(call_ctx.call_id, url)
        call_ctx.recording_url = url
        logger.info("Attached delayed recording for %s", call_ctx.call_id)
    except Exception:
        logger.exception("Background recording attach failed for %s", call_ctx.call_id)


async def finalize_interaction(
    call_ctx: CallContext,
    *,
    enable_summary: bool = True,
    outcome: str | None = None,
) -> bool:
    """Write call/chat/voice record with full transcript. Returns True if saved."""
    if call_ctx.call_persisted or not call_ctx.crm:
        if not call_ctx.crm:
            logger.warning("No CRM on call_ctx — skipping persist for %s", call_ctx.call_id)
        return False

    if call_ctx._finalize_lock is None:
        call_ctx._finalize_lock = asyncio.Lock()

    async with call_ctx._finalize_lock:
        if call_ctx.call_persisted:
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
        recording_url = await _resolve_recording_url(call_ctx)
        delayed_recording = bool(call_ctx.egress_id and not recording_url)

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
            recording_url=recording_url,
            agent_instance_id=call_ctx.agent_instance_id,
            channel=channel,
        )
        await call_ctx.crm.create_call_record(record)
        call_ctx.call_persisted = True
        call_ctx.recording_url = recording_url
        logger.info(
            "Interaction persisted call_id=%s channel=%s transcript_chars=%s recording=%s",
            call_ctx.call_id,
            channel,
            len(transcript or ""),
            bool(recording_url),
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
                    "has_recording": bool(recording_url),
                },
            )

        if delayed_recording:
            asyncio.create_task(_background_attach_recording(call_ctx))

        return True