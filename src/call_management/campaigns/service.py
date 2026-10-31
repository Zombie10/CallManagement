"""Save a sales campaign and run one dial pass against the CRM."""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from call_management.campaigns.dialer import (
    TRUNK_UNSET_MESSAGE,
    DialRequest,
    configured_outbound_numbers,
    get_campaign_dialer,
    outbound_trunk_id,
)
from call_management.campaigns.eligibility import (
    CALL_RESULTS,
    ContactAttemptState,
    campaign_totals,
    clock_in_window,
    filter_attempt_report,
    map_call_outcome,
    parse_contact_file,
    parse_hhmm,
    scheduled_pass_is_due,
    scheduled_slot,
    search_contacts,
    select_dials,
)
from call_management.crm.database import CRMDatabase
from call_management.crm.models import Appointment, CallRecord
from call_management.utils.time import utc_now_iso

logger = logging.getLogger("call-management.campaigns")

SALES_AGENT = "sales"
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_PHONE = re.compile(r"^\+\d{8,15}$")


class CampaignError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def dispatch_metadata(
    *,
    phone: str,
    name: str,
    tenant_id: str,
    call_id: str,
    agent: str = SALES_AGENT,
    product: str = "",
    opening_line: str = "",
    forbidden: str = "",
) -> str:
    """JSON the live worker already reads in ``_parse_session_overrides``."""
    return json.dumps(
        {
            "department": agent,
            "phone_number": phone,
            "customer_name": name,
            "tenant_id": tenant_id,
            "call_id": call_id,
            "product": product,
            "opening_line": opening_line,
            "forbidden": forbidden,
        },
        ensure_ascii=False,
    )


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def normalize_weekdays(value: str | None) -> str:
    if value is None or not str(value).strip():
        return "0,1,2,3,4,5,6"
    parts: list[str] = []
    for piece in str(value).split(","):
        piece = piece.strip()
        if piece not in {"0", "1", "2", "3", "4", "5", "6"}:
            raise CampaignError("Los días de la semana no son válidos.")
        if piece not in parts:
            parts.append(piece)
    if not parts:
        raise CampaignError("Elige al menos un día.")
    return ",".join(parts)


