"""Pure campaign eligibility. No clock and no telephony imports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class ContactAttemptState:
    contact_id: str
    phone: str
    name: str
    may_call: bool
    do_not_call: bool
    dial_count: int
    has_meeting: bool


@dataclass(frozen=True)
class DialChoice:
    contact_id: str
    phone: str
    name: str


def parse_hhmm(value: str) -> time:
    hour_text, minute_text = value.split(":", 1)
    return time(int(hour_text), int(minute_text))


def in_calling_window(at: datetime, window_start: str, window_end: str, timezone: str) -> bool:
    """True when ``at`` falls inside [start, end) in the campaign timezone."""
    if at.tzinfo is None:
        at = at.replace(tzinfo=ZoneInfo("UTC"))
    local = at.astimezone(ZoneInfo(timezone or "UTC"))
    clock = local.timetz().replace(tzinfo=None)
    return clock_in_window(clock, window_start, window_end)


def clock_in_window(clock: time, window_start: str, window_end: str) -> bool:
    start = parse_hhmm(window_start)
    end = parse_hhmm(window_end)
    if start <= end:
        return start <= clock < end
    return clock >= start or clock < end


def parse_weekdays(value: str | None) -> set[int]:
    """Monday is 0, matching ``datetime.weekday``."""
    chosen: set[int] = set()
    for piece in (value or "").split(","):
        piece = piece.strip()
        if piece.isdigit() and 0 <= int(piece) <= 6:
            chosen.add(int(piece))
    return chosen or set(range(7))


def local_when(at: datetime, timezone: str) -> datetime:
    if at.tzinfo is None:
        at = at.replace(tzinfo=ZoneInfo("UTC"))
    return at.astimezone(ZoneInfo(timezone or "UTC"))


def on_calling_schedule(
    at: datetime,
    *,
    window_start: str,
    window_end: str,
    timezone: str,
    weekdays: str | None,
    paused: bool = False,
) -> bool:
    """Weekdays, hours, and timezone. A paused campaign is never on schedule."""
    if paused:
        return False
    if not in_calling_window(at, window_start, window_end, timezone):
        return False
    local = local_when(at, timezone)
    return local.weekday() in parse_weekdays(weekdays)


def scheduled_slot(at: datetime, timezone: str, scheduled_time: str) -> str:
    local = local_when(at, timezone)
    return f"{local.date().isoformat()}T{scheduled_time}"


def scheduled_pass_is_due(
    at: datetime,
    *,
    window_start: str,
    window_end: str,
    timezone: str,
    weekdays: str | None,
    scheduled_time: str | None,
    paused: bool,
    last_slot: str = "",
) -> bool:
    """True when the clock matches the scheduled minute and that slot has not run."""
    clock = (scheduled_time or "").strip()
    if not clock or paused:
        return False
    if not on_calling_schedule(
        at,
        window_start=window_start,
        window_end=window_end,
        timezone=timezone,
        weekdays=weekdays,
        paused=False,
    ):
        return False
    local = local_when(at, timezone)
    if local.strftime("%H:%M") != clock:
        return False
    return last_slot != scheduled_slot(at, timezone, clock)


CALL_RESULTS = ("answered", "no-answer", "busy", "failed")

_OUTCOME_TO_RESULT = {
    "answered": "answered",
    "completed": "answered",
    "resolved": "answered",
    "escalated": "answered",
    "sales_meeting_scheduled": "answered",
    "in_progress": "answered",
    "no-answer": "no-answer",
    "no_answer": "no-answer",
    "noanswer": "no-answer",
    "unanswered": "no-answer",
    "not_answered": "no-answer",
    "busy": "busy",
    "user_busy": "busy",
    "failed": "failed",
    "failure": "failed",
    "error": "failed",
    "canceled": "failed",
    "cancelled": "failed",
    "rejected": "failed",
}


def map_call_outcome(outcome: str | None) -> str:
    """Map a finished call onto answered, no-answer, busy, or failed."""
    key = (outcome or "").strip().lower().replace(" ", "_")
    return _OUTCOME_TO_RESULT.get(key, "failed")


_SIP_ACTIVE = frozenset({"active", "answered", "automation"})
_SIP_BUSY = frozenset({"busy", "user_busy"})
_DISCONNECT_RESULT = {
    "USER_REJECTED": "busy",
    "USER_UNAVAILABLE": "no-answer",
    "SIP_TRUNK_FAILURE": "failed",
}
_PRESERVE_OUTCOMES = frozenset(
    {
        "resolved",
        "escalated",
        "sales_meeting_scheduled",
        "answered",
        "completed",
        "no-answer",
        "no_answer",
        "noanswer",
        "not_answered",
        "unanswered",
        "busy",
        "user_busy",
        "failed",
        "failure",
        "error",
        "canceled",
        "cancelled",
        "rejected",
    }
)


def sip_disconnect_reason_name(reason: object) -> str:
    """LiveKit DisconnectReason as its enum name. Empty when unknown."""
    if reason is None:
        return ""
    if isinstance(reason, str):
        return reason.strip()
    try:
        from livekit import rtc

        if isinstance(reason, int):
            return rtc.DisconnectReason.Name(reason)
    except (ValueError, AttributeError):
        return ""
    name = getattr(reason, "name", None)
    return name.strip() if isinstance(name, str) else ""


def note_sip_call_status(call_ctx: object, status: str | None) -> None:
    """Remember whether this SIP leg reached a connected state."""
    key = (status or "").strip().lower()
    setattr(call_ctx, "saw_sip_leg", True)
    if not key:
        return
    setattr(call_ctx, "sip_status_seen", True)
    if key in _SIP_ACTIVE:
        setattr(call_ctx, "sip_leg_active", True)
    elif key in _SIP_BUSY:
        setattr(call_ctx, "sip_saw_busy", True)
    elif key == "failed":
        setattr(call_ctx, "sip_terminal_status", "failed")


def note_sip_disconnect_reason(call_ctx: object, reason: object) -> None:
    """Apply USER_REJECTED, USER_UNAVAILABLE, or SIP_TRUNK_FAILURE before save."""
    setattr(call_ctx, "saw_sip_leg", True)
    name = sip_disconnect_reason_name(reason)
    if name:
        setattr(call_ctx, "sip_disconnect_reason", name)
    if getattr(call_ctx, "sip_leg_active", False):
        return
    mapped = _DISCONNECT_RESULT.get(name)
    if not mapped:
        return
    existing = (getattr(call_ctx, "outcome", None) or "").strip().lower().replace(" ", "_")
    if existing in _PRESERVE_OUTCOMES:
        return
    setattr(call_ctx, "outcome", mapped)


def apply_sip_leg_end(call_ctx: object, status: str | None = None) -> None:
    """Classify a SIP leg that ended before anyone answered.

    A resolved or scheduled sales call keeps its outcome. Active and
    automation mean the callee connected, so the call stays answered.
    A disconnect reason already stored as busy, no-answer, or failed is kept.
    Ringing that ends with no reason is no-answer.
    """
    if status:
        note_sip_call_status(call_ctx, status)
    existing = (getattr(call_ctx, "outcome", None) or "").strip().lower().replace(" ", "_")
    if existing in _PRESERVE_OUTCOMES:
        return
    if getattr(call_ctx, "sip_leg_active", False):
        return
    terminal = (status or getattr(call_ctx, "sip_terminal_status", "") or "").strip().lower()
    if not getattr(call_ctx, "sip_status_seen", False) and not terminal:
        return
    if getattr(call_ctx, "sip_saw_busy", False) or terminal in _SIP_BUSY:
        setattr(call_ctx, "outcome", "busy")
    elif terminal == "failed":
        setattr(call_ctx, "outcome", "failed")
    else:
        setattr(call_ctx, "outcome", "no-answer")


def parse_contact_file(text: str) -> list[tuple[str, str]]:
    """Name and phone pairs from a CSV or line file. Header row is optional."""
    import csv
    from io import StringIO

    raw = (text or "").strip()
    if not raw:
        return []
    sample = raw.splitlines()[0]
    delimiter = "," if "," in sample else ";" if ";" in sample else ","
    reader = csv.reader(StringIO(raw), delimiter=delimiter)
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return []
    header = [cell.strip().lower() for cell in rows[0]]
    name_keys = {"name", "nombre", "contacto", "contact"}
    phone_keys = {"phone", "telefono", "teléfono", "tel", "number", "numero", "número"}
    start = 0
    name_at = 0
    phone_at = 1
    if any(cell in name_keys or cell in phone_keys for cell in header):
        start = 1
        for index, cell in enumerate(header):
            if cell in name_keys:
                name_at = index
            if cell in phone_keys:
                phone_at = index
    found: list[tuple[str, str]] = []
    for row in rows[start:]:
        if len(row) < 2:
            continue
        name = row[name_at].strip() if name_at < len(row) else ""
        phone = row[phone_at].strip() if phone_at < len(row) else ""
        if phone.startswith("+") or phone.replace(" ", "").startswith("+"):
            pass
        elif name.replace(" ", "").startswith("+"):
            name, phone = phone, name
        if name and phone:
            found.append((name, phone))
    return found


def search_contacts(contacts: list[dict], query: str) -> list[dict]:
    needle = query.strip().lower()
    if not needle:
        return list(contacts)
    return [
        row
        for row in contacts
        if needle in str(row.get("name") or "").lower() or needle in str(row.get("phone") or "").lower()
    ]


def filter_attempt_report(
    attempts: list[dict],
    *,
    result: str | None,
    start: datetime | None,
    end: datetime | None,
) -> list[dict]:
    """Attempts whose call result and created time match. ``end`` is exclusive."""
    chosen: list[dict] = []
    for row in attempts:
        disposition = str(row.get("call_result") or "")
        if result and disposition != result:
            continue
        created = _parse_created(row.get("created_at"))
        if start and (created is None or created < start):
            continue
        if end and (created is None or created >= end):
            continue
        chosen.append(row)
    return chosen


def _parse_created(value: object) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=ZoneInfo("UTC"))
    return parsed


def select_dials(
    contacts: list[ContactAttemptState],
    *,
    at: datetime,
    window_start: str,
    window_end: str,
    timezone: str,
    pace: int,
    max_attempts: int,
    weekdays: str | None = None,
    paused: bool = False,
) -> list[DialChoice]:
    """Contacts this pass may dial, in list order, capped by pace.

    A contact is eligible only when it may be called, is not do-not-call,
    has no meeting yet, is still under max attempts, and ``at`` is inside
    the calling window. Everyone else is left undialed.
    """
    if pace < 1 or max_attempts < 1:
        return []
    if not on_calling_schedule(
        at,
        window_start=window_start,
        window_end=window_end,
        timezone=timezone,
        weekdays=weekdays,
        paused=paused,
    ):
        return []
    chosen: list[DialChoice] = []
    for contact in contacts:
        if not contact.may_call or contact.do_not_call or contact.has_meeting:
            continue
        if contact.dial_count >= max_attempts:
            continue
        chosen.append(
            DialChoice(contact_id=contact.contact_id, phone=contact.phone, name=contact.name)
        )
        if len(chosen) >= pace:
            break
    return chosen


def campaign_totals(
    contacts: list[ContactAttemptState],
    attempts: list[dict],
    *,
    max_attempts: int,
) -> dict[str, int]:
    """Snapshot counts for the campaign screen.

    ``dialed`` counts placed calls, including those that later became a meeting.
    ``skipped`` counts contacts that must not be called.
    ``pending`` counts contacts that can still be dialed.
    """
    meeting_contacts = {str(row["contact_id"]) for row in attempts if row.get("result") == "meeting"}
    dialed = sum(1 for row in attempts if row.get("result") in ("dialed", "meeting"))
    meeting = sum(1 for row in attempts if row.get("result") == "meeting")
    dials_by_contact: dict[str, int] = {}
    for row in attempts:
        if row.get("result") not in ("dialed", "meeting"):
            continue
        key = str(row["contact_id"])
        dials_by_contact[key] = dials_by_contact.get(key, 0) + 1
    pending = 0
    skipped = 0
    for contact in contacts:
        if contact.do_not_call or not contact.may_call:
            skipped += 1
            continue
        if contact.contact_id in meeting_contacts:
            continue
        if dials_by_contact.get(contact.contact_id, 0) >= max_attempts:
            continue
        pending += 1
    return {"pending": pending, "dialed": dialed, "skipped": skipped, "meeting": meeting}
