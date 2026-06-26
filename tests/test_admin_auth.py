"""Tests for admin authentication."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_webauthn_origin_strips_path(monkeypatch):
    monkeypatch.setenv("ADMIN_ORIGIN", "https://paymercadogo.com/callmgmt")
    from call_management.admin.auth_routes import _origin

    assert _origin() == "https://paymercadogo.com"


@pytest.mark.asyncio
async def test_auth_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/auth/status")
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True


@pytest.mark.asyncio
async def test_password_login_and_me(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "test-secret-123")

    from call_management.admin.auth_store import ensure_bootstrap_user

    ensure_bootstrap_user()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unauth = await client.get("/api/dashboard")
        assert unauth.status_code == 401

        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "test-secret-123"},
        )
        assert login.status_code == 200
        cookie = login.cookies.get("cm_admin_session")
        assert cookie

        me = await client.get("/api/dashboard", cookies={"cm_admin_session": cookie})
        assert me.status_code == 200

        profile = await client.get("/api/auth/me", cookies={"cm_admin_session": cookie})
        assert profile.status_code == 200
        body = profile.json()
        assert body["username"] == "admin"
        assert body["role"] in ("admin", "super_admin")


@pytest.mark.asyncio
async def test_playground_user_rbac(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")

    from call_management.admin.auth_store import create_user, ensure_bootstrap_user

    ensure_bootstrap_user()
    demo = create_user(
        username="demo",
        password="demo-pass-99",
        display_name="Demo",
        role="playground",
    )
    assert demo.role == "playground"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "demo", "password": "demo-pass-99"},
        )
        assert login.status_code == 200
        cookie = login.cookies.get("cm_admin_session")

        allowed = await client.get(
            "/api/voice/config/receptionist",
            cookies={"cm_admin_session": cookie},
        )
        assert allowed.status_code == 200

        denied = await client.get("/api/agents", cookies={"cm_admin_session": cookie})
        assert denied.status_code == 403

        me = await client.get("/api/auth/me", cookies={"cm_admin_session": cookie})
        assert me.json()["default_route"] == "/playground"


@pytest.mark.asyncio
async def test_admin_creates_playground_user(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth2.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")

    from call_management.admin.auth_store import ensure_bootstrap_user

    ensure_bootstrap_user()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "admin-secret-99"},
        )
        cookie = login.cookies.get("cm_admin_session")

        created = await client.post(
            "/api/auth/users",
            json={
                "username": "tester",
                "password": "tester-pass",
                "display_name": "Tester",
                "role": "playground",
            },
            cookies={"cm_admin_session": cookie},
        )
        assert created.status_code == 200
        assert created.json()["role"] == "playground"


@pytest.mark.asyncio
async def test_sync_password_from_env_on_existing_user(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    from call_management.admin.auth_store import ensure_bootstrap_user, verify_user_password

    ensure_bootstrap_user()
    assert not verify_user_password("admin", "new-password-456")

    monkeypatch.setenv("ADMIN_PASSWORD", "new-password-456")
    ensure_bootstrap_user()
    assert verify_user_password("admin", "new-password-456")