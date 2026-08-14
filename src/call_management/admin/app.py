"""FastAPI admin application for Call Management."""

from __future__ import annotations

import os

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from call_management.admin.auth_middleware import AdminAuthMiddleware
from call_management.admin.auth_routes import router as auth_router
from call_management.admin.auth_store import ensure_bootstrap_user
from call_management.admin.chat_runner import get_chat_manager
from call_management.admin.livekit_playground import livekit_playground_ready
from call_management.admin.call_records import (
    get_call_for_tenant,
    list_calls_for_tenant,
    stream_call_recording,
    upload_call_recording,
)
from call_management.admin.env_store import PROJECT_ROOT, load_settings, save_settings
from call_management.admin.public_api import router as public_api_router
from call_management.admin.schemas import (
    AgentProfilePayload,
    ApiKeyCreate,
    AppointmentCreate,
    AppointmentUpdate,
    VoicePreviewPayload,
    CustomerCreate,
    CustomerUpdate,
    SettingsUpdate,
)
from call_management.admin.tenant_deps import require_super_admin, require_tenant_context, scoped_playground_context
from call_management.admin.playground_routes import router as playground_router
from call_management.admin.tenant_routes import router as tenant_router
from call_management.agent_store import delete_profile, get_catalog, load_profiles, upsert_profile
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.migrate import migrate_legacy_crm_if_needed
from call_management.tenancy.platform_store import get_platform_store
from call_management.agents.registry import get_default_instructions
from call_management.config import get_model_config
from call_management.crm.database import Appointment, Customer
from call_management.tenancy.webhooks import emit_event, WEBHOOK_EVENTS
from call_management.xai.mcp import load_remote_mcp_config

ADMIN_UI_DIST = PROJECT_ROOT / "admin-ui" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_bootstrap_user()
    get_platform_store()
    migrate_legacy_crm_if_needed()
    from call_management.crm.demo_seed import seed_demo_customers

    default_tenant = get_platform_store().ensure_default_tenant()
    await resolve_crm_for_tenant(default_tenant.id)
    await seed_demo_customers(tenant_id=default_tenant.id)
    yield


