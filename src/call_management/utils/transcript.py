"""Extract and format conversation transcripts from agent sessions."""

from __future__ import annotations

from typing import Any

ROLE_LABELS = {
    "user": "Cliente",
    "assistant": "Agente",
}


def content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                if part.strip():
                    parts.append(part.strip())
            elif isinstance(part, dict):
                text = part.get("text") or part.get("transcript") or ""
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
            else:
                text = getattr(part, "text", None) or getattr(part, "transcript", None)
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return " ".join(parts).strip()
    text = getattr(content, "text", None)
    if isinstance(text, str):
        return text.strip()
    return str(content).strip()


def format_transcript_line(role: str, text: str, *, agent_name: str | None = None) -> str:
    label = ROLE_LABELS.get(role, role)
    if role == "assistant" and agent_name:
        label = f"Agente ({agent_name})"
    return f"[{label}] {text}"


def transcript_from_agent_session(session: Any, *, agent_name: str | None = None) -> str:
    """Build a full transcript from a LiveKit AgentSession chat history."""
    history = getattr(session, "history", None)
    if history is None:
        return ""

    current_agent = agent_name
    if not current_agent:
        agent = getattr(session, "current_agent", None)
        current_agent = getattr(agent, "agent_name", None) if agent else None

    lines: list[str] = []
    seen: set[tuple[str, str]] = set()

    for item in getattr(history, "items", []):
        item_type = getattr(item, "type", None)
        if item_type == "message":
            role = getattr(item, "role", "")
            if role not in ("user", "assistant"):
                continue
            text = content_to_text(getattr(item, "content", None))
            if not text:
                continue
            key = (role, text)
            if key in seen:
                continue
            seen.add(key)
            lines.append(
                format_transcript_line(
                    role,
                    text,
                    agent_name=current_agent if role == "assistant" else None,
                )
            )
        elif item_type == "agent_handoff":
            new_agent = getattr(item, "new_agent_id", None) or getattr(item, "agent_name", "unknown")
            lines.append(f"[Sistema] Transferencia → {new_agent}")
            current_agent = str(new_agent).replace("_agent", "")

    return "\n".join(lines)


def transcript_from_lines(lines: list[str]) -> str:
    return "\n".join(line for line in lines if line.strip())