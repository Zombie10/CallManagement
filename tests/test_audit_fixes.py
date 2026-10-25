"""Audit fixes: redacted notes, shared counts, phones, and DID assignment."""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import quote

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.did_assign import choose_did_agent
from call_management.agents.registry import list_function_tool_catalog, resolve_handoff_target
from call_management.crm.banking_data import (
    format_customer_lookup,
    get_demo_customer,
    redact_customer_notes,
)
from call_management.crm.database import CRMDatabase, CallRecord
from call_management.crm.reports import CallReportQuery, default_period
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.tenancy.queue import concurrency_status, supervisor_snapshot
from call_management.utils.summary import present_call_summary
from call_management.utils.transcript import clean_transcript, transcript_from_lines

FULL_ACCOUNT = "359798493"
FULL_PAN_SPACED = "5470 5195 2639 3094"
FULL_PAN_PLAIN = "5470519526393094"
LEAKED_NOTES = (
    "Cliente: Reynaldo Garcia. Teléfono: +15103750043. "
    f"Cuenta BAC: {FULL_ACCOUNT} (Cuenta de ahorro). "
    f"Tarjeta débito: {FULL_PAN_SPACED} (vence 10/2026). "
    f"También {FULL_PAN_PLAIN}. "
    "Notas: Cliente BAC California. Prefiere español."
)


def _assert_no_secret(body: str) -> None:
    assert FULL_ACCOUNT not in body
    assert FULL_PAN_SPACED not in body
    assert FULL_PAN_PLAIN not in body
    assert "10/2026" not in body


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_format_and_redactor_hide_full_card_and_keep_verification_profile():
    demo = get_demo_customer("+15103750043")
    assert demo is not None
    assert demo.banking.account_number == FULL_ACCOUNT
    assert demo.banking.debit_card_last4 == "3094"
    assert demo.banking.debit_card_exp == "10/2026"

    written = format_customer_lookup(demo)
    _assert_no_secret(written)
    assert "Reynaldo Garcia" in written
    assert "+15103750043" in written
    assert "****3094" in written
    assert "****8493" in written

    redacted = redact_customer_notes(LEAKED_NOTES)
    assert redacted
    _assert_no_secret(redacted)
    assert "+15103750043" in redacted
    assert "Prefiere español" in redacted

    other = get_demo_customer("+50588860156")
    assert other is not None
    other_text = format_customer_lookup(other)
    assert "4827156093" not in other_text
    assert "4532 8810 2241 5587" not in other_text
    assert "5412 0034 8891 4421" not in other_text
    assert "+50588860156" in other_text


@pytest.mark.asyncio
async def test_admin_profile_redacts_stored_cleartext():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    phone = "+15103750043"
    await crm.get_or_create_customer(phone)
    async with crm._connect() as db:
        await db.execute(
            "UPDATE customers SET name = ?, notes = ? WHERE phone_number = ?",
            ("Reynaldo Garcia", LEAKED_NOTES, phone),
        )
        await db.commit()

    profile = await crm.get_customer_profile(phone)
    assert profile is not None
    notes = profile["customer"]["notes"]
    assert notes
    _assert_no_secret(json.dumps(profile))
    assert "Prefiere español" in notes

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get(f"/api/customers/{quote(phone, safe='')}/profile")
        second = await client.get(f"/api/customers/{quote(phone, safe='')}/profile")
    assert first.status_code == 200
    assert second.status_code == 200
    _assert_no_secret(first.text)
    _assert_no_secret(second.text)
    assert first.json()["customer"]["notes"]
    assert second.json()["customer"]["notes"]


