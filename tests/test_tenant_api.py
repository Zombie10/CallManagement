"""Admin API tests for multi-tenant routes."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.tenancy.platform_store import get_platform_store


@pytest.mark.asyncio
async def test_tenant_agents_crud():
    store = get_platform_store()
    tenant = store.create_tenant(slug="api-co", name="API Test Co")

    transport = ASGITransport(app=app)
    headers = {"X-Tenant-Id": tenant.id}

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        listed = await client.get("/api/tenant-agents", headers=headers)
        assert listed.status_code == 200
        assert listed.json()["tenant"]["id"] == tenant.id

        created = await client.post(
            "/api/tenant-agents",
            headers=headers,
            json={
                "slug": "bot-1",
                "display_name": "Bot Uno",
                "template_id": "receptionist",
                "status": "active",
                "phone_number": "+15559990001",
            },
        )
        assert created.status_code == 200
        agent_id = created.json()["id"]

        updated = await client.patch(
            f"/api/tenant-agents/{agent_id}",
            headers=headers,
            json={
                "slug": "bot-1",
                "display_name": "Bot Uno Plus",
                "template_id": "receptionist",
                "status": "paused",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["status"] == "paused"

        resolve = await client.get("/api/phone-routes/resolve", params={"phone": "+15559990001"})
        assert resolve.status_code == 200
        assert resolve.json()["agent_instance_id"] == agent_id