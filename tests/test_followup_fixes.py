"""Follow-up re-check: history dashboard, filtered KPIs, labels, templates, transcripts."""

from __future__ import annotations

import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.agent_store import load_profiles, reset_profile_cache
from call_management.agents.registry import list_function_tool_catalog
from call_management.crm.database import CallRecord
from call_management.crm.reports import default_period
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.utils.summary import present_call_summary

FULL_ACCOUNT = "359798493"
FULL_PAN_SPACED = "5470 5195 2639 3094"
JUNE = datetime(2026, 6, 15, 14, 0, 0, tzinfo=UTC)
AUGUST = datetime(2026, 8, 19, 20, 47, 6, tzinfo=UTC)
RANGE = {"date_from": "2026-06-01", "date_to": "2026-08-31"}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _comparison_total(actionable: dict) -> int:
    return sum(row["call_count"] for row in actionable["agent_comparison"])


@pytest.mark.asyncio
async def test_dashboard_history_and_filtered_kpis_follow_the_report_range():
    window_from, _window_to = default_period()
    assert JUNE.date().isoformat() < window_from
    assert AUGUST.date().isoformat() < window_from

    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    await crm.create_call_record(
        CallRecord(
            call_id="june-escalated",
            room_name="june",
            from_number="unknown",
            start_time=JUNE.isoformat(),
            duration_seconds=10,
            outcome="escalated",
            transferred_to="support",
            agent_instance_id="inst-support",
            transcript="queja problema urgente cancelar",
        )
    )
    await crm.create_call_record(
        CallRecord(
            call_id="august-completed",
            room_name="august",
            from_number="+15103750043",
            start_time=AUGUST.isoformat(),
            duration_seconds=90,
            outcome="completed",
            transferred_to="receptionist",
            agent_instance_id="inst-reception",
            transcript="consulta de saldo",
        )
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        dashboard = (await client.get("/api/dashboard")).json()
        empty = (await client.get("/api/analytics")).json()
        filtered = (await client.get("/api/analytics", params=RANGE)).json()
        report = (
            await client.post("/api/reports/calls", json={**RANGE, "group_by": "day"})
        ).json()

    assert dashboard["stats"]["calls"] == dashboard["analytics"]["total_calls"] == 2
    by_day = {row["day"]: row["count"] for row in dashboard["analytics"]["calls_by_day"]}
    assert sum(by_day.values()) == dashboard["analytics"]["total_calls"]
    assert by_day["2026-06-15"] == 1
    assert by_day["2026-08-19"] == 1
    assert dashboard["actionable"]["total_calls"] == 2
    assert dashboard["actionable"]["escalations"] == 1

    assert empty["total_calls"] == 0
    assert empty["actionable"]["sla_compliance_pct"] == 0.0
    assert empty["actionable"]["escalations"] == 0
    assert empty["actionable"]["sentiment_label"] == "neutral"
    assert _comparison_total(empty["actionable"]) == 0

    actionable = filtered["actionable"]
    assert filtered["total_calls"] == actionable["total_calls"] == report["summary"]["total_calls"] == 2
    assert actionable["sla_compliance_pct"] == 50.0
    assert actionable["escalations"] == 1
    assert actionable["sentiment_label"] == "negative"
    assert _comparison_total(actionable) == actionable["total_calls"]
    assert actionable["sla_compliance_pct"] != empty["actionable"]["sla_compliance_pct"]
    assert actionable["escalations"] != empty["actionable"]["escalations"]
    assert actionable["sentiment_label"] != empty["actionable"]["sentiment_label"]

    origen = {row["call_id"]: row["from_number"] for row in report["detail"]}
    assert origen["june-escalated"] == "Teléfono inválido"
    assert "unknown" not in origen["june-escalated"]
    assert origen["august-completed"] == "+15103750043"


@pytest.mark.asyncio
async def test_report_options_expose_instance_template_for_unique_labels():
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    store.create_agent(
        tenant.id,
        slug="soporte-us",
        display_name="Soporte US",
        template_id="support",
        status="active",
    )
    store.create_agent(
        tenant.id,
        slug="recepcion-us",
        display_name="Recepción US",
        template_id="receptionist",
        status="active",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        options = (await client.get("/api/reports/options")).json()
    by_label = {agent["label"]: agent for agent in options["agents"]}
    assert by_label["Soporte US"]["template_id"] == "support"
    assert by_label["Recepción US"]["template_id"] == "receptionist"


def test_call_id_is_not_an_agent_name_and_cards_stay_masked():
    shown = present_call_summary(
        "The call call_65d8252dcc51 was handled and then the call ended."
    )
    assert shown is not None
    assert "atendida por call" not in shown
    assert "65d8252dcc51" not in shown

    routed = present_call_summary(
        "The call call_65d8252dcc51 was routed to the banking_support agent and then ended."
    )
    assert routed is not None
    assert "atendida por call" not in routed
    assert "soporte bancario" in routed


@pytest.mark.asyncio
async def test_stored_card_and_account_still_render_as_last_four():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    await crm.create_call_record(
        CallRecord(
            call_id="mask-followup",
            room_name="mask",
            from_number="+15103750043",
            start_time=datetime.now(UTC).isoformat(),
            transcript=f"Tarjeta {FULL_PAN_SPACED}. Cuenta {FULL_ACCOUNT}.",
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        detail = await client.get("/api/calls/mask-followup")
    assert detail.status_code == 200
    body = detail.text
    assert FULL_PAN_SPACED not in body
    assert FULL_ACCOUNT not in body
    assert "****3094" in body
    assert "****8493" in body


def test_builtin_templates_use_spanish_titles_and_keep_handoffs(agent_profiles_file):
    agent_profiles_file.write_text(
        json.dumps(
            {
                "receptionist": {"display_name": "Receptionist", "locale": "en"},
                "support": {"display_name": "Support", "locale": "en"},
                "banking_support": {"display_name": "Mesa propia", "locale": "en"},
                "sales": {"display_name": "Ventas personalizadas", "locale": "multi"},
            }
        ),
        encoding="utf-8",
    )
    reset_profile_cache()
    profiles = load_profiles()
    assert profiles["receptionist"].display_name == "Recepción"
    assert profiles["support"].display_name == "Soporte"
    assert profiles["receptionist"].locale == "es"
    assert profiles["support"].locale == "es"
    assert profiles["banking_support"].display_name == "Mesa propia"
    assert profiles["banking_support"].locale == "es"
    assert profiles["sales"].display_name == "Ventas personalizadas"
    assert profiles["sales"].locale == "multi"
    for profile in (profiles["receptionist"], profiles["support"]):
        assert profile.display_name not in {"Receptionist", "Support"}
        assert profile.locale != "en"

    labels = {item["id"]: item["label"] for item in list_function_tool_catalog()}
    assert labels["to_scheduling"] == "Agendar cita con Soporte"
    assert labels["to_support"] == "Transferir a Soporte"
    assert "English" not in labels.values()


@pytest.mark.asyncio
async def test_agents_api_serves_spanish_builtin_cards(agent_profiles_file):
    agent_profiles_file.write_text(
        json.dumps(
            {
                "receptionist": {"display_name": "Receptionist", "locale": "en"},
                "support": {"display_name": "Support", "locale": "en"},
            }
        ),
        encoding="utf-8",
    )
    reset_profile_cache()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        body = (await client.get("/api/agents")).json()
    by_name = {profile["name"]: profile for profile in body["profiles"]}
    assert by_name["receptionist"]["display_name"] == "Recepción"
    assert by_name["support"]["display_name"] == "Soporte"
    assert by_name["receptionist"]["locale"] == "es"
    assert by_name["support"]["locale"] == "es"
    assert "Receptionist" not in json.dumps(by_name["receptionist"]["display_name"])
    assert "Support" != by_name["support"]["display_name"]


def test_admin_surfaces_for_dates_agents_onboarding_and_tool_lines():
    root = Path(__file__).resolve().parents[1]
    proc = subprocess.run(
        [
            "node",
            "--import",
            str(root / "tests" / "register_admin_ts.mjs"),
            str(root / "tests" / "check_admin_surfaces.mjs"),
        ],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "19/08/2026, 20:47:06" in proc.stdout
    assert "Soporte US" in proc.stdout
    assert "Recepción US" in proc.stdout
    assert "…" not in proc.stdout
