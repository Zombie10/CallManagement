"""Agent label shared by Análisis Detalle and Comparación agentes."""

from __future__ import annotations

import re
from typing import Any

_FINAL_AGENT = re.compile(r"(?:Final agent|Agente final):\s*([^\n]+)", re.IGNORECASE)

# Same fallbacks as admin-ui formatAgentsHandled → agentLabel.
_TEMPLATE_FALLBACK = {
    "receptionist": "Recepción",
    "banking_support": "Soporte bancario BAC",
    "support": "Soporte general",
    "sales": "Ventas",
    "technical": "Técnico",
    "escalation": "Escalación",
}


def template_agent_from_summary(summary: str | None) -> str | None:
    if not summary:
        return None
    match = _FINAL_AGENT.search(summary)
    if not match:
        return None
    found = match.group(1).strip()
    return found or None


def agent_handled_label(
    *,
    agent_instance_id: str | None,
    transferred_to: str | None,
    summary: str | None,
    agents: list[dict[str, Any]] | None = None,
) -> str:
    """Detalle label: instance name, else the tenant's only instance of that template, else —."""
    roster = agents or []
    instance_id = (agent_instance_id or "").strip()
    if instance_id and instance_id != "unassigned":
        for agent in roster:
            if agent.get("id") == instance_id:
                label = agent.get("label") or agent.get("display_name")
                if label:
                    return str(label)
        return instance_id[:8]

    template_id = (transferred_to or "").strip() or (template_agent_from_summary(summary) or "")
    template_id = template_id.strip()
    if template_id and template_id not in {"unknown", "sin_plantilla"}:
        matches = [agent for agent in roster if agent.get("template_id") == template_id]
        if len(matches) == 1:
            label = matches[0].get("label") or matches[0].get("display_name")
            if label:
                return str(label)
        return _TEMPLATE_FALLBACK.get(template_id, template_id)
    return "—"


def agent_refs(instances: list[Any]) -> list[dict[str, str]]:
    return [
        {
            "id": agent.id,
            "label": agent.display_name,
            "template_id": agent.template_id,
        }
        for agent in instances
    ]
