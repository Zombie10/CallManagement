"""Tests for the 11 gap features implemented in this milestone."""

from __future__ import annotations

import hashlib
import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.auth_store import ensure_bootstrap_user
from call_management.crm.database import Appointment, CRMDatabase, reset_crm_singleton
from call_management.tenancy.platform_store import get_platform_store, reset_platform_store
from call_management.tenancy.queue import (
    QueueLimits,
    agent_active_count,
    build_queue_limits,
    number_active_count,
    register_active_call,
    release,
    reset_queue_state,
    resolve_queue_limits_from_store,
    supervisor_snapshot,
    try_acquire,
    unregister_active_call,
)
from call_management.tenancy.webhooks import WEBHOOK_EVENTS


@pytest.fixture(autouse=True)
def _reset_stores(tmp_path, monkeypatch):
    reset_crm_singleton()
    reset_platform_store()
    reset_queue_state()
    monkeypatch.setenv("PLATFORM_DB_PATH", str(tmp_path / "platform.db"))
    monkeypatch.setenv("TENANTS_DATA_ROOT", str(tmp_path / "tenants"))
    monkeypatch.delenv("CRM_DATABASE_URL", raising=False)
    get_platform_store().initialize()
    ensure_bootstrap_user()
    yield
    reset_queue_state()


@pytest.mark.asyncio
async def test_appointment_crud(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "crm.db")
    await db.initialize()
    await db.get_or_create_customer("+15550001111")
    appt = Appointment(
        customer_phone="+15550001111",
        scheduled_time="2026-06-27T15:00:00",
        purpose="Demo",
        notes="test",
    )
    appt_id = await db.create_appointment(appt)
    fetched = await db.get_appointment(appt_id)
    assert fetched and fetched.purpose == "Demo"

    fetched.scheduled_time = "2026-06-28T10:00:00"
    await db.update_appointment(fetched)
    updated = await db.get_appointment(appt_id)
    assert updated.scheduled_time == "2026-06-28T10:00:00"

    assert await db.delete_appointment(appt_id)
    assert await db.get_appointment(appt_id) is None


@pytest.mark.asyncio
async def test_customer_profile_unified(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "crm.db")
    await db.initialize()
    phone = "+15550002222"
    await db.get_or_create_customer(phone)
    await db.create_appointment(
        Appointment(customer_phone=phone, scheduled_time="tomorrow", purpose="callback")
    )
    profile = await db.get_customer_profile(phone)
    assert profile is not None
    assert profile["customer"]["phone_number"] == phone
    assert profile["stats"]["appointments"] == 1


@pytest.mark.asyncio
async def test_actionable_analytics(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "crm.db")
    await db.initialize()
    from call_management.crm.database import CallRecord

    await db.create_call_record(
        CallRecord(
            call_id="c1",
            room_name="r1",
            from_number="+1",
            duration_seconds=10,
            outcome="completed",
            transcript="gracias por la ayuda",
        )
    )
    await db.create_call_record(
        CallRecord(
            call_id="c2",
            room_name="r2",
            from_number="+2",
            duration_seconds=120,
            outcome="escalated",
            transferred_to="escalation",
            transcript="tengo un problema urgente",
        )
    )
    data = await db.get_actionable_analytics(sla_seconds=30)
    assert data["total_calls"] == 2
    assert data["escalations"] == 1
    assert data["handoffs"] == 1
    assert "sentiment_label" in data
    assert len(data["agent_comparison"]) >= 1


@pytest.mark.asyncio
async def test_supervisor_queue_registry():
    await register_active_call(
        "call_abc",
        tenant_id="tenant_1",
        from_number="+1555",
        channel="sip",
        started_at="2026-06-26T12:00:00",
        queued=True,
        recording=True,
    )
    snap = supervisor_snapshot("tenant_1")
    assert snap["active_calls"] == 1
    assert snap["queued_calls"] == 1
    assert snap["recording_calls"] == 1
    await unregister_active_call("call_abc")
    assert supervisor_snapshot("tenant_1")["active_calls"] == 0


