"""Re-check fixes: transcript secrets, Spanish summaries, period metrics, caller phones."""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.voice_tool_runner import execute_voice_function
from call_management.crm.database import CallRecord
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.utils.summary import (
    build_structured_summary,
    present_call_summary,
    summary_model_messages,
)

FULL_ACCOUNT = "359798493"
FULL_PAN_SPACED = "5470 5195 2639 3094"
FULL_PAN_PLAIN = "5470519526393094"
ENGLISH_ROUTED = (
    "The call from +15103750043 was routed to the banking_support agent "
    "for a debit card block."
)
ENGLISH_SECOND = "The customer asked to speak with a supervisor and then the call ended."
SYSTEM_LINE = (
    "[Sistema] get_account_summary: "
    f"Cuenta BAC {FULL_ACCOUNT}. "
    f"Tarjeta débito {FULL_PAN_SPACED} (vence 10/2026). "
    f"PAN {FULL_PAN_PLAIN}."
)


def _assert_no_secret(body: str) -> None:
    assert FULL_ACCOUNT not in body
    assert FULL_PAN_SPACED not in body
    assert FULL_PAN_PLAIN not in body


def _assert_spanish_summary(shown: str) -> None:
    assert shown
    assert "The call from" not in shown
    assert "was routed to" not in shown
    assert shown != ENGLISH_ROUTED
    assert shown != ENGLISH_SECOND
    assert "Llamada" in shown


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_call_record_api_redacts_stored_card_and_drops_placeholder_lines():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    await crm.create_call_record(
        CallRecord(
            call_id="voice_faa6f7e4cc69",
            room_name="room-a",
            from_number="+15103750043",
            start_time=datetime.now(UTC).isoformat(),
            summary=ENGLISH_ROUTED,
            agent_notes=f"Cuenta {FULL_ACCOUNT} tarjeta {FULL_PAN_SPACED}",
            transcript=f"{SYSTEM_LINE}\n[Cliente] ...\n[Cliente]\n[Cliente] hola\n",
            channel="voice_xai",
        )
    )
    await crm.create_call_record(
        CallRecord(
            call_id="voice_second_secret",
            room_name="room-b",
            from_number="+15103750043",
            start_time=datetime.now(UTC).isoformat(),
            summary=ENGLISH_SECOND,
            transcript=f"[Sistema] seguimiento {FULL_PAN_PLAIN} cuenta {FULL_ACCOUNT}\n[Agente] listo\n",
            channel="voice_xai",
        )
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.get("/api/calls/voice_faa6f7e4cc69")
        listed = await client.get("/api/calls")
        second = await client.get("/api/calls/voice_second_secret")

    assert first.status_code == 200
    assert second.status_code == 200
    _assert_no_secret(first.text)
    _assert_no_secret(listed.text)
    _assert_no_secret(second.text)
    detail = first.json()
    assert detail["transcript"]
    assert "[Cliente] hola" in detail["transcript"]
    assert "[Cliente] ..." not in detail["transcript"]
    assert "[Cliente]\n" not in detail["transcript"]
    assert "****3094" in detail["transcript"] or "****8493" in detail["transcript"]
    _assert_spanish_summary(detail["summary"])
    assert "+15103750043" in detail["summary"]
    assert "soporte bancario" in detail["summary"]
    assert "bloqueo de tarjeta de débito" in detail["summary"]
    _assert_spanish_summary(second.json()["summary"])
    assert "supervisor" in second.json()["summary"]
    assert "asked" not in second.json()["summary"]
    listed_item = next(item for item in listed.json()["items"] if item["call_id"] == "voice_faa6f7e4cc69")
    _assert_no_secret(json.dumps(listed_item))
    assert "[Cliente] hola" in listed_item["transcript"]


@pytest.mark.asyncio
async def test_voice_account_summary_omits_full_card_and_account():
    tenant = get_platform_store().ensure_default_tenant()
    result = await execute_voice_function(
        function_name="get_account_summary",
        phone_number="+15103750043",
        tenant_id=tenant.id,
    )
    assert result["status"] == "ok"
    output = result["output"]
    assert output
    _assert_no_secret(output)
    assert "****3094" in output
    assert "****8493" in output

    lookup = await execute_voice_function(
        function_name="lookup_customer",
        arguments={"phone_number": "+15103750043"},
        phone_number="+15103750043",
        tenant_id=tenant.id,
    )
    _assert_no_secret(lookup["output"])


def test_english_prose_and_no_model_summary_are_spanish():
    routed = present_call_summary(ENGLISH_ROUTED)
    second = present_call_summary(ENGLISH_SECOND)
    assert routed is not None and second is not None
    _assert_spanish_summary(routed)
    _assert_spanish_summary(second)
    assert "was routed to" not in second

    class Ctx:
        call_id = "voice_1"
        from_number = "+15103750043"
        outcome = "completed"
        call_purpose = "bloqueo de tarjeta"
        current_agent_name = None
        previous_agent_name = "banking_support"
        handoff_reason = None
        appointment_details = None
        call_notes: list[str] = []

    built = build_structured_summary(Ctx())
    assert "ID de llamada: voice_1" in built
    assert "De: +15103750043" in built
    assert "The call" not in built
    messages = summary_model_messages(built)
    assert "español" in messages[0]["content"].lower()
    assert "summarize" not in messages[0]["content"].lower()


def test_voice_formatter_omits_ellipsis_only_client_line():
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        [
            "node",
            "--import",
            str(root / "tests" / "register_admin_ts.mjs"),
            str(root / "tests" / "check_voice_transcript.mjs"),
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "[Cliente] hola" in proc.stdout
    assert "[Cliente] ..." not in proc.stdout


@pytest.mark.asyncio
async def test_period_metrics_ignore_history_outside_the_window():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    now = datetime.now(UTC)
    await crm.create_call_record(
        CallRecord(
            call_id="old-metrics",
            room_name="old",
            from_number="+15103750043",
            start_time=(now - timedelta(days=400)).isoformat(),
            duration_seconds=10,
            outcome="completed",
            transferred_to="support",
            agent_instance_id="old-agent",
            transcript="queja queja queja problema urgente cancelar",
        )
    )

    transport = ASGITransport(app=app)

    async def payloads():
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            dashboard = (await client.get("/api/dashboard")).json()
            analytics = (await client.get("/api/analytics")).json()
        return dashboard, analytics

    dashboard, analytics = await payloads()
    assert dashboard["stats"]["calls"] == dashboard["analytics"]["total_calls"] == 1
    assert sum(day["count"] for day in dashboard["analytics"]["calls_by_day"]) == 1
    assert dashboard["actionable"]["total_calls"] == 1
    assert dashboard["actionable"]["handoffs"] == 1
    assert dashboard["actionable"]["escalations"] == 0
    assert analytics["total_calls"] == 0
    actionable = analytics["actionable"]
    assert actionable["total_calls"] == 0
    assert actionable["handoffs"] == 0
    assert actionable["sla_compliance_pct"] == 0.0
    assert actionable["sentiment_label"] != "negative"
    assert sum(row["call_count"] for row in actionable["agent_comparison"]) == 0

    await crm.create_call_record(
        CallRecord(
            call_id="new-metrics",
            room_name="new",
            from_number="+15103750043",
            start_time=now.isoformat(),
            duration_seconds=91,
            outcome="completed",
            agent_instance_id="agent-now",
            transcript="consulta de saldo",
        )
    )
    dashboard, analytics = await payloads()
    assert dashboard["stats"]["calls"] == dashboard["analytics"]["total_calls"] == 2
    assert sum(day["count"] for day in dashboard["analytics"]["calls_by_day"]) == 2
    assert analytics["total_calls"] == 1
    actionable = analytics["actionable"]
    assert actionable["total_calls"] == 1
    assert actionable["handoffs"] == 0
    assert actionable["sentiment_label"] != "negative"
    assert actionable["sla_compliance_pct"] == 0.0
    assert sum(row["call_count"] for row in actionable["agent_comparison"]) == actionable["total_calls"]


@pytest.mark.asyncio
async def test_registros_labels_invalid_caller_phones():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    now = datetime.now(UTC).isoformat()
    await crm.create_call_record(
        CallRecord(call_id="phone-unknown", room_name="room", from_number="unknown", start_time=now)
    )
    await crm.create_call_record(
        CallRecord(call_id="phone-short", room_name="room", from_number="+184494142", start_time=now)
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unknown = await client.get("/api/calls/phone-unknown")
        short = await client.get("/api/calls/phone-short")
        listed = await client.get("/api/calls")
    assert unknown.status_code == 200
    assert short.status_code == 200
    assert unknown.json()["from_number"] == "Teléfono inválido"
    assert short.json()["from_number"] == "Teléfono inválido"
    assert "unknown" not in unknown.json()["from_number"]
    by_id = {item["call_id"]: item for item in listed.json()["items"]}
    assert by_id["phone-unknown"]["from_number"] == "Teléfono inválido"
    assert by_id["phone-short"]["from_number"] == "Teléfono inválido"
