"""Tenant-scoped public REST API authenticated via API keys."""

from __future__ import annotations

import hashlib
import secrets
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from call_management.crm.database import Appointment
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.tenancy.webhooks import emit_event

router = APIRouter(prefix="/api/public/v1", tags=["public-api"])

API_SCOPES = frozenset(
    {
        "calls.read",
        "customers.read",
        "appointments.read",
        "appointments.write",
    }
)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


class ApiKeyCreatePayload(BaseModel):
    name: str
    scopes: list[str] = Field(default_factory=lambda: ["calls.read", "customers.read"])


class PublicAppointmentCreate(BaseModel):
    customer_phone: str
    scheduled_time: str
    purpose: str
    notes: str | None = None


class PublicAppointmentUpdate(BaseModel):
    scheduled_time: str | None = None
    purpose: str | None = None
    notes: str | None = None


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
) -> dict[str, Any]:
    raw = x_api_key or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not raw or not raw.startswith("cmk_"):
        raise HTTPException(status_code=401, detail="API key requerida (X-Api-Key)")
    store = get_platform_store()
    record = store.get_api_key_by_hash(_hash_key(raw))
    if not record:
        raise HTTPException(status_code=401, detail="API key inválida")
    store.touch_api_key(record["id"])
    return record


def _require_scope(ctx: dict[str, Any], scope: str) -> None:
    scopes = set(ctx.get("scopes") or [])
    if scope not in scopes:
        raise HTTPException(status_code=403, detail=f"Scope requerido: {scope}")


@router.get("/calls")
async def public_list_calls(
    limit: int = 50,
    offset: int = 0,
    ctx: dict = Depends(require_api_key),
):
    _require_scope(ctx, "calls.read")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    return await crm.list_call_records(limit=min(limit, 200), offset=offset)


@router.get("/calls/{call_id}")
async def public_get_call(call_id: str, ctx: dict = Depends(require_api_key)):
    _require_scope(ctx, "calls.read")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    row = await crm.get_call_record_row(call_id)
    if not row:
        raise HTTPException(status_code=404, detail="Llamada no encontrada")
    return row


@router.get("/customers")
async def public_list_customers(
    limit: int = 50,
    offset: int = 0,
    ctx: dict = Depends(require_api_key),
):
    _require_scope(ctx, "customers.read")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    return await crm.list_customers(limit=min(limit, 200), offset=offset)


@router.get("/customers/{phone}")
async def public_customer_profile(phone: str, ctx: dict = Depends(require_api_key)):
    _require_scope(ctx, "customers.read")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    profile = await crm.get_customer_profile(phone)
    if not profile:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return profile


@router.get("/appointments")
async def public_list_appointments(
    limit: int = 50,
    offset: int = 0,
    ctx: dict = Depends(require_api_key),
):
    _require_scope(ctx, "appointments.read")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    return await crm.list_appointments(limit=min(limit, 200), offset=offset)


@router.post("/appointments")
async def public_create_appointment(payload: PublicAppointmentCreate, ctx: dict = Depends(require_api_key)):
    _require_scope(ctx, "appointments.write")
    crm = await resolve_crm_for_tenant(ctx["tenant_id"])
    await crm.get_or_create_customer(payload.customer_phone)
    appt = Appointment(
        customer_phone=payload.customer_phone,
        scheduled_time=payload.scheduled_time,
        purpose=payload.purpose,
        notes=payload.notes,
    )
    appt_id = await crm.create_appointment(appt)
    await emit_event(
        ctx["tenant_id"],
        "appointment.created",
        {
            "id": appt_id,
            "customer_phone": payload.customer_phone,
            "scheduled_time": payload.scheduled_time,
            "purpose": payload.purpose,
        },
    )
    return {"id": appt_id, **payload.model_dump()}