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
                "account_masked": f"****{b.account_number[-4:]}",
                "account_type": b.account_type,
                "debit_card_masked": b.debit_card_masked,
                "debit_card_exp": b.debit_card_exp,
                "credit_card_masked": b.credit_card_masked,
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
    return ". ".join(lines) + "."