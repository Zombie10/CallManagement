"""Base classes and shared logic for all Call Management agents."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import yaml
from livekit.agents import Agent, RunContext
from livekit.agents.llm import function_tool

from call_management.config import get_language_instruction, get_model_config, get_voice_for_agent
from call_management.crm.database import CRMDatabase
from call_management.telephony.sip_tools import SIPManager
from call_management.utils.time import utc_now_iso

logger = logging.getLogger("call-management.agents")

XAI_TOOL_HINTS = {
    "xai_web_search": "You can search the web for up-to-date public information when needed.",
    "xai_x_search": "You can search X/Twitter for recent public posts when relevant.",
    "xai_file_search": "You can search the configured knowledge-base documents for answers.",
    "xai_code_interpreter": "You can run Python in a sandbox for calculations or data analysis.",
    "openai_web_search": "You can search the web for up-to-date public information when needed.",
    "openai_file_search": "You can search the configured knowledge-base documents for answers.",
    "openai_code_interpreter": "You can run Python in a sandbox for calculations or data analysis.",
    "xai_x_search_classic": "You can search X/Twitter for recent public posts when relevant.",
}


def _remote_mcp_hint(tool_id: str) -> str | None:
    if tool_id.startswith("xai_remote_mcp_"):
        label = tool_id.removeprefix("xai_remote_mcp_")
        return f"You can use remote MCP tools from server '{label}' for specialized lookups."
    return None


def _xai_tools_instruction(tools: list) -> str:
    hints = []
    for tool in tools:
        tool_id = getattr(tool, "id", None)
        if not tool_id:
            continue
        if tool_id in XAI_TOOL_HINTS:
            hints.append(XAI_TOOL_HINTS[tool_id])
            continue
        mcp_hint = _remote_mcp_hint(tool_id)
        if mcp_hint:
            hints.append(mcp_hint)
    if not hints:
        return ""
    return "Available xAI tools:\n- " + "\n- ".join(dict.fromkeys(hints))


@dataclass
class CallContext:
    """Shared state passed between agents via AgentSession.userdata."""

    call_id: str = ""
    room_name: str = ""
    from_number: str = ""
    to_number: str | None = None
    department_hint: str | None = None

    customer_name: str | None = None
    customer_email: str | None = None
    customer_notes: str | None = None
    is_vip: bool = False

    call_purpose: str | None = None
    previous_agent_name: str | None = None
    handoff_reason: str | None = None
    start_time: str = field(default_factory=utc_now_iso)

    appointment_details: dict[str, Any] = field(default_factory=dict)
    call_notes: list[str] = field(default_factory=list)
    outcome: str | None = None
    post_call_summary: str | None = None
    call_persisted: bool = False

    crm: CRMDatabase | None = None
    sip: SIPManager | None = None
    agents: dict[str, Agent] = field(default_factory=dict)

    def summarize(self) -> str:
        data = {
            "call": {
                "id": self.call_id,
                "from": self.from_number,
                "to": self.to_number,
                "department": self.department_hint,
                "started_at": self.start_time,
            },
            "customer": {
                "name": self.customer_name or "unknown",
                "email": self.customer_email or "unknown",
                "vip": self.is_vip,
                "notes": (self.customer_notes or "")[:500],
            },
            "state": {
                "purpose": self.call_purpose,
                "previous_agent": self.previous_agent_name,
                "handoff_reason": self.handoff_reason,
                "notes": self.call_notes[-5:] if self.call_notes else [],
                "appointment": self.appointment_details or None,
                "outcome": self.outcome,
            },
        }
        return yaml.dump(data, sort_keys=False, allow_unicode=True)


RunContextT = RunContext[CallContext]


class BaseAgent(Agent):
    """All domain agents inherit from this."""

    preferred_voice: str | None = None

    def __init__(
        self,
        instructions: str,
        *,
        name: str = "base",
        tools: list | None = None,
        preferred_voice: str | None = None,
        **kwargs,
    ) -> None:
        self.agent_name = name
        self.preferred_voice = preferred_voice
        super().__init__(instructions=instructions, tools=tools or [], **kwargs)

    async def _apply_agent_voice(self) -> None:
        """Apply per-agent voice presets when the pipeline supports it."""
        cfg = get_model_config()
        voice = self.preferred_voice or get_voice_for_agent(self.agent_name, cfg.provider)
        tts = getattr(self.session, "tts", None)
        if tts is not None and hasattr(tts, "update_options"):
            try:
                tts.update_options(voice=voice)
                logger.info("Applied voice '%s' for agent '%s'", voice, self.agent_name)
            except Exception:
                logger.debug("Voice update not supported for agent '%s'", self.agent_name)

    async def on_enter(self) -> None:
        ctx = self.session.userdata
        await self._apply_agent_voice()

        chat_ctx = self.chat_ctx.copy()
        if ctx.previous_agent_name:
            recent = [item for item in self.chat_ctx.items if item.type == "message"][-4:]
            for item in recent:
                chat_ctx.items.append(item)

        language_instruction = get_language_instruction(get_model_config().default_locale)
        xai_tool_note = _xai_tools_instruction(self.tools)
        vip_note = (
            "This caller is a VIP customer. Prioritize fast resolution and white-glove service."
            if ctx.is_vip
            else ""
        )
        system_msg = (
            f"You are the **{self.agent_name}** agent in a professional call center.\n"
            f"Current call context:\n{ctx.summarize()}\n\n"
            f"{language_instruction}\n"
            f"{xai_tool_note}\n"
            f"{vip_note}\n"
            "Be concise, professional, and empathetic. Confirm important information "
            "before taking irreversible actions (transfers, bookings, etc.)."
        )
        chat_ctx.add_message(role="system", content=system_msg.strip())

        try:
            await self.update_chat_ctx(chat_ctx)
            self.session.generate_reply(tool_choice="none")
        except Exception as exc:
            logger.warning(
                "Could not fully inject context in on_enter (common with realtime models): %s",
                exc,
            )

        logger.info("Entered agent: %s", self.agent_name)

    async def _transfer_to(
        self, agent_name: str, context: RunContextT, reason: str = ""
    ) -> tuple[Agent, str]:
        ctx = context.userdata
        next_agent = ctx.agents.get(agent_name)
        if not next_agent:
            logger.error("Agent '%s' not registered", agent_name)
            return self, f"I'm sorry, I cannot transfer you to {agent_name} right now."

        ctx.previous_agent_name = self.agent_name
        ctx.handoff_reason = reason or f"Transferred to {agent_name}"
        ctx.call_notes.append(f"Handoff to {agent_name}: {ctx.handoff_reason}")

        logger.info("Handoff: %s -> %s (%s)", self.agent_name, agent_name, reason)
        return next_agent, f"Transferring you to our {agent_name} team now."

    @function_tool
    async def update_customer_name(self, name: str, context: RunContextT) -> str:
        """Update the caller's name in our records. Confirm spelling with the user first."""
        ctx = context.userdata
        ctx.customer_name = name.strip()
        if ctx.crm and ctx.from_number:
            customer = await ctx.crm.get_or_create_customer(ctx.from_number)
            customer.name = ctx.customer_name
            await ctx.crm.update_customer(customer)
        return f"Thank you. I've updated your name to {ctx.customer_name}."

    @function_tool
    async def update_customer_email(self, email: str, context: RunContextT) -> str:
        """Update the caller's email address."""
        ctx = context.userdata
        ctx.customer_email = email.strip()
        if ctx.crm and ctx.from_number:
            customer = await ctx.crm.get_or_create_customer(ctx.from_number)
            customer.email = ctx.customer_email
            await ctx.crm.update_customer(customer)
        return f"Email updated to {ctx.customer_email}."

    @function_tool
    async def add_call_note(self, note: str, context: RunContextT) -> str:
        """Add an internal note about this call (visible to all future agents)."""
        ctx = context.userdata
        timestamp = utc_now_iso()[:19]
        ctx.call_notes.append(f"[{timestamp}] {note}")
        if ctx.crm and ctx.from_number:
            await ctx.crm.add_customer_note(ctx.from_number, note)
        return "Note recorded. Thank you."

    @function_tool
    async def lookup_customer(self, context: RunContextT) -> str:
        """Look up the current caller in our CRM and refresh context."""
        ctx = context.userdata
        if not ctx.from_number or not ctx.crm:
            return "No caller phone number available for lookup."

        customer = await ctx.crm.get_or_create_customer(ctx.from_number)
        ctx.customer_name = customer.name
        ctx.customer_email = customer.email
        ctx.customer_notes = customer.notes
        ctx.is_vip = customer.vip

        if customer.name:
            return f"Welcome back, {customer.name}. I have your details on file."
        return f"I have your phone number ({ctx.from_number}) on file, but no name yet."

    @function_tool
    async def to_receptionist(self, context: RunContextT) -> tuple[Agent, str]:
        """Return to the main receptionist / greeter."""
        return await self._transfer_to("receptionist", context, "Returned to receptionist")

    @function_tool
    async def escalate_to_human(self, reason: str, context: RunContextT) -> tuple[Agent, str]:
        """Escalate this call to a human agent / supervisor."""
        ctx = context.userdata
        ctx.outcome = "escalated"
        ctx.call_notes.append(f"Escalation requested: {reason}")
        return await self._transfer_to("escalation", context, f"Escalation: {reason}")

    @function_tool
    async def end_call_gracefully(self, farewell: str, context: RunContextT) -> str:
        """End the call after saying a polite farewell. Use when the issue is fully resolved."""
        ctx = context.userdata
        ctx.outcome = ctx.outcome or "resolved"
        try:
            await self.session.say(farewell)
            if ctx.sip:
                await ctx.sip.end_current_call()
        except Exception:
            logger.exception("Failed to end call gracefully")
            return f"{farewell} (Note: automatic hangup failed; please use end_call if needed.)"
        return farewell