@pytest.mark.asyncio
async def test_customer_list_does_not_present_invalid_phones(tmp_path):
    db = CRMDatabase(tmp_path / "customers.db")
    await db.initialize()
    for phone in ("unknown", "+184494142", "+15103750043"):
        await db.get_or_create_customer(phone)
    listed = await db.list_customers(limit=20)
    by_phone = {item["phone_number"]: item for item in listed["items"]}

    assert by_phone["unknown"]["phone_valid"] is False
    assert by_phone["unknown"]["phone_display"] is None
    assert by_phone["+184494142"]["phone_valid"] is False
    assert by_phone["+184494142"]["phone_display"] is None
    assert by_phone["+15103750043"]["phone_valid"] is True
    assert by_phone["+15103750043"]["phone_display"] == "+15103750043"


@pytest.mark.asyncio
async def test_profile_keeps_call_and_session_identifiers(tmp_path):
    db = CRMDatabase(tmp_path / "ids.db")
    await db.initialize()
    phone = "+15105550143"
    await db.get_or_create_customer(phone)
    async with db._connect() as conn:
        await conn.execute(
            "UPDATE customers SET notes = ? WHERE phone_number = ?",
            (LEAKED_NOTES, phone),
        )
        await conn.commit()

    call_id = "call_12345678abcd"
    room_name = "room_call_12345678abcd"
    recording_url = "https://recordings.example/call_12345678abcd.ogg"
    session_id = "deadbeef12345678cafebabe00001111"
    await db.create_call_record(
        CallRecord(
            call_id=call_id,
            room_name=room_name,
            from_number=phone,
            recording_url=recording_url,
            summary=f"Agente final: support\nCuenta BAC: {FULL_ACCOUNT}",
            channel="voice_xai",
        )
    )
    await db.save_chat_session(
        session_id=session_id,
        customer_phone=phone,
        customer_name=None,
        agent_instance_id=None,
        started_at="2026-10-01T00:00:00+00:00",
        ended_at="2026-10-01T00:01:00+00:00",
        transcript=None,
        message_count=0,
    )

    profile = await db.get_customer_profile(phone)
    assert profile is not None
    call = profile["calls"][0]
    assert call["call_id"] == call_id
    assert call["room_name"] == room_name
    assert call["recording_url"] == recording_url
    assert profile["playground_interactions"][0]["call_id"] == call_id
    assert profile["chat_sessions"][0]["session_id"] == session_id
    assert FULL_ACCOUNT not in call["summary"]
    _assert_no_secret(json.dumps(profile))


