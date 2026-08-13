"""Single source of truth for system agent templates."""

from __future__ import annotations

TEMPLATE_IDS: frozenset[str] = frozenset(
    {"receptionist", "banking_support", "support", "sales", "technical", "escalation"}
)

TEMPLATE_LABELS: dict[str, str] = {
    "receptionist": "Recepción",
    "banking_support": "Soporte bancario BAC",
    "support": "Soporte general",
    "sales": "Ventas",
    "technical": "Técnico",
    "escalation": "Escalación",
}


def is_valid_template(name: str | None) -> bool:
    return bool(name) and name in TEMPLATE_IDS


def normalize_template(name: str | None, *, default: str = "receptionist") -> str:
    value = (name or "").strip().lower()
    if value in TEMPLATE_IDS:
        return value
    return default
