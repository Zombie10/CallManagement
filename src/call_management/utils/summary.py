"""Post-call summary generation."""

from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger("call-management.summary")

_CHANNEL_PREFIX = re.compile(r"^\[(?:voice_xai|voice_livekit|chat|sip)\]\s*", re.IGNORECASE)
_SPANISH_LABEL = re.compile(
    r"^(?:ID de llamada|De|Resultado|Motivo|Agente final|Última transferencia|Cita|Notas)\s*:",
    re.IGNORECASE,
)
_ENGLISH_WORD = re.compile(
    r"\b(?:the|was|were|from|routed|call|agent|customer|asked|ended|for|and|with|this|that|please|then)\b",
    re.IGNORECASE,
)
_AGENT_NAMES = {
    "banking_support": "soporte bancario",
    "receptionist": "recepción",
    "support": "soporte general",
    "sales": "ventas",
    "technical": "técnico",
    "escalation": "escalación",
}
_CALL_ID_TOKEN = re.compile(r"^call_[0-9a-f]{8,}$", re.IGNORECASE)
_PURPOSE_PHRASES = (
    (re.compile(r"debit card block|block\w* (?:the |a )?debit card", re.IGNORECASE), "bloqueo de tarjeta de débito"),
    (re.compile(r"debit card", re.IGNORECASE), "tarjeta de débito"),
    (re.compile(r"credit card", re.IGNORECASE), "tarjeta de crédito"),
    (re.compile(r"appointment", re.IGNORECASE), "una cita"),
    (re.compile(r"supervisor", re.IGNORECASE), "un supervisor"),
    (re.compile(r"\bbalance\b", re.IGNORECASE), "el saldo"),
    (re.compile(r"\btransfer\b", re.IGNORECASE), "una transferencia"),
)
SUMMARY_MODEL_INSTRUCTION = (
    "Resume esta llamada telefónica para el registro del CRM en 3 a 5 oraciones, en español. "
    "Incluye el resultado, la necesidad del cliente y los siguientes pasos."
)
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


def _line_is_english_prose(line: str) -> bool:
    stripped = line.strip()
    if not stripped or _SPANISH_LABEL.match(stripped):
        return False
    return len(_ENGLISH_WORD.findall(stripped)) >= 2


def spanish_from_english_prose(line: str) -> str:
    """Deterministic Spanish stand-in for a stored English sentence. No model call."""
    phone = re.search(r"\+\d{8,15}", line)
    agent_name = next(
        (
            token
            for token in re.findall(r"\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b", line)
            if not _CALL_ID_TOKEN.match(token)
        ),
        None,
    )
    purposes: list[str] = []
    for pattern, label in _PURPOSE_PHRASES:
        if label in purposes:
            continue
        if label == "tarjeta de débito" and "bloqueo de tarjeta de débito" in purposes:
            continue
        if pattern.search(line):
            purposes.append(label)
    parts = ["Llamada"]
    if phone:
        parts.append(f"desde {phone.group(0)}")
    if agent_name:
        parts.append(f"atendida por {_AGENT_NAMES.get(agent_name, agent_name.replace('_', ' '))}")
    if purposes:
        parts.append("sobre " + " y ".join(purposes))
    if len(parts) == 1:
        return "Llamada registrada."
    return " ".join(parts) + "."


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
        if _line_is_english_prose(mapped):
            mapped = spanish_from_english_prose(mapped)
        lines.append(mapped)
    return "\n".join(lines).strip()


def summary_model_messages(structured: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": SUMMARY_MODEL_INSTRUCTION},
        {"role": "user", "content": structured},
    ]


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
            messages=summary_model_messages(structured),
            max_tokens=250,
        )
        content = response.choices[0].message.content
        if content:
            return content.strip()
    except Exception:
        logger.exception("LLM call summary failed; using structured summary")

    return structured
