"""Customer Support Agent.

Handles billing, account issues, basic troubleshooting, and appointment scheduling.
"""

from __future__ import annotations

from typing import Annotated

from livekit.agents.llm import function_tool
from pydantic import Field

from call_management.agents.base import BaseAgent, RunContextT
from call_management.crm.database import Appointment


class SupportAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="support",
            instructions=(
                "You are an experienced customer support specialist. "
                "You help existing customers with account questions, billing, "
                "basic product troubleshooting, returns, and scheduling callbacks or appointments. "
                "\n\n"
                "Always look up the customer first using the lookup tool. "
                "Be patient, clear, and solution-oriented. "
                "For complex technical problems, offer to transfer to the technical team. "
                "For new sales opportunities, transfer to sales."
            ),
        )

    # ---------------- Support-specific Tools ----------------

    @function_tool
    async def check_upcoming_appointments(self, context: RunContextT) -> str:
        """Show the caller what upcoming appointments or callbacks they have on file."""
        ctx = context.userdata
        if not ctx.crm or not ctx.from_number:
            return "I don't have access to our scheduling system right now."

        appts = await ctx.crm.get_upcoming_appointments(ctx.from_number)
        if not appts:
            return "You don't have any upcoming appointments scheduled with us."

        lines = ["Here are your upcoming appointments:"]
        for a in appts:
            lines.append(f"- {a.scheduled_time}: {a.purpose}")
            if a.notes:
                lines.append(f"  Notes: {a.notes}")
        return "\n".join(lines)

    @function_tool
    async def schedule_callback(
        self,
        when: Annotated[
            str,
            Field(
                description="When the caller wants the callback (e.g. 'tomorrow at 3pm', 'Friday morning')"
            ),
        ],
        purpose: Annotated[str, Field(description="Reason for the callback")],
        context: RunContextT,
    ) -> str:
        """Schedule a callback or appointment for this customer."""
        ctx = context.userdata
        if not ctx.crm or not ctx.from_number:
            return "Unable to access scheduling right now. I'll take your details for a callback."

        appt = Appointment(
            customer_phone=ctx.from_number,
            scheduled_time=when,
            purpose=purpose,
            notes=f"Requested via support agent. Caller: {ctx.customer_name or ctx.from_number}",
        )
        appt_id = await ctx.crm.create_appointment(appt)

        ctx.appointment_details = {
            "id": appt_id,
            "time": when,
            "purpose": purpose,
        }
        ctx.outcome = "callback_scheduled"

        return (
            f"Callback scheduled for {when} ({purpose}). Ref: {appt_id}. "
            "Anything else before we end the call?"
        )

    @function_tool
    async def update_account_notes(self, note: str, context: RunContextT) -> str:
        """Add important account-level notes (e.g. contact prefs, known issues)."""
        ctx = context.userdata
        if ctx.crm and ctx.from_number:
            await ctx.crm.add_customer_note(ctx.from_number, f"[Support] {note}")
        ctx.call_notes.append(f"Account note: {note}")
        return "Account note saved."

    @function_tool
    async def request_technical_escalation(
        self, issue_summary: str, context: RunContextT
    ) -> tuple[BaseAgent, str]:
        """Escalate complex technical issue to the engineering team."""
        ctx = context.userdata
        ctx.call_purpose = f"Tech escalation: {issue_summary}"
        return await self._transfer_to("technical", context, f"Complex issue: {issue_summary}")
