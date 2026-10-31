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
    start = parse_hhmm(window_start)
    end = parse_hhmm(window_end)
    if start <= end:
        return start <= clock < end
    return clock >= start or clock < end


def select_dials(
    contacts: list[ContactAttemptState],
    *,
    at: datetime,
    window_start: str,
    window_end: str,
    timezone: str,
    pace: int,
    max_attempts: int,
) -> list[DialChoice]:
    """Contacts this pass may dial, in list order, capped by pace.

    A contact is eligible only when it may be called, is not do-not-call,
    has no meeting yet, is still under max attempts, and ``at`` is inside
    the calling window. Everyone else is left undialed.
    """
    if pace < 1 or max_attempts < 1:
        return []
    if not in_calling_window(at, window_start, window_end, timezone):
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
