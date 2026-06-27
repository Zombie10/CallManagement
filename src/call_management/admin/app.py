"""FastAPI admin application for Call Management."""

from __future__ import annotations

import os

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from call_management.admin.auth_middleware import AdminAuthMiddleware
from call_management.admin.auth_routes import router as auth_router
from call_management.admin.auth_store import ensure_bootstrap_user
from call_management.admin.chat_runner import get_chat_manager
from call_management.admin.livekit_playground import (
    create_livekit_playground_session,
    livekit_playground_ready,
)
from call_management.admin.call_records import (
    get_call_for_tenant,
    list_calls_for_tenant,
    stream_call_recording,
    upload_call_recording,
)
from call_management.admin.interaction_complete import complete_voice_xai_session
from call_management.admin.voice_session import create_browser_voice_session
from call_management.admin.env_store import PROJECT_ROOT, load_settings, save_settings
from call_management.admin.public_api import router as public_api_router
from call_management.admin.schemas import (
    AgentProfilePayload,
    ApiKeyCreate,
    AppointmentCreate,
    AppointmentUpdate,
    ChatMessagePayload,
    ChatSessionCreate,
    VoiceSessionCreate,
    VoiceSessionComplete,
    VoiceToolExecute,
    LiveKitPlaygroundCreate,
    CustomerCreate,
    CustomerUpdate,
    SettingsUpdate,
)
from call_management.admin.tenant_deps import require_tenant_context
from call_management.admin.tenant_routes import router as tenant_router
from call_management.admin.voice_tool_runner import execute_voice_function
from call_management.agent_store import delete_profile, get_catalog, load_profiles, upsert_profile
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.migrate import migrate_legacy_crm_if_needed
from call_management.tenancy.platform_store import get_platform_store
from call_management.agents.registry import get_default_instructions
from call_management.config import get_model_config
from call_management.crm.database import Appointment, Customer, get_crm
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
async def get_settings():
    return load_settings()


@app.put("/api/settings")
async def put_settings(payload: SettingsUpdate):
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
async def get_voice_agent_config(agent_name: str):
    from call_management.xai.voice import build_voice_session_payload

    try:
        return build_voice_session_payload(agent_name)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
async def export_calls_csv(ctx=Depends(require_tenant_context)):
    import csv
    import io

    from fastapi.responses import StreamingResponse

    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    rows = await crm.export_calls_csv_rows()
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buf.write("call_id,from_number,start_time,outcome\n")
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="calls_export.csv"'},
    )


@app.get("/api/api-keys")
async def list_api_keys(ctx=Depends(require_tenant_context)):
    return {"api_keys": get_platform_store().list_api_keys(ctx.tenant.id)}


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
    created = get_platform_store().create_api_key(
        ctx.tenant.id,
        name=payload.name,
        scopes=scopes,
        raw_key=raw,
        key_hash=key_hash,
    )
    return created


@app.delete("/api/api-keys/{key_id}")
async def revoke_api_key(key_id: str, ctx=Depends(require_tenant_context)):
    ok = get_platform_store().revoke_api_key(key_id, ctx.tenant.id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key no encontrada")
    return {"revoked": key_id}


@app.get("/api/chat/status")
async def chat_status():
    return get_chat_manager().status()


@app.post("/api/chat/sessions")
async def create_chat_session(payload: ChatSessionCreate):
    try:
        return await get_chat_manager().create(
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            department=payload.department,
            initial_agent=payload.initial_agent,
            tenant_id=payload.tenant_id,
            agent_instance_id=payload.agent_instance_id,
            vip=payload.vip,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/chat/sessions/{session_id}/messages")
async def send_chat_message(session_id: str, payload: ChatMessagePayload):
    try:
        return await get_chat_manager().send_message(session_id, payload.message)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/chat/sessions/{session_id}/reset")
async def reset_chat_session(session_id: str):
    try:
        return await get_chat_manager().reset(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/chat/sessions/{session_id}")
async def delete_chat_session(session_id: str):
    await get_chat_manager().close(session_id)
    return {"deleted": session_id}


@app.post("/api/voice/session")
async def create_voice_session(payload: VoiceSessionCreate):
    try:
        return await create_browser_voice_session(
            agent_name=payload.agent,
            tenant_id=payload.tenant_id,
            agent_instance_id=payload.agent_instance_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/voice/complete")
async def complete_voice_session(payload: VoiceSessionComplete):
    try:
        return await complete_voice_xai_session(
            call_id=payload.call_id,
            agent=payload.agent,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=payload.tenant_id,
            agent_instance_id=payload.agent_instance_id,
            start_time=payload.start_time,
            transcript=payload.transcript,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/voice/tools/execute")
async def execute_voice_tool(payload: VoiceToolExecute):
    try:
        return await execute_voice_function(
            function_name=payload.function_name,
            arguments=payload.arguments,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=payload.tenant_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/livekit/status")
async def livekit_status():
    ready, issues = livekit_playground_ready()
    return {"ready": ready, "issues": issues, "requires_worker": True}


@app.post("/api/livekit/playground")
async def create_livekit_playground(payload: LiveKitPlaygroundCreate):
    try:
        return await create_livekit_playground_session(
            initial_agent=payload.initial_agent,
            phone_number=payload.phone_number,
            customer_name=payload.customer_name,
            tenant_id=payload.tenant_id,
            agent_instance_id=payload.agent_instance_id,
            vip=payload.vip,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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