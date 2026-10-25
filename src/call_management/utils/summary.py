"""Post-call summary generation."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger("call-management.summary")

_CHANNEL_PREFIX = re.compile(r"^\[(?:voice_xai|voice_livekit|chat|sip)\]\s*", re.IGNORECASE)
_SUMMARY_LABELS = (
    (re.compile(r"^Call ID:\s*", re.IGNORECASE), "ID de llamada: "),
    (re.compile(r"^From:\s*", re.IGNORECASE), "De: "),
    (re.compile(r"^Outcome:\s*", re.IGNORECASE), "Resultado: "),
    (re.compile(r"^Purpose:\s*", re.IGNORECASE), "Motivo: "),
    (re.compile(r"^Final agent:\s*", re.IGNORECASE), "Agente final: "),
    (re.compile(r"^Last handoff:\s*", re.IGNORECASE), "Última transferencia: "),
    (re.compile(r"^Appointment:\s*", re.IGNORECASE), "Cita: "),
    (re.compile(r"^Notes:\s*$", re.IGNORECASE), "Notas:"),
)


def build_structured_summary(call_ctx: Any) -> str:
    """Build a deterministic Spanish summary from call context fields."""
    lines = [
        f"ID de llamada: {call_ctx.call_id}",
        f"De: {call_ctx.from_number}",
        f"Resultado: {call_ctx.outcome or 'desconocido'}",
        f"Motivo: {call_ctx.call_purpose or 'no indicado'}",
        f"Agente final: {getattr(call_ctx, 'current_agent_name', None) or call_ctx.previous_agent_name or 'desconocido'}",
    ]
    if call_ctx.handoff_reason:
        lines.append(f"Última transferencia: {call_ctx.handoff_reason}")
    if call_ctx.appointment_details:
        lines.append(f"Cita: {call_ctx.appointment_details}")
    if call_ctx.call_notes:
        lines.append("Notas:")
        lines.extend(f"- {note}" for note in call_ctx.call_notes[-10:])
    return "\n".join(lines)


def present_call_summary(summary: str | None) -> str | None:
    """Spanish summary for Registros. Strips a stored channel prefix such as [voice_xai]."""
    if summary is None:
        return None
    text = summary.strip()
    while True:
        stripped = _CHANNEL_PREFIX.sub("", text, count=1)
        if stripped == text:
            break
        text = stripped.strip()
    lines: list[str] = []
    for line in text.splitlines():
        mapped = line
        for pattern, label in _SUMMARY_LABELS:
            if pattern.match(line):
                mapped = pattern.sub(label, line, count=1)
                break
        lines.append(mapped)
    return "\n".join(lines).strip()


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
