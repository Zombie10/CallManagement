"""Base classes and shared logic for all Call Management agents.

Heavily inspired by LiveKit's official restaurant_agent example, adapted
for general-purpose contact center / call management use cases.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import yaml
from livekit.agents import Agent, RunContext
from livekit.agents.llm import function_tool

from call_management.crm.database import CRMDatabase
from call_management.telephony.sip_tools import SIPManager

logger = logging.getLogger("call-management.agents")


@dataclass
class CallContext:
    """Shared state passed between agents via AgentSession.userdata.

    This object lives for the entire duration of a call/job.
    """

    # Call metadata
    call_id: str = ""
    room_name: str = ""
    from_number: str = ""
    to_number: str | None = None
    department_hint: str | None = None  # e.g. "sales", "support" from dispatch metadata

    # Customer data (populated by CRM lookup)
    customer_name: str | None = None
    customer_email: str | None = None
    customer_notes: str | None = None
    is_vip: bool = False

    # Conversation state
    call_purpose: str | None = None
    previous_agent_name: str | None = None
    handoff_reason: str | None = None

    # Collected during call
    appointment_details: dict[str, Any] = field(default_factory=dict)
    call_notes: list[str] = field(default_factory=list)
    outcome: str | None = None

    # Runtime objects (injected by server)
    crm: CRMDatabase | None = None
    sip: SIPManager | None = None

    # Registry of all possible agents (set by entrypoint)
    agents: dict[str, Agent] = field(default_factory=dict)

    def summarize(self) -> str:
        """YAML summary is excellent context for LLMs."""
        data = {
            "call": {
                "id": self.call_id,
                "from": self.from_number,
                "to": self.to_number,
                "department": self.department_hint,
            },
            "customer": {
                "name": self.customer_name or "unknown",
                "email": self.customer_email or "unknown",
                "vip": self.is_vip,
                "notes": (self.customer_notes or "")[:500],  # keep prompt reasonable
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
    """All domain agents inherit from this.

    Provides:
    - Automatic context injection on enter (customer data + previous chat)
    - Common tools (update customer info, handoff, add note)
    - Helper for transferring to another registered agent
    """

    def __init__(
        self,
        instructions: str,
        *,
        name: str = "base",
        tools: list | None = None,
        **kwargs,
    ) -> None:
        self.agent_name = name
        super().__init__(instructions=instructions, tools=tools or [], **kwargs)

    async def on_enter(self) -> None:
        """Called when this agent becomes the active agent in the session."""
        ctx = self.session.userdata  # type: CallContext

        # Inject rich context into the LLM
        chat_ctx = self.chat_ctx.copy()

        # Carry over limited history from previous agent (if any)
        if ctx.previous_agent_name and isinstance(ctx.previous_agent_name, str):
            # The previous agent is stored by name; we keep a small window of recent turns
            # In a more advanced implementation you could store the actual Agent instance.
            pass

        system_msg = (
            f"You are the **{self.agent_name}** agent in a professional call center.\n"
            f"Current call context:\n{ctx.summarize()}\n\n"
            "Be concise, professional, and empathetic. Confirm important information "
            "before taking irreversible actions (transfers, bookings, etc.)."
        )
        chat_ctx.add_message(role="system", content=system_msg)

        # Context injection + generate_reply works great in classic pipelines,
        # but often times out or behaves differently with Realtime models (xAI Grok Realtime, OpenAI Realtime, etc.)
        try:
            await self.update_chat_ctx(chat_ctx)
            self.session.generate_reply(tool_choice="none")
        except Exception as e:
            # Realtime models (like xai.realtime.RealtimeModel) manage context differently.
            # It's safe to continue — the agent will still work with voice input.
            logger.warning(f"Could not fully inject context in on_enter (common with realtime models): {e}")

        logger.info(f"Entered agent: {self.agent_name}")

    async def _transfer_to(
        self, agent_name: str, context: RunContextT, reason: str = ""
    ) -> tuple[Agent, str]:
        """Internal handoff helper. Returns (next_agent, spoken_message)."""
        ctx = context.userdata
        next_agent = ctx.agents.get(agent_name)
        if not next_agent:
            logger.error(f"Agent '{agent_name}' not registered")
            return self, f"I'm sorry, I cannot transfer you to {agent_name} right now."

        ctx.previous_agent_name = self.agent_name
        ctx.handoff_reason = reason or f"Transferred to {agent_name}"
        ctx.call_notes.append(f"Handoff to {agent_name}: {ctx.handoff_reason}")

        logger.info(f"Handoff: {self.agent_name} -> {agent_name} ({reason})")
        return next_agent, f"Transferring you to our {agent_name} team now."

    # ---------------- Common Tools (available to all agents) ----------------

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
        timestamp = __import__("datetime").datetime.utcnow().isoformat()[:19]
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
        # The actual SIP end happens via the telephony tool "end_call"
        # We just prepare the context and let the LLM + tool combination finish.
        return farewell
