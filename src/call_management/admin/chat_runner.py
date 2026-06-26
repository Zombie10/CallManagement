"""In-memory text chat sessions for the admin playground."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from dataclasses import dataclass, field
from typing import Any

from livekit.agents import AgentSession
from livekit.agents.voice.run_result import AgentHandoffEvent, ChatMessageEvent, FunctionCallEvent

from call_management.agents import (
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
from call_management.utils.time import utc_now_iso
from call_management.xai.tools import attach_xai_provider_tools, get_xai_tools_config

logger = logging.getLogger("call-management.admin.chat")

VALID_START_AGENTS = {"receptionist", "support", "sales", "technical", "escalation"}


@dataclass
class ManagedChatSession:
    session_id: str
    agent_session: AgentSession[CallContext]
    call_ctx: CallContext
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    created_at: str = field(default_factory=utc_now_iso)


def _build_text_llm():
    """Text-optimized LLM (avoids Grok Realtime quirks in admin chat)."""
    cfg = get_model_config()

    if cfg.provider == "xai":
        from livekit.plugins import openai

        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            raise ValueError("XAI_API_KEY is required for chat. Set it in .env or Admin → Configuración.")
        return openai.LLM(
            model=cfg.xai_llm_model,
            base_url="https://api.x.ai/v1",
            api_key=api_key,
        )

    if cfg.provider == "inference":
        from livekit.agents import inference

        return inference.LLM(cfg.llm_model)

    from livekit.plugins import openai

    return openai.LLM(model=cfg.llm_model)


def _extract_reply(result: Any) -> tuple[str, list[dict[str, str]]]:
    """Return assistant reply text and a list of notable events."""
    events_out: list[dict[str, str]] = []
    assistant_parts: list[str] = []

    for event in result.events:
        if isinstance(event, FunctionCallEvent):
            call = event.item
            events_out.append({"type": "tool_call", "detail": getattr(call, "name", "tool")})
        elif isinstance(event, AgentHandoffEvent):
            new_agent = getattr(event, "new_agent", None)
            name = getattr(new_agent, "agent_name", None) or getattr(
                getattr(event, "item", None), "new_agent_id", "unknown"
            )
            events_out.append({"type": "handoff", "detail": str(name).replace("_agent", "")})
        elif isinstance(event, ChatMessageEvent):
            item = event.item
            if getattr(item, "role", None) == "assistant":
                content = item.content
                if isinstance(content, list):
                    text = " ".join(str(part) for part in content if part)
                else:
                    text = str(content or "")
                if text.strip():
                    assistant_parts.append(text.strip())

    reply = assistant_parts[-1] if assistant_parts else ""
    return reply, events_out


class ChatSessionManager:
    """Keeps ephemeral AgentSession instances for admin text chat."""

    def __init__(self) -> None:
        self._sessions: dict[str, ManagedChatSession] = {}

    def status(self) -> dict[str, Any]:
        from call_management.admin.livekit_playground import livekit_playground_ready

        cfg = get_model_config()
        has_xai = bool(os.getenv("XAI_API_KEY"))
        lk_ready, lk_issues = livekit_playground_ready()
        return {
            "ready": cfg.provider == "xai" and has_xai or cfg.provider != "xai",
            "provider": cfg.provider,
            "model": cfg.xai_llm_model if cfg.provider == "xai" else cfg.llm_model,
            "voice_model": cfg.grok_realtime_model,
            "voice_ready": lk_ready,
            "livekit_ready": lk_ready,
            "livekit_issues": lk_issues,
            "active_sessions": len(self._sessions),
            "requires_xai_key": cfg.provider == "xai" and not has_xai,
            "requires_worker": True,
        }

    async def create(
        self,
        *,
        phone_number: str = "+15551234567",
        customer_name: str | None = None,
        department: str | None = None,
        initial_agent: str = "receptionist",
        vip: bool = False,
    ) -> dict[str, Any]:
        if initial_agent not in VALID_START_AGENTS:
            raise ValueError(f"Invalid initial agent '{initial_agent}'")

        cfg = get_model_config()
        llm = _build_text_llm()

        session = AgentSession[CallContext](
            llm=llm,
            max_tool_steps=cfg.max_tool_steps,
            preemptive_generation=cfg.preemptive_generation,
        )

        crm = await get_crm()
        customer = await crm.get_or_create_customer(phone_number)
        if customer_name:
            customer.name = customer_name
            await crm.update_customer(customer)

        call_ctx = CallContext(
            call_id=f"admin_{uuid.uuid4().hex[:12]}",
            room_name="admin-playground",
            from_number=phone_number,
            department_hint=department,
            customer_name=customer.name or customer_name,
            customer_email=customer.email,
            customer_notes=customer.notes,
            is_vip=vip or customer.vip,
            crm=crm,
            start_time=utc_now_iso(),
        )

        agents_registry = {
            "receptionist": ReceptionistAgent(),
            "support": SupportAgent(),
            "sales": SalesAgent(),
            "technical": TechnicalAgent(),
            "escalation": EscalationAgent(),
        }
        call_ctx.agents = agents_registry

        if cfg.provider == "xai":
            attach_xai_provider_tools(agents_registry, realtime=False, cfg=get_xai_tools_config())

        for agent_name, agent in agents_registry.items():
            agent._instructions = get_effective_instructions(agent_name)

        session.userdata = call_ctx
        start_agent = agents_registry[initial_agent]
        await session.start(agent=start_agent)

        session_id = uuid.uuid4().hex
        self._sessions[session_id] = ManagedChatSession(
            session_id=session_id,
            agent_session=session,
            call_ctx=call_ctx,
        )

        return {
            "session_id": session_id,
            "initial_agent": initial_agent,
            "phone_number": phone_number,
            "provider": cfg.provider,
            "model": cfg.xai_llm_model if cfg.provider == "xai" else cfg.llm_model,
            "voice": get_voice_for_agent(initial_agent, cfg.provider),
        }

    async def send_message(self, session_id: str, message: str) -> dict[str, Any]:
        managed = self._sessions.get(session_id)
        if not managed:
            raise ValueError("Chat session not found or expired. Start a new session.")

        message = message.strip()
        if not message:
            raise ValueError("Message cannot be empty")

        async with managed.lock:
            result = await managed.agent_session.run(user_input=message)
            reply, events = _extract_reply(result)
            current = managed.agent_session.current_agent
            agent_name = getattr(current, "agent_name", "unknown")

        return {
            "reply": reply,
            "agent": agent_name,
            "events": events,
        }

    async def close(self, session_id: str) -> None:
        managed = self._sessions.pop(session_id, None)
        if managed:
            await managed.agent_session.aclose()

    async def reset(self, session_id: str) -> dict[str, Any]:
        managed = self._sessions.get(session_id)
        if not managed:
            raise ValueError("Chat session not found")
        phone = managed.call_ctx.from_number
        vip = managed.call_ctx.is_vip
        department = managed.call_ctx.department_hint
        initial = getattr(managed.agent_session.current_agent, "agent_name", "receptionist")
        await self.close(session_id)
        return await self.create(
            phone_number=phone,
            department=department,
            initial_agent=initial if initial in VALID_START_AGENTS else "receptionist",
            vip=vip,
        )


_chat_manager: ChatSessionManager | None = None


def get_chat_manager() -> ChatSessionManager:
    global _chat_manager
    if _chat_manager is None:
        _chat_manager = ChatSessionManager()
    return _chat_manager