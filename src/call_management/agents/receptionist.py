"""Receptionist / Main Greeter Agent."""

from __future__ import annotations

from livekit.agents.llm import function_tool

from call_management.agents.base import BaseAgent, RunContextT
from call_management.config import get_model_config, get_voice_for_agent


class ReceptionistAgent(BaseAgent):
    def __init__(self) -> None:
        cfg = get_model_config()
        super().__init__(
            name="receptionist",
            preferred_voice=get_voice_for_agent("receptionist", cfg.provider),
            instructions=(
                "You are the friendly professional receptionist for a modern company. "
                "Greet callers, quickly understand their reason for calling, and route them "
                "to the correct specialist team.\n\n"
                "Common reasons: general questions, tech support, sales/pricing, billing/account issues, "
                "scheduling appointments/callbacks, or human supervisor request.\n\n"
                "Confirm name/phone early. Be warm, efficient, and never keep people waiting unnecessarily."
            ),
        )

    async def _route(self, target: str, context: RunContextT, reason: str) -> tuple[BaseAgent, str]:
        return await self._transfer_to(target, context, reason)

    @function_tool
    async def to_support(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to technical / customer support."""
        return await self._route("support", context, "Customer needs support")

    @function_tool
    async def to_sales(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to sales / new business."""
        return await self._route("sales", context, "Sales or pricing inquiry")

    @function_tool
    async def to_technical(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to advanced technical / engineering team."""
        return await self._route("technical", context, "Complex technical issue")

    @function_tool
    async def to_scheduling(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to scheduling / appointments specialist."""
        return await self._route("support", context, "Wants to schedule appointment")

    @function_tool
    async def to_escalation(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Escalate directly to human / supervisor queue."""
        return await self._route("escalation", context, "Direct escalation request")
