"""Mock scheduling service backed by the CRM database.

Replace with Google Calendar, Calendly, or another provider in production.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from call_management.crm.database import Appointment, CRMDatabase


@dataclass
class CalendarService:
    crm: CRMDatabase

    async def schedule_callback(
        self,
        *,
        phone_number: str,
        when: str,
        purpose: str,
        notes: str | None = None,
    ) -> str:
        appt = Appointment(
            customer_phone=phone_number,
            scheduled_time=when,
            purpose=purpose,
            notes=notes,
        )
        return await self.crm.create_appointment(appt)

    async def list_upcoming(self, phone_number: str, limit: int = 5) -> list[Appointment]:
        return await self.crm.get_upcoming_appointments(phone_number, limit=limit)


async def schedule_appointment(
    crm: CRMDatabase,
    *,
    phone_number: str,
    when: str,
    purpose: str,
    notes: str | None = None,
) -> tuple[str, dict[str, Any]]:
    """Convenience helper used by agents and tests."""
    service = CalendarService(crm=crm)
    appt_id = await service.schedule_callback(
        phone_number=phone_number,
        when=when,
        purpose=purpose,
        notes=notes,
    )
    details = {"id": appt_id, "time": when, "purpose": purpose}
    return appt_id, details
