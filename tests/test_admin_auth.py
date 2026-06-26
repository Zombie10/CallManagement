"""Tests for admin authentication."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


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
        assert profile.json()["username"] == "admin"


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