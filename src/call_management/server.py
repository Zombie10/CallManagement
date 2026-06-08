"""Main AgentServer for the Call Management System.

This is the heart of the application. It:
- Sets up the LiveKit AgentServer
- Pre-warms the VAD model
- Defines the RTC entrypoint that gets called for every new call/job
- Instantiates the full multi-agent system with shared CallContext
- Wires SIP tools and CRM
- Listens to important SIP/participant events for logging & state
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import AgentServer, AgentSession, JobContext, JobProcess, cli
from livekit.plugins import cartesia, deepgram, openai, silero, xai
from livekit.agents import inference as lk_inference  # avoid name clash with variable

from call_management.agents import (
    CallContext,
    EscalationAgent,
    ReceptionistAgent,
    SalesAgent,
    SupportAgent,
    TechnicalAgent,
)
from call_management.config import get_model_config
from call_management.crm.database import get_crm
from call_management.telephony.sip_tools import SIPManager, make_sip_tools

load_dotenv()

logger = logging.getLogger("call-management")
logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO))


# ------------------------------------------------------------------
# Prewarm (runs once per worker process before any sessions start)
# ------------------------------------------------------------------


def prewarm(proc: JobProcess) -> None:
    """Preload heavy models so the first call is fast."""
    logger.info("Prewarming VAD model...")
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("Prewarm complete.")


server = AgentServer()
server.setup_fnc = prewarm


# ------------------------------------------------------------------
# Main entrypoint (one per incoming call / job)
# ------------------------------------------------------------------


@server.rtc_session(agent_name="call-management")
async def entrypoint(ctx: JobContext) -> None:
    """Called by LiveKit when a new room/job is dispatched to this agent.

    This is where we:
    1. Extract SIP / dispatch metadata
    2. Initialize CRM + SIP manager
    3. Create the shared CallContext
    4. Build all specialist agents and register them
    5. Start the AgentSession
    6. Attach SIP event listeners
    """
    ctx.log_context_fields = {"room": ctx.room.name}

    logger.info(f"New call job started — room: {ctx.room.name}")

    # --- 1. Gather context from SIP attributes and dispatch metadata ---
    from_number = "unknown"
    to_number = None
    department_hint = None

    # Try to get SIP caller info from participants that may already be present
    for identity, participant in ctx.room.remote_participants.items():
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            attrs = participant.attributes or {}
            from_number = attrs.get("sip.phoneNumber", identity)
            to_number = attrs.get("sip.trunkPhoneNumber") or attrs.get("sip.to")
            logger.info(
                f"SIP caller detected: {from_number} (status={attrs.get('sip.callStatus')})"
            )

    # Dispatch metadata (set in dispatch rules) can contain department hints etc.
    if ctx.job.metadata:
        try:
            import json

            meta = json.loads(ctx.job.metadata)
            department_hint = meta.get("department") or meta.get("team")
            logger.info(f"Dispatch metadata: {meta}")
        except Exception:
            logger.warning(f"Could not parse job metadata: {ctx.job.metadata}")

    # --- 2. Initialize services ---
    crm = await get_crm()
    sip = SIPManager(ctx)

    # Create or refresh customer record early
    customer = await crm.get_or_create_customer(from_number)
    if customer.name:
        logger.info(f"Returning customer: {customer.name} ({from_number})")

    # --- 3. Build shared call context ---
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
    )

    # --- 4. Instantiate all agents and register them in the context ---
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

    # --- 5. Create AgentSession with xAI / Grok support (as requested) ---
    cfg = get_model_config()

    if cfg.provider == "xai":
        if cfg.use_grok_realtime:
            # === BEST OPTION: Full Grok Voice Agent API (speech-to-speech) ===
            # Extremely natural, low latency, powered by xAI
            logger.info(
                f"Using xAI Grok Realtime (model={cfg.grok_realtime_model}, voice={cfg.grok_realtime_voice})"
            )

            session = AgentSession[CallContext](
                # VAD is still useful even with realtime models for barge-in
                vad=ctx.proc.userdata.get("vad") or silero.VAD.load(),
                llm=xai.realtime.RealtimeModel(
                    model=cfg.grok_realtime_model,
                    voice=cfg.grok_realtime_voice,
                ),
                userdata=call_ctx,
                max_tool_steps=cfg.max_tool_steps,
            )
        else:
            # Classic pipeline using individual xAI components
            logger.info(f"Using xAI classic pipeline (LLM={cfg.xai_llm_model})")

            session = AgentSession[CallContext](
                vad=ctx.proc.userdata.get("vad") or silero.VAD.load(),
                stt=xai.STT(model=cfg.xai_stt_model),
                llm=xai.LLM(model=cfg.xai_llm_model),
                tts=xai.TTS(model=cfg.xai_tts_model, voice=cfg.xai_tts_voice),
                userdata=call_ctx,
                max_tool_steps=cfg.max_tool_steps,
                preemptive_generation=cfg.preemptive_generation,
            )

    elif cfg.provider == "inference":
        session = AgentSession[CallContext](
            vad=ctx.proc.userdata["vad"],
            stt=lk_inference.STT(cfg.stt_model, language=cfg.language),
            llm=lk_inference.LLM(cfg.llm_model),
            tts=lk_inference.TTS(cfg.tts_model, voice=cfg.tts_voice),
            userdata=call_ctx,
            max_tool_steps=cfg.max_tool_steps,
            preemptive_generation=cfg.preemptive_generation,
        )

    else:
        # Direct / third-party plugins
        session = AgentSession[CallContext](
            vad=ctx.proc.userdata["vad"],
            stt=deepgram.STT(model=cfg.stt_model, language=cfg.language),
            llm=openai.LLM(model=cfg.llm_model),
            tts=cartesia.TTS(model=cfg.tts_model, voice=cfg.tts_voice),
            userdata=call_ctx,
            max_tool_steps=cfg.max_tool_steps,
            preemptive_generation=cfg.preemptive_generation,
        )

    # Attach SIP tools to the session (they become available to every agent)
    sip_tools = make_sip_tools(sip)
    # Note: In this architecture the tools are attached via the individual agents' tools lists
    # or globally on the session. For maximum flexibility we add them at the session level too.
    # The current livekit-agents version allows tools on AgentSession as well in many cases.
    # We will also inject them into the base agents after creation.

    # Add common tools to all agents (they inherit from BaseAgent which has some)
    # SIP tools are powerful — we attach them to the receptionist and support primarily,
    # but they can be added to any agent.
    receptionist.tools.extend(sip_tools)
    support.tools.extend(sip_tools)
    escalation.tools.extend(sip_tools)  # Escalation should always be able to end/transfer

    # Choose the starting agent based on department hint from dispatch metadata
    initial_agent = receptionist
    if department_hint:
        initial_agent = agents_registry.get(department_hint, receptionist)
        logger.info(f"Routing directly to department agent: {department_hint}")

    # --- 6. Start the session ---
    await session.start(agent=initial_agent, room=ctx.room)
    await ctx.connect()  # Ensure we're fully connected

    logger.info(f"Agent session started. Initial agent: {initial_agent.agent_name}")

    # --- 7. SIP / Participant event listeners (excellent for logging & automation) ---
    def on_participant_connected(participant: rtc.RemoteParticipant):
        asyncio.create_task(_handle_participant_connected(participant, call_ctx, session))

    def on_participant_attributes_changed(changed: dict, participant: rtc.Participant):
        asyncio.create_task(_handle_attributes_changed(changed, participant, call_ctx, session))

    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info(f"Participant left: {participant.identity} (kind={participant.kind})")
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            # The main caller hung up — we can trigger cleanup if desired
            asyncio.create_task(_handle_call_ended(call_ctx))

    ctx.room.on("participant_connected", on_participant_connected)
    ctx.room.on("participant_attributes_changed", on_participant_attributes_changed)
    ctx.room.on("participant_disconnected", on_participant_disconnected)

    # Optional: initial greeting instruction (agents' on_enter already triggers generate_reply)
    # await session.generate_reply(instructions="Greet the caller and introduce yourself.")


async def _handle_participant_connected(
    participant: rtc.RemoteParticipant,
    call_ctx: CallContext,
    session: AgentSession,
) -> None:
    logger.info(f"Participant joined: {participant.identity} ({participant.kind})")

    if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        attrs = participant.attributes or {}
        call_ctx.from_number = attrs.get("sip.phoneNumber", call_ctx.from_number)
        status = attrs.get("sip.callStatus")
        logger.info(f"SIP call status update: {status} for {call_ctx.from_number}")

        # Refresh CRM lookup now that we have a solid phone number
        if call_ctx.crm:
            customer = await call_ctx.crm.get_or_create_customer(call_ctx.from_number)
            call_ctx.customer_name = customer.name
            call_ctx.is_vip = customer.vip

        # Welcome message if this is the primary caller
        try:
            await session.say(
                "Hello! Thank you for calling. I'm your AI assistant and I'll be happy to help you today."
            )
        except Exception:
            pass


async def _handle_attributes_changed(
    changed: dict,
    participant: rtc.Participant,
    call_ctx: CallContext,
    session: AgentSession,
) -> None:
    if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
        return

    if "sip.callStatus" in changed:
        new_status = changed["sip.callStatus"]
        logger.info(f"SIP callStatus changed to: {new_status}")
        call_ctx.call_notes.append(f"Call status: {new_status}")

        if new_status in ("hangup", "failed"):
            await _handle_call_ended(call_ctx)


async def _handle_call_ended(call_ctx: CallContext) -> None:
    """Persist final call record when the SIP leg ends."""
    logger.info(f"Call ending — persisting record for {call_ctx.call_id}")

    if not call_ctx.crm:
        return

    end_time = datetime.utcnow().isoformat()
    # Very rough duration (in real life you'd store start time more precisely)
    # TODO: store real start time in CallContext for accurate duration calculation
    try:
        _ = (
            datetime.fromisoformat(call_ctx.call_id.split("_")[-1])
            if "_" in call_ctx.call_id
            else None
        )
    except Exception:
        pass

    record = __import__("call_management.crm.database", fromlist=["CallRecord"]).CallRecord(
        call_id=call_ctx.call_id,
        room_name=call_ctx.room_name,
        from_number=call_ctx.from_number,
        to_number=call_ctx.to_number,
        end_time=end_time,
        outcome=call_ctx.outcome or "completed",
        summary="\n".join(call_ctx.call_notes[-10:]),
        agent_notes="\n".join(call_ctx.call_notes),
        transferred_to=call_ctx.previous_agent_name,
    )
    await call_ctx.crm.create_call_record(record)
    logger.info("Call record persisted.")


# ------------------------------------------------------------------
# CLI entrypoint
# ------------------------------------------------------------------


def main() -> None:
    """Entry point for the `call-management` console script."""
    cli.run_app(server)


if __name__ == "__main__":
    main()
