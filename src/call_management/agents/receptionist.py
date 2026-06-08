"""Receptionist / Main Greeter Agent.

First point of contact. Understands caller intent and routes to the correct specialist team.
"""

from __future__ import annotations

from call_management.agents.base import BaseAgent, RunContextT


class ReceptionistAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="receptionist",
            instructions=(
                "You are the friendly professional receptionist for a modern company. "
                "Greet callers, quickly understand their reason for calling, and route them "
                "to the correct specialist team.\n\n"
                "Common reasons: general questions, tech support, sales/pricing, billing/account issues, "
                "scheduling appointments/callbacks, or human supervisor request.\n\n"
                "Confirm name/phone early. Be warm, efficient, and never keep people waiting unnecessarily."
            ),
            # Tools are registered after instantiation in the server
        )

    async def on_enter(self) -> None:
        await super().on_enter()
        # Gentle proactive greeting on first entry
        # The generate_reply in base will handle most of it.
        # You can override with a specific instruction if desired:
        # await self.session.generate_reply(instructions="Greet warmly and ask how to help.")

    # ---------------- Routing Tools ----------------

    async def _route(self, target: str, context: RunContextT, reason: str) -> tuple[BaseAgent, str]:
        return await self._transfer_to(target, context, reason)

    async def to_support(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to technical / customer support."""
        return await self._route("support", context, "Customer needs support")

    async def to_sales(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to sales / new business."""
        return await self._route("sales", context, "Sales or pricing inquiry")

    async def to_technical(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to advanced technical / engineering team."""
        return await self._route("technical", context, "Complex technical issue")

    async def to_scheduling(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Route to scheduling / appointments specialist."""
        # We can treat scheduling as part of support or have a dedicated agent.
        # For simplicity we reuse support with a hint, or create a thin SchedulingAgent.
        return await self._route("support", context, "Wants to schedule appointment")

    async def to_escalation(self, context: RunContextT) -> tuple[BaseAgent, str]:
        """Escalate directly to human / supervisor queue."""
        return await self._route("escalation", context, "Direct escalation request")
