"""Multi-tenant platform tests."""

from __future__ import annotations

import pytest

from call_management.tenancy.context import clear_crm_cache, resolve_crm_for_tenant, resolve_dispatch
from call_management.tenancy.platform_store import PlatformStore, reset_platform_store


@pytest.fixture
def platform_db(tmp_path, monkeypatch):
    db = tmp_path / "platform.db"
    tenants_root = tmp_path / "tenants"
    monkeypatch.setenv("PLATFORM_DB_PATH", str(db))
    monkeypatch.setenv("TENANTS_DATA_ROOT", str(tenants_root))
    reset_platform_store()
    clear_crm_cache()
    store = PlatformStore(str(db))
    store.initialize()
    yield store
    reset_platform_store()
    clear_crm_cache()


@pytest.mark.asyncio
async def test_default_tenant_and_isolated_crm(platform_db):
    default = platform_db.ensure_default_tenant()
    crm_a = await resolve_crm_for_tenant(default.id)
    await crm_a.get_or_create_customer("+15551111111")
    customer = await crm_a.get_or_create_customer("+15551111111")
    customer.name = "Tenant A Only"
    await crm_a.update_customer(customer)

    other = platform_db.create_tenant(slug="acme", name="ACME Corp")
    crm_b = await resolve_crm_for_tenant(other.id)
    other_customer = await crm_b.get_or_create_customer("+15551111111")
    assert other_customer.name is None


@pytest.mark.asyncio
async def test_agent_instance_and_phone_route(platform_db):
    tenant = platform_db.create_tenant(slug="bac", name="BAC Test")
    agent = platform_db.create_agent(
        tenant.id,
        slug="recepcion",
        display_name="Recepción BAC",
        template_id="banking_support",
        status="active",
        phone_number="+15103750043",
    )
    route = platform_db.resolve_phone("+15103750043")
    assert route is not None
    assert route.agent_instance_id == agent.id

    resolved_tenant, resolved_agent, template = resolve_dispatch(phone_number="+15103750043")
    assert resolved_tenant.id == tenant.id
    assert resolved_agent is not None
    assert resolved_agent.id == agent.id
    assert template == "banking_support"

    by_dialed, resolved_agent2, template2 = resolve_dispatch(dialed_number="+15103750043")
    assert by_dialed.id == tenant.id
    assert resolved_agent2 is not None
    assert resolved_agent2.id == agent.id
    assert template2 == "banking_support"


def test_tenant_metrics_and_limits(platform_db):
    tenant = platform_db.create_tenant(slug="limited", name="Limited Co", max_agents=1)
    platform_db.create_agent(
        tenant.id,
        slug="a1",
        display_name="Agent 1",
        template_id="receptionist",
    )
    with pytest.raises(ValueError, match="Límite"):
        platform_db.create_agent(
            tenant.id,
            slug="a2",
            display_name="Agent 2",
            template_id="support",
        )
    metrics = platform_db.tenant_metrics(tenant.id)
    assert metrics["agent_count"] == 1


def test_duplicate_agent(platform_db):
    tenant = platform_db.create_tenant(slug="dup", name="Dup Co")
    original = platform_db.create_agent(
        tenant.id,
        slug="orig",
        display_name="Original",
        template_id="sales",
        voice="rex",
    )
    copy = platform_db.duplicate_agent(original.id, slug="orig-copy", display_name="Copy")
    assert copy.template_id == "sales"
    assert copy.voice == "rex"
    assert copy.status == "draft"


def test_agent_schedules(platform_db):
    tenant = platform_db.create_tenant(slug="sched", name="Sched Co")
    agent = platform_db.create_agent(
        tenant.id,
        slug="sched-agent",
        display_name="Scheduled",
        template_id="support",
    )
    schedules = platform_db.set_schedules(
        agent.id,
        [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}],
    )
    assert len(schedules) == 1
    assert schedules[0].day_of_week == 1


def test_platform_metrics(platform_db):
    platform_db.create_tenant(slug="m1", name="M1")
    metrics = platform_db.platform_metrics()
    assert metrics["tenant_count"] >= 2  # default + m1
    assert "tenants" in metrics