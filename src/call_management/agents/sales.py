"""Sales / New Business Agent."""

from __future__ import annotations

from typing import Annotated

from livekit.agents.llm import function_tool
from pydantic import Field

from call_management.agents.base import BaseAgent, RunContextT


class SalesAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="sales",
            instructions=(
                "You are a professional sales representative. "
                "Your goal is to understand the caller's needs, qualify the opportunity, "
                "provide high-level pricing and capability information, and book a follow-up "
                "with the right account executive when appropriate. "
                "Be helpful and consultative — never pushy."
            ),
        )

    @function_tool
    async def qualify_lead(
        self,
        company: Annotated[str, Field(description="Caller's company or organization")],
        role: Annotated[str, Field(description="Caller's role or title")],
        interest: Annotated[str, Field(description="What product/service they are interested in")],
        context: RunContextT,
    ) -> str:
        """Capture lead qualification details."""
        ctx = context.userdata
        ctx.call_purpose = f"Sales lead: {interest}"
        ctx.appointment_details = {
            "type": "sales_qualification",
            "company": company,
            "role": role,
            "interest": interest,
        }
        return (
            f"Thank you. I've noted your interest in {interest} for {company}. "
            "A member of our sales team will follow up shortly. "
            "Is there anything specific you'd like me to pass along?"
        )

    @function_tool
    async def schedule_sales_meeting(self, preferred_time: str, context: RunContextT) -> str:
        """Book a discovery call or demo with an account executive."""
        ctx = context.userdata
        ctx.outcome = "sales_meeting_scheduled"
        ctx.appointment_details["sales_meeting"] = preferred_time
        return (
            f"Great. I've requested a sales meeting around {preferred_time}. "
            "Our team will confirm the exact time via email or callback. "
            "Anything else I can help you with today?"
        )
