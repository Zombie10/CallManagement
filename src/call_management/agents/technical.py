"""Advanced Technical / Engineering Support Agent."""

from __future__ import annotations

from livekit.agents.llm import function_tool

from call_management.agents.base import BaseAgent, RunContextT
from call_management.config import get_model_config, get_voice_for_agent


class TechnicalAgent(BaseAgent):
    def __init__(self) -> None:
        cfg = get_model_config()
        super().__init__(
            name="technical",
            preferred_voice=get_voice_for_agent("technical", cfg.provider),
            instructions=(
                "You are senior technical support on a live phone line. "
                "Handle complex troubleshooting, integrations, and performance issues.\n\n"
                "Let the caller describe the problem first. Ask targeted follow-ups — not a long intake form. "
                "Collect diagnostics when needed. Escalate when it's beyond your scope."
            ),
        )

    @function_tool
    async def collect_diagnostics(self, details: str, context: RunContextT) -> str:
        """Record diagnostic information provided by the customer."""
        ctx = context.userdata
        ctx.call_notes.append(f"Diagnostics: {details}")
        return "Diagnostics recorded. Engineering will review. Would you like a follow-up engineer callback?"

    @function_tool
    async def schedule_engineer_callback(self, when: str, context: RunContextT) -> str:
        """Schedule a callback with a specialist engineer."""
        ctx = context.userdata
        ctx.outcome = "engineer_callback_scheduled"
        ctx.appointment_details["engineer_callback"] = when
        return f"Engineer callback scheduled for {when}. Reference has been noted on your account."
