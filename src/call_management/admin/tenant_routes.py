"""Multi-tenant API: companies, agent instances, schedules, metrics."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from call_management.admin.tenant_deps import require_super_admin, require_tenant_context
from call_management.agent_store import get_catalog
from call_management.agents.registry import get_default_instructions
from call_management.tenancy.context import TenantContext, resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.tenancy.scheduling import agent_schedule_status

router = APIRouter(prefix="/api", tags=["tenants"])


class TenantCreatePayload(BaseModel):
    slug: str
    name: str
    status: str = "active"
    logo_url: str | None = None
    brand_color: str | None = None
    max_agents: int = 10
    max_calls_per_day: int = 1000
    timezone: str = "America/Guatemala"


class TenantUpdatePayload(BaseModel):
    name: str | None = None
    status: str | None = None
    logo_url: str | None = None
    brand_color: str | None = None
    max_agents: int | None = None
    max_calls_per_day: int | None = None
    timezone: str | None = None


class AgentInstancePayload(BaseModel):
    slug: str
    display_name: str
    template_id: str
    status: str = "draft"
    phone_number: str | None = None
    phone_numbers: list[str] = Field(default_factory=list)
    sip_trunk_id: str | None = None
    provider: str = "xai"
    voice: str = "ara"
    locale: str = "es"
    voice_language: str = ""
    custom_instructions: str = ""
    tools: list[str] = Field(default_factory=list)
    function_tools: list[str] = Field(default_factory=list)
    mcp_servers: list[str] = Field(default_factory=list)
    brand_name: str | None = None
    schedule_json: str | None = None


class AgentDuplicatePayload(BaseModel):
    slug: str
    display_name: str


class ScheduleEntryPayload(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    timezone: str = "America/Guatemala"


class SchedulesPayload(BaseModel):
    schedules: list[ScheduleEntryPayload]


def _agent_dict(agent) -> dict[str, Any]:
    data = {
        "id": agent.id,
        "tenant_id": agent.tenant_id,
        "slug": agent.slug,
        "display_name": agent.display_name,
        "template_id": agent.template_id,
        "status": agent.status,
        "phone_number": agent.phone_number,
        "phone_numbers": agent.phone_numbers,
        "sip_trunk_id": agent.sip_trunk_id,
        "provider": agent.provider,
        "voice": agent.voice,
        "locale": agent.locale,
        "voice_language": agent.voice_language,
        "custom_instructions": agent.custom_instructions,
        "tools": agent.tools,
        "function_tools": agent.function_tools,
        "mcp_servers": agent.mcp_servers,
        "brand_name": agent.brand_name,
        "schedule_json": agent.schedule_json,
        "call_count_today": agent.call_count_today,
        "schedule_status": agent_schedule_status(agent.id),
        "default_instructions": get_default_instructions(agent.template_id),
        "created_at": agent.created_at,
        "updated_at": agent.updated_at,
    }
    return data


def _tenant_dict(tenant) -> dict[str, Any]:
    store = get_platform_store()
    metrics = store.tenant_metrics(tenant.id)
    return {
        "id": tenant.id,
        "slug": tenant.slug,
        "name": tenant.name,
        "status": tenant.status,
        "logo_url": tenant.logo_url,
        "brand_color": tenant.brand_color,
        "max_agents": tenant.max_agents,
        "max_calls_per_day": tenant.max_calls_per_day,
        "timezone": tenant.timezone,
        "created_at": tenant.created_at,
        "updated_at": tenant.updated_at,
        "metrics": metrics,
    }


@router.get("/platform/metrics")
async def platform_metrics(_admin: dict = Depends(require_super_admin)):
    return get_platform_store().platform_metrics()


@router.get("/tenants")
async def list_tenants(request: Request, _admin: dict = Depends(require_super_admin)):
    store = get_platform_store()
    return {"tenants": [_tenant_dict(t) for t in store.list_tenants()]}


@router.get("/tenants/mine")
async def my_tenant(ctx: TenantContext = Depends(require_tenant_context)):
    return _tenant_dict(ctx.tenant)


@router.post("/tenants")
async def create_tenant(payload: TenantCreatePayload, _admin: dict = Depends(require_super_admin)):
    store = get_platform_store()
    try:
        tenant = store.create_tenant(**payload.model_dump())
        await resolve_crm_for_tenant(tenant.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _tenant_dict(tenant)


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str,
    payload: TenantUpdatePayload,
    _admin: dict = Depends(require_super_admin),
):
    store = get_platform_store()
    try:
        tenant = store.update_tenant(tenant_id, **payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _tenant_dict(tenant)


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, _admin: dict = Depends(require_super_admin)):
    store = get_platform_store()
    try:
        store.delete_tenant(tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"deleted": tenant_id}


@router.get("/tenants/{tenant_id}/metrics")
async def tenant_metrics(tenant_id: str, _admin: dict = Depends(require_super_admin)):
    store = get_platform_store()
    if not store.get_tenant(tenant_id):
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return store.tenant_metrics(tenant_id)


@router.get("/tenant-agents")
async def list_tenant_agents(ctx: TenantContext = Depends(require_tenant_context)):
    store = get_platform_store()
    agents = store.list_agents(ctx.tenant.id)
    return {
        "tenant": _tenant_dict(ctx.tenant),
        "agents": [_agent_dict(a) for a in agents],
        "catalog": get_catalog(),
    }


@router.post("/tenant-agents")
async def create_tenant_agent(
    payload: AgentInstancePayload,
    ctx: TenantContext = Depends(require_tenant_context),
):
    store = get_platform_store()
    try:
        agent = store.create_agent(ctx.tenant.id, **payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _agent_dict(agent)


@router.patch("/tenant-agents/{agent_id}")
async def update_tenant_agent(
    agent_id: str,
    payload: AgentInstancePayload,
    ctx: TenantContext = Depends(require_tenant_context),
):
    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent or agent.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    try:
        updated = store.update_agent(
            agent_id,
            **payload.model_dump(exclude_unset=True, exclude={"slug", "template_id"}),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _agent_dict(updated)


@router.post("/tenant-agents/{agent_id}/duplicate")
async def duplicate_tenant_agent(
    agent_id: str,
    payload: AgentDuplicatePayload,
    ctx: TenantContext = Depends(require_tenant_context),
):
    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent or agent.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    try:
        copy = store.duplicate_agent(agent_id, slug=payload.slug, display_name=payload.display_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _agent_dict(copy)


@router.delete("/tenant-agents/{agent_id}")
async def delete_tenant_agent(agent_id: str, ctx: TenantContext = Depends(require_tenant_context)):
    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent or agent.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    store.delete_agent(agent_id)
    return {"deleted": agent_id}


@router.get("/tenant-agents/{agent_id}/schedules")
async def get_agent_schedules(agent_id: str, ctx: TenantContext = Depends(require_tenant_context)):
    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent or agent.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    schedules = store.list_schedules(agent_id)
    return {
        "schedules": [
            {
                "id": s.id,
                "day_of_week": s.day_of_week,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "timezone": s.timezone,
            }
            for s in schedules
        ]
    }


@router.put("/tenant-agents/{agent_id}/schedules")
async def put_agent_schedules(
    agent_id: str,
    payload: SchedulesPayload,
    ctx: TenantContext = Depends(require_tenant_context),
):
    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent or agent.tenant_id != ctx.tenant.id:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    schedules = store.set_schedules(agent_id, [s.model_dump() for s in payload.schedules])
    return {
        "schedules": [
            {
                "id": s.id,
                "day_of_week": s.day_of_week,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "timezone": s.timezone,
            }
            for s in schedules
        ]
    }


class WebhookCreatePayload(BaseModel):
    url: str
    events: list[str] = Field(default_factory=lambda: ["call.ended"])
    secret: str | None = None


class CustomFilterPayload(BaseModel):
    field: str
    op: str = "eq"
    value: Any = None


class CallReportPayload(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    outcomes: list[str] = Field(default_factory=list)
    agent_instance_ids: list[str] = Field(default_factory=list)
    from_number: str | None = None
    min_duration: int | None = None
    max_duration: int | None = None
    group_by: str = "day"
    pivot_row: str | None = None
    pivot_col: str | None = None
    metric: str = "count"
    custom_filters: list[CustomFilterPayload] = Field(default_factory=list)
    detail_limit: int = 100


def _report_query_from_payload(payload: CallReportPayload):
    from call_management.crm.reports import CallReportQuery

    return CallReportQuery(
        date_from=payload.date_from,
        date_to=payload.date_to,
        outcomes=payload.outcomes,
        agent_instance_ids=payload.agent_instance_ids,
        from_number=payload.from_number,
        min_duration=payload.min_duration,
        max_duration=payload.max_duration,
        group_by=payload.group_by,
        pivot_row=payload.pivot_row,
        pivot_col=payload.pivot_col,
        metric=payload.metric,
        custom_filters=[f.model_dump() for f in payload.custom_filters],
        detail_limit=min(payload.detail_limit, 500),
    )


@router.get("/reports/options")
async def report_options(ctx: TenantContext = Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    options = await crm.get_report_options()
    store = get_platform_store()
    agents = store.list_agents(ctx.tenant.id)
    options["agents"] = [
        {"id": a.id, "label": a.display_name, "slug": a.slug} for a in agents
    ]
    return options


@router.get("/reports/calls")
async def report_calls_get(
    date_from: str | None = None,
    date_to: str | None = None,
    outcomes: str | None = None,
    agent_instance_ids: str | None = None,
    from_number: str | None = None,
    min_duration: int | None = None,
    max_duration: int | None = None,
    group_by: str = "day",
    pivot_row: str | None = None,
    pivot_col: str | None = None,
    metric: str = "count",
    ctx: TenantContext = Depends(require_tenant_context),
):
    payload = CallReportPayload(
        date_from=date_from,
        date_to=date_to,
        outcomes=[o.strip() for o in (outcomes or "").split(",") if o.strip()],
        agent_instance_ids=[a.strip() for a in (agent_instance_ids or "").split(",") if a.strip()],
        from_number=from_number,
        min_duration=min_duration,
        max_duration=max_duration,
        group_by=group_by,
        pivot_row=pivot_row,
        pivot_col=pivot_col,
        metric=metric,
    )
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await crm.query_call_report(_report_query_from_payload(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reports/calls")
async def report_calls_post(
    payload: CallReportPayload,
    ctx: TenantContext = Depends(require_tenant_context),
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await crm.query_call_report(_report_query_from_payload(payload))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/analytics")
async def tenant_analytics(ctx: TenantContext = Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    analytics = await crm.get_call_analytics()
    actionable = await crm.get_actionable_analytics()
    metrics = get_platform_store().tenant_metrics(ctx.tenant.id)
    from call_management.tenancy.queue import active_count

    return {
        **analytics,
        "actionable": actionable,
        "metrics": metrics,
        "active_calls": active_count(ctx.tenant.id),
    }


@router.get("/webhooks/deliveries")
async def list_webhook_deliveries(
    limit: int = 50,
    offset: int = 0,
    ctx: TenantContext = Depends(require_tenant_context),
):
    return get_platform_store().list_webhook_deliveries(ctx.tenant.id, limit=limit, offset=offset)


@router.get("/webhooks")
async def list_webhooks(ctx: TenantContext = Depends(require_tenant_context)):
    return {"webhooks": get_platform_store().list_webhooks(ctx.tenant.id)}


@router.post("/webhooks")
async def create_webhook(payload: WebhookCreatePayload, ctx: TenantContext = Depends(require_tenant_context)):
    store = get_platform_store()
    hooks_before = len(store.list_webhooks(ctx.tenant.id))
    store.create_webhook(ctx.tenant.id, url=payload.url, events=payload.events, secret=payload.secret)
    hooks = store.list_webhooks(ctx.tenant.id)
    created = hooks[0] if len(hooks) > hooks_before else hooks[-1] if hooks else {}
    return created


@router.delete("/webhooks/{webhook_id}")
async def delete_webhook(webhook_id: str, ctx: TenantContext = Depends(require_tenant_context)):
    hooks = get_platform_store().list_webhooks(ctx.tenant.id)
    if not any(h["id"] == webhook_id for h in hooks):
        raise HTTPException(status_code=404, detail="Webhook no encontrado")
    get_platform_store().delete_webhook(webhook_id)
    return {"deleted": webhook_id}


@router.get("/phone-routes/resolve")
async def resolve_phone_route(phone: str):
    route = get_platform_store().resolve_phone(phone)
    if not route:
        raise HTTPException(status_code=404, detail="Sin ruta para este número")
    agent = get_platform_store().get_agent(route.agent_instance_id)
    return {
        "tenant_id": route.tenant_id,
        "agent_instance_id": route.agent_instance_id,
        "phone_number": route.phone_number,
        "template_id": agent.template_id if agent else None,
    }