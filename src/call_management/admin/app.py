"""FastAPI admin application for Call Management."""

from __future__ import annotations

import os

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
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
from call_management.admin.interaction_complete import complete_voice_xai_session
from call_management.admin.voice_session import create_browser_voice_session
from call_management.admin.env_store import PROJECT_ROOT, load_settings, save_settings
from call_management.admin.schemas import (
    AgentProfilePayload,
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
from call_management.crm.database import Customer, get_crm
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
    from call_management.tenancy.queue import active_count, global_active

    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    stats = await crm.get_dashboard_stats()
    analytics = await crm.get_call_analytics(days=14)
    tenant_metrics = get_platform_store().tenant_metrics(ctx.tenant.id)
    cfg = get_model_config()
    mcp = load_remote_mcp_config()
    chat_status = get_chat_manager().status()
    lk_ready, lk_issues = livekit_playground_ready()
    return {
        "stats": stats,
        "analytics": analytics,
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
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await crm.list_call_records(limit=limit, offset=offset)


@app.get("/api/appointments")
async def list_appointments(limit: int = 50, offset: int = 0, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await crm.list_appointments(limit=limit, offset=offset)


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