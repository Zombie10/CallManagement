"""Business-hour schedule tests."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from call_management.tenancy.platform_store import AgentSchedule
from call_management.tenancy.scheduling import is_within_schedule


def test_within_weekday_hours():
    schedules = [
        AgentSchedule(
            id="s1",
            agent_instance_id="a1",
            day_of_week=1,
            start_time="09:00",
            end_time="17:00",
            timezone="America/Guatemala",
        )
    ]
    monday_noon = datetime(2026, 6, 29, 12, 0, tzinfo=ZoneInfo("America/Guatemala"))
    assert is_within_schedule(schedules, now=monday_noon) is True


def test_outside_hours():
    schedules = [
        AgentSchedule(
            id="s1",
            agent_instance_id="a1",
            day_of_week=1,
            start_time="09:00",
            end_time="17:00",
            timezone="America/Guatemala",
        )
    ]
    monday_night = datetime(2026, 6, 29, 20, 0, tzinfo=ZoneInfo("America/Guatemala"))
    assert is_within_schedule(schedules, now=monday_night) is False


def test_empty_schedule_always_open():
    assert is_within_schedule([], now=datetime.now(ZoneInfo("America/Guatemala"))) is True