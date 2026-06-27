#!/usr/bin/env python3
"""Seed demo tenants with agents, phone routes, and business hours.

Usage:
  uv run python scripts/seed_demo_company.py
  uv run python scripts/seed_demo_company.py --no-reset
  DEMO_PHONE_RECEPCION=+50212345678 uv run python scripts/seed_demo_company.py
"""

from __future__ import annotations

import argparse
import os
import sys

from call_management.tenancy.platform_store import get_platform_store, reset_platform_store

CAFE_SLUG = os.getenv("DEMO_TENANT_SLUG", "cafe-central")
CAFE_NAME = os.getenv("DEMO_TENANT_NAME", "Café Central (demo)")
US_SLUG = os.getenv("US_TENANT_SLUG", "call-management-us")
US_NAME = os.getenv("US_TENANT_NAME", "Call Management US (demo)")
US_MAIN_PHONE = os.getenv("DEMO_US_PHONE", "+15109379101")


def _phone(env_key: str, fallback: str | None) -> str | None:
    raw = os.getenv(env_key, "").strip()
    return raw or fallback


def _weekday_hours(tz: str) -> list[dict]:
    base = [
        {"day_of_week": d, "start_time": "08:00", "end_time": "18:00", "timezone": tz}
        for d in range(1, 6)
    ]
    base.append({"day_of_week": 6, "start_time": "09:00", "end_time": "13:00", "timezone": tz})
    return base


def _us_weekday_hours() -> list[dict]:
    base = [
        {"day_of_week": d, "start_time": "09:00", "end_time": "17:00", "timezone": "America/Los_Angeles"}
        for d in range(1, 6)
    ]
    return base


def _ensure_tenant(store, *, slug: str, name: str, brand_color: str, timezone: str, wipe_agents: bool):
    existing = next((t for t in store.list_tenants() if t.slug == slug), None)
    if existing:
        tenant = existing
        print(f"Reusing empresa: {tenant.name} ({tenant.id})")
        if wipe_agents:
            for agent in store.list_agents(tenant.id):
                store.delete_agent(agent.id)
        return tenant
    tenant = store.create_tenant(
        slug=slug,
        name=name,
        brand_color=brand_color,
        max_agents=12,
        max_calls_per_day=500,
        timezone=timezone,
    )
    print(f"Empresa creada: {tenant.name} ({tenant.slug})")
    return tenant


def seed_cafe_central(store, *, wipe_agents: bool) -> None:
    tenant = _ensure_tenant(
        store,
        slug=CAFE_SLUG,
        name=CAFE_NAME,
        brand_color="#d97706",
        timezone="America/Guatemala",
        wipe_agents=wipe_agents,
    )
    specs = [
        ("recepcion", "Recepción Café Central", "receptionist", "+15550100001", "ara", "active",
         "Saluda con calidez y enruta a ventas o soporte."),
        ("ventas", "Ventas Café Central", "sales", "+15550100002", "rex", "active",
         "Ofrece combos y pedidos corporativos."),
        ("soporte", "Soporte Café Central", "support", "+15550100003", "sal", "active",
         "Ayuda con quejas y reembolsos."),
        ("tecnico", "Técnico Café Central", "technical", "+15550100004", "eve", "active",
         "Diagnóstico de equipos y pedidos de mantenimiento."),
        ("escalacion", "Escalación Café Central", "escalation", None, "leo", "paused",
         "Solo transferencias urgentes; sin DID propio."),
    ]
    created = []
    existing_slugs = {a.slug for a in store.list_agents(tenant.id)}
    for slug, name, template, phone, voice, status, instructions in specs:
        if slug in existing_slugs:
            print(f"  omitido (ya existe): {slug}")
            continue
        agent = store.create_agent(
            tenant.id,
            slug=slug,
            display_name=name,
            template_id=template,
            status=status,
            phone_number=phone,
            voice=voice,
            locale="es",
            brand_name="Café Central",
            custom_instructions=instructions,
        )
        if status == "active" and phone:
            store.set_schedules(agent.id, _weekday_hours("America/Guatemala"))
        created.append(agent)

    print(f"  {len(created)} agentes en {tenant.name}")


