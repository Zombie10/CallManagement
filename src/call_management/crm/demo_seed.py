"""Seed demo CRM customers (idempotent)."""

from __future__ import annotations

from call_management.crm.banking_data import DEMO_CUSTOMERS, format_customer_lookup
from call_management.crm.database import Customer, get_crm


async def seed_demo_customers(tenant_id: str | None = None) -> int:
    """Upsert demo banking customers. Returns number of records touched."""
    if tenant_id:
        from call_management.tenancy.context import resolve_crm_for_tenant

        crm = await resolve_crm_for_tenant(tenant_id)
    else:
        crm = await get_crm()
    count = 0
    for demo in DEMO_CUSTOMERS:
        customer = await crm.get_or_create_customer(demo.phone_number)
        customer.name = demo.name
        customer.email = demo.email
        customer.vip = demo.vip
        customer.notes = format_customer_lookup(demo)
        await crm.update_customer(customer)
        count += 1
    return count