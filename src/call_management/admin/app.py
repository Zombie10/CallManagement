"""FastAPI admin application for Call Management."""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from call_management.admin.env_store import PROJECT_ROOT, load_settings, save_settings
from call_management.admin.schemas import AgentProfilePayload, CustomerCreate, CustomerUpdate, SettingsUpdate
from call_management.agent_store import (
    delete_profile,
    get_catalog,
    load_profiles,
    upsert_profile,
)
from call_management.config import get_model_config
from call_management.crm.database import Customer, get_crm
from call_management.xai.mcp import load_remote_mcp_config

ADMIN_UI_DIST = PROJECT_ROOT / "admin-ui" / "dist"

app = FastAPI(
    title="Call Management Admin",
    description="Web console for system configuration and CRM",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "call-management-admin"}


@app.get("/api/dashboard")
async def dashboard():
    crm = await get_crm()
    stats = await crm.get_dashboard_stats()
    cfg = get_model_config()
    mcp = load_remote_mcp_config()
    return {
        "stats": stats,
        "runtime": {
            "provider": cfg.provider,
            "grok_realtime": cfg.use_grok_realtime,
            "remote_mcp": mcp.enabled,
            "mcp_servers": len(mcp.servers),
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
        "profiles": [profile.to_dict() for profile in profiles.values()],
        "catalog": get_catalog(),
        "mcp_server_ids": mcp_server_ids,
    }


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
async def list_customers(limit: int = 50, offset: int = 0):
    crm = await get_crm()
    return await crm.list_customers(limit=limit, offset=offset)


@app.post("/api/customers")
async def create_customer(payload: CustomerCreate):
    crm = await get_crm()
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
async def update_customer(phone_number: str, payload: CustomerUpdate):
    crm = await get_crm()
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
async def list_calls(limit: int = 50, offset: int = 0):
    crm = await get_crm()
    return await crm.list_call_records(limit=limit, offset=offset)


@app.get("/api/appointments")
async def list_appointments(limit: int = 50, offset: int = 0):
    crm = await get_crm()
    return await crm.list_appointments(limit=limit, offset=offset)


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
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Admin UI not built")


_mount_static()


def main() -> None:
    import uvicorn

    host = os.getenv("ADMIN_HOST", "127.0.0.1")
    port = int(os.getenv("ADMIN_PORT", "8080"))
    uvicorn.run("call_management.admin.app:app", host=host, port=port, reload=False)