def test_webhook_events_catalog():
    assert "call.started" in WEBHOOK_EVENTS
    assert "appointment.created" in WEBHOOK_EVENTS
    assert "agent.handoff" in WEBHOOK_EVENTS


@pytest.mark.asyncio
async def test_webhook_delivery_audit_log(tmp_path):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    logged = store.log_webhook_delivery(
        tenant_id=tenant.id,
        webhook_id="whk_test",
        event="call.ended",
        url="https://example.com/hook",
        status_code=200,
        success=True,
        attempts=1,
        error=None,
    )
    assert logged["success"] is True
    deliveries = store.list_webhook_deliveries(tenant.id)
    assert deliveries["total"] == 1
    assert deliveries["items"][0]["event"] == "call.ended"


@pytest.mark.asyncio
async def test_api_keys_and_public_api(tmp_path):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    raw = "cmk_test_secret_key_12345"
    created = store.create_api_key(
        tenant.id,
        name="Test",
        scopes=["calls.read"],
        raw_key=raw,
        key_hash=hashlib.sha256(raw.encode()).hexdigest(),
    )
    assert created["api_key"] == raw
    listed = store.list_api_keys(tenant.id)
    assert len(listed) == 1

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/public/v1/calls",
            headers={"X-Api-Key": raw, "X-Tenant-Id": tenant.id},
        )
        assert res.status_code == 200
        body = res.json()
        assert "items" in body


@pytest.mark.asyncio
async def test_appointments_api_crud(tmp_path):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "CallMgmt2026!"},
        )
        assert login.status_code == 200
        cookies = login.cookies

        create = await client.post(
            "/api/appointments",
            headers={"X-Tenant-Id": tenant.id},
            cookies=cookies,
            json={
                "customer_phone": "+15559998888",
                "scheduled_time": "2026-07-01 14:00",
                "purpose": "Reunión",
            },
        )
        assert create.status_code == 200
        appt_id = create.json()["id"]

        patch = await client.patch(
            f"/api/appointments/{appt_id}",
            headers={"X-Tenant-Id": tenant.id},
            cookies=cookies,
            json={"purpose": "Reunión actualizada"},
        )
        assert patch.status_code == 200
        assert patch.json()["purpose"] == "Reunión actualizada"

        delete = await client.delete(
            f"/api/appointments/{appt_id}",
            headers={"X-Tenant-Id": tenant.id},
            cookies=cookies,
        )
        assert delete.status_code == 200


@pytest.mark.asyncio
async def test_supervisor_api_endpoint(tmp_path):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    await register_active_call(
        "call_sup",
        tenant_id=tenant.id,
        from_number="+1",
        started_at="2026-06-26T10:00:00",
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "CallMgmt2026!"},
        )
        res = await client.get(
            "/api/supervisor",
            headers={"X-Tenant-Id": tenant.id},
            cookies=login.cookies,
        )
        assert res.status_code == 200
        body = res.json()
        assert body["active_calls"] >= 1
        assert "alerts" in body


def test_postgres_backend_sqlite_fallback_without_asyncpg(monkeypatch, tmp_path):
    monkeypatch.setenv("CRM_DATABASE_URL", "postgresql://user:pass@localhost/testdb")
    from call_management.crm.postgres_backend import PostgresCRMDatabase

    pg = PostgresCRMDatabase("postgresql://localhost/test", tenant_key=str(tmp_path / "t1" / "crm.db"))
    if not pg._pg:
        assert pg.db_path == tmp_path / "t1" / "crm.db"


@pytest.mark.asyncio
async def test_export_calls_csv(tmp_path):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "CallMgmt2026!"},
        )
        res = await client.get(
            "/api/export/calls.csv",
            headers={"X-Tenant-Id": tenant.id},
            cookies=login.cookies,
        )
        assert res.status_code == 200
        assert "text/csv" in res.headers.get("content-type", "")
        assert "call_id" in res.text


