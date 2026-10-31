"""Admin API for sales campaigns."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from call_management.admin.tenant_deps import require_tenant_context
from call_management.campaigns.dialer import configured_outbound_numbers
from call_management.campaigns.service import (
    CampaignError,
    add_contact,
    add_contacts_from_crm,
    campaign_payload,
    campaign_report,
    create_campaign,
    delete_campaign,
    import_contacts,
    list_campaigns,
    parse_instant,
    parse_report_bound,
    record_sales_meeting,
    remove_contact,
    report_csv,
    run_campaign_pass,
    run_due_campaigns,
    search_campaign_contacts,
    update_campaign,
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
    product: str = ""
    opening_line: str = ""
    forbidden: str = ""
    weekdays: str | None = None
    scheduled_time: str = ""
    paused: bool = False
    caller_id: str = ""


class CampaignUpdate(BaseModel):
    name: str | None = None
    window_start: str | None = None
    window_end: str | None = None
    timezone: str | None = None
    pace: int | None = Field(default=None, ge=1)
    max_attempts: int | None = Field(default=None, ge=1)
    product: str | None = None
    opening_line: str | None = None
    forbidden: str | None = None
    weekdays: str | None = None
    scheduled_time: str | None = None
    paused: bool | None = None
    caller_id: str | None = None


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


class ImportIn(BaseModel):
    text: str


class CrmPickIn(BaseModel):
    phones: list[str] = Field(default_factory=list)


def _error(exc: CampaignError) -> HTTPException:
    status = 404 if "no encontrada" in exc.message or "no encontrado" in exc.message else 400
    return HTTPException(status_code=status, detail=exc.message)


def _changes(payload: CampaignUpdate) -> dict:
    return payload.model_dump(exclude_unset=True)


@router.get("/outbound-numbers")
async def get_outbound_numbers(ctx=Depends(require_tenant_context)):
    del ctx
    return {"numbers": configured_outbound_numbers()}


@router.post("/scheduled")
async def post_scheduled(payload: CampaignStart, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await run_due_campaigns(
            crm,
            tenant_id=ctx.tenant.id,
            at=parse_instant(payload.at),
        )
    except CampaignError as exc:
        raise _error(exc) from exc


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
            product=payload.product,
            opening_line=payload.opening_line,
            forbidden=payload.forbidden,
            weekdays=payload.weekdays,
            scheduled_time=payload.scheduled_time,
            paused=payload.paused,
            caller_id=payload.caller_id,
        )
    except CampaignError as exc:
        raise _error(exc) from exc


@router.get("/{campaign_id}/report.csv")
async def get_report_csv(
    campaign_id: str,
    ctx=Depends(require_tenant_context),
    result: str | None = None,
    start: str | None = None,
    end: str | None = None,
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        payload = await campaign_payload(crm, campaign_id)
        rows = campaign_report(
            payload["attempts"],
            result=result or None,
            start=parse_report_bound(start),
            end=parse_report_bound(end, inclusive_end=True),
        )
    except CampaignError as exc:
        raise _error(exc) from exc
    return Response(
        content=report_csv(rows),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=informe-campana.csv"},
    )


@router.get("/{campaign_id}/report")
async def get_report(
    campaign_id: str,
    ctx=Depends(require_tenant_context),
    result: str | None = None,
    start: str | None = None,
    end: str | None = None,
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        payload = await campaign_payload(crm, campaign_id)
        rows = campaign_report(
            payload["attempts"],
            result=result or None,
            start=parse_report_bound(start),
            end=parse_report_bound(end, inclusive_end=True),
        )
    except CampaignError as exc:
        raise _error(exc) from exc
    return {"items": rows, "total": len(rows)}


@router.get("/{campaign_id}/contacts")
async def get_contacts(
    campaign_id: str,
    ctx=Depends(require_tenant_context),
    q: str = Query(default=""),
):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await search_campaign_contacts(crm, campaign_id, q)
    except CampaignError as exc:
        raise _error(exc) from exc


@router.post("/{campaign_id}/contacts/import")
async def post_import(campaign_id: str, payload: ImportIn, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await import_contacts(crm, campaign_id, payload.text)
    except CampaignError as exc:
        raise _error(exc) from exc


@router.post("/{campaign_id}/contacts/from-crm")
async def post_from_crm(campaign_id: str, payload: CrmPickIn, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await add_contacts_from_crm(crm, campaign_id, payload.phones)
    except CampaignError as exc:
        raise _error(exc) from exc


@router.delete("/{campaign_id}/contacts/{contact_id}")
async def delete_contact(campaign_id: str, contact_id: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await remove_contact(crm, campaign_id, contact_id)
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


@router.patch("/{campaign_id}")
async def patch_campaign(campaign_id: str, payload: CampaignUpdate, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await update_campaign(crm, campaign_id, _changes(payload))
    except CampaignError as exc:
        raise _error(exc) from exc


@router.delete("/{campaign_id}")
async def delete_one(campaign_id: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await delete_campaign(crm, campaign_id)
    except CampaignError as exc:
        raise _error(exc) from exc


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, ctx=Depends(require_tenant_context)):
    crm = await resolve_crm_for_tenant(ctx.tenant.id)
    try:
        return await campaign_payload(crm, campaign_id)
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
