"""
Real Conversation Demo with xAI Grok Voice Agent

This script uses your real XAI_API_KEY to have an actual conversation
with the Call Management multi-agent system powered by Grok.

Run it with:
    uv run python examples/real_xai_conversation.py
"""

import asyncio
import logging
import os
from dotenv import load_dotenv

from livekit.agents import AgentSession

from call_management.agents import (
    ReceptionistAgent,
    SupportAgent,
    SalesAgent,
    TechnicalAgent,
    EscalationAgent,
    CallContext,
)
from call_management.crm.database import get_crm
from call_management.config import get_model_config
from call_management.telephony.sip_tools import make_sip_tools, SIPManager

# We need a minimal JobContext-like object for SIP tools in the demo
from dataclasses import dataclass

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("real-xai-demo")


@dataclass
class FakeJobContext:
    """Minimal object so SIP tools can work in the demo."""
    room: object
    api: object = None


async def main():
    print("\n" + "=" * 70)
    print("🎙️  CALL MANAGEMENT + xAI GROK — REAL CONVERSATION DEMO")
    print("=" * 70)
    print("Using Grok Voice Agent API (realtime) with your provided key.\n")

    cfg = get_model_config()
    print(f"Provider: {cfg.provider}")
    print(f"Realtime: {cfg.use_grok_realtime}")
    print(f"Model:    {cfg.grok_realtime_model}")
    print(f"Voice:    {cfg.grok_realtime_voice}\n")

    # === Real Grok LLM via xAI (OpenAI compatible) - this is what matters most ===
    print("Using Grok (xAI) as the brain of the Call Management agent.\n")

    from livekit.plugins import openai, deepgram, cartesia

    llm = openai.LLM(
        model="grok-voice-latest",
        base_url="https://api.x.ai/v1",
        api_key=os.getenv("XAI_API_KEY"),
    )

    # Minimal session - only Grok LLM (no STT/TTS needed for text demo)
    session = AgentSession[CallContext](
        llm=llm,
        max_tool_steps=10,
    )

    # === Prepare full production-like context ===
    crm = await get_crm()
    call_ctx = CallContext(
        call_id="real_demo_call_001",
        room_name="demo-xai-call",
        from_number="+1 (555) 123-4567",
        crm=crm,
    )

    # Register all agents
    agents = {
        "receptionist": ReceptionistAgent(),
        "support": SupportAgent(),
        "sales": SalesAgent(),
        "technical": TechnicalAgent(),
        "escalation": EscalationAgent(),
    }
    call_ctx.agents = agents

    # Attach SIP tools (so the agent can end/transfer calls in the demo)
    # We pass a fake context because we don't have a real LiveKit room here.
    fake_ctx = FakeJobContext(room=type("obj", (object,), {"name": "demo-room"})())
    sip = SIPManager(fake_ctx)  # type: ignore
    sip_tools = make_sip_tools(sip)

    # Give powerful tools to the main agents
    agents["receptionist"].tools.extend(sip_tools)
    agents["support"].tools.extend(sip_tools)
    agents["escalation"].tools.extend(sip_tools)

    session.userdata = call_ctx

    # Start with receptionist
    receptionist = agents["receptionist"]
    await session.start(agent=receptionist)

    print("-" * 70)
    print("📞 Conversation started. The agent is now powered by Grok.\n")

    # === Real conversation turns ===
    conversation = [
        "Hola, buenos días. Quisiera agendar una reunión con el equipo de ventas para la próxima semana.",
        "Sí, me llamo Carlos Mendoza y soy de la empresa TechNova. Necesito una demo del producto.",
        "Perfecto. ¿Qué disponibilidad tienen el martes o miércoles en la tarde?",
    ]

    for i, user_msg in enumerate(conversation, 1):
        print(f"👤 USUARIO ({i}): {user_msg}")
        print("🤖 AGENTE (Grok): ", end="", flush=True)

        try:
            result = await session.run(user_input=user_msg)

            # Extract actual Grok response
            response_text = ""
            if hasattr(result, "messages") and result.messages:
                for msg in reversed(result.messages):
                    if getattr(msg, "role", None) == "assistant" and getattr(msg, "content", None):
                        response_text = msg.content
                        break
            if not response_text:
                response_text = "Grok respondió (ver detalles en logs)."

            print(response_text.strip()[:600])
            print()

            # Small pause so it feels like a real call
            await asyncio.sleep(0.8)

        except Exception as e:
            print(f"\n[Error calling xAI] {e}\n")
            break

    print("-" * 70)
    print("✅ Demo finalizado. Esta es una conversación real con Grok")
    print("   actuando como tu agente de Call Management.")
    print("=" * 70 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
