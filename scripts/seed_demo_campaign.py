#!/usr/bin/env python3
"""Seed one sales campaign on Empresa principal and run a simulated pass.

The pass uses a recording dialer, so no phone call is placed.
Re-running the script leaves an existing campaign as it is.

Usage:
  uv run python scripts/seed_demo_campaign.py
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from zoneinfo import ZoneInfo

from call_management.campaigns.dialer import DialRequest, set_campaign_dialer
from call_management.campaigns.service import (
    CampaignError,
    create_campaign,
    list_campaigns,
    record_sales_meeting,
    run_campaign_pass,
)
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store

DEMO_NAME = "Campaña demo de ventas"
DEMO_CONTACTS = [
    {"phone": "+15550101001", "name": "Ana Ruiz", "may_call": True, "do_not_call": False},
    {"phone": "+15550101002", "name": "Luis Pérez", "may_call": True, "do_not_call": False},
    {"phone": "+15550101003", "name": "Cliente no llamar", "may_call": False, "do_not_call": True},
]


class RecordingDialer:
    def __init__(self) -> None:
        self.calls: list[DialRequest] = []

    async def __call__(self, request: DialRequest) -> None:
        self.calls.append(request)


async def main() -> None:
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    existing = await list_campaigns(crm)
    found = next((item for item in existing["items"] if item["name"] == DEMO_NAME), None)
    if found:
        print(f"Ya existe: {found['name']} ({found['id']})")
        print(f"Totales: {found['totals']}")
        return

    created = await create_campaign(
        crm,
        name=DEMO_NAME,
        agent="sales",
        window_start="00:00",
        window_end="23:59",
        timezone="America/Guatemala",
        pace=2,
        max_attempts=1,
        contacts=DEMO_CONTACTS,
    )
    dialer = RecordingDialer()
    set_campaign_dialer(dialer)
    try:
        try:
            await run_campaign_pass(
                crm,
                created["id"],
                tenant_id=tenant.id,
                at=datetime.now(ZoneInfo("America/Guatemala")),
            )
            raise SystemExit("La pasada debió rechazarse sin troncal de salida")
        except CampaignError as exc:
            print(f"Sin troncal: {exc.message}")

        at = datetime(2026, 10, 31, 10, 0, tzinfo=ZoneInfo("America/Guatemala"))
        passed = await run_campaign_pass(
            crm,
            created["id"],
            tenant_id=tenant.id,
            at=at,
            trunk_id="demo-sin-red",
        )
    finally:
        set_campaign_dialer(None)

    phones = [call.phone for call in dialer.calls]
    if phones != ["+15550101001", "+15550101002"]:
        raise SystemExit(f"Números marcados inesperados: {phones}")
    ana = next(row for row in passed["attempts"] if row["phone"] == "+15550101001")
    finished = await record_sales_meeting(
        crm,
        created["id"],
        ana["id"],
        preferred_time="2026-11-03T15:00:00-06:00",
        qualification={"company": "Café Norte", "role": "Compras", "interest": "Plan mensual"},
    )
    totals = finished["totals"]
    expected = {"pending": 0, "dialed": 2, "skipped": 1, "meeting": 1}
    if totals != expected:
        raise SystemExit(f"Totales inesperados: {totals}")
    print(f"Empresa: {tenant.name}")
    print(f"Campaña: {finished['name']} ({finished['id']})")
    print(f"Marcados (simulado, sin red): {', '.join(phones)}")
    print(f"Omitido: +15550101003")
    print(f"Reunión: Ana Ruiz el 2026-11-03 15:00")
    print(f"Totales: {totals}")


if __name__ == "__main__":
    asyncio.run(main())
