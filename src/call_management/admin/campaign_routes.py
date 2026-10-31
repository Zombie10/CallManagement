"""Admin API for sales campaigns."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from call_management.admin.tenant_deps import require_tenant_context
from call_management.campaigns.service import (
    CampaignError,
    add_contact,
    create_campaign,
    list_campaigns,
    parse_instant,
    record_sales_meeting,
    run_campaign_pass,
)
from call_management.tenancy.context import resolve_crm_for_tenant

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


class CampaignContactIn(BaseModel):
    phone: str
    name: str
    may_call: bool = True
    do_not_call: bool = False


class CampaignCreate(BaseModel):
    name: str
    agent: str = "sales"
    window_start: str
    window_end: str
    timezone: str = "UTC"
    pace: int = Field(ge=1)
    max_attempts: int = Field(ge=1)
    contacts: list[CampaignContactIn] = Field(default_factory=list)


class CampaignStart(BaseModel):
    at: str | None = None


class MeetingQualification(BaseModel):
    company: str | None = None
    role: str | None = None
    interest: str | None = None
    purpose: str | None = None


class AttemptResultIn(BaseModel):
    result: str
    preferred_time: str | None = None
    qualification: MeetingQualification | None = None


def _error(exc: CampaignError) -> HTTPException:
    status = 404 if "no encontrada" in exc.message or "no encontrado" in exc.message else 400
    return HTTPException(status_code=status, detail=exc.message)


@router.get("")
async def get_campaigns(ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    return await list_campaigns(crm)


@router.post("")
async def post_campaign(payload: CampaignCreate, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await create_campaign(
            crm,
            name=payload.name,
            agent=payload.agent,
            window_start=payload.window_start,
            window_end=payload.window_end,
            timezone=payload.timezone,
            pace=payload.pace,
            max_attempts=payload.max_attempts,
            contacts=[item.model_dump() for item in payload.contacts],
        )
    except CampaignError as exc:
        raise _error(exc) from exc


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        from call_management.campaigns.service import campaign_payload

        return await campaign_payload(crm, campaign_id)
    except CampaignError as exc:
        raise _error(exc) from exc


@router.post("/{campaign_id}/contacts")
async def post_contact(
    campaign_id: str, payload: CampaignContactIn, ctx=Depends(require_tenant_context)
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await add_contact(
            crm,
            campaign_id,
            phone=payload.phone,
            name=payload.name,
            may_call=payload.may_call,
            do_not_call=payload.do_not_call,
        )
    except CampaignError as exc:
        raise _error(exc) from exc


@router.post("/{campaign_id}/start")
async def post_start(campaign_id: str, payload: CampaignStart, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await run_campaign_pass(
            crm,
            campaign_id,
            tenant_id=ctx.tenant.id,
            at=parse_instant(payload.at),
        )
    except CampaignError as exc:
        raise _error(exc) from exc


@router.post("/{campaign_id}/attempts/{attempt_id}/result")
async def post_result(
    campaign_id: str,
    attempt_id: str,
    payload: AttemptResultIn,
    ctx=Depends(require_tenant_context),
):
    if payload.result not in ("meeting", "sales_meeting_scheduled"):
        raise HTTPException(status_code=400, detail="El resultado de la campaña no es válido.")
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        qualification = payload.qualification.model_dump() if payload.qualification else None
        return await record_sales_meeting(
            crm,
            campaign_id,
            attempt_id,
            preferred_time=payload.preferred_time or "",
            qualification=qualification,
        )
    except CampaignError as exc:
        raise _error(exc) from exc