def test_analisis_reads_spanish_and_english_final_agent():
    root = Path(__file__).resolve().parents[1]
    script = root / "tests" / "check_report_display.mjs"
    register = root / "tests" / "register_admin_ts.mjs"
    proc = subprocess.run(
        ["node", "--import", str(register), str(script)],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert proc.stdout.strip() == "Soporte general"


@pytest.mark.asyncio
async def test_dashboard_and_analytics_share_period_count_and_series(tmp_path):
    db = CRMDatabase(tmp_path / "calls.db")
    await db.initialize()
    now = datetime.now(UTC)
    await db.create_call_record(
        CallRecord(
            call_id="inside",
            room_name="r1",
            from_number="+15103750043",
            start_time=now.isoformat(),
            duration_seconds=91,
            outcome="completed",
        )
    )
    await db.create_call_record(
        CallRecord(
            call_id="outside",
            room_name="r2",
            from_number="+15103750043",
            start_time=(now - timedelta(days=400)).isoformat(),
            duration_seconds=500,
            outcome="completed",
        )
    )
    date_from, date_to = default_period()
    analytics = await db.get_call_analytics(date_from=date_from, date_to=date_to)
    report = await db.query_call_report(
        CallReportQuery(date_from=date_from, date_to=date_to, group_by="day")
    )
    assert analytics["total_calls"] == report["summary"]["total_calls"] == 1
    assert analytics["avg_duration_seconds"] == 91
    assert analytics["calls_by_day"]
    assert sum(day["count"] for day in analytics["calls_by_day"]) == analytics["total_calls"]
    assert sum(point["count"] for point in report["series"]) == report["summary"]["total_calls"]


@pytest.mark.asyncio
async def test_supervisor_and_dashboard_share_concurrency(monkeypatch):
    monkeypatch.setenv("MAX_CONCURRENT_CALLS_PER_TENANT", "12")
    tenant_id = "tenant-audit"
    status = concurrency_status(tenant_id)
    snap = supervisor_snapshot(tenant_id)
    assert status["active"] == snap["tenant_limit"]["active"]
    assert status["cap"] == snap["tenant_limit"]["cap"] == 12

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        dashboard = (await client.get("/api/dashboard")).json()
        settings = (await client.get("/api/settings")).json()
        auth = (await client.get("/api/auth/status")).json()
    assert dashboard["worker"]["active_calls_tenant"] == dashboard["supervisor"]["tenant_limit"]["active"]
    assert dashboard["worker"]["active_calls_cap"] == dashboard["supervisor"]["tenant_limit"]["cap"]
    assert "s3_bucket" not in dashboard["recordings"]
    assert "/opt/callmanagement/.env" not in json.dumps(settings)
    assert "env_path" not in settings
    assert "ADMIN_PASSWORD" not in auth["hint"]
    assert "http://localhost:8080" not in auth["hint"]


def test_did_step_assigns_the_number_to_its_owner():
    agents = [
        {
            "id": "banca",
            "display_name": "Banca US",
            "status": "active",
            "phone_numbers": ["+15105550000"],
        },
        {
            "id": "recepcion",
            "display_name": "Recepción US",
            "status": "paused",
            "phone_number": "+15109379101",
            "phone_numbers": [],
        },
    ]
    chosen = choose_did_agent(agents, "+15109379101")
    assert chosen is not None
    assert chosen["display_name"] == "Recepción US"


def test_registros_summary_and_transcript_display():
    summary = present_call_summary(
        "[voice_xai] Call ID: call_1\nFrom: +15103750043\nOutcome: completed\n"
        "Purpose: consulta\nFinal agent: support"
    )
    assert summary is not None
    assert "[voice_xai]" not in summary
    assert "Call ID" not in summary
    assert "ID de llamada: call_1" in summary
    assert "Resultado: completed" in summary
    assert "De: +15103750043" in summary

    transcript = transcript_from_lines(["[Cliente]", "[Cliente]   ", "[Agente] Hola"])
    assert "[Cliente]" not in transcript
    assert transcript == "[Agente] Hola"
    stored = clean_transcript("[Cliente]\n[Cliente] Buenos días\n[Agente]")
    assert stored == "[Cliente] Buenos días"


def test_citas_handoff_is_not_offered_as_a_missing_template():
    templates = {"receptionist", "support", "sales", "technical", "escalation", "banking_support"}
    for item in list_function_tool_catalog():
        label = item["label"]
        if "Citas" in label:
            target = resolve_handoff_target(item["id"])
            assert target in templates
    assert resolve_handoff_target("to_scheduling") in templates
    assert all(item["label"] != "Transferir a Citas" for item in list_function_tool_catalog())


@pytest.mark.asyncio
async def test_call_record_read_strips_empty_client_lines_and_channel_prefix():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    await crm.create_call_record(
        CallRecord(
            call_id="audit-call",
            room_name="room",
            from_number="+15103750043",
            start_time=datetime.now(UTC).isoformat(),
            summary="[voice_xai] Call ID: audit-call\nOutcome: completed",
            transcript="[Cliente]\n[Cliente] Necesito ayuda\n[Agente]",
            duration_seconds=40,
            channel="voice_xai",
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        detail = await client.get("/api/calls/audit-call")
        listing = await client.get("/api/calls")
    assert detail.status_code == 200
    body = detail.json()
    assert "[voice_xai]" not in (body["summary"] or "")
    assert "ID de llamada" in body["summary"]
    assert body["transcript"] == "[Cliente] Necesito ayuda"
    listed = next(item for item in listing.json()["items"] if item["call_id"] == "audit-call")
    assert "[Cliente]\n" not in (listed["transcript"] or "")
    assert "[voice_xai]" not in (listed["summary"] or "")