app = FastAPI(
    title="Call Management Admin",
    description="Web console for system configuration and CRM",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ADMIN_CORS_ORIGINS", "http://127.0.0.1:8080,http://localhost:8080").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AdminAuthMiddleware)
app.include_router(auth_router)
app.include_router(tenant_router)
app.include_router(public_api_router)
app.include_router(playground_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "call-management-admin"}


@app.get("/api/demo/customers")
async def list_demo_customers():
    from call_management.crm.banking_data import demo_customers_payload

    return {"customers": demo_customers_payload()}


@app.get("/api/dashboard")
async def dashboard(ctx=Depends(require_tenant_context)):
    from call_management.admin.chat_runner import get_chat_manager
    from call_management.admin.livekit_playground import livekit_playground_ready
    from call_management.recordings.livekit_egress import egress_configured
    from call_management.tenancy.queue import active_count, global_active, supervisor_snapshot

    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    stats = await crm.get_dashboard_stats()
    analytics = await crm.get_call_analytics(days=14)
    actionable = await crm.get_actionable_analytics()
    tenant_metrics = get_platform_store().tenant_metrics(ctx.tenant.id)
    cfg = get_model_config()
    mcp = load_remote_mcp_config()
    chat_status = get_chat_manager().status()
    lk_ready, lk_issues = livekit_playground_ready()
    store = get_platform_store()
    supervisor = supervisor_snapshot(
        ctx.tenant.id,
        agents=store.list_agents(ctx.tenant.id),
        phone_routes=store.list_tenant_phone_routes(ctx.tenant.id),
    )
    return {
        "stats": stats,
        "analytics": analytics,
        "actionable": actionable,
        "tenant": {
            "id": ctx.tenant.id,
            "name": ctx.tenant.name,
            "brand_color": ctx.tenant.brand_color,
            "logo_url": ctx.tenant.logo_url,
            "metrics": tenant_metrics,
        },
        "runtime": {
            "provider": cfg.provider,
            "grok_realtime": cfg.use_grok_realtime,
            "remote_mcp": mcp.enabled,
            "mcp_servers": len(mcp.servers),
        },
        "worker": {
            "livekit_ready": lk_ready,
            "livekit_issues": lk_issues,
            "xai_voice_ready": chat_status.get("xai_voice_ready", False),
            "requires_worker": chat_status.get("requires_worker", True),
            "active_calls_tenant": active_count(ctx.tenant.id),
            "active_calls_global": global_active(),
        },
        "recordings": {
            "egress_configured": egress_configured(),
            "s3_bucket": os.getenv("RECORDINGS_S3_BUCKET", ""),
            "active_recordings": supervisor.get("recording_calls", 0),
        },
        "supervisor": supervisor,
    }


@app.get("/api/settings")
async def get_settings(_admin=Depends(require_super_admin)):
    return load_settings()


@app.put("/api/settings")
async def put_settings(payload: SettingsUpdate, _admin=Depends(require_super_admin)):
    try:
        return save_settings(payload.values)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _agents_response() -> dict:
    profiles = load_profiles()
    mcp_cfg = load_remote_mcp_config()
    mcp_server_ids = [server.id for server in mcp_cfg.servers]
    return {
        "profiles": [
            {
                **profile.to_dict(),
                "default_instructions": get_default_instructions(profile.name),
                "has_custom_instructions": bool(profile.custom_instructions.strip()),
            }
            for profile in profiles.values()
        ],
        "catalog": get_catalog(),
        "mcp_server_ids": mcp_server_ids,
    }


@app.get("/api/voice/config/{agent_name}")
async def get_voice_agent_config(agent_name: str, request: Request):
    from call_management.agents.runtime import build_runtime_agent, runtime_to_voice_payload

    try:
        ctx = scoped_playground_context(request, tenant_id=None, agent_instance_id=None)
        instance = None
        if ctx.tenant:
            store = get_platform_store()
            matches = [
                a
                for a in store.list_agents(ctx.tenant.id)
                if a.template_id == agent_name
            ]
            instance = next((a for a in matches if a.status == "active"), None) or (
                matches[0] if matches else None
            )
        runtime = build_runtime_agent(instance=instance, template_id=agent_name, for_voice=True)
        return runtime_to_voice_payload(runtime)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/voice/preview")
async def post_voice_preview(payload: VoicePreviewPayload):
    """Synthesize a short MP3 sample so admins can hear a voice + language."""
    from fastapi.responses import Response

    from call_management.xai.voice import synthesize_voice_preview

    try:
        audio = await synthesize_voice_preview(
            voice_id=payload.voice_id,
            language=payload.language,
            text=payload.text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Voice preview failed: {exc}") from exc

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": 'inline; filename="voice-preview.mp3"',
        },
    )


@app.get("/api/agents")
async def get_agents():
    return _agents_response()


