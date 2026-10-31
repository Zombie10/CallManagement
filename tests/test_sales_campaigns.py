"""Sales campaigns: trunk gate, eligibility, dispatch metadata, CRM meeting, tenant and module."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.auth_store import SESSION_COOKIE, create_user
from call_management.agents.base import CallContext
from call_management.campaigns.dialer import DialRequest, set_campaign_dialer
from call_management.crm.session_persist import finalize_interaction
from call_management.server import _parse_session_overrides
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store

ADA = "+15551110001"
BEN = "+15551110002"
CAM = "+15551110003"
INSIDE = "2026-08-19T15:00:00+00:00"
OUTSIDE = "2026-08-19T18:30:00+00:00"


class RecordingDialer:
    def __init__(self) -> None:
        self.calls: list[DialRequest] = []

    async def __call__(self, request: DialRequest) -> None:
        self.calls.append(request)


def _phones(dialer: RecordingDialer) -> list[str]:
    return [call.phone for call in dialer.calls]


@pytest.mark.asyncio
async def test_sales_campaign_pass_meeting_and_tenant_isolation(monkeypatch):
    monkeypatch.delenv("SIP_TRUNK_ID", raising=False)
    monkeypatch.delenv("CALL_INITIAL_AGENT", raising=False)
    monkeypatch.delenv("CALL_FROM_NUMBER", raising=False)
    monkeypatch.delenv("CALL_CUSTOMER_NAME", raising=False)
    monkeypatch.delenv("CALL_VIP", raising=False)

    store = get_platform_store()
    tenant = store.create_tenant(slug="campaign-a", name="Campaign A")
    other = store.create_tenant(slug="campaign-b", name="Campaign B")
    dialer = RecordingDialer()
    set_campaign_dialer(dialer)
    headers = {"X-Tenant-Id": tenant.id}
    other_headers = {"X-Tenant-Id": other.id}

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/campaigns",
                headers=headers,
                json={
                    "name": "Salida agosto",
                    "agent": "sales",
                    "window_start": "09:00",
                    "window_end": "17:00",
                    "timezone": "UTC",
                    "pace": 1,
                    "max_attempts": 1,
                    "contacts": [
                        {"phone": ADA, "name": "Ada", "may_call": True, "do_not_call": False},
                        {"phone": BEN, "name": "Ben", "may_call": True, "do_not_call": False},
                    ],
                },
            )
            assert created.status_code == 200, created.text
            campaign_id = created.json()["id"]

            added = await client.post(
                f"/api/campaigns/{campaign_id}/contacts",
                headers=headers,
                json={"phone": CAM, "name": "Cam", "may_call": False, "do_not_call": True},
            )
            assert added.status_code == 200, added.text
            assert added.json()["totals"]["skipped"] == 1
            assert added.json()["totals"]["pending"] == 2

            blocked = await client.post(
                f"/api/campaigns/{campaign_id}/start",
                headers=headers,
                json={"at": INSIDE},
            )
            assert blocked.status_code >= 400
            blocked_body = blocked.json()
            assert blocked_body.get("detail")
            assert "SIP_TRUNK" not in blocked.text
            assert _phones(dialer) == []

            monkeypatch.setenv("SIP_TRUNK_ID", "trunk-test-outbound")
            closed = await client.post(
                f"/api/campaigns/{campaign_id}/start",
                headers=headers,
                json={"at": OUTSIDE},
            )
            assert closed.status_code == 200, closed.text
            assert _phones(dialer) == []
            assert closed.json()["totals"]["dialed"] == 0

            first = await client.post(
                f"/api/campaigns/{campaign_id}/start",
                headers=headers,
                json={"at": INSIDE},
            )
            assert first.status_code == 200, first.text
            assert _phones(dialer) == [ADA]
            assert first.json()["totals"]["dialed"] == 1
            assert first.json()["totals"]["pending"] == 1
            assert first.json()["totals"]["skipped"] == 1
            ada_attempt = next(row for row in first.json()["attempts"] if row["phone"] == ADA)
            assert ada_attempt["result"] == "dialed"
            parsed = _parse_session_overrides(dialer.calls[0].metadata)
            assert parsed["department_hint"] == "sales"
            assert parsed["from_number"] == ADA
            assert parsed["customer_name"] == "Ada"
            assert dialer.calls[0].trunk_id == "trunk-test-outbound"

            second = await client.post(
                f"/api/campaigns/{campaign_id}/start",
                headers=headers,
                json={"at": INSIDE},
            )
            assert second.status_code == 200, second.text
            assert _phones(dialer) == [ADA, BEN]
            assert CAM not in _phones(dialer)
            assert second.json()["totals"]["dialed"] == 2
            assert second.json()["totals"]["pending"] == 0
            ben_attempt = next(row for row in second.json()["attempts"] if row["phone"] == BEN)
            ben_meta = _parse_session_overrides(dialer.calls[1].metadata)
            assert ben_meta["department_hint"] == "sales"
            assert ben_meta["from_number"] == BEN
            assert ben_meta["customer_name"] == "Ben"

            recorded = await client.post(
                f"/api/campaigns/{campaign_id}/attempts/{ada_attempt['id']}/result",
                headers=headers,
                json={
                    "result": "sales_meeting_scheduled",
                    "preferred_time": "2026-08-20T15:00:00+00:00",
                    "qualification": {"company": "Northwind", "role": "Buyer", "interest": "Demo"},
                },
            )
            assert recorded.status_code == 200, recorded.text
            assert recorded.json()["totals"]["meeting"] == 1
            ada_after = next(row for row in recorded.json()["attempts"] if row["id"] == ada_attempt["id"])
            assert ada_after["result"] == "meeting"
            assert "Northwind" in (ada_after.get("qualification") or "")

            customers = await client.get("/api/customers", headers=headers)
            ada_customer = next(row for row in customers.json()["items"] if row["phone_number"] == ADA)
            assert "Northwind" in (ada_customer.get("notes") or "")
            appointments = await client.get("/api/appointments", headers=headers)
            ada_appt = next(row for row in appointments.json()["items"] if row["customer_phone"] == ADA)
            assert ada_appt["scheduled_time"] == "2026-08-20T15:00:00+00:00"
            calls = await client.get(f"/api/calls/{ada_attempt['call_id']}", headers=headers)
            assert calls.status_code == 200, calls.text
            assert "Northwind" in (calls.json().get("agent_notes") or "")

            crm = await resolve_crm_for_tenant(tenant.id)
            call_ctx = CallContext(
                call_id=ben_attempt["call_id"],
                room_name=f"outbound-{BEN.replace('+', '')}",
                from_number=BEN,
                customer_name="Ben",
                call_purpose="Sales lead: Plan",
                appointment_details={
                    "type": "sales_qualification",
                    "company": "Contoso",
                    "role": "Owner",
                    "interest": "Plan",
                    "sales_meeting": "2026-08-21T16:00:00+00:00",
                },
                outcome="sales_meeting_scheduled",
                crm=crm,
                tenant_id=tenant.id,
                channel="sip",
            )
            saved = await finalize_interaction(
                call_ctx, enable_summary=False, outcome="sales_meeting_scheduled"
            )
            assert saved is True
            finished = await client.get(f"/api/campaigns/{campaign_id}", headers=headers)
            assert finished.status_code == 200
            assert finished.json()["totals"]["meeting"] == 2
            ben_customer = next(
                row
                for row in (await client.get("/api/customers", headers=headers)).json()["items"]
                if row["phone_number"] == BEN
            )
            assert "Contoso" in (ben_customer.get("notes") or "")
            ben_appts = [
                row
                for row in (await client.get("/api/appointments", headers=headers)).json()["items"]
                if row["customer_phone"] == BEN
            ]
            assert len(ben_appts) == 1
            assert ben_appts[0]["scheduled_time"] == "2026-08-21T16:00:00+00:00"

            hidden = await client.get("/api/campaigns", headers=other_headers)
            assert hidden.status_code == 200
            assert all(row["id"] != campaign_id for row in hidden.json()["items"])
            missing = await client.get(f"/api/campaigns/{campaign_id}", headers=other_headers)
            assert missing.status_code == 404
    finally:
        set_campaign_dialer(None)


@pytest.mark.asyncio
async def test_campaign_api_forbidden_without_module(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_AUTH_DISABLED", "false")
    monkeypatch.setenv("ADMIN_AUTH_DB_PATH", str(tmp_path / "auth.db"))
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-secret-99")

    store = get_platform_store()
    tenant = store.create_tenant(slug="campaign-role", name="Campaign Role")
    create_user(
        username="nora",
        password="nora-pass-99",
        display_name="Nora",
        role="admin",
        tenant_id=tenant.id,
        modules=["dashboard"],
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post("/api/auth/login", json={"username": "nora", "password": "nora-pass-99"})
        assert login.status_code == 200, login.text
        cookie = login.cookies.get(SESSION_COOKIE)
        assert cookie
        forbidden = await client.get(
            "/api/campaigns",
            headers={"X-Tenant-Id": tenant.id},
            cookies={SESSION_COOKIE: cookie},
        )
        assert forbidden.status_code == 403
        blocked_post = await client.post(
            "/api/campaigns",
            headers={"X-Tenant-Id": tenant.id},
            cookies={SESSION_COOKIE: cookie},
            json={
                "name": "No",
                "agent": "sales",
                "window_start": "09:00",
                "window_end": "17:00",
                "pace": 1,
                "max_attempts": 1,
                "contacts": [],
            },
        )
        assert blocked_post.status_code == 403
