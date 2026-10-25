"""Demo banking customer profiles for BAC Credomatic support scenarios."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class BankingProfile:
    institution: str
    account_number: str
    account_type: str
    debit_card_masked: str
    debit_card_last4: str
    debit_card_exp: str
    credit_card_masked: str | None = None
    credit_card_last4: str | None = None
    credit_card_exp: str | None = None
    products: tuple[str, ...] = ()
    branch: str = ""


@dataclass(frozen=True)
class DemoCustomer:
    phone_number: str
    name: str
    email: str
    vip: bool
    notes: str
    banking: BankingProfile


def normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return phone.strip()
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if len(digits) == 8:
        return f"+505{digits}"
    if phone.strip().startswith("+"):
        return f"+{digits}"
    return f"+{digits}"


_INVALID_PHONE_WORDS = frozenset(
    {"unknown", "anonymous", "restricted", "private", "unavailable", "withheld", "null", "none"}
)

# 13–19 digit PANs, grouped or contiguous, plus an expiry only when it sits on that PAN.
_PAN_WITH_EXPIRY = re.compile(
    r"(?<!\d)"
    r"(?P<pan>(?:\d{4}[ \t-]+){3}\d{1,7}|\d{13,19})"
    r"(?!\d)"
    r"(?:[ \t]*\([ \t]*vence[ \t]+\d{1,2}[/-]\d{4}[ \t]*\))?",
    re.IGNORECASE,
)
# Account-length runs. A leading + keeps E.164 phones intact.
_BARE_ACCOUNT = re.compile(r"(?<![+\d])\d{8,12}(?!\d)")


def mask_last4(raw: str | None) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) < 4:
        return "****"
    return f"****{digits[-4:]}"


def redact_customer_notes(text: str | None) -> str | None:
    """Mask full account numbers and full PANs. Drop an expiry only when it follows a full PAN."""
    if text is None:
        return None
    if not text:
        return text

    def _pan(match: re.Match[str]) -> str:
        return mask_last4(match.group("pan"))

    redacted = _PAN_WITH_EXPIRY.sub(_pan, text)
    redacted = _BARE_ACCOUNT.sub(lambda match: mask_last4(match.group(0)), redacted)
    return redacted


def is_valid_customer_phone(phone: str | None) -> bool:
    """True when the admin list may show this value as a phone number."""
    raw = (phone or "").strip()
    if not raw or raw.lower() in _INVALID_PHONE_WORDS:
        return False
    if re.search(r"[A-Za-z]", raw):
        return False
    digits = re.sub(r"\D", "", raw)
    return 10 <= len(digits) <= 15


DEMO_CUSTOMERS: list[DemoCustomer] = [
    DemoCustomer(
        phone_number="+15103750043",
        name="Reynaldo Garcia",
        email="reynaldo.garcia@email.com",
        vip=True,
        notes=(
            "Cliente BAC California. Prefiere español. "
            "Última consulta: bloqueo temporal de tarjeta por compra sospechosa."
        ),
        banking=BankingProfile(
            institution="BAC Credomatic",
            account_number="359798493",
            account_type="Cuenta de ahorro",
            debit_card_masked="5470 5195 2639 3094",
            debit_card_last4="3094",
            debit_card_exp="10/2026",
            products=("cuenta de ahorro BAC", "tarjeta débito Visa"),
            branch="Oakland, CA",
        ),
    ),
    DemoCustomer(
        phone_number="+50588860156",
        name="Francisco Galeano",
        email="francisco.galeano@email.com",
        vip=False,
        notes=(
            "Cliente BAC Nicaragua. Consultas frecuentes sobre límites de transferencia "
            "y activación de tarjeta de crédito."
        ),
        banking=BankingProfile(
            institution="BAC Credomatic Nicaragua",
            account_number="4827156093",
            account_type="Cuenta corriente",
            debit_card_masked="4532 8810 2241 5587",
            debit_card_last4="5587",
            debit_card_exp="03/2027",
            credit_card_masked="5412 0034 8891 4421",
            credit_card_last4="4421",
            credit_card_exp="08/2028",
            products=("cuenta corriente", "tarjeta débito Mastercard", "tarjeta crédito Gold"),
            branch="Managua",
        ),
    ),
]

_BY_PHONE: dict[str, DemoCustomer] = {c.phone_number: c for c in DEMO_CUSTOMERS}


def get_demo_customer(phone_number: str) -> DemoCustomer | None:
    return _BY_PHONE.get(normalize_phone(phone_number))


def demo_customers_payload() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for customer in DEMO_CUSTOMERS:
        b = customer.banking
        rows.append(
            {
                "phone_number": customer.phone_number,
                "name": customer.name,
                "email": customer.email,
                "vip": customer.vip,
                "institution": b.institution,
                "account_masked": mask_last4(b.account_number),
                "account_type": b.account_type,
                "debit_card_masked": mask_last4(b.debit_card_masked),
                "debit_card_exp": b.debit_card_exp,
                "credit_card_masked": mask_last4(b.credit_card_masked) if b.credit_card_masked else None,
                "products": list(b.products),
                "hint": "Pide al agente verificar tu cuenta o tarjeta para ver las tools en acción.",
            }
        )
    return rows


def format_customer_lookup(customer: DemoCustomer) -> str:
    b = customer.banking
    lines = [
        f"Cliente: {customer.name}",
        f"Teléfono: {customer.phone_number}",
        f"Email: {customer.email}",
        f"VIP: {'sí' if customer.vip else 'no'}",
        f"Banco: {b.institution}",
        f"Cuenta BAC: {b.account_number} ({b.account_type})",
        f"Tarjeta débito: {b.debit_card_masked} (vence {b.debit_card_exp})",
    ]
    if b.credit_card_masked:
        lines.append(f"Tarjeta crédito: {b.credit_card_masked} (vence {b.credit_card_exp})")
    if b.products:
        lines.append(f"Productos: {', '.join(b.products)}")
    if customer.notes:
        lines.append(f"Notas: {customer.notes}")
    return redact_customer_notes(". ".join(lines) + ".") or ""