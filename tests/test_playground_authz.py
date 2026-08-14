"""Authenticated playground: tenant body is ignored; chat session is not a bearer token."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.chat_runner import ManagedChatSession, get_chat_manager
from call_management.admin.playground_sessions import register_lease, reset_leases
from call_management.admin.auth_store import create_user, ensure_bootstrap_user
from call_management.tenancy.platform_store import get_platform_store


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_authenticated_playground_isolates_tenant_and_chat(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")
    reset_leases()

    ensure_bootstrap_user()
    store = get_platform_store()
    tenant_a = store.create_tenant(slug="alpha-co", name="Alpha")
    tenant_b = store.create_tenant(slug="beta-co", name="Beta")
    user_a = create_user(
        username="alice",
        password="alice-pass-99",
        display_name="Alice",
        role="playground",
        tenant_id=tenant_a.id,
    )
    user_b = create_user(
        username="bob",
        password="bob-pass-99",
        display_name="Bob",
        role="playground",
        tenant_id=tenant_b.id,
    )

    async def fake_token():
        return {"value": "tok", "expires_at": 9999999999}

    monkeypatch.setattr(
        "call_management.admin.voice_session.create_ephemeral_voice_token",
        fake_token,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_a = await client.post(
            "/api/auth/login", json={"username": "alice", "password": "alice-pass-99"}
        )
        login_b = await client.post(
            "/api/auth/login", json={"username": "bob", "password": "bob-pass-99"}
        )
        cookie_a = login_a.cookies.get("cm_admin_session")
        cookie_b = login_b.cookies.get("cm_admin_session")
        assert cookie_a and cookie_b

        voice = await client.post(
            "/api/voice/session",
            json={"agent": "receptionist", "tenant_id": tenant_b.id},
            cookies={"cm_admin_session": cookie_a},
        )
        assert voice.status_code == 200
        assert voice.json()["tenant_id"] == tenant_a.id
        assert voice.json()["tenant_id"] != tenant_b.id

        session_id = "chat_owned_by_alice"
        register_lease(session_id, user_id=user_a.id, tenant_id=tenant_a.id, kind="chat")
        mgr = get_chat_manager()
        mock_session = MagicMock()
        mock_session.run = AsyncMock()
        mgr._sessions[session_id] = ManagedChatSession(
            session_id=session_id,
            agent_session=mock_session,
            call_ctx=MagicMock(),
            user_id=user_a.id,
        )

        stolen = await client.post(
            f"/api/chat/sessions/{session_id}/messages",
            json={"message": "hola"},
            cookies={"cm_admin_session": cookie_b},
        )
        assert stolen.status_code == 403
        mock_session.run.assert_not_called()

    reset_leases()
    mgr._sessions.pop(session_id, None)


@pytest.mark.asyncio
async def test_chat_create_requires_tenant_and_user():
    from call_management.admin.chat_runner import ChatSessionManager

    mgr = ChatSessionManager()
    with pytest.raises(ValueError, match="tenant_id"):
        await mgr.create(user_id="u1")
    with pytest.raises(ValueError, match="user_id"):
        await mgr.create(tenant_id="t1")