@app.post("/api/agents")
async def create_agent(payload: AgentProfilePayload):
    try:
        profile = upsert_profile(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return profile.to_dict()


@app.put("/api/agents/{agent_name}")
async def update_agent(agent_name: str, payload: AgentProfilePayload):
    data = payload.model_dump()
    data["name"] = agent_name
    try:
        profile = upsert_profile(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return profile.to_dict()


@app.delete("/api/agents/{agent_name}")
async def remove_agent(agent_name: str):
    try:
        delete_profile(agent_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deleted": agent_name}


@app.get("/api/customers")
async def list_customers(limit: int = 50, offset: int = 0, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await crm.list_customers(limit=limit, offset=offset)


@app.post("/api/customers")
async def create_customer(payload: CustomerCreate, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    customer = Customer(
        phone_number=payload.phone_number,
        name=payload.name,
        email=payload.email,
        notes=payload.notes,
        vip=payload.vip,
    )
    await crm.update_customer(customer)
    return customer


@app.patch("/api/customers/{phone_number}")
async def update_customer(phone_number: str, payload: CustomerUpdate, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    customer = await crm.get_or_create_customer(phone_number)
    if payload.name is not None:
        customer.name = payload.name
    if payload.email is not None:
        customer.email = payload.email
    if payload.notes is not None:
        customer.notes = payload.notes
    if payload.vip is not None:
        customer.vip = payload.vip
    await crm.update_customer(customer)
    return customer


@app.get("/api/calls")
async def list_calls(limit: int = 50, offset: int = 0, ctx=Depends(require_tenant_context)):
    return await list_calls_for_tenant(ctx, limit=limit, offset=offset)


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, ctx=Depends(require_tenant_context)):
    return await get_call_for_tenant(ctx, call_id)


@app.get("/api/calls/{call_id}/recording")
async def get_call_recording(call_id: str, ctx=Depends(require_tenant_context)):
    return await stream_call_recording(ctx, call_id)


@app.post("/api/calls/{call_id}/recording")
async def post_call_recording(
    call_id: str,
    file: UploadFile = File(...),
    ctx=Depends(require_tenant_context),
):
    return await upload_call_recording(ctx, call_id, file)


@app.get("/api/appointments")
async def list_appointments(limit: int = 50, offset: int = 0, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await crm.list_appointments(limit=limit, offset=offset)


@app.post("/api/appointments")
async def create_appointment(payload: AppointmentCreate, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    await crm.get_or_create_customer(payload.customer_phone)
    appt = Appointment(
        customer_phone=payload.customer_phone,
        scheduled_time=payload.scheduled_time,
        purpose=payload.purpose,
        notes=payload.notes,
    )
    appt_id = await crm.create_appointment(appt)
    await emit_event(
        ctx.tenant.id,
        "appointment.created",
        {
            "id": appt_id,
            "customer_phone": payload.customer_phone,
            "scheduled_time": payload.scheduled_time,
            "purpose": payload.purpose,
        },
    )
    return {"id": appt_id, **payload.model_dump()}


@app.patch("/api/appointments/{appt_id}")
async def update_appointment(
    appt_id: str, payload: AppointmentUpdate, ctx=Depends(require_tenant_context)
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    appt = await crm.get_appointment(appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    if payload.customer_phone is not None:
        appt.customer_phone = payload.customer_phone
    if payload.scheduled_time is not None:
        appt.scheduled_time = payload.scheduled_time
    if payload.purpose is not None:
        appt.purpose = payload.purpose
    if payload.notes is not None:
        appt.notes = payload.notes
    await crm.update_appointment(appt)
    await emit_event(
        ctx.tenant.id,
        "appointment.updated",
        {"id": appt_id, "customer_phone": appt.customer_phone, "scheduled_time": appt.scheduled_time},
    )
    return appt


@app.delete("/api/appointments/{appt_id}")
async def delete_appointment(appt_id: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    appt = await crm.get_appointment(appt_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Cita no encontrada")
    await crm.delete_appointment(appt_id)
    await emit_event(
        ctx.tenant.id,
        "appointment.deleted",
        {"id": appt_id, "customer_phone": appt.customer_phone},
    )
    return {"deleted": appt_id}


@app.get("/api/customers/{phone_number}/profile")
async def customer_profile(phone_number: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    profile = await crm.get_customer_profile(phone_number)
    if not profile:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return profile


@app.get("/api/supervisor")
async def supervisor_panel(ctx=Depends(require_tenant_context)):
    from call_management.recordings.livekit_egress import egress_configured
    from call_management.tenancy.queue import supervisor_snapshot
    from call_management.tenancy.scheduling import agent_schedule_status

    store = get_platform_store()
    agents = store.list_agents(ctx.tenant.id)
    phone_routes = store.list_tenant_phone_routes(ctx.tenant.id)
    snap = supervisor_snapshot(ctx.tenant.id, agents=agents, phone_routes=phone_routes)
    metrics = store.tenant_metrics(ctx.tenant.id)
    agent_limit_map = {a["agent_instance_id"]: a for a in snap.get("agent_limits", [])}
    return {
        **snap,
        "tenant_metrics": metrics,
        "agents": [
            {
                "id": a.id,
                "display_name": a.display_name,
                "status": a.status,
                "schedule_status": agent_schedule_status(a.id),
                "call_count_today": a.call_count_today,
                "max_concurrent_calls": a.max_concurrent_calls,
                "active_calls": agent_limit_map.get(a.id, {}).get("active", 0),
                "at_capacity": agent_limit_map.get(a.id, {}).get("at_capacity", False),
            }
            for a in agents
        ],
        "recordings": {"egress_configured": egress_configured()},
        "alerts": _supervisor_alerts(snap, metrics),
    }


def _supervisor_alerts(snap: dict, metrics: dict) -> list[dict]:
    alerts: list[dict] = []
    if snap.get("at_capacity"):
        alerts.append({"level": "warning", "message": "Cola al límite de llamadas concurrentes"})
    for agent in snap.get("agent_limits", []):
        if agent.get("at_capacity"):
            alerts.append(
                {
                    "level": "warning",
                    "message": f"{agent.get('display_name', 'Agente')} al máximo ({agent.get('active')}/{agent.get('cap')})",
                }
            )
    for route in snap.get("number_limits", []):
        if route.get("at_capacity"):
            alerts.append(
                {
                    "level": "warning",
                    "message": f"Línea {route.get('phone_number')} al máximo ({route.get('active')}/{route.get('cap')})",
                }
            )
    if snap.get("queued_calls", 0) > 0:
        alerts.append(
            {
                "level": "info",
                "message": f"{snap['queued_calls']} llamada(s) en espera",
            }
        )
    if metrics.get("calls_today", 0) >= metrics.get("max_calls_per_day", 1000) * 0.9:
        alerts.append({"level": "warning", "message": "Cerca del límite diario de llamadas"})
    return alerts


@app.get("/api/webhooks/events")
async def webhook_events_catalog():
    return {"events": sorted(WEBHOOK_EVENTS)}


@app.get("/api/export/calls.csv")
async def export_calls_csv(
    date_from: str | None = None,
    date_to: str | None = None,
    outcomes: str | None = None,
    agent_instance_ids: str | None = None,
    channels: str | None = None,
    from_number: str | None = None,
    min_duration: int | None = None,
    max_duration: int | None = None,
    ctx=Depends(require_tenant_context),
):
    from datetime import UTC, datetime

    from fastapi.responses import Response

    from call_management.admin.export_calls import build_calls_csv
    from call_management.crm.reports import CallReportQuery
    from call_management.tenancy.platform_store import get_platform_store

    store = get_platform_store()
    agent_labels = {a.id: a.display_name for a in store.list_agents(ctx.tenant.id)}

    has_filters = any(
        [
            date_from,
            date_to,
            outcomes,
            agent_instance_ids,
            channels,
            from_number,
            min_duration is not None,
            max_duration is not None,
        ]
    )
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    if has_filters:
        query = CallReportQuery(
            date_from=date_from,
            date_to=date_to,
            outcomes=[o.strip() for o in (outcomes or "").split(",") if o.strip()],
            agent_instance_ids=[a.strip() for a in (agent_instance_ids or "").split(",") if a.strip()],
            channels=[c.strip() for c in (channels or "").split(",") if c.strip()],
            from_number=from_number,
            min_duration=min_duration,
            max_duration=max_duration,
        )
        rows = await crm.export_calls_filtered(query, limit=5000)
    else:
        rows = await crm.export_calls_csv_rows()

    content = build_calls_csv(rows, agent_labels=agent_labels)
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    filename = f"llamadas-{ctx.tenant.slug}-{stamp}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/api-keys")
async def list_api_keys(ctx=Depends(require_tenant_context)):
    from call_management.tenancy import api_key_store

    return {"api_keys": api_key_store.list_api_keys(ctx.tenant.id)}


@app.post("/api/api-keys")
async def create_api_key(payload: ApiKeyCreate, ctx=Depends(require_tenant_context)):
    import hashlib
    import secrets

    from call_management.admin.public_api import API_SCOPES

    scopes = [s for s in payload.scopes if s in API_SCOPES]
    if not scopes:
        raise HTTPException(status_code=400, detail="Al menos un scope válido requerido")
    raw = f"cmk_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    from call_management.tenancy import api_key_store

    created = api_key_store.create_api_key(
        ctx.tenant.id,
        name=payload.name,
        scopes=scopes,
        raw_key=raw,
        key_hash=key_hash,
    )
    return created


@app.delete("/api/api-keys/{key_id}")
async def revoke_api_key(key_id: str, ctx=Depends(require_tenant_context)):
    from call_management.tenancy import api_key_store

    ok = api_key_store.revoke_api_key(key_id, ctx.tenant.id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key no encontrada")
    return {"revoked": key_id}


def _mount_static() -> None:
    if not ADMIN_UI_DIST.exists():
        return

    assets_dir = ADMIN_UI_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        index = ADMIN_UI_DIST / "index.html"
        if index.exists():
            return FileResponse(
                index,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        raise HTTPException(status_code=404, detail="Admin UI not built")


_mount_static()


def main() -> None:
    import uvicorn

    host = os.getenv("ADMIN_HOST", "127.0.0.1")
    port = int(os.getenv("ADMIN_PORT", "8080"))
    uvicorn.run("call_management.admin.app:app", host=host, port=port, reload=False)