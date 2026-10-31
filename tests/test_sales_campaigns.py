"""Sales campaigns: trunk gate, eligibility, dispatch metadata, CRM meeting, tenant and module."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.auth_store import SESSION_COOKIE, create_user
from call_management.agents.base import CallContext, outbound_sales_brief
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


NIA = "+15551110021"
LEO = "+15551110022"
SARA = "+15551110023"
LIA = "+15551110024"
OMAR = "+15551110025"
PIO = "+15551110026"
OUTCOME_PHONES = ["+15551110031", "+15551110032", "+15551110033", "+15551110034"]
CALLER_A = "+15551000001"
CALLER_B = "+15551000002"
DUE = datetime(2026, 8, 19, 17, 0, tzinfo=ZoneInfo("UTC"))
OUTSIDE_HOURS = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo("UTC"))
OTHER_MINUTE = datetime(2026, 8, 19, 18, 0, tzinfo=ZoneInfo("UTC"))


def _iso(value: datetime) -> str:
    return value.isoformat()


@pytest.mark.asyncio
async def test_campaign_console_offer_schedule_list_result_and_caller(monkeypatch):
    monkeypatch.setenv("SIP_TRUNK_ID", "trunk-test-outbound")
    monkeypatch.setenv("OUTBOUND_NUMBERS", f"{CALLER_A},{CALLER_B}")
    monkeypatch.delenv("CALL_INITIAL_AGENT", raising=False)
    monkeypatch.delenv("CALL_FROM_NUMBER", raising=False)
    monkeypatch.delenv("CALL_CUSTOMER_NAME", raising=False)
    monkeypatch.delenv("CALL_VIP", raising=False)

    local = DUE.astimezone(ZoneInfo("America/Los_Angeles"))
    weekday = str(local.weekday())
    other_day = str((local.weekday() + 1) % 7)
    scheduled = local.strftime("%H:%M")
    store = get_platform_store()
    tenant = store.create_tenant(slug="campaign-console", name="Campaign Console")
    dialer = RecordingDialer()
    set_campaign_dialer(dialer)
    headers = {"X-Tenant-Id": tenant.id}

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            numbers = await client.get("/api/campaigns/outbound-numbers", headers=headers)
            assert numbers.status_code == 200, numbers.text
            assert numbers.json()["numbers"] == [CALLER_A, CALLER_B]

            crm = await resolve_crm_for_tenant(tenant.id)
            customer = await crm.get_or_create_customer(NIA)
            customer.name = "Nia"
            customer.notes = "cuenta de ahorro"
            await crm.update_customer(customer)

            created = await client.post(
                "/api/campaigns",
                headers=headers,
                json={
                    "name": "Oferta oro",
                    "agent": "sales",
                    "window_start": "09:00",
                    "window_end": "17:00",
                    "timezone": "America/Los_Angeles",
                    "pace": 1,
                    "max_attempts": 1,
                    "product": "Plan oro",
                    "opening_line": "Llamo por el plan oro",
                    "forbidden": "No menciones soporte",
                    "weekdays": weekday,
                    "scheduled_time": scheduled,
                    "caller_id": CALLER_A,
                    "contacts": [{"phone": NIA, "name": "Nia", "may_call": True, "do_not_call": False}],
                },
            )
            assert created.status_code == 200, created.text
            offer_id = created.json()["id"]
            assert created.json()["product"] == "Plan oro"
            assert created.json()["opening_line"] == "Llamo por el plan oro"
            assert created.json()["forbidden"] == "No menciones soporte"
            assert created.json()["caller_id"] == CALLER_A

            edited = await client.patch(
                f"/api/campaigns/{offer_id}",
                headers=headers,
                json={"opening_line": "Abre con el plan oro", "caller_id": CALLER_B},
            )
            assert edited.status_code == 200, edited.text
            assert edited.json()["opening_line"] == "Abre con el plan oro"
            assert edited.json()["caller_id"] == CALLER_B

            added = await client.post(
                f"/api/campaigns/{offer_id}/contacts",
                headers=headers,
                json={"phone": LEO, "name": "Leo", "may_call": True, "do_not_call": False},
            )
            assert added.status_code == 200, added.text

            first = await client.post(
                f"/api/campaigns/{offer_id}/start",
                headers=headers,
                json={"at": _iso(DUE)},
            )
            assert first.status_code == 200, first.text
            assert _phones(dialer) == [NIA]
            assert dialer.calls[0].sip_number == CALLER_B
            parsed = _parse_session_overrides(dialer.calls[0].metadata)
            assert parsed["department_hint"] == "sales"
            assert parsed["campaign_product"] == "Plan oro"
            assert parsed["campaign_opening"] == "Abre con el plan oro"
            assert parsed["campaign_forbidden"] == "No menciones soporte"
            saved = await crm.get_or_create_customer(NIA)
            brief = outbound_sales_brief(
                customer_name=str(parsed["customer_name"] or saved.name),
                customer_notes=saved.notes,
                product=str(parsed["campaign_product"]),
                opening_line=str(parsed["campaign_opening"]),
                forbidden=str(parsed["campaign_forbidden"]),
            )
            assert "Plan oro" in brief
            assert "Abre con el plan oro" in brief
            assert "No menciones soporte" in brief
            assert "cuenta de ahorro" in brief
            assert saved.name in brief

            paused = await client.patch(
                f"/api/campaigns/{offer_id}",
                headers=headers,
                json={"paused": True},
            )
            assert paused.status_code == 200, paused.text
            assert paused.json()["paused"] is True
            before = len(dialer.calls)
            held = await client.post(
                f"/api/campaigns/{offer_id}/start",
                headers=headers,
                json={"at": _iso(DUE)},
            )
            assert held.status_code == 200, held.text
            assert len(dialer.calls) == before

            resumed = await client.patch(
                f"/api/campaigns/{offer_id}",
                headers=headers,
                json={"paused": False, "weekdays": other_day},
            )
            assert resumed.status_code == 200, resumed.text
            closed_day = await client.post(
                f"/api/campaigns/{offer_id}/start",
                headers=headers,
                json={"at": _iso(DUE)},
            )
            assert closed_day.status_code == 200, closed_day.text
            assert len(dialer.calls) == before

            schedule = await client.post(
                "/api/campaigns",
                headers=headers,
                json={
                    "name": "Horario",
                    "agent": "sales",
                    "window_start": "09:00",
                    "window_end": "17:00",
                    "timezone": "America/Los_Angeles",
                    "pace": 1,
                    "max_attempts": 2,
                    "weekdays": weekday,
                    "scheduled_time": scheduled,
                    "caller_id": CALLER_A,
                    "contacts": [{"phone": SARA, "name": "Sara", "may_call": True, "do_not_call": False}],
                },
            )
            assert schedule.status_code == 200, schedule.text
            schedule_id = schedule.json()["id"]
            asleep = await client.patch(
                f"/api/campaigns/{schedule_id}",
                headers=headers,
                json={"paused": True},
            )
            assert asleep.status_code == 200, asleep.text
            skipped = await client.post("/api/campaigns/scheduled", headers=headers, json={"at": _iso(DUE)})
            assert skipped.status_code == 200, skipped.text
            assert skipped.json()["total"] == 0
            assert _phones(dialer) == [NIA]
            await client.patch(f"/api/campaigns/{schedule_id}", headers=headers, json={"paused": False})
            early = await client.post(
                f"/api/campaigns/{schedule_id}/start",
                headers=headers,
                json={"at": _iso(OUTSIDE_HOURS)},
            )
            assert early.status_code == 200, early.text
            assert _phones(dialer) == [NIA]
            wrong_minute = await client.post(
                "/api/campaigns/scheduled",
                headers=headers,
                json={"at": _iso(OTHER_MINUTE)},
            )
            assert wrong_minute.status_code == 200, wrong_minute.text
            assert _phones(dialer) == [NIA]
            due = await client.post("/api/campaigns/scheduled", headers=headers, json={"at": _iso(DUE)})
            assert due.status_code == 200, due.text
            assert due.json()["total"] == 1
            assert _phones(dialer) == [NIA, SARA]
            assert dialer.calls[-1].sip_number == CALLER_A
            again = await client.post("/api/campaigns/scheduled", headers=headers, json={"at": _iso(DUE)})
            assert again.status_code == 200, again.text
            assert _phones(dialer) == [NIA, SARA]
            manual = await client.post(
                f"/api/campaigns/{schedule_id}/start",
                headers=headers,
                json={"at": _iso(OTHER_MINUTE)},
            )
            assert manual.status_code == 200, manual.text
            assert _phones(dialer) == [NIA, SARA, SARA]

            listed = await client.post(
                "/api/campaigns",
                headers=headers,
                json={
                    "name": "Lista",
                    "agent": "sales",
                    "window_start": "09:00",
                    "window_end": "17:00",
                    "timezone": "UTC",
                    "pace": 1,
                    "max_attempts": 1,
                    "contacts": [],
                },
            )
            assert listed.status_code == 200, listed.text
            list_id = listed.json()["id"]
            imported = await client.post(
                f"/api/campaigns/{list_id}/contacts/import",
                headers=headers,
                json={"text": "nombre,telefono\nLia,+15551110024\nOmar,+15551110025\n"},
            )
            assert imported.status_code == 200, imported.text
            phones = {row["phone"] for row in imported.json()["contacts"]}
            assert phones == {LIA, OMAR}
            found = await client.get(f"/api/campaigns/{list_id}/contacts", headers=headers, params={"q": "omar"})
            assert found.status_code == 200, found.text
            assert [row["phone"] for row in found.json()["contacts"]] == [OMAR]
            lia = next(row for row in imported.json()["contacts"] if row["phone"] == LIA)
            removed = await client.delete(f"/api/campaigns/{list_id}/contacts/{lia['id']}", headers=headers)
            assert removed.status_code == 200, removed.text
            assert LIA not in {row["phone"] for row in removed.json()["contacts"]}
            pio = await crm.get_or_create_customer(PIO)
            pio.name = "Pio"
            await crm.update_customer(pio)
            picked = await client.post(
                f"/api/campaigns/{list_id}/contacts/from-crm",
                headers=headers,
                json={"phones": [PIO]},
            )
            assert picked.status_code == 200, picked.text
            assert {row["phone"] for row in picked.json()["contacts"]} == {OMAR, PIO}
            assert next(row["name"] for row in picked.json()["contacts"] if row["phone"] == PIO) == "Pio"

            outcomes = await client.post(
                "/api/campaigns",
                headers=headers,
                json={
                    "name": "Resultados",
                    "agent": "sales",
                    "window_start": "00:00",
                    "window_end": "23:59",
                    "timezone": "UTC",
                    "pace": 4,
                    "max_attempts": 1,
                    "contacts": [
                        {"phone": phone, "name": f"Contacto {index}", "may_call": True, "do_not_call": False}
                        for index, phone in enumerate(OUTCOME_PHONES, start=1)
                    ],
                },
            )
            assert outcomes.status_code == 200, outcomes.text
            outcome_id = outcomes.json()["id"]
            when = datetime(2026, 8, 19, 12, 0, tzinfo=ZoneInfo("UTC"))
            dialed = await client.post(
                f"/api/campaigns/{outcome_id}/start",
                headers=headers,
                json={"at": _iso(when)},
            )
            assert dialed.status_code == 200, dialed.text
            attempts = {row["phone"]: row for row in dialed.json()["attempts"]}
            spoken = {
                OUTCOME_PHONES[0]: ("answered", "El cliente escuchó el precio.", "https://cdn.example.com/rec-answered.wav"),
                OUTCOME_PHONES[1]: ("no-answer", "No hubo conversación.", None),
                OUTCOME_PHONES[2]: ("busy", "La línea estaba ocupada.", None),
                OUTCOME_PHONES[3]: ("failed", "La llamada no se completó.", None),
            }
            for phone, (outcome, said, recording) in spoken.items():
                attempt = attempts[phone]
                call_ctx = CallContext(
                    call_id=attempt["call_id"],
                    room_name=f"outbound-{phone.replace('+', '')}",
                    from_number=phone,
                    customer_name=attempt["customer_name"],
                    outcome=outcome,
                    transcript_lines=[said],
                    recording_url=recording,
                    crm=crm,
                    tenant_id=tenant.id,
                    channel="sip",
                    start_time="2020-01-01T00:00:00+00:00",
                )
                saved_call = await finalize_interaction(call_ctx, enable_summary=False, outcome=outcome)
                assert saved_call is True
            finished = await client.get(f"/api/campaigns/{outcome_id}", headers=headers)
            by_phone = {row["phone"]: row for row in finished.json()["attempts"]}
            for phone, (outcome, said, recording) in spoken.items():
                row = by_phone[phone]
                assert row["call_result"] == outcome
                assert said in (row.get("transcript") or "")
                assert row["duration_seconds"] > 0
                if recording:
                    assert row["recording_url"] == recording
                else:
                    assert not row.get("recording_url")
            busy = await client.get(
                f"/api/campaigns/{outcome_id}/report",
                headers=headers,
                params={"result": "busy", "start": _iso(when - timedelta(minutes=5)), "end": _iso(when + timedelta(minutes=5))},
            )
            assert busy.status_code == 200, busy.text
            assert [row["phone"] for row in busy.json()["items"]] == [OUTCOME_PHONES[2]]
            missed = await client.get(
                f"/api/campaigns/{outcome_id}/report",
                headers=headers,
                params={"result": "busy", "start": "2026-08-20T00:00:00+00:00", "end": "2026-08-21T00:00:00+00:00"},
            )
            assert missed.json()["total"] == 0
            downloaded = await client.get(
                f"/api/campaigns/{outcome_id}/report.csv",
                headers=headers,
                params={"result": "answered"},
            )
            assert downloaded.status_code == 200, downloaded.text
            assert "text/csv" in downloaded.headers["content-type"]
            assert OUTCOME_PHONES[0] in downloaded.text
            assert "El cliente escuchó el precio." in downloaded.text
            assert OUTCOME_PHONES[2] not in downloaded.text
            assert "https://cdn.example.com/rec-answered.wav" in downloaded.text

            deleted = await client.delete(f"/api/campaigns/{offer_id}", headers=headers)
            assert deleted.status_code == 200, deleted.text
            gone = await client.get(f"/api/campaigns/{offer_id}", headers=headers)
            assert gone.status_code == 404
            remaining = await client.get("/api/campaigns", headers=headers)
            assert all(row["id"] != offer_id for row in remaining.json()["items"])
    finally:
        set_campaign_dialer(None)
