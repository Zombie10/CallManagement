"""Agent business-hour checks."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from call_management.tenancy.platform_store import AgentSchedule


def _parse_hhmm(value: str) -> tuple[int, int]:
    hour, minute = value.strip().split(":", 1)
    return int(hour), int(minute)


def _minutes_since_midnight(hour: int, minute: int) -> int:
    return hour * 60 + minute


def is_within_schedule(
    schedules: list[AgentSchedule],
    *,
    now: datetime | None = None,
    fallback_timezone: str = "America/Guatemala",
) -> bool:
    """Return True if no schedules configured, or current time falls in a window."""
    if not schedules:
        return True

    for entry in schedules:
        tz = ZoneInfo(entry.timezone or fallback_timezone)
        local_now = (now or datetime.now(tz)).astimezone(tz)
        # agent_schedules use 0=Sunday … 6=Saturday (UI/JS); datetime.weekday() is 0=Monday … 6=Sunday
        store_weekday = (local_now.weekday() + 1) % 7
        if store_weekday != entry.day_of_week:
            continue
        start_h, start_m = _parse_hhmm(entry.start_time)
        end_h, end_m = _parse_hhmm(entry.end_time)
        current = _minutes_since_midnight(local_now.hour, local_now.minute)
        start = _minutes_since_midnight(start_h, start_m)
        end = _minutes_since_midnight(end_h, end_m)
        if start <= current < end:
            return True
    return False


def schedule_status(
    schedules: list[AgentSchedule],
    *,
    now: datetime | None = None,
    fallback_timezone: str = "America/Guatemala",
) -> str:
    """Return 'open', 'closed', or 'always'."""
    if not schedules:
        return "always"
    return "open" if is_within_schedule(schedules, now=now, fallback_timezone=fallback_timezone) else "closed"


def agent_schedule_status(agent_id: str) -> str:
    from call_management.tenancy.platform_store import get_platform_store

    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent:
        return "always"
    schedules = store.list_schedules(agent_id)
    tenant = store.get_tenant(agent.tenant_id)
    tz = tenant.timezone if tenant else "America/Guatemala"
    return schedule_status(schedules, fallback_timezone=tz)


def is_agent_available(agent_id: str) -> bool:
    from call_management.tenancy.platform_store import get_platform_store

    store = get_platform_store()
    agent = store.get_agent(agent_id)
    if not agent:
        return True
    if agent.status != "active":
        return False
    schedules = store.list_schedules(agent_id)
    tenant = store.get_tenant(agent.tenant_id)
    tz = tenant.timezone if tenant else "America/Guatemala"
    return is_within_schedule(schedules, fallback_timezone=tz)