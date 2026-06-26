#!/usr/bin/env python3
"""Seed a full demo tenant with agents, phone routes, and business hours.

Usage:
  uv run python scripts/seed_demo_company.py
  DEMO_PHONE_RECEPCION=+50212345678 uv run python scripts/seed_demo_company.py
"""

from __future__ import annotations

import os
import sys

from call_management.tenancy.platform_store import get_platform_store, reset_platform_store

DEMO_SLUG = os.getenv("DEMO_TENANT_SLUG", "cafe-central")
DEMO_NAME = os.getenv("DEMO_TENANT_NAME", "Café Central (demo)")


def _phone(env_key: str, fallback: str) -> str | None:
    raw = os.getenv(env_key, "").strip()
    return raw or fallback


def main() -> int:
    reset_platform_store()
    store = get_platform_store()
    store.initialize()

    existing = next((t for t in store.list_tenants() if t.slug == DEMO_SLUG), None)
    if existing:
        tenant = existing
        print(f"Reusing empresa existente: {tenant.name} ({tenant.id})")
        for agent in store.list_agents(tenant.id):
            store.delete_agent(agent.id)
    else:
        tenant = store.create_tenant(
            slug=DEMO_SLUG,
            name=DEMO_NAME,
            brand_color="#d97706",
            max_agents=10,
            max_calls_per_day=500,
            timezone="America/Guatemala",
        )
        print(f"Empresa creada: {tenant.name} ({tenant.slug})")

    phone_recepcion = _phone("DEMO_PHONE_RECEPCION", "+15550100001")
    phone_ventas = _phone("DEMO_PHONE_VENTAS", "+15550100002")
    phone_soporte = _phone("DEMO_PHONE_SOPORTE", "+15550100003")

    recepcion = store.create_agent(
        tenant.id,
        slug="recepcion",
        display_name="Recepción Café Central",
        template_id="receptionist",
        status="active",
        phone_number=phone_recepcion,
        voice="ara",
        locale="es",
        brand_name="Café Central",
        custom_instructions=(
            "Eres la recepcionista de Café Central, una cafetería en Guatemala. "
            "Saluda con calidez, pregunta en qué puedes ayudar y enruta a ventas o soporte. "
            "No inventes datos del cliente; pide el teléfono si necesitas buscar su cuenta."
        ),
    )

    ventas = store.create_agent(
        tenant.id,
        slug="ventas",
        display_name="Ventas Café Central",
        template_id="sales",
        status="active",
        phone_number=phone_ventas,
        voice="rex",
        locale="es",
        brand_name="Café Central",
        custom_instructions=(
            "Ofrece combos, membresías y pedidos corporativos. "
            "Menciona que hay promoción de desayuno hasta las 11:00."
        ),
    )

    soporte = store.create_agent(
        tenant.id,
        slug="soporte",
        display_name="Soporte Café Central",
        template_id="support",
        status="active",
        phone_number=phone_soporte,
        voice="sal",
        locale="es",
        brand_name="Café Central",
        custom_instructions=(
            "Ayuda con quejas, reembolsos y citas de mantenimiento de equipos. "
            "Confirma siempre el número de teléfono del cliente antes de buscar en el sistema."
        ),
    )

    weekday_hours = [
        {"day_of_week": d, "start_time": "08:00", "end_time": "18:00", "timezone": "America/Guatemala"}
        for d in range(1, 6)
    ]
    saturday = [{"day_of_week": 6, "start_time": "09:00", "end_time": "13:00", "timezone": "America/Guatemala"}]

    for agent in (recepcion, ventas, soporte):
        store.set_schedules(agent.id, weekday_hours + saturday)

    print("\n=== Demo listo ===")
    print(f"Empresa: {tenant.name} (slug={tenant.slug}, id={tenant.id})")
    print("Agentes:")
    for agent in (recepcion, ventas, soporte):
        route = store.resolve_phone(agent.phone_number or "")
        print(
            f"  - {agent.display_name} [{agent.status}] "
            f"plantilla={agent.template_id} voz={agent.voice} "
            f"tel={agent.phone_number} ruta={'OK' if route else 'sin ruta'}"
        )
    print("\nHorario: Lun–Vie 08:00–18:00, Sáb 09:00–13:00 (America/Guatemala)")
    print("\nEn el admin:")
    print("  1. Empresas → Gestionar en Café Central")
    print("  2. Mis agentes → revisar los 3 agentes y horarios")
    print("  3. Playground → elegir agente y probar voz")
    print("\nLlamada real desde celular:")
    print("  - Configura SIP trunk en LiveKit + DID real")
    print("  - Asigna el DID al campo teléfono del agente")
    print("  - Ejecuta el worker: uv run -m call_management.server start")
    print("  - Marca el DID desde tu celular")
    return 0


if __name__ == "__main__":
    sys.exit(main())