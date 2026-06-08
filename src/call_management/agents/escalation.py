"""Human Escalation / Supervisor Queue Agent.

This agent represents the point where we hand off to a real person.
In production you would typically integrate with a queueing system (Genesys, Five9, Aircall, etc.)
or trigger an internal notification + warm transfer.
"""

from __future__ import annotations

from livekit.agents.llm import function_tool

from call_management.agents.base import BaseAgent, RunContextT


class EscalationAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="escalation",
            instructions=(
                "Escalation / supervisor queue agent. "
                "Callers here were escalated or asked for a human.\n"
                "Provide empathy, gather context, arrange fast resolution or transfer. "
                "Be clear. Never over-promise."
            ),
        )

    @function_tool
    async def create_escalation_ticket(
        self, priority: str, details: str, context: RunContextT
    ) -> str:
        """Create an internal escalation ticket (simulated here)."""
        ctx = context.userdata
        ctx.outcome = "escalation_ticket_created"
        note = f"[ESCALATION - {priority.upper()}] {details}"
        ctx.call_notes.append(note)
        if ctx.crm and ctx.from_number:
            await ctx.crm.add_customer_note(ctx.from_number, note)

        return (
            f"Thank you. I've created a priority {priority} escalation ticket with the details you provided. "
            "A supervisor will contact you within the next 30 minutes. "
            "Is there anything else I can do for you while you wait?"
        )

    @function_tool
    async def request_immediate_callback(self, context: RunContextT) -> str:
        """Flag this call for immediate supervisor callback (highest priority)."""
        ctx = context.userdata
        ctx.outcome = "immediate_callback_requested"
        ctx.call_notes.append("IMMEDIATE SUPERVISOR CALLBACK REQUESTED")
        return (
            "Understood. I've flagged this for an immediate supervisor callback. "
            "Please stay on the line or expect a call back within the next few minutes. "
            "Thank you for your patience."
        )
