"""Tests for the admin API."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_admin_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_admin_settings():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/settings")
    assert resp.status_code == 200
    body = resp.json()
    assert "sections" in body
    assert "xai_models" in body["sections"]


@pytest.mark.asyncio
async def test_admin_dashboard():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert "stats" in body
    assert "runtime" in body


@pytest.mark.asyncio
async def test_admin_agents_list(agent_profiles_file):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/agents")
    assert resp.status_code == 200
    body = resp.json()
    assert "profiles" in body
    assert "catalog" in body
    assert any(p["name"] == "receptionist" for p in body["profiles"])


@pytest.mark.asyncio
async def test_admin_agents_crud(agent_profiles_file):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create = await client.post(
            "/api/agents",
            json={
                "name": "billing",
                "display_name": "Billing",
                "provider": "xai",
                "voice": "Grok",
                "locale": "es",
                "tools": ["web_search"],
                "mcp_servers": [],
            },
        )
        assert create.status_code == 200
        assert create.json()["voice"] == "Grok"

        update = await client.put(
            "/api/agents/billing",
            json={
                "name": "billing",
                "display_name": "Billing Team",
                "provider": "xai",
                "voice": "Ara",
                "locale": "en",
                "tools": ["web_search", "x_search"],
                "mcp_servers": [],
            },
        )
        assert update.status_code == 200
        assert "x_search" in update.json()["tools"]

        delete = await client.delete("/api/agents/billing")
        assert delete.status_code == 200

        protected = await client.delete("/api/agents/receptionist")
        assert protected.status_code == 400


@pytest.mark.asyncio
async def test_chat_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/chat/status")
    assert resp.status_code == 200
    body = resp.json()
    assert "ready" in body
    assert "provider" in body


@pytest.mark.asyncio
async def test_chat_session_requires_key(monkeypatch):
    monkeypatch.delenv("XAI_API_KEY", raising=False)
    monkeypatch.setenv("MODEL_PROVIDER", "xai")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/chat/sessions", json={"initial_agent": "receptionist"})
    assert resp.status_code == 400