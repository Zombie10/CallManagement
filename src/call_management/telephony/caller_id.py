"""Resolve inbound caller phone numbers from LiveKit SIP participants and metadata."""

from __future__ import annotations

import re

from livekit import rtc

from call_management.telephony.inbound_setup import normalize_e164

E164_RE = re.compile(r"\+\d{8,15}")
SIP_PHONE_ATTRS = ("sip.phoneNumber", "sip.from", "sip.callerId")


def _digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def looks_like_phone(value: str | None) -> bool:
    raw = (value or "").strip()
    if not raw or raw.lower() == "unknown":
        return False
    if E164_RE.fullmatch(raw):
        return True
    digits = _digits_only(raw)
    return 8 <= len(digits) <= 15


def normalize_caller_phone(value: str) -> str:
    raw = value.strip()
    e164 = normalize_e164(raw)
    if e164:
        return e164
    digits = _digits_only(raw)
    if not digits:
        return raw
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if raw.startswith("+"):
        return f"+{digits}"
    return f"+{digits}"


def phone_from_participant(participant: rtc.Participant) -> str | None:
    attrs = participant.attributes or {}
    for key in SIP_PHONE_ATTRS:
        raw = (attrs.get(key) or "").strip()
        if looks_like_phone(raw):
            return normalize_caller_phone(raw)

    identity = (participant.identity or "").strip()
    if looks_like_phone(identity):
        return normalize_caller_phone(identity)
    return None


def phone_from_room_name(room_name: str) -> str | None:
    for match in E164_RE.finditer(room_name or ""):
        return normalize_caller_phone(match.group(0))
    return None


def resolve_caller_phone(
    *,
    room_name: str,
    metadata_phone: str | None = None,
    participants: list[rtc.Participant] | None = None,
    fallback: str = "unknown",
) -> str:
    if metadata_phone and looks_like_phone(metadata_phone):
        return normalize_caller_phone(metadata_phone)

    for participant in participants or []:
        if participant.kind != rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            continue
        phone = phone_from_participant(participant)
        if phone:
            return phone

    from_room = phone_from_room_name(room_name)
    if from_room:
        return from_room

    return fallback


def refresh_call_ctx_caller(
    call_ctx,
    room: rtc.Room,
    *,
    metadata_phone: str | None = None,
) -> str:
    """Update call_ctx.from_number when a real caller ID becomes available."""
    current = (call_ctx.from_number or "").strip() or "unknown"
    fallback = current if looks_like_phone(current) else "unknown"
    phone = resolve_caller_phone(
        room_name=room.name,
        metadata_phone=metadata_phone,
        participants=list(room.remote_participants.values()),
        fallback=fallback,
    )
    if phone != "unknown":
        call_ctx.from_number = phone
    return call_ctx.from_number