def test_permissions_supervisor_and_export_modules():
    from call_management.admin.auth_permissions import can_access_api, can_access_route

    assert can_access_route("viewer", "/supervisor", ["supervisor"])
    assert can_access_api("admin", "/api/supervisor")
    assert can_access_api("admin", "/api/export/calls.csv")


@pytest.mark.asyncio
async def test_per_agent_concurrency_limits(monkeypatch):
    monkeypatch.setenv("MAX_CONCURRENT_CALLS_PER_TENANT", "20")
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    banco = store.create_agent(
        tenant.id,
        slug="banco",
        display_name="Banco",
        template_id="banking_support",
        status="active",
        max_concurrent_calls=8,
    )
    recepcion = store.create_agent(
        tenant.id,
        slug="recepcion",
        display_name="Recepción",
        template_id="receptionist",
        status="active",
        max_concurrent_calls=4,
    )

    banco_limits = resolve_queue_limits_from_store(
        store,
        tenant_id=tenant.id,
        agent_instance_id=banco.id,
        dialed_number=None,
    )
    recepcion_limits = resolve_queue_limits_from_store(
        store,
        tenant_id=tenant.id,
        agent_instance_id=recepcion.id,
        dialed_number=None,
    )

    for _ in range(8):
        ok, blocked = await try_acquire(banco_limits)
        assert ok and blocked is None
    ok, blocked = await try_acquire(banco_limits)
    assert not ok and blocked == "agent"
    assert agent_active_count(banco.id) == 8

    for _ in range(4):
        ok, blocked = await try_acquire(recepcion_limits)
        assert ok and blocked is None
    ok, blocked = await try_acquire(recepcion_limits)
    assert not ok and blocked == "agent"

    await release(banco_limits)
    ok, blocked = await try_acquire(banco_limits)
    assert ok and blocked is None


@pytest.mark.asyncio
async def test_per_number_concurrency_limits(monkeypatch):
    monkeypatch.setenv("MAX_CONCURRENT_CALLS_PER_TENANT", "20")
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    agent = store.create_agent(
        tenant.id,
        slug="multi-line",
        display_name="Multi línea",
        template_id="receptionist",
        status="active",
        phone_number="+15551110001",
        phone_numbers=["+15551110001", "+15551110002"],
        phone_limits={"+15551110001": 2, "+15551110002": 4},
        max_concurrent_calls=8,
    )

    line1 = resolve_queue_limits_from_store(
        store,
        tenant_id=tenant.id,
        agent_instance_id=agent.id,
        dialed_number="+15551110001",
    )
    line2 = resolve_queue_limits_from_store(
        store,
        tenant_id=tenant.id,
        agent_instance_id=agent.id,
        dialed_number="+15551110002",
    )

    for _ in range(2):
        ok, blocked = await try_acquire(line1)
        assert ok and blocked is None
    ok, blocked = await try_acquire(line1)
    assert not ok and blocked == "number"
    assert number_active_count("+15551110001") == 2

    for _ in range(4):
        ok, blocked = await try_acquire(line2)
        assert ok and blocked is None
    ok, blocked = await try_acquire(line2)
    assert not ok and blocked == "number"


@pytest.mark.asyncio
async def test_supervisor_snapshot_agent_limits(monkeypatch):
    monkeypatch.setenv("MAX_CONCURRENT_CALLS_PER_TENANT", "12")
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    agent = store.create_agent(
        tenant.id,
        slug="soporte",
        display_name="Soporte",
        template_id="support",
        status="active",
        max_concurrent_calls=3,
    )
    limits = build_queue_limits(
        tenant_id=tenant.id,
        agent_instance_id=agent.id,
        agent_max_concurrent=3,
    )
    for _ in range(3):
        await try_acquire(limits)

    snap = supervisor_snapshot(
        tenant.id,
        agents=store.list_agents(tenant.id),
        phone_routes=store.list_tenant_phone_routes(tenant.id),
    )
    assert snap["agent_limits"][0]["at_capacity"] is True
    assert snap["tenant_limit"]["cap"] == 12