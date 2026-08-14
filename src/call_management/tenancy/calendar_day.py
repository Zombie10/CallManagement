"""Tenant-local calendar dates for daily call caps."""

from __future__ import annotations

from datetime import UTC, datetime


def tenant_calendar_day(tz_name: str | None, *, now: datetime | None = None) -> str:
    """Return YYYY-MM-DD in the tenant timezone (falls back to UTC)."""
    from zoneinfo import ZoneInfo

    current = now or datetime.now(UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    try:
        tz = ZoneInfo((tz_name or "UTC").strip() or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    return current.astimezone(tz).date().isoformat()
