"""Main AgentServer for the Call Management System."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import AgentServer, AgentSession, JobContext, JobProcess, cli
from livekit.agents import inference as lk_inference
from livekit.plugins import cartesia, deepgram, openai, silero, xai

from call_management.agents import (
    CallContext,
    EscalationAgent,
    ReceptionistAgent,
    SalesAgent,
    SupportAgent,
    TechnicalAgent,
)
from call_management.config import get_model_config, get_voice_for_agent
from call_management.crm.database import CallRecord, get_crm
from call_management.telephony.sip_tools import SIPManager, make_sip_tools
from call_management.utils.logging import configure_logging
from call_management.utils.summary import generate_call_summary
from call_management.utils.time import utc_now_iso
from call_management.xai.tools import attach_xai_provider_tools

load_dotenv()

logger = configure_logging()

VALID_DEPARTMENTS = {"receptionist", "support", "sales", "technical", "escalation"}


def prewarm(proc: JobProcess) -> None:
    """Preload heavy models so the first call is fast."""
    logger.info("Prewarming VAD model...")
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("Prewarm complete.")


server = AgentServer()
server.setup_fnc = prewarm


def _resolve_initial_agent(
    agents_registry: dict[str, object],
    *,
    department_hint: str | None,
    is_vip: bool,
    vip_skip_receptionist: bool,
) -> tuple[object, str]:
    receptionist = agents_registry["receptionist"]

    if is_vip and vip_skip_receptionist:
        logger.info("VIP caller detected — routing directly to support")
        return agents_registry["support"], "vip_support"

    if department_hint:
        if department_hint in agents_registry:
            logger.info("Routing directly to department agent: %s", department_hint)
            return agents_registry[department_hint], department_hint
        logger.warning(
            "Unknown department '%s' in dispatch metadata; falling back to receptionist",
            department_hint,
        )

    return receptionist, "receptionist"


def _build_session(call_ctx: CallContext, ctx: JobContext) -> AgentSession[CallContext]:
    cfg = get_model_config()
    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    if cfg.provider == "xai":
        if cfg.use_grok_realtime:
            initial_voice = get_voice_for_agent("receptionist", cfg.provider)
            logger.info(
                "Using xAI Grok Realtime (model=%s, voice=%s)",
                cfg.grok_realtime_model,
                initial_voice,
            )
            return AgentSession[CallContext](
                vad=vad,
                llm=xai.realtime.RealtimeModel(
                    model=cfg.grok_realtime_model,
                    voice=initial_voice,
                ),
                userdata=call_ctx,
                max_tool_steps=cfg.max_tool_steps,
            )

        logger.info("Using xAI classic pipeline (LLM=%s)", cfg.xai_llm_model)
        return AgentSession[CallContext](
            vad=vad,
            stt=xai.STT(model=cfg.xai_stt_model),
            llm=xai.LLM(model=cfg.xai_llm_model),
            tts=xai.TTS(model=cfg.xai_tts_model, voice=cfg.xai_tts_voice),
            userdata=call_ctx,
            max_tool_steps=cfg.max_tool_steps,
            preemptive_generation=cfg.preemptive_generation,
        )

    if cfg.provider == "inference":
        return AgentSession[CallContext](
            vad=vad,
            stt=lk_inference.STT(cfg.stt_model, language=cfg.language),
            llm=lk_inference.LLM(cfg.llm_model),
            tts=lk_inference.TTS(cfg.tts_model, voice=cfg.tts_voice),
            userdata=call_ctx,
            max_tool_steps=cfg.max_tool_steps,
            preemptive_generation=cfg.preemptive_generation,
        )

    return AgentSession[CallContext](
        vad=vad,
        stt=deepgram.STT(model=cfg.stt_model, language=cfg.language),
        llm=openai.LLM(model=cfg.llm_model),
        tts=cartesia.TTS(model=cfg.tts_model, voice=cfg.tts_voice),
        userdata=call_ctx,
        max_tool_steps=cfg.max_tool_steps,
        preemptive_generation=cfg.preemptive_generation,
    )


@server.rtc_session(agent_name="call-management")
async def entrypoint(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}
    logger.info("New call job started — room: %s", ctx.room.name)

    from_number = "unknown"
    to_number = None
    department_hint = None

    for identity, participant in ctx.room.remote_participants.items():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            attrs = participant.attributes or {}
            from_number = attrs.get("sip.phoneNumber", identity)
            to_number = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to")
            logger.info(
                "SIP caller detected: %s (status=%s)",
                from_number,
                attrs.get("sip.callStatus"),
            )

    if ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
            raw_department = meta.get("department") or meta.get("team")
            if raw_department:
                department_hint = str(raw_department).lower()
                if department_hint not in VALID_DEPARTMENTS:
                    logger.warning("Invalid department in metadata: %s", department_hint)
            logger.info("Dispatch metadata: %s", meta)
        except json.JSONDecodeError:
            logger.warning("Could not parse job metadata as JSON: %s", ctx.job.metadata)

    cfg = get_model_config()
    crm = await get_crm()
    sip = SIPManager(ctx)

    customer = await crm.get_or_create_customer(from_number)
    if customer.name:
        logger.info("Returning customer: %s (%s)", customer.name, from_number)

    call_id = f"call_{uuid.uuid4().hex[:12]}"
    call_ctx = CallContext(
        call_id=call_id,
        room_name=ctx.room.name,
        from_number=from_number,
        to_number=to_number,
        department_hint=department_hint,
        customer_name=customer.name,
        customer_email=customer.email,
        customer_notes=customer.notes,
        is_vip=customer.vip,
        crm=crm,
        sip=sip,
        start_time=utc_now_iso(),
    )

    receptionist = ReceptionistAgent()
    support = SupportAgent()
    sales = SalesAgent()
    technical = TechnicalAgent()
    escalation = EscalationAgent()

    agents_registry = {
        "receptionist": receptionist,
        "support": support,
        "sales": sales,
        "technical": technical,
        "escalation": escalation,
    }
    call_ctx.agents = agents_registry

    session = _build_session(call_ctx, ctx)

    sip_tools = make_sip_tools(sip)
    receptionist.tools.extend(sip_tools)
    support.tools.extend(sip_tools)
    escalation.tools.extend(sip_tools)

    if cfg.provider == "xai":
        attach_xai_provider_tools(
            agents_registry,
            realtime=cfg.use_grok_realtime,
        )

    initial_agent, route_reason = _resolve_initial_agent(
        agents_registry,
        department_hint=department_hint,
        is_vip=customer.vip,
        vip_skip_receptionist=cfg.vip_skip_receptionist,
    )
    if route_reason == "vip_support":
        call_ctx.call_notes.append("VIP caller routed directly to support")

    await session.start(agent=initial_agent, room=ctx.room)
    await ctx.connect()

    logger.info("Agent session started. Initial agent: %s", initial_agent.agent_name)

    def on_participant_connected(participant: rtc.RemoteParticipant):
        asyncio.create_task(_handle_participant_connected(participant, call_ctx))

    def on_participant_attributes_changed(changed: dict, participant: rtc.Participant):
        asyncio.create_task(_handle_attributes_changed(changed, participant, call_ctx))

    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info("Participant left: %s (kind=%s)", participant.identity, participant.kind)
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            asyncio.create_task(_handle_call_ended(call_ctx, cfg.enable_post_call_summary))

    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("participant_attributes_changed", on_participant_attributes_changed)
    ctx.room.on("participant_disconnected", on_participant_disconnected)


async def _handle_participant_connected(
    participant: rtc.RemoteParticipant,
    call_ctx: CallContext,
) -> None:
    logger.info("Participant joined: %s (%s)", participant.identity, participant.kind)

    if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        return

    attrs = participant.attributes or {}
    call_ctx.from_number = attrs.get("sip.phoneNumber", call_ctx.from_number)
    status = attrs.get("sip.callStatus")
    logger.info("SIP call status update: %s for %s", status, call_ctx.from_number)

    if call_ctx.crm:
        customer = await call_ctx.crm.get_or_create_customer(call_ctx.from_number)
        call_ctx.customer_name = customer.name
        call_ctx.is_vip = customer.vip


async def _handle_attributes_changed(
    changed: dict,
    participant: rtc.Participant,
    call_ctx: CallContext,
) -> None:
    if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        return

    if "sip.callStatus" in changed:
        new_status = changed["sip.callStatus"]
        logger.info("SIP callStatus changed to: %s", new_status)
        call_ctx.call_notes.append(f"Call status: {new_status}")

        if new_status in ("hangup", "failed"):
            cfg = get_model_config()
            await _handle_call_ended(call_ctx, cfg.enable_post_call_summary)


def _calculate_duration_seconds(start_time: str, end_time: str) -> int | None:
    try:
        start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=UTC)
        if end.tzinfo is None:
            end = end.replace(tzinfo=UTC)
        return max(0, int((end - start).total_seconds()))
    except ValueError:
        logger.warning("Could not calculate call duration from %s to %s", start_time, end_time)
        return None


async def _handle_call_ended(call_ctx: CallContext, enable_summary: bool) -> None:
    """Persist final call record when the SIP leg ends."""
    if call_ctx.call_persisted:
        return

    logger.info("Call ending — persisting record for %s", call_ctx.call_id)
    call_ctx.outcome = call_ctx.outcome or "completed"

    if not call_ctx.crm:
        return

    end_time = utc_now_iso()
    duration_seconds = _calculate_duration_seconds(call_ctx.start_time, end_time)

    if enable_summary:
        call_ctx.post_call_summary = await generate_call_summary(call_ctx)
    else:
        from call_management.utils.summary import build_structured_summary

        call_ctx.post_call_summary = build_structured_summary(call_ctx)

    record = CallRecord(
        call_id=call_ctx.call_id,
        room_name=call_ctx.room_name,
        from_number=call_ctx.from_number,
        to_number=call_ctx.to_number,
        start_time=call_ctx.start_time,
        end_time=end_time,
        outcome=call_ctx.outcome,
        summary=call_ctx.post_call_summary,
        agent_notes="\n".join(call_ctx.call_notes),
        transferred_to=call_ctx.previous_agent_name,
        duration_seconds=duration_seconds,
    )
    await call_ctx.crm.create_call_record(record)
    call_ctx.call_persisted = True
    logger.info("Call record persisted (duration=%ss).", duration_seconds)


def main() -> None:
    """Entry point for the `call-management` console script."""
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "dev":
        from call_management.dev_check import print_dev_preflight

        print_dev_preflight()

    cli.run_app(server)


if __name__ == "__main__":
    main()
