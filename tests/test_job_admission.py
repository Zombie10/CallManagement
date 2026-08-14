"""Shipped inbound job gate: daily TZ cap + shared SQLite concurrency."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from call_management.tenancy.calendar_day import tenant_calendar_day
from call_management.tenancy.platform_store import get_platform_store
from call_management.tenancy.queue import admit_inbound_job, reset_queue_state


@pytest.fixture(autouse=True)
def _clear_slots():
    reset_queue_state()
    yield
    reset_queue_state()


def test_tenant_calendar_day_uses_timezone_not_utc():
    # 2026-08-14 05:30 UTC == 2026-08-13 23:30 in America/Guatemala
    now = datetime(2026, 8, 14, 5, 30, tzinfo=UTC)
    assert tenant_calendar_day("America/Guatemala", now=now) == "2026-08-13"
    assert tenant_calendar_day("UTC", now=now) == "2026-08-14"


def test_daily_counter_follows_tenant_timezone(monkeypatch):
    store = get_platform_store()
    tenant = store.create_tenant(
        slug="tz-cafe",
        name="Café TZ",
        timezone="America/Guatemala",
        max_calls_per_day=10,
    )
    agent = store.create_agent(
        tenant.id, slug="tz-bot", display_name="Bot", template_id="receptionist", status="active"
    )

    evening_utc = datetime(2026, 8, 14, 5, 30, tzinfo=UTC)  # still Aug 13 local
    monkeypatch.setattr(
        "call_management.tenancy.calendar_day.datetime",
        type("D", (), {"now": staticmethod(lambda tz=None: evening_utc), "UTC": UTC}) ,
    )
    # increment uses tenant_calendar_day(now=datetime.now(UTC)) — patch tenant_calendar_day
    monkeypatch.setattr(
        "call_management.tenancy.calendar_day.tenant_calendar_day",
        lambda tz, now=None: "2026-08-13",
    )
    store.increment_agent_calls(agent.id)
    store.increment_agent_calls(agent.id)
    assert store.tenant_metrics(tenant.id)["calls_today"] == 2

    monkeypatch.setattr(
        "call_management.tenancy.calendar_day.tenant_calendar_day",
        lambda tz, now=None: "2026-08-14",
    )
    store.increment_agent_calls(agent.id)
    loaded = store.get_agent(agent.id)
    assert loaded.call_count_today == 1
    assert loaded.call_count_date == "2026-08-14"
    assert store.tenant_metrics(tenant.id)["calls_today"] == 1


def test_admit_rejects_when_daily_cap_reached():
    store = get_platform_store()
    tenant = store.create_tenant(
        slug="full-day", name="Full", timezone="UTC", max_calls_per_day=1
    )
    agent = store.create_agent(
        tenant.id, slug="only", display_name="Only", template_id="receptionist", status="active"
    )
    store.increment_agent_calls(agent.id)
    denied = admit_inbound_job(store, tenant=tenant, agent_instance=agent, dialed_number=None)
    assert denied.allowed is False
    assert denied.reason == "daily_limit"


def test_admit_rejects_when_concurrency_layer_full():
    store = get_platform_store()
    tenant = store.create_tenant(slug="busy", name="Busy", max_calls_per_day=100)
    agent = store.create_agent(
        tenant.id,
        slug="capped",
        display_name="Capped",
        template_id="receptionist",
        status="active",
        max_concurrent_calls=1,
    )
    first = admit_inbound_job(store, tenant=tenant, agent_instance=agent, dialed_number=None)
    assert first.allowed is True
    second = admit_inbound_job(store, tenant=tenant, agent_instance=agent, dialed_number=None)
    assert second.allowed is False
    assert second.reason == "agent"


def test_admit_shared_across_store_handles():
    """Two PlatformStore objects on the same DB share the cap (multi-process)."""
    store = get_platform_store()
    tenant = store.create_tenant(slug="shared", name="Shared", max_calls_per_day=100)
    agent = store.create_agent(
        tenant.id,
        slug="one",
        display_name="One",
        template_id="receptionist",
        status="active",
        max_concurrent_calls=1,
    )
    assert admit_inbound_job(store, tenant=tenant, agent_instance=agent, dialed_number=None).allowed
    twin = type(store)(store.db_path)
    twin.initialize()
    denied = admit_inbound_job(twin, tenant=tenant, agent_instance=agent, dialed_number=None)
    assert denied.allowed is False
    assert denied.reason == "agent"
