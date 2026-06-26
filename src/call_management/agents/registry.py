"""Agent registry: default instructions, routing tools, and voice function schemas."""

from __future__ import annotations

from typing import Any

from call_management.agents import (
    BankingSupportAgent,
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
    "banking_support": BankingSupportAgent,
}

# Handoff / CRM function tools available per agent (LiveKit @function_tool names)
DEFAULT_FUNCTION_TOOLS: dict[str, list[str]] = {
    "receptionist": [
        "to_support",
        "to_sales",
        "to_technical",
        "to_scheduling",
        "to_escalation",
        "to_banking_support",
        "lookup_customer",
        "update_customer_name",
        "add_call_note",
    ],
    "banking_support": [
        "lookup_customer",
        "verify_bac_account",
        "verify_debit_card",
        "block_debit_card",
        "get_account_summary",
        "add_call_note",
        "to_escalation",
        "to_receptionist",
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
    "to_banking_support": "Transferir a Soporte bancario",
    "lookup_customer": "Buscar cliente en CRM",
    "verify_bac_account": "Verificar cuenta BAC",
    "verify_debit_card": "Verificar tarjeta débito",
    "block_debit_card": "Bloquear tarjeta débito",
    "get_account_summary": "Resumen de productos bancarios",
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
    "to_banking_support": "banking_support",
    "transfer_to_support": "support",
    "transfer_to_sales": "sales",
    "transfer_to_technical": "technical",
    "transfer_to_escalation": "escalation",
    "transfer_to_receptionist": "receptionist",
    "transfer_to_banking_support": "banking_support",
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
    "to_banking_support": {
        "type": "function",
        "name": "transfer_to_banking_support",
        "description": "Transfer to BAC banking support for accounts, debit/credit cards, and transfers.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief banking issue description"},
            },
        },
    },
    "lookup_customer": {
        "type": "function",
        "name": "lookup_customer",
        "description": "Look up the current caller in the CRM by phone number.",
        "parameters": {"type": "object", "properties": {}},
    },
    "update_customer_name": {
        "type": "function",
        "name": "update_customer_name",
        "description": "Update the caller's name in the CRM.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Customer full name"},
            },
            "required": ["name"],
        },
    },
    "add_call_note": {
        "type": "function",
        "name": "add_call_note",
        "description": "Add a note about this call to the customer's CRM record.",
        "parameters": {
            "type": "object",
            "properties": {
                "note": {"type": "string", "description": "Note text to save"},
            },
            "required": ["note"],
        },
    },
    "schedule_appointment": {
        "type": "function",
        "name": "schedule_appointment",
        "description": "Schedule an appointment or callback for the caller.",
        "parameters": {
            "type": "object",
            "properties": {
                "scheduled_time": {"type": "string", "description": "ISO datetime for the appointment"},
                "purpose": {"type": "string", "description": "Reason for the appointment"},
            },
            "required": ["scheduled_time"],
        },
    },
    "escalate_to_human": {
        "type": "function",
        "name": "escalate_to_human",
        "description": "Escalate the call to a human agent when the caller requests it.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for escalation"},
            },
        },
    },
    "end_call_gracefully": {
        "type": "function",
        "name": "end_call_gracefully",
        "description": "End the call politely after resolving the caller's request.",
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {"type": "string", "description": "Brief call summary"},
            },
        },
    },
    "verify_bac_account": {
        "type": "function",
        "name": "verify_bac_account",
        "description": "Verify the last 4 digits of the caller's BAC account number.",
        "parameters": {
            "type": "object",
            "properties": {
                "account_last_four": {"type": "string", "description": "Last 4 digits of BAC account"},
            },
            "required": ["account_last_four"],
        },
    },
    "verify_debit_card": {
        "type": "function",
        "name": "verify_debit_card",
        "description": "Verify debit card last 4 digits and optional expiry MM/YYYY.",
        "parameters": {
            "type": "object",
            "properties": {
                "card_last_four": {"type": "string", "description": "Last 4 digits of debit card"},
                "expiry": {"type": "string", "description": "Expiry MM/YYYY or empty"},
            },
            "required": ["card_last_four"],
        },
    },
    "block_debit_card": {
        "type": "function",
        "name": "block_debit_card_temporarily",
        "description": "Temporarily block the caller's debit card for fraud or loss.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Reason for temporary block"},
            },
            "required": ["reason"],
        },
    },
    "get_account_summary": {
        "type": "function",
        "name": "get_account_summary",
        "description": "Return a summary of the caller's banking products after lookup.",
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