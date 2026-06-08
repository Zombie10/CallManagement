"""Post-call summary generation."""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("call-management.summary")


def build_structured_summary(call_ctx: Any) -> str:
    """Build a deterministic summary from call context fields."""
    lines = [
        f"Call ID: {call_ctx.call_id}",
        f"From: {call_ctx.from_number}",
        f"Outcome: {call_ctx.outcome or 'unknown'}",
        f"Purpose: {call_ctx.call_purpose or 'not captured'}",
        f"Final agent: {call_ctx.previous_agent_name or 'unknown'}",
    ]
    if call_ctx.handoff_reason:
        lines.append(f"Last handoff: {call_ctx.handoff_reason}")
    if call_ctx.appointment_details:
        lines.append(f"Appointment: {call_ctx.appointment_details}")
    if call_ctx.call_notes:
        lines.append("Notes:")
        lines.extend(f"- {note}" for note in call_ctx.call_notes[-10:])
    return "\n".join(lines)


async def generate_call_summary(call_ctx: Any) -> str:
    """Generate a post-call summary, optionally enriched by an LLM."""
    structured = build_structured_summary(call_ctx)
    api_key = os.getenv("XAI_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key or not call_ctx.call_notes:
        return structured

    try:
        import openai

        client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.x.ai/v1" if os.getenv("XAI_API_KEY") else None,
        )
        model = os.getenv("SUMMARY_LLM_MODEL", "grok-3-mini" if os.getenv("XAI_API_KEY") else "gpt-4.1-mini")
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this phone call for a CRM record in 3-5 concise sentences. "
                        "Include outcome, customer need, and next steps."
                    ),
                },
                {"role": "user", "content": structured},
            ],
            max_tokens=250,
        )
        content = response.choices[0].message.content
        if content:
            return content.strip()
    except Exception:
        logger.exception("LLM call summary failed; using structured summary")

    return structured
