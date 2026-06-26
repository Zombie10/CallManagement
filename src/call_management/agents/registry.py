"""Agent registry: default instructions, routing tools, and voice function schemas."""

from __future__ import annotations

from typing import Any

from call_management.agents import (
    EscalationAgent,
    ReceptionistAgent,
    SalesAgent,
    SupportAgent,
    TechnicalAgent,
)

_AGENT_CLASSES = {
    "receptionist": ReceptionistAgent,
    "support": SupportAgent,
    "sales": SalesAgent,
    "technical": TechnicalAgent,
    "escalation": EscalationAgent,
}

# Handoff / CRM function tools available per agent (LiveKit @function_tool names)
DEFAULT_FUNCTION_TOOLS: dict[str, list[str]] = {
    "receptionist": [
        "to_support",
        "to_sales",
        "to_technical",
        "to_scheduling",
        "to_escalation",
        "lookup_customer",
        "update_customer_name",
        "add_call_note",
    ],
    "support": [
        "to_sales",
        "to_technical",
        "to_escalation",
        "to_receptionist",
        "schedule_appointment",
        "lookup_customer",
        "add_call_note",
    ],
    "sales": [
        "to_support",
        "to_technical",
        "to_escalation",
        "to_receptionist",
        "lookup_customer",
        "add_call_note",
    ],
    "technical": [
        "to_support",
        "to_escalation",
        "to_receptionist",
        "lookup_customer",
        "add_call_note",
    ],
    "escalation": [
        "to_support",
        "to_receptionist",
        "escalate_to_human",
        "lookup_customer",
        "add_call_note",
        "end_call_gracefully",
    ],
}

_FUNCTION_TOOL_LABELS: dict[str, str] = {
    "to_support": "Transferir a Soporte",
    "to_sales": "Transferir a Ventas",
    "to_technical": "Transferir a Técnico",
    "to_scheduling": "Transferir a Citas",
    "to_escalation": "Transferir a Escalación",
    "to_receptionist": "Volver a Recepción",
    "lookup_customer": "Buscar cliente en CRM",
    "update_customer_name": "Actualizar nombre",
    "add_call_note": "Agregar nota",
    "schedule_appointment": "Agendar cita",
    "escalate_to_human": "Escalar a humano",
    "end_call_gracefully": "Finalizar llamada",
}

# Voice API routing: function name -> target agent
_VOICE_HANDOFF_TARGETS: dict[str, str] = {
    "to_support": "support",
    "to_sales": "sales",
    "to_technical": "technical",
    "to_scheduling": "support",
    "to_escalation": "escalation",
    "to_receptionist": "receptionist",
    "transfer_to_support": "support",
    "transfer_to_sales": "sales",
    "transfer_to_technical": "technical",
    "transfer_to_escalation": "escalation",
    "transfer_to_receptionist": "receptionist",
}

_VOICE_FUNCTION_SCHEMAS: dict[str, dict[str, Any]] = {
    "to_support": {
        "type": "function",
        "name": "transfer_to_support",
        "description": "Transfer the caller to the customer support team. Use when they need help with an existing product or account issue.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief reason for the transfer"},
            },
        },
    },
    "to_sales": {
        "type": "function",
        "name": "transfer_to_sales",
        "description": "Transfer the caller to the sales team. Use for pricing, demos, new business, or purchasing.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief reason for the transfer"},
            },
        },
    },
    "to_technical": {
        "type": "function",
        "name": "transfer_to_technical",
        "description": "Transfer the caller to the technical/engineering team for complex technical issues.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief reason for the transfer"},
            },
        },
    },
    "to_escalation": {
        "type": "function",
        "name": "transfer_to_escalation",
        "description": "Escalate the caller to a supervisor or human escalation queue.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief reason for escalation"},
            },
        },
    },
    "to_scheduling": {
        "type": "function",
        "name": "transfer_to_scheduling",
        "description": "Transfer the caller to schedule an appointment or callback.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Scheduling request details"},
            },
        },
    },
    "to_receptionist": {
        "type": "function",
        "name": "transfer_to_receptionist",
        "description": "Return the caller to the main receptionist.",
        "parameters": {"type": "object", "properties": {}},
    },
    "lookup_customer": {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up the current caller in the CRM by phone number.",
        "parameters": {"type": "object", "properties": {}},
    },
}


def get_default_instructions(agent_name: str) -> str:
    factory = _AGENT_CLASSES.get(agent_name, ReceptionistAgent)
    return factory().instructions


def get_default_function_tools(agent_name: str) -> list[str]:
    return list(DEFAULT_FUNCTION_TOOLS.get(agent_name, []))


def list_function_tool_catalog() -> list[dict[str, str]]:
    return [
        {"id": tool_id, "label": _FUNCTION_TOOL_LABELS.get(tool_id, tool_id)}
        for tool_id in sorted(_FUNCTION_TOOL_LABELS)
    ]


def resolve_handoff_target(function_name: str) -> str | None:
    return _VOICE_HANDOFF_TARGETS.get(function_name)


def build_voice_function_tools(agent_name: str, enabled: list[str]) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    for tool_id in enabled:
        schema = _VOICE_FUNCTION_SCHEMAS.get(tool_id)
        if schema:
            tools.append(dict(schema))
    return tools