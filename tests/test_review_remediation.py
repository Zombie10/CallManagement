"""Regression tests for the maintainability / authz review remediations."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.agents.runtime import build_runtime_agent
from call_management.crm.session_persist import finalize_interaction
from call_management.tenancy.context import get_tenant_context, resolve_dispatch
from call_management.tenancy.platform_store import get_platform_store


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_update_agent_phone_limits_does_not_write_fake_column():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    agent = store.create_agent(
        tenant.id,
        slug="limits-bot",
        display_name="Limits",
        template_id="receptionist",
        status="active",
        phone_number="+15551110001",
        phone_numbers=["+15551110001", "+15551110002"],
        phone_limits={"+15551110001": 2},
    )
    updated = store.update_agent(
        agent.id,
        display_name="Limits 2",
        phone_limits={"+15551110001": 3, "+15551110002": 4},
        phone_numbers=["+15551110001", "+15551110002"],
    )
    assert updated.display_name == "Limits 2"
    routes = store.list_phone_routes(agent.id)
    by_num = {r.phone_number: r.max_concurrent_calls for r in routes}
    assert by_num["+15551110001"] == 3
    assert by_num["+15551110002"] == 4


def test_daily_call_counter_resets_on_new_date(monkeypatch):
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    agent = store.create_agent(
        tenant.id,
        slug="daily-bot",
        display_name="Daily",
        template_id="receptionist",
        status="active",
    )
    store.increment_agent_calls(agent.id)
    store.increment_agent_calls(agent.id)
    loaded = store.get_agent(agent.id)
    assert loaded.call_count_today == 2
    assert store.tenant_metrics(tenant.id)["calls_today"] == 2

    monkeypatch.setattr(
        "call_management.tenancy.calendar_day.tenant_calendar_day",
        lambda tz, now=None: "1999-01-02",
    )
    store.increment_agent_calls(agent.id)
    loaded = store.get_agent(agent.id)
    assert loaded.call_count_today == 1
    assert loaded.call_count_date == "1999-01-02"
    assert store.tenant_metrics(tenant.id)["calls_today"] == 1


def test_unrouted_did_fails_closed():
    with pytest.raises(ValueError, match="no enrutado"):
        resolve_dispatch(dialed_number="+15550009999")


def test_admin_without_tenant_fails_closed():
    with pytest.raises(PermissionError, match="empresa"):
        get_tenant_context(tenant_id=None, user_tenant_id=None, is_super_admin=False)


def test_runtime_agent_applies_instance_fields():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    agent = store.create_agent(
        tenant.id,
        slug="runtime-bot",
        display_name="Banca Empresa",
        template_id="banking_support",
        status="active",
        voice="naksh",
        locale="es",
        custom_instructions="Eres el bot de la empresa ACME.",
        function_tools=["lookup_customer", "to_escalation"],
    )
    runtime = build_runtime_agent(instance=agent, for_voice=True)
    assert runtime.display_name == "Banca Empresa"
    assert runtime.voice == "naksh"
    assert "ACME" in runtime.instructions
    assert "lookup_customer" in runtime.function_tools
    assert runtime.instance_id == agent.id


def test_transferred_to_not_set_without_handoff():
    from call_management.agents.base import CallContext

    ctx = CallContext(call_id="c1", current_agent_name="receptionist")
    assert ctx.transferred_to is None
    ctx.previous_agent_name = "receptionist"
    ctx.transferred_to = "support"
    assert ctx.transferred_to == "support"


@pytest.mark.asyncio
async def test_finalize_does_not_mark_handoff_without_transfer(tmp_path):
    from call_management.agents.base import CallContext
    from call_management.crm.database import CRMDatabase

    crm = CRMDatabase(tmp_path / "crm.db")
    await crm.initialize()
    ctx = CallContext(
        call_id="call_no_handoff",
        room_name="room",
        from_number="+15550001111",
        crm=crm,
        channel="sip",
        current_agent_name="receptionist",
        transcript_lines=["[Cliente] hola", "[Agente] buenos dias"],
    )
    saved = await finalize_interaction(ctx, enable_summary=False)
    assert saved is True
    row = await crm.get_call_record_row("call_no_handoff")
    assert row["transferred_to"] is None
    full = await crm.get_call_record("call_no_handoff")
    assert full is not None
    assert full.transcript
    assert full.channel == "sip"


@pytest.mark.asyncio
async def test_tenant_admin_cannot_mint_super_admin(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")

    from call_management.admin.auth_store import create_user, ensure_bootstrap_user

    ensure_bootstrap_user()
    tenant = get_platform_store().ensure_default_tenant()
    create_user(
        username="tenantadmin",
        password="tenant-pass-99",
        display_name="TA",
        role="admin",
        tenant_id=tenant.id,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "tenantadmin", "password": "tenant-pass-99"},
        )
        assert login.status_code == 200
        assert login.json()["role"] == "admin"
        cookie = login.cookies.get("cm_admin_session")

        created = await client.post(
            "/api/auth/users",
            json={
                "username": "evil",
                "password": "evil-pass-99",
                "display_name": "Evil",
                "role": "super_admin",
            },
            cookies={"cm_admin_session": cookie},
        )
        assert created.status_code == 403


@pytest.mark.asyncio
async def test_disabled_user_cannot_login(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth-disabled.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")

    from call_management.admin.auth_store import create_user, ensure_bootstrap_user, update_user

    ensure_bootstrap_user()
    tenant = get_platform_store().ensure_default_tenant()
    user = create_user(
        username="disabled",
        password="disabled-99",
        display_name="Off",
        role="viewer",
        tenant_id=tenant.id,
    )
    update_user(user.id, enabled=False)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "disabled", "password": "disabled-99"},
        )
        assert login.status_code == 401


@pytest.mark.asyncio
async def test_customer_patch_does_not_clear_vip():
    from call_management.admin.schemas import CustomerUpdate
    from call_management.tenancy.context import resolve_crm_for_tenant

    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    customer = await crm.get_or_create_customer("+15551230000")
    customer.name = "Ana"
    customer.vip = True
    await crm.update_customer(customer)

    payload = CustomerUpdate(name="Ana G")
    assert payload.vip is None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.patch(
            "/api/customers/+15551230000",
            json={"name": "Ana G"},
        )
        assert resp.status_code == 200
        assert resp.json()["vip"] is True
        assert resp.json()["name"] == "Ana G"


@pytest.mark.asyncio
async def test_recording_rejects_path_traversal_ext(tmp_path):
    from call_management.recordings.store import save_recording_bytes

    with pytest.raises(ValueError, match="extension"):
        save_recording_bytes("tenant1", "call_abc", b"xx", ext="webm/../../evil")


@pytest.mark.asyncio
async def test_operations_agents_endpoint():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    store.create_agent(
        tenant.id,
        slug="ops-bot",
        display_name="Ops",
        template_id="support",
        status="active",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/operations/agents", headers={"X-Tenant-Id": tenant.id})
    assert resp.status_code == 200
    body = resp.json()
    assert body["agents"]
    assert body["agents"][0]["display_name"] == "Ops"


@pytest.mark.asyncio
async def test_settings_allowlist_ignores_unknown_keys(tmp_path, monkeypatch):
    from call_management.admin.env_store import save_settings

    env_path = tmp_path / ".env"
    env_path.write_text("XAI_API_KEY=old\n", encoding="utf-8")
    monkeypatch.setenv("ENV_FILE", str(env_path))
    # reload path
    import call_management.admin.env_store as env_store

    monkeypatch.setattr(env_store, "ENV_PATH", env_path)
    save_settings({"ADMIN_AUTH_DISABLED": "true", "GROK_REALTIME_MODEL": "grok-voice-think-fast-2.0"})
    text = env_path.read_text(encoding="utf-8")
    assert "ADMIN_AUTH_DISABLED" not in text
    assert "GROK_REALTIME_MODEL=grok-voice-think-fast-2.0" in text


def test_webhook_list_redacts_secret():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    from call_management.tenancy import webhook_store

    created = webhook_store.create_webhook(tenant.id, url="https://example.com/hook", events=["call.ended"], secret="shh")
    assert created["secret"] == "shh"


@pytest.mark.asyncio
async def test_webhook_api_redacts_secret_on_list():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    from call_management.tenancy import webhook_store

    webhook_store.create_webhook(tenant.id, url="https://example.com/hook", events=["call.ended"], secret="shh")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listed = await client.get("/api/webhooks", headers={"X-Tenant-Id": tenant.id})
    assert listed.status_code == 200
    hooks = listed.json()["webhooks"]
    assert hooks
    assert hooks[0]["secret"] is None
    assert hooks[0]["has_secret"] is True