def normalize_scheduled_time(value: str | None, *, window_start: str, window_end: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if not _HHMM.match(text):
        raise CampaignError("La hora programada no es válida.")
    if not clock_in_window(parse_hhmm(text), window_start, window_end):
        raise CampaignError("La hora programada tiene que caer dentro del horario.")
    return text


def normalize_caller_id(value: str | None) -> str:
    text = (value or "").strip().replace(" ", "")
    if not text:
        return ""
    if not _PHONE.match(text):
        raise CampaignError("El número que se muestra no es válido.")
    allowed = configured_outbound_numbers()
    if text not in allowed:
        raise CampaignError("Elige un número de salida que ya esté configurado.")
    return text


def _validate_campaign_fields(
    *,
    name: str,
    agent: str,
    window_start: str,
    window_end: str,
    timezone: str,
    pace: int,
    max_attempts: int,
) -> None:
    if not name.strip():
        raise CampaignError("La campaña necesita un nombre.")
    if agent != SALES_AGENT:
        raise CampaignError("La campaña usa el agente de ventas.")
    if not _HHMM.match(window_start) or not _HHMM.match(window_end) or window_start == window_end:
        raise CampaignError("El horario de llamada no es válido.")
    try:
        ZoneInfo(timezone or "UTC")
    except Exception as exc:
        raise CampaignError("La zona horaria de la campaña no es válida.") from exc
    if pace < 1 or max_attempts < 1:
        raise CampaignError("El ritmo y los intentos máximos tienen que ser al menos 1.")


def _validate_contact(phone: str, name: str) -> str:
    cleaned = phone.strip().replace(" ", "")
    if not _PHONE.match(cleaned):
        raise CampaignError("El teléfono del contacto tiene que incluir el código de país.")
    if not name.strip():
        raise CampaignError("El contacto necesita un nombre.")
    return cleaned


def _states(contacts: list[dict], attempts: list[dict]) -> list[ContactAttemptState]:
    dials: dict[str, int] = {}
    meetings: set[str] = set()
    for row in attempts:
        contact_id = str(row["contact_id"])
        if row.get("result") in ("dialed", "meeting"):
            dials[contact_id] = dials.get(contact_id, 0) + 1
        if row.get("result") == "meeting":
            meetings.add(contact_id)
    return [
        ContactAttemptState(
            contact_id=row["id"],
            phone=row["phone"],
            name=row["name"],
            may_call=bool(row["may_call"]),
            do_not_call=bool(row["do_not_call"]),
            dial_count=dials.get(row["id"], 0),
            has_meeting=row["id"] in meetings,
        )
        for row in contacts
    ]


def _qualification_text(qualification: dict[str, Any] | None) -> str:
    if not qualification:
        return ""
    parts: list[str] = []
    for key in ("company", "role", "interest"):
        value = str(qualification.get(key) or "").strip()
        if value:
            parts.append(f"{key}={value}")
    purpose = str(qualification.get("purpose") or "").strip()
    if purpose:
        parts.append(purpose)
    return "; ".join(parts)


async def campaign_payload(crm: CRMDatabase, campaign_id: str) -> dict[str, Any]:
    row = await crm.get_campaign_row(campaign_id)
    if not row:
        raise CampaignError("Campaña no encontrada.")
    contacts = await crm.list_campaign_contacts(campaign_id)
    attempts = await crm.list_campaign_attempts(campaign_id)
    states = _states(contacts, attempts)
    return {
        "id": row["id"],
        "name": row["name"],
        "agent": row["agent"],
        "window_start": row["window_start"],
        "window_end": row["window_end"],
        "timezone": row["timezone"],
        "pace": row["pace"],
        "max_attempts": row["max_attempts"],
        "created_at": row["created_at"],
        "product": row.get("product") or "",
        "opening_line": row.get("opening_line") or "",
        "forbidden": row.get("forbidden") or "",
        "weekdays": row.get("weekdays") or "0,1,2,3,4,5,6",
        "scheduled_time": row.get("scheduled_time") or "",
        "paused": bool(row.get("paused")),
        "caller_id": row.get("caller_id") or "",
        "contacts": contacts,
        "attempts": attempts,
        "totals": campaign_totals(states, attempts, max_attempts=int(row["max_attempts"])),
    }


async def create_campaign(
    crm: CRMDatabase,
    *,
    name: str,
    agent: str,
    window_start: str,
    window_end: str,
    timezone: str,
    pace: int,
    max_attempts: int,
    contacts: list[dict[str, Any]] | None = None,
    product: str = "",
    opening_line: str = "",
    forbidden: str = "",
    weekdays: str | None = None,
    scheduled_time: str = "",
    paused: bool = False,
    caller_id: str = "",
) -> dict[str, Any]:
    timezone = timezone or "UTC"
    _validate_campaign_fields(
        name=name,
        agent=agent,
        window_start=window_start,
        window_end=window_end,
        timezone=timezone,
        pace=pace,
        max_attempts=max_attempts,
    )
    days = normalize_weekdays(weekdays)
    clock = normalize_scheduled_time(scheduled_time, window_start=window_start, window_end=window_end)
    shown = normalize_caller_id(caller_id)
    campaign_id = _new_id("camp")
    now = utc_now_iso()
    await crm.insert_campaign(
        campaign_id=campaign_id,
        name=name.strip(),
        agent=agent,
        window_start=window_start,
        window_end=window_end,
        timezone=timezone,
        pace=pace,
        max_attempts=max_attempts,
        created_at=now,
        product=(product or "").strip(),
        opening_line=(opening_line or "").strip(),
        forbidden=(forbidden or "").strip(),
        weekdays=days,
        scheduled_time=clock,
        paused=paused,
        caller_id=shown,
    )
    for contact in contacts or []:
        await add_contact(
            crm,
            campaign_id,
            phone=str(contact.get("phone") or ""),
            name=str(contact.get("name") or ""),
            may_call=bool(contact.get("may_call", True)),
            do_not_call=bool(contact.get("do_not_call", False)),
        )
    return await campaign_payload(crm, campaign_id)


async def add_contact(
    crm: CRMDatabase,
    campaign_id: str,
    *,
    phone: str,
    name: str,
    may_call: bool,
    do_not_call: bool,
) -> dict[str, Any]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    cleaned = _validate_contact(phone, name)
    await crm.insert_campaign_contact(
        contact_id=_new_id("ctc"),
        campaign_id=campaign_id,
        phone=cleaned,
        name=name.strip(),
        may_call=may_call,
        do_not_call=do_not_call,
        created_at=utc_now_iso(),
    )
    return await campaign_payload(crm, campaign_id)


async def update_campaign(crm: CRMDatabase, campaign_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    row = await crm.get_campaign_row(campaign_id)
    if not row:
        raise CampaignError("Campaña no encontrada.")
    name = changes.get("name", row["name"])
    window_start = changes.get("window_start", row["window_start"])
    window_end = changes.get("window_end", row["window_end"])
    timezone = changes.get("timezone", row["timezone"]) or "UTC"
    pace = int(changes.get("pace", row["pace"]))
    max_attempts = int(changes.get("max_attempts", row["max_attempts"]))
    _validate_campaign_fields(
        name=str(name),
        agent=row["agent"],
        window_start=str(window_start),
        window_end=str(window_end),
        timezone=str(timezone),
        pace=pace,
        max_attempts=max_attempts,
    )
    weekdays = normalize_weekdays(changes.get("weekdays", row.get("weekdays")))
    scheduled = normalize_scheduled_time(
        changes.get("scheduled_time", row.get("scheduled_time")),
        window_start=str(window_start),
        window_end=str(window_end),
    )
    caller_id = normalize_caller_id(changes.get("caller_id", row.get("caller_id")))
    paused = bool(changes["paused"]) if "paused" in changes else bool(row.get("paused"))
    await crm.update_campaign_fields(
        campaign_id,
        {
            "name": str(name).strip(),
            "window_start": window_start,
            "window_end": window_end,
            "timezone": timezone,
            "pace": pace,
            "max_attempts": max_attempts,
            "product": str(changes.get("product", row.get("product") or "")).strip(),
            "opening_line": str(changes.get("opening_line", row.get("opening_line") or "")).strip(),
            "forbidden": str(changes.get("forbidden", row.get("forbidden") or "")).strip(),
            "weekdays": weekdays,
            "scheduled_time": scheduled,
            "paused": paused,
            "caller_id": caller_id,
        },
    )
    return await campaign_payload(crm, campaign_id)


async def delete_campaign(crm: CRMDatabase, campaign_id: str) -> dict[str, str]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    await crm.delete_campaign(campaign_id)
    return {"deleted": campaign_id}


async def remove_contact(crm: CRMDatabase, campaign_id: str, contact_id: str) -> dict[str, Any]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    removed = await crm.delete_campaign_contact(campaign_id, contact_id)
    if not removed:
        raise CampaignError("Contacto no encontrado.")
    return await campaign_payload(crm, campaign_id)


async def search_campaign_contacts(crm: CRMDatabase, campaign_id: str, query: str) -> dict[str, Any]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    contacts = await crm.list_campaign_contacts(campaign_id)
    matched = search_contacts(contacts, query)
    return {"contacts": matched, "total": len(matched)}


async def import_contacts(crm: CRMDatabase, campaign_id: str, text: str) -> dict[str, Any]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    pairs = parse_contact_file(text)
    if not pairs:
        raise CampaignError("El archivo no tiene contactos con nombre y teléfono.")
    existing = {row["phone"] for row in await crm.list_campaign_contacts(campaign_id)}
    added = False
    for name, phone in pairs:
        cleaned = _validate_contact(phone, name)
        if cleaned in existing:
            continue
        await crm.insert_campaign_contact(
            contact_id=_new_id("ctc"),
            campaign_id=campaign_id,
            phone=cleaned,
            name=name.strip(),
            may_call=True,
            do_not_call=False,
            created_at=utc_now_iso(),
        )
        existing.add(cleaned)
        added = True
    if not added:
        raise CampaignError("Esos contactos ya están en la campaña.")
    return await campaign_payload(crm, campaign_id)


async def add_contacts_from_crm(crm: CRMDatabase, campaign_id: str, phones: list[str]) -> dict[str, Any]:
    if not await crm.get_campaign_row(campaign_id):
        raise CampaignError("Campaña no encontrada.")
    if not phones:
        raise CampaignError("Elige al menos un cliente.")
    existing = {row["phone"] for row in await crm.list_campaign_contacts(campaign_id)}
    added = False
    for phone in phones:
        cleaned = _validate_contact(phone, "Cliente")
        customer = await crm.get_customer_if_exists(cleaned)
        if customer is None:
            raise CampaignError("Ese cliente no está en el CRM.")
        if cleaned in existing:
            continue
        name = (customer.name or "").strip() or "Cliente"
        await crm.insert_campaign_contact(
            contact_id=_new_id("ctc"),
            campaign_id=campaign_id,
            phone=cleaned,
            name=name,
            may_call=True,
            do_not_call=False,
            created_at=utc_now_iso(),
        )
        existing.add(cleaned)
        added = True
    if not added:
        raise CampaignError("Esos clientes ya están en la campaña.")
    return await campaign_payload(crm, campaign_id)


def campaign_report(
    attempts: list[dict],
    *,
    result: str | None,
    start: datetime | None,
    end: datetime | None,
) -> list[dict]:
    if result and result not in CALL_RESULTS:
        raise CampaignError("El resultado del informe no es válido.")
    return filter_attempt_report(attempts, result=result or None, start=start, end=end)


def report_csv(rows: list[dict]) -> str:
    import csv
    from io import StringIO

    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["fecha", "telefono", "nombre", "resultado", "duracion", "grabacion", "dicho"])
    for row in rows:
        writer.writerow(
            [
                row.get("created_at") or "",
                row.get("phone") or "",
                row.get("customer_name") or "",
                row.get("call_result") or "",
                row.get("duration_seconds") if row.get("duration_seconds") is not None else "",
                row.get("recording_url") or "",
                row.get("transcript") or "",
            ]
        )
    return buffer.getvalue()


async def list_campaigns(crm: CRMDatabase) -> dict[str, Any]:
    rows = await crm.list_campaign_rows()
    items = [await campaign_payload(crm, row["id"]) for row in rows]
    return {"items": items, "total": len(items)}


def parse_report_bound(value: str | None, *, inclusive_end: bool = False) -> datetime | None:
    """Date-only values cover that calendar day. Instants stay exclusive at ``end``."""
    if not value or not value.strip():
        return None
    text = value.strip()
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        parsed = parse_instant(f"{text}T00:00:00+00:00")
        return parsed + timedelta(days=1) if inclusive_end else parsed
    return parse_instant(text)


def parse_instant(value: str | None) -> datetime:
    if not value:
        return datetime.now(ZoneInfo("UTC"))
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CampaignError("El instante de la pasada no es válido.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
    return parsed


async def run_due_campaigns(
    crm: CRMDatabase,
    *,
    tenant_id: str,
    at: datetime,
    trunk_id: str | None = None,
) -> dict[str, Any]:
    """Run one pass for every campaign whose scheduled minute is due. No start button."""
    rows = await crm.list_campaign_rows()
    due_ids: list[str] = []
    for row in rows:
        if scheduled_pass_is_due(
            at,
            window_start=row["window_start"],
            window_end=row["window_end"],
            timezone=row["timezone"],
            weekdays=row.get("weekdays"),
            scheduled_time=row.get("scheduled_time"),
            paused=bool(row.get("paused")),
            last_slot=str(row.get("last_scheduled_slot") or ""),
        ):
            due_ids.append(row["id"])
    if not due_ids:
        return {"items": [], "total": 0}
    items = []
    for campaign_id in due_ids:
        payload = await run_campaign_pass(
            crm,
            campaign_id,
            tenant_id=tenant_id,
            at=at,
            trunk_id=trunk_id,
        )
        row = await crm.get_campaign_row(campaign_id)
        clock = str(row.get("scheduled_time") or "") if row else ""
        if row and clock:
            await crm.update_campaign_fields(
                campaign_id,
                {"last_scheduled_slot": scheduled_slot(at, row["timezone"], clock)},
            )
        items.append(payload)
    return {"items": items, "total": len(items)}


async def run_campaign_pass(
    crm: CRMDatabase,
    campaign_id: str,
    *,
    tenant_id: str,
    at: datetime,
    trunk_id: str | None = None,
) -> dict[str, Any]:
    """Dial eligible contacts once. Refuses while the outbound trunk is unset."""
    trunk = outbound_trunk_id() if trunk_id is None else trunk_id.strip()
    if not trunk:
        raise CampaignError(TRUNK_UNSET_MESSAGE)
    row = await crm.get_campaign_row(campaign_id)
    if not row:
        raise CampaignError("Campaña no encontrada.")
    contacts = await crm.list_campaign_contacts(campaign_id)
    attempts = await crm.list_campaign_attempts(campaign_id)
    chosen = select_dials(
        _states(contacts, attempts),
        at=at,
        window_start=row["window_start"],
        window_end=row["window_end"],
        timezone=row["timezone"],
        pace=int(row["pace"]),
        max_attempts=int(row["max_attempts"]),
        weekdays=row.get("weekdays") or "0,1,2,3,4,5,6",
        paused=bool(row.get("paused")),
    )
    dialer = get_campaign_dialer()
    caller_id = str(row.get("caller_id") or "")
    for choice in chosen:
        call_id = _new_id("call")
        metadata = dispatch_metadata(
            phone=choice.phone,
            name=choice.name,
            tenant_id=tenant_id,
            call_id=call_id,
            agent=row["agent"],
            product=str(row.get("product") or ""),
            opening_line=str(row.get("opening_line") or ""),
            forbidden=str(row.get("forbidden") or ""),
        )
        digits = choice.phone.replace("+", "")
        request = DialRequest(
            trunk_id=trunk,
            phone=choice.phone,
            room_name=f"outbound-{digits}",
            participant_identity=f"outbound_{choice.phone}",
            participant_name=choice.name,
            metadata=metadata,
            sip_number=caller_id,
        )
        await dialer(request)
        await crm.insert_campaign_attempt(
            attempt_id=_new_id("att"),
            campaign_id=campaign_id,
            contact_id=choice.contact_id,
            result="dialed",
            call_id=call_id,
            phone=choice.phone,
            customer_name=choice.name,
            dispatch_metadata=metadata,
            created_at=at.isoformat(),
        )
    return await campaign_payload(crm, campaign_id)


async def record_sales_meeting(
    crm: CRMDatabase,
    campaign_id: str,
    attempt_id: str,
    *,
    preferred_time: str,
    qualification: dict[str, Any] | None,
) -> dict[str, Any]:
    """Store a sales meeting on the attempt, the customer, and the call record."""
    attempt = await crm.get_campaign_attempt(campaign_id, attempt_id)
    if not attempt:
        raise CampaignError("Intento no encontrado.")
    if attempt.get("result") == "meeting":
        return await campaign_payload(crm, campaign_id)
    when = preferred_time.strip()
    if not when:
        raise CampaignError("La reunión necesita un horario.")
    phone = str(attempt["phone"])
    text = _qualification_text(qualification)
    customer = await crm.get_or_create_customer(phone)
    if attempt.get("customer_name") and not customer.name:
        customer.name = str(attempt["customer_name"])
        await crm.update_customer(customer)
    if text:
        await crm.add_customer_note(phone, f"Calificación de campaña: {text}")
    notes = text or None
    appt = Appointment(
        customer_phone=phone,
        scheduled_time=when,
        purpose="sales_meeting",
        notes=notes,
    )
    await crm.create_appointment(appt)
    call_id = attempt.get("call_id")
    if call_id:
        await _store_qualification_on_call(
            crm,
            call_id=str(call_id),
            phone=phone,
            customer_name=attempt.get("customer_name"),
            qualification=text,
            when=when,
        )
    await crm.mark_campaign_attempt_meeting(
        attempt_id,
        qualification=text,
        scheduled_time=when,
    )
    return await campaign_payload(crm, campaign_id)


async def _store_qualification_on_call(
    crm: CRMDatabase,
    *,
    call_id: str,
    phone: str,
    customer_name: str | None,
    qualification: str,
    when: str,
) -> None:
    existing = await crm.get_call_record(call_id)
    note = f"Calificación de campaña: {qualification}. Reunión: {when}".strip()
    if existing:
        existing.outcome = "sales_meeting_scheduled"
        existing.agent_notes = f"{existing.agent_notes}\n{note}" if existing.agent_notes else note
        await crm.update_call_record(existing)
        return
    await crm.create_call_record(
        CallRecord(
            call_id=call_id,
            room_name=f"outbound-{phone.replace('+', '')}",
            from_number=phone,
            outcome="sales_meeting_scheduled",
            summary=note,
            agent_notes=note,
            channel="campaign",
        )
    )
    if customer_name:
        customer = await crm.get_or_create_customer(phone)
        if not customer.name:
            customer.name = customer_name
            await crm.update_customer(customer)


async def sync_campaign_attempt(call_ctx: Any) -> None:
    """Copy the finished call onto the campaign attempt, including a sales meeting."""
    crm = getattr(call_ctx, "crm", None)
    call_id = getattr(call_ctx, "call_id", None)
    if crm is None or not call_id:
        return
    try:
        attempt = await crm.find_campaign_attempt_by_call(str(call_id))
    except Exception:
        logger.exception("Campaign lookup failed for %s", call_id)
        return
    if not attempt:
        return
    record = None
    try:
        record = await crm.get_call_record(str(call_id))
    except Exception:
        logger.exception("Call record lookup failed for %s", call_id)
    transcript = None
    recording = None
    duration = None
    if record is not None:
        transcript = record.transcript or record.summary
        recording = record.recording_url
        duration = record.duration_seconds
    await crm.set_campaign_attempt_call_result(
        str(attempt["id"]),
        call_result=map_call_outcome(getattr(call_ctx, "outcome", None)),
        duration_seconds=duration,
        transcript=transcript,
        recording_url=recording,
    )
    if getattr(call_ctx, "outcome", None) == "sales_meeting_scheduled":
        await apply_campaign_call_outcome(call_ctx)


async def apply_campaign_call_outcome(call_ctx: Any) -> None:
    """When a dialed campaign call ends as a sales meeting, persist it."""
    crm = getattr(call_ctx, "crm", None)
    if crm is None or getattr(call_ctx, "outcome", None) != "sales_meeting_scheduled":
        return
    call_id = getattr(call_ctx, "call_id", None)
    if not call_id:
        return
    try:
        attempt = await crm.find_campaign_attempt_by_call(str(call_id))
    except Exception:
        logger.exception("Campaign lookup failed for %s", call_id)
        return
    if not attempt or attempt.get("result") == "meeting":
        return
    details = dict(getattr(call_ctx, "appointment_details", None) or {})
    preferred = str(details.get("sales_meeting") or getattr(call_ctx, "start_time", "") or utc_now_iso())
    qualification = {
        "company": details.get("company"),
        "role": details.get("role"),
        "interest": details.get("interest"),
        "purpose": getattr(call_ctx, "call_purpose", None),
    }
    try:
        await record_sales_meeting(
            crm,
            str(attempt["campaign_id"]),
            str(attempt["id"]),
            preferred_time=preferred,
            qualification=qualification,
        )
    except CampaignError:
        logger.exception("Could not store campaign meeting for %s", call_id)