def _find_us_tenant(store):
    route = store.resolve_phone(US_MAIN_PHONE)
    if route:
        tenant = store.get_tenant(route.tenant_id)
        if tenant:
            print(f"Reusing empresa con {US_MAIN_PHONE}: {tenant.name} ({tenant.id})")
            return tenant
    return next((t for t in store.list_tenants() if t.slug == US_SLUG), None)


def seed_us_company(store, *, wipe_agents: bool) -> None:
    existing_us = _find_us_tenant(store)
    if existing_us:
        tenant = existing_us
        if wipe_agents:
            for agent in store.list_agents(tenant.id):
                store.delete_agent(agent.id)
    else:
        tenant = _ensure_tenant(
            store,
            slug=US_SLUG,
            name=US_NAME,
            brand_color="#06b6d4",
            timezone="America/Los_Angeles",
            wipe_agents=wipe_agents,
        )
    specs = [
        ("recepcion-us", "Recepción US", "receptionist", None, "ara", "active",
         "Recepción en inglés/español para llamadas al DID principal."),
        ("ventas-us", "Ventas US", "sales", "+15550100011", "rex", "active",
         "Demos del producto y planes enterprise."),
        ("soporte-us", "Soporte US", "support", "+15550100012", "sal", "active",
         "Tickets, estado de cuenta y seguimiento."),
        ("banca-us", "Banca US", "banking_support", "+15550100013", "eve", "active",
         "Soporte bancario demo BAC Credomatic."),
        ("tecnico-us", "Técnico US", "technical", "+15550100014", "leo", "draft",
         "Integraciones API — borrador sin DID."),
    ]
    created = []
    existing_slugs = {a.slug for a in store.list_agents(tenant.id)}
    used_phones = {r.phone_number for r in store.list_tenant_phone_routes(tenant.id)}
    for slug, name, template, phone, voice, status, instructions in specs:
        if slug in existing_slugs:
            print(f"  omitido (ya existe): {slug}")
            continue
        assign_phone = phone
        if slug == "recepcion-us" and not assign_phone and US_MAIN_PHONE not in used_phones:
            assign_phone = US_MAIN_PHONE
        if assign_phone and assign_phone in used_phones:
            print(f"  omitido {slug}: teléfono {assign_phone} ya en uso")
            continue
        agent = store.create_agent(
            tenant.id,
            slug=slug,
            display_name=name,
            template_id=template,
            status=status,
            phone_number=assign_phone,
            voice=voice,
            locale="en",
            brand_name="Call Management",
            custom_instructions=instructions,
        )
        if assign_phone:
            used_phones.add(assign_phone)
        if status == "active" and assign_phone:
            store.set_schedules(agent.id, _us_weekday_hours())
        created.append(agent)

    print(f"  {len(created)} agentes en {tenant.name}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed demo companies and agents")
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="No borrar platform.db; actualizar empresas demo in-place",
    )
    args = parser.parse_args()

    if not args.no_reset:
        reset_platform_store()
    store = get_platform_store()
    store.initialize()

    print("=== Sembrando empresas demo ===")
    seed_cafe_central(store, wipe_agents=not args.no_reset)
    seed_us_company(store, wipe_agents=not args.no_reset)

    print("\n=== Listo ===")
    print("Café Central: 5 agentes (recepción, ventas, soporte, técnico, escalación)")
    print("Call Management US: 5 agentes (recepción PSTN, ventas, soporte, banca, técnico borrador)")
    print(f"DID producción US (si existe en LiveKit): {US_MAIN_PHONE}")
    print("\nDispatch rule LiveKit: se crea automáticamente al guardar agente con DID del proyecto.")
    print("Manual: uv run python scripts/setup_livekit_inbound.py --phone +DID --livekit-phone-number")
    return 0


if __name__ == "__main__":
    sys.exit(main())