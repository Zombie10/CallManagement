"""Main AgentServer for the Call Management System."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import AgentServer, AgentSession, JobContext, JobProcess, cli
from livekit.agents import inference as lk_inference
from livekit.plugins import cartesia, deepgram, openai, silero, xai

from call_management.agents import (
    BankingSupportAgent,
    CallContext,
    EscalationAgent,
    ReceptionistAgent,
    SalesAgent,
    SupportAgent,
    TechnicalAgent,
)
from call_management.agent_store import get_effective_instructions
from call_management.config import get_model_config, get_voice_for_agent
from call_management.crm.database import get_crm
from call_management.crm.session_persist import finalize_interaction
from call_management.telephony.caller_id import phone_from_participant, refresh_call_ctx_caller, resolve_caller_phone
from call_management.telephony.sip_tools import SIPManager, make_sip_tools
from call_management.utils.logging import configure_logging
from call_management.utils.time import utc_now_iso
from call_management.xai.tools import attach_xai_provider_tools, get_xai_tools_config

load_dotenv()

logger = configure_logging()

VALID_DEPARTMENTS = {"receptionist", "support", "sales", "technical", "escalation", "banking_support"}


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


def _parse_session_overrides(metadata_raw: str | None) -> dict[str, object]:
    """Merge dispatch metadata and console CLI env overrides."""
    department_hint: str | None = None
    from_number: str | None = None
    customer_name: str | None = None
    vip: bool | None = None
    tenant_id: str | None = None
    agent_instance_id: str | None = None
    call_id: str | None = None

    if metadata_raw:
        try:
            meta = json.loads(metadata_raw)
            if meta.get("tenant_id"):
                tenant_id = str(meta["tenant_id"])
            if meta.get("agent_instance_id"):
                agent_instance_id = str(meta["agent_instance_id"])
            raw_department = meta.get("department") or meta.get("team") or meta.get("initial_agent")
            if raw_department:
                hint = str(raw_department).lower()
                if hint in VALID_DEPARTMENTS:
                    department_hint = hint
                else:
                    logger.warning("Invalid department in metadata: %s", hint)
            if meta.get("phone_number"):
                from_number = str(meta["phone_number"])
            if meta.get("customer_name"):
                customer_name = str(meta["customer_name"])
            if "vip" in meta:
                vip = bool(meta["vip"])
            if meta.get("call_id"):
                call_id = str(meta["call_id"])
            logger.info("Dispatch metadata: %s", meta)
        except json.JSONDecodeError:
            logger.warning("Could not parse job metadata as JSON: %s", metadata_raw)

    env_agent = os.getenv("CALL_INITIAL_AGENT", "").strip().lower()
    if env_agent in VALID_DEPARTMENTS:
        department_hint = env_agent

    env_phone = os.getenv("CALL_FROM_NUMBER", "").strip()
    if env_phone:
        from_number = env_phone

    env_customer = os.getenv("CALL_CUSTOMER_NAME", "").strip()
    if env_customer:
        customer_name = env_customer

    if os.getenv("CALL_VIP", "").lower() == "true":
        vip = True

    return {
        "department_hint": department_hint,
        "from_number": from_number,
        "customer_name": customer_name,
        "vip": vip,
        "tenant_id": tenant_id,
        "agent_instance_id": agent_instance_id,
        "call_id": call_id,
    }


def _build_session(
    call_ctx: CallContext,
    ctx: JobContext,
    *,
    voice_override: str | None = None,
    template_agent: str = "receptionist",
) -> AgentSession[CallContext]:
    cfg = get_model_config()
    vad = ctx.proc.userdata.get("vad") or silero.VAD.load()

    if cfg.provider == "xai":
        if cfg.use_grok_realtime:
            initial_voice = voice_override or get_voice_for_agent(template_agent, cfg.provider)
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

    overrides = _parse_session_overrides(ctx.job.metadata)
    department_hint = overrides["department_hint"]  # type: ignore[assignment]
    metadata_phone = str(overrides["from_number"]) if overrides["from_number"] else None

    from_number = resolve_caller_phone(
        room_name=ctx.room.name,
        metadata_phone=metadata_phone,
        participants=list(ctx.room.remote_participants.values()),
    )
    to_number = None
    for participant in ctx.room.remote_participants.values():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            attrs = participant.attributes or {}
            to_number = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to")
            logger.info(
                "SIP caller detected: %s (status=%s)",
                from_number,
                attrs.get("sip.callStatus"),
            )
            break

    from call_management.tenancy.context import resolve_crm_for_tenant, resolve_dispatch

    from call_management.tenancy.platform_store import get_platform_store
    from call_management.tenancy.queue import release as release_queue_slot
    from call_management.tenancy.queue import resolve_queue_limits_from_store
    from call_management.tenancy.queue import try_acquire as acquire_queue_slot
    from call_management.tenancy.scheduling import is_agent_available

    store = get_platform_store()
    tenant, agent_instance, routed_template = resolve_dispatch(
        dialed_number=to_number,
        tenant_id=overrides.get("tenant_id"),  # type: ignore[arg-type]
        agent_instance_id=overrides.get("agent_instance_id"),  # type: ignore[arg-type]
    )
    if not department_hint:
        department_hint = routed_template

    after_hours_note = ""
    queue_note = ""
    limit_note = ""

    if not store.tenant_within_call_limit(tenant.id):
        limit_note = (
            "\n\nLa empresa alcanzó su límite de llamadas del día. "
            "Informa amablemente que no podemos atender más llamadas hoy y ofrece contacto mañana."
        )
        department_hint = "receptionist"

    agent_id_for_queue = agent_instance.id if agent_instance else None
    queue_limits = resolve_queue_limits_from_store(
        store,
        tenant_id=tenant.id,
        agent_instance_id=agent_id_for_queue,
        dialed_number=to_number,
    )
    queued_ok, blocked_layer = await acquire_queue_slot(queue_limits)
    if not queued_ok:
        if blocked_layer == "agent":
            queue_note = (
                "\n\nEste departamento tiene el máximo de llamadas simultáneas. "
                "Pide al caller esperar un momento o ofrece devolver la llamada; sé breve y empático."
            )
        elif blocked_layer == "number":
            queue_note = (
                "\n\nEsta línea telefónica está al máximo de llamadas simultáneas. "
                "Pide al caller esperar un momento o ofrece devolver la llamada; sé breve y empático."
            )
        else:
            queue_note = (
                "\n\nTodos los agentes están ocupados. Pide al caller esperar un momento "
                "o ofrece devolver la llamada; sé breve y empático."
            )
        department_hint = department_hint or "receptionist"

    if agent_instance:
        if agent_instance.status != "active":
            logger.warning(
                "Agent instance %s is %s — using default tenant routing",
                agent_instance.id,
                agent_instance.status,
            )
            agent_instance = None
            department_hint = department_hint or "receptionist"
        elif not is_agent_available(agent_instance.id):
            logger.info(
                "Agent %s outside business hours — after-hours message",
                agent_instance.display_name,
            )
            department_hint = routed_template
            after_hours_note = (
                "\n\nIMPORTANTE — Fuera de horario: saluda y di claramente que estamos cerrados. "
                "Indica el horario de atención, ofrece tomar un mensaje o agendar callback. "
                "No transfieras a otros departamentos."
            )
        elif not limit_note:
            store.increment_agent_calls(agent_instance.id)

    cfg = get_model_config()
    crm = await resolve_crm_for_tenant(tenant.id)
    sip = SIPManager(ctx)

    customer = await crm.get_or_create_customer(from_number)
    if overrides["customer_name"]:
        customer.name = str(overrides["customer_name"])
        await crm.update_customer(customer)
    if overrides["vip"] is True:
        customer.vip = True
        await crm.update_customer(customer)

    if customer.name:
        logger.info("Returning customer: %s (%s)", customer.name, from_number)

    is_playground_room = ctx.room.name.startswith("admin-voice-")
    preset_call_id = overrides.get("call_id")  # type: ignore[assignment]
    call_id = str(preset_call_id) if preset_call_id else f"call_{uuid.uuid4().hex[:12]}"
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
        tenant_id=tenant.id,
        agent_instance_id=agent_instance.id if agent_instance else None,
        channel="voice_livekit" if is_playground_room else "sip",
        queued=not queued_ok,
        queue_limits=queue_limits,
        queue_blocked_layer=blocked_layer,
    )

    from call_management.agents import BankingSupportAgent

    receptionist = ReceptionistAgent()
    support = SupportAgent()
    sales = SalesAgent()
    technical = TechnicalAgent()
    escalation = EscalationAgent()
    banking_support = BankingSupportAgent()

    agents_registry = {
        "receptionist": receptionist,
        "support": support,
        "sales": sales,
        "technical": technical,
        "escalation": escalation,
        "banking_support": banking_support,
    }
    call_ctx.agents = agents_registry

    voice_override = agent_instance.voice if agent_instance else None
    session = _build_session(
        call_ctx,
        ctx,
        voice_override=voice_override,
        template_agent=routed_template,
    )

    sip_tools = make_sip_tools(sip)
    receptionist.tools.extend(sip_tools)
    support.tools.extend(sip_tools)
    escalation.tools.extend(sip_tools)

    if cfg.provider == "xai":
        attach_xai_provider_tools(
            agents_registry,
            realtime=cfg.use_grok_realtime,
            cfg=get_xai_tools_config(),
        )

    for agent_name, agent in agents_registry.items():
        agent._instructions = get_effective_instructions(
            agent_name,
            for_voice=cfg.use_grok_realtime,
        )

    if agent_instance:
        routed = agents_registry.get(routed_template)
        if routed:
            extra = ""
            if agent_instance.custom_instructions:
                extra += f"\n\n{agent_instance.custom_instructions.strip()}"
            if after_hours_note:
                extra += after_hours_note
            if queue_note:
                extra += queue_note
            if limit_note:
                extra += limit_note
            if extra:
                routed._instructions = f"{routed._instructions}{extra}"

    if after_hours_note and not agent_instance:
        receptionist._instructions += after_hours_note
    if queue_note:
        receptionist._instructions += queue_note
    if limit_note:
        receptionist._instructions += limit_note

    initial_agent, route_reason = _resolve_initial_agent(
        agents_registry,
        department_hint=department_hint,
        is_vip=customer.vip,
        vip_skip_receptionist=cfg.vip_skip_receptionist,
    )
    if route_reason == "vip_support":
        call_ctx.call_notes.append("VIP caller routed directly to support")

    call_ctx.previous_agent_name = getattr(initial_agent, "agent_name", None)

    await session.start(agent=initial_agent, room=ctx.room)
    await ctx.connect()
    call_ctx.agent_session = session

    refreshed_from = refresh_call_ctx_caller(call_ctx, ctx.room, metadata_phone=metadata_phone)
    if refreshed_from != from_number:
        from_number = refreshed_from
        for participant in ctx.room.remote_participants.values():
            if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                attrs = participant.attributes or {}
                to_number = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to") or to_number
                break
        if call_ctx.crm:
            customer = await call_ctx.crm.get_or_create_customer(from_number)
            call_ctx.customer_name = customer.name
            call_ctx.is_vip = customer.vip
            call_ctx.customer_email = customer.email
            call_ctx.customer_notes = customer.notes

    from call_management.recordings.livekit_egress import start_room_audio_recording

    call_ctx.egress_id = await start_room_audio_recording(
        room_name=ctx.room.name,
        call_id=call_ctx.call_id,
        tenant_id=call_ctx.tenant_id,
    )

    from call_management.recordings.livekit_egress import egress_configured
    from call_management.tenancy.queue import register_active_call
    from call_management.tenancy.webhooks import emit_event

    await register_active_call(
        call_ctx.call_id,
        tenant_id=tenant.id,
        from_number=from_number,
        channel=call_ctx.channel,
        agent_instance_id=call_ctx.agent_instance_id,
        dialed_number=to_number,
        started_at=call_ctx.start_time,
        queued=not queued_ok,
        recording=bool(call_ctx.egress_id) or egress_configured(),
        queue_blocked_layer=call_ctx.queue_blocked_layer,
    )
    await emit_event(
        tenant.id,
        "call.started",
        {
            "call_id": call_ctx.call_id,
            "from_number": from_number,
            "to_number": to_number,
            "channel": call_ctx.channel,
            "agent_instance_id": call_ctx.agent_instance_id,
            "recording": bool(call_ctx.egress_id),
        },
    )

    logger.info("Agent session started. Initial agent: %s", initial_agent.agent_name)

    def on_participant_connected(participant: rtc.RemoteParticipant):
        asyncio.create_task(_handle_participant_connected(participant, call_ctx))

    def on_participant_attributes_changed(changed: dict, participant: rtc.Participant):
        asyncio.create_task(_handle_attributes_changed(changed, participant, call_ctx))

    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info("Participant left: %s (kind=%s)", participant.identity, participant.kind)
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            asyncio.create_task(_handle_call_ended(call_ctx, cfg.enable_post_call_summary))
        elif is_playground_room and participant.identity.startswith("admin-"):
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

    phone = phone_from_participant(participant)
    if phone:
        call_ctx.from_number = phone
    status = (participant.attributes or {}).get("sip.callStatus")
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

    if "sip.phoneNumber" in changed or "sip.from" in changed or "sip.callerId" in changed:
        phone = phone_from_participant(participant)
        if phone:
            call_ctx.from_number = phone
            logger.info("SIP caller ID updated: %s", phone)

    if "sip.callStatus" in changed:
        new_status = changed["sip.callStatus"]
        logger.info("SIP callStatus changed to: %s", new_status)
        call_ctx.call_notes.append(f"Call status: {new_status}")

        if new_status in ("hangup", "failed"):
            cfg = get_model_config()
            await _handle_call_ended(call_ctx, cfg.enable_post_call_summary)


async def _handle_call_ended(call_ctx: CallContext, enable_summary: bool) -> None:
    """Persist final call record when the SIP or playground leg ends."""
    if call_ctx.call_persisted:
        return

    if call_ctx.sip:
        refresh_call_ctx_caller(call_ctx, call_ctx.sip.ctx.room)

    logger.info(
        "Call ending — persisting record for %s (from=%s)",
        call_ctx.call_id,
        call_ctx.from_number,
    )

    if call_ctx.tenant_id:
        from call_management.tenancy.queue import release as release_queue_slot
        from call_management.tenancy.queue import unregister_active_call

        await release_queue_slot(call_ctx.queue_limits)
        await unregister_active_call(call_ctx.call_id)

    await finalize_interaction(call_ctx, enable_summary=enable_summary)

    if call_ctx.egress_id and not call_ctx.recording_url:
        from call_management.crm.session_persist import _background_attach_recording

        await _background_attach_recording(call_ctx)


def main() -> None:
    """Entry point for the `call-management` console script."""
    import sys

    from call_management.console_cli import apply_console_cli_overrides, print_console_usage

    if len(sys.argv) > 1 and sys.argv[1] == "console-help":
        print_console_usage()
        raise SystemExit(0)

    sys.argv = apply_console_cli_overrides()

    if len(sys.argv) > 1 and sys.argv[1] == "dev":
        from call_management.dev_check import print_dev_preflight

        print_dev_preflight()

    cli.run_app(server)


if __name__ == "__main__":
    main()
