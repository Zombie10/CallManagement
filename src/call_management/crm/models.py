"""CRM domain models (shared by SQLite backend and API layers)."""

from __future__ import annotations

from dataclasses import dataclass, field

from call_management.utils.time import utc_now_iso


@dataclass
class Customer:
    phone_number: str
    name: str | None = None
    email: str | None = None
    notes: str | None = None
    vip: bool = False
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)


@dataclass
class CallRecord:
    call_id: str
    room_name: str
    from_number: str
    to_number: str | None = None
    start_time: str = field(default_factory=utc_now_iso)
    end_time: str | None = None
    outcome: str | None = None
    summary: str | None = None
    agent_notes: str | None = None
    transferred_to: str | None = None
    duration_seconds: int | None = None
    transcript: str | None = None
    recording_url: str | None = None
    agent_instance_id: str | None = None
    channel: str = "sip"


@dataclass
class Appointment:
    id: str | None = None
    customer_phone: str = ""
    scheduled_time: str = ""
    purpose: str = ""
    notes: str | None = None
    created_at: str = field(default_factory=utc_now_iso)
