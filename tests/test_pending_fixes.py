"""Pending re-check: hidden env names, agent comparison, dates, summary, language catalog."""

from __future__ import annotations

import subprocess
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from call_management.admin.app import app
from call_management.admin.env_store import SETTING_SECTIONS, load_settings
from call_management.admin.livekit_playground import livekit_playground_ready
from call_management.crm.agent_labels import agent_handled_label, agent_refs
from call_management.crm.database import CallRecord
from call_management.crm.reports import _label_key, default_period
from call_management.dev_check import check_livekit_env
from call_management.tenancy.context import resolve_crm_for_tenant
from call_management.tenancy.platform_store import get_platform_store
from call_management.utils.summary import present_call_summary

ROOT = Path(__file__).resolve().parents[1]
JUNE = datetime(2026, 6, 15, 14, 0, 0, tzinfo=UTC)
AUGUST = datetime(2026, 8, 19, 20, 47, 6, tzinfo=UTC)
RANGE = {"date_from": "2026-06-01", "date_to": "2026-08-31"}
ENGLISH_SUMMARY = "The call call_65d8252dcc51 was handled and then the call ended."
FULL_ACCOUNT = "359798493"
FULL_PAN_SPACED = "5470 5195 2639 3094"
VISIBLE_PAGES = (
    "admin-ui/src/pages/Settings.tsx",
    "admin-ui/src/pages/SetupWizard.tsx",
    "admin-ui/src/pages/Playground.tsx",
    "admin-ui/src/pages/Login.tsx",
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _catalog_keys() -> list[str]:
    return [field["key"] for fields in SETTING_SECTIONS.values() for field in fields]


def test_operator_issues_and_visible_pages_omit_catalog_keys(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://your-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "AP...")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "")
    monkeypatch.delenv("XAI_API_KEY", raising=False)

    issues = check_livekit_env()
    _ready, playground_issues = livekit_playground_ready()
    blob = "\n".join([*issues, *playground_issues])
    assert issues
    assert playground_issues
    keys = _catalog_keys()
    assert "LIVEKIT_API_KEY" in keys
    assert "XAI_API_KEY" in keys
    assert "SLACK_WEBHOOK_URL" in keys
    for key in keys:
        assert key not in blob
    assert "systemctl" not in blob.lower()

    for relative in VISIBLE_PAGES:
        text = (ROOT / relative).read_text(encoding="utf-8")
        for key in keys:
            assert key not in text, f"{relative} shows {key}"
        assert "systemctl" not in text, relative

    settings = (ROOT / "admin-ui/src/pages/Settings.tsx").read_text(encoding="utf-8")
    assert "{field.key}</p>" not in settings
    assert ">{field.key}<" not in settings
    assert "[field.key]" in settings

    payload = load_settings()
    returned = [field["key"] for fields in payload["sections"].values() for field in fields]
    assert returned == keys
    labels = [field["label"] for fields in payload["sections"].values() for field in fields]
    assert "API Key" in labels
    assert "Slack Webhook" in labels


def test_english_call_id_summary_is_not_the_hidden_placeholder():
    shown = present_call_summary(ENGLISH_SUMMARY)
    assert shown is not None
    assert "atendida por call" not in shown
    assert "El texto en inglés no se muestra" not in shown
    assert "65d8252dcc51" not in shown

    routed = present_call_summary(
        "The call call_65d8252dcc51 was routed to the banking_support agent and then ended."
    )
    assert routed is not None
    assert "soporte bancario" in routed
    assert "atendida por call" not in routed


def test_series_day_label_is_day_first_with_the_year():
    label = _label_key("2026-08-19", "day")
    assert label == "19/08/2026"
    assert "T" not in label
    assert label != "2026-08-19"


@pytest.mark.asyncio
async def test_comparison_matches_detail_labels_and_history_keeps_old_calls():
    window_from, _window_to = default_period()
    assert JUNE.date().isoformat() < window_from
    assert AUGUST.date().isoformat() < window_from

    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    soporte = store.create_agent(
        tenant.id,
        slug="soporte-us",
        display_name="Soporte US",
        template_id="support",
        status="active",
    )
    recepcion = store.create_agent(
        tenant.id,
        slug="recepcion-us",
        display_name="Recepción US",
        template_id="receptionist",
        status="active",
    )
    store.create_agent(
        tenant.id,
        slug="ventas-norte",
        display_name="Ventas Norte",
        template_id="sales",
        status="active",
    )
    store.create_agent(
        tenant.id,
        slug="ventas-sur",
        display_name="Ventas Sur",
        template_id="sales",
        status="active",
    )
    agents = agent_refs(store.list_agents(tenant.id))
    crm = await resolve_crm_for_tenant(tenant.id)

    async def add(call_id: str, start: datetime, **fields):
        await crm.create_call_record(
            CallRecord(
                call_id=call_id,
                room_name=call_id,
                from_number="+15103750043",
                start_time=start.isoformat(),
                outcome="completed",
                duration_seconds=fields.pop("duration_seconds", 40),
                **fields,
            )
        )

    await add(
        "call-inst-soporte",
        AUGUST,
        agent_instance_id=soporte.id,
        transferred_to="support",
        duration_seconds=91,
    )
    await add(
        "call-inst-recepcion",
        AUGUST,
        agent_instance_id=recepcion.id,
        transferred_to="receptionist",
    )
    for index in range(3):
        await add(f"call-tpl-support-{index}", JUNE, transferred_to="support")
    await add(
        "call-tpl-recepcion",
        JUNE,
        summary="Agente final: receptionist",
    )
    await add("call_65d8252dcc51", JUNE, summary=ENGLISH_SUMMARY, transcript="The customer asked about the balance in English.")
    await add("voice_74021a912922", AUGUST)
    await add("call-sales-ambiguous", JUNE, transferred_to="sales")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        dashboard = (await client.get("/api/dashboard")).json()
        analytics = (await client.get("/api/analytics", params=RANGE)).json()
        report = (await client.post("/api/reports/calls", json={**RANGE, "group_by": "day", "detail_limit": 100})).json()
        stored = (await client.get("/api/calls/call_65d8252dcc51")).json()

    assert dashboard["stats"]["calls"] == dashboard["analytics"]["total_calls"] == 9
    by_day = {row["day"]: row["count"] for row in dashboard["analytics"]["calls_by_day"]}
    assert by_day["2026-06-15"] >= 1
    assert by_day["2026-08-19"] >= 1

    assert report["summary"]["total_calls"] == 9
    assert len(report["detail"]) == 9
    series = {row["key"]: row["label"] for row in report["series"]}
    assert series["2026-08-19"] == "19/08/2026"
    assert "T" not in series["2026-08-19"]
    assert series["2026-06-15"] == "15/06/2026"
    durations = {row["call_id"]: row["duration_seconds"] for row in report["detail"]}
    assert durations["call-inst-soporte"] == 91

    expected: Counter[str] = Counter()
    for row in report["detail"]:
        label = agent_handled_label(
            agent_instance_id=row.get("agent_instance_id"),
            transferred_to=row.get("transferred_to"),
            summary=row.get("summary"),
            agents=agents,
        )
        expected[label] += 1
        if row["call_id"] in {"call_65d8252dcc51", "voice_74021a912922"}:
            assert label == "—"

    assert expected["Soporte US"] == 4
    assert expected["Recepción US"] == 2
    assert expected["—"] == 2
    assert expected["Ventas"] == 1
    assert "Ventas Norte" not in expected
    assert "Ventas Sur" not in expected
    assert sum(expected.values()) == 9

    actionable = analytics["actionable"]
    actual = {row["label"]: row["call_count"] for row in actionable["agent_comparison"]}
    assert actual == dict(expected)
    assert sum(row["call_count"] for row in actionable["agent_comparison"]) == actionable["total_calls"] == 9
    assert "Sin asignar" not in actual
    assert actual["—"] == expected["—"]
    assert "Soporte US" in actual
    assert "Recepción US" in actual

    assert "atendida por call" not in stored["summary"]
    assert "El texto en inglés no se muestra" not in stored["summary"]
    assert "English" in stored["transcript"] or "english" in stored["transcript"].lower()


@pytest.mark.asyncio
async def test_cards_stay_masked_on_the_call_record():
    tenant = get_platform_store().ensure_default_tenant()
    crm = await resolve_crm_for_tenant(tenant.id)
    await crm.create_call_record(
        CallRecord(
            call_id="mask-pending",
            room_name="mask",
            from_number="+15103750043",
            start_time=datetime.now(UTC).isoformat(),
            transcript=f"Tarjeta {FULL_PAN_SPACED}. Cuenta {FULL_ACCOUNT}.",
        )
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        detail = await client.get("/api/calls/mask-pending")
    assert detail.status_code == 200
    body = detail.text
    assert FULL_PAN_SPACED not in body
    assert FULL_ACCOUNT not in body
    assert "****3094" in body
    assert "****8493" in body


def test_admin_surfaces_for_duration_days_history_and_language():
    proc = subprocess.run(
        [
            "node",
            "--import",
            str(ROOT / "tests" / "register_admin_ts.mjs"),
            str(ROOT / "tests" / "check_admin_surfaces.mjs"),
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "1m 31s" in proc.stdout
    assert "19/08/2026" in proc.stdout
    assert "Búsqueda web" in proc.stdout
    assert "Web Search" in proc.stdout
