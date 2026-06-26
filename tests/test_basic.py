"""Tests for the Call Management package."""

from __future__ import annotations

import pytest

from call_management import __version__
from call_management.agents import (
    EscalationAgent,
    ReceptionistAgent,
    SalesAgent,
    SupportAgent,
    TechnicalAgent,
)
from call_management.agents.base import CallContext
from call_management.config import get_model_config, get_voice_for_agent
from call_management.crm.database import CRMDatabase, reset_crm_singleton
from call_management.scheduling.calendar import schedule_appointment
from call_management.server import VALID_DEPARTMENTS, _calculate_duration_seconds, _resolve_initial_agent
from call_management.utils.summary import build_structured_summary


def test_version():
    assert __version__ == "0.1.0"


def test_model_config_defaults(monkeypatch):
    monkeypatch.delenv("MODEL_PROVIDER", raising=False)
    cfg = get_model_config()
    assert cfg.provider in ("inference", "xai", "direct")
    assert cfg.use_grok_realtime is True


def test_model_config_env_override(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "inference")
    monkeypatch.setenv("USE_GROK_REALTIME", "false")
    cfg = get_model_config()
    assert cfg.provider == "inference"
    assert cfg.use_grok_realtime is False


def test_voice_presets_per_agent():
    from call_management.config import VOICE_PRESETS

    assert get_voice_for_agent("sales", "xai") == "rex"
    assert get_voice_for_agent("support", "direct") == VOICE_PRESETS["support"]


@pytest.mark.asyncio
async def test_crm_basic(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "test_crm.db")
    await db.initialize()

    cust = await db.get_or_create_customer("+15551234567")
    assert cust.phone_number == "+15551234567"

    cust.name = "Test User"
    await db.update_customer(cust)

    cust2 = await db.get_or_create_customer("+15551234567")
    assert cust2.name == "Test User"


@pytest.mark.asyncio
async def test_crm_appointments_and_call_records(tmp_path):
    db = CRMDatabase(db_path=tmp_path / "test_crm.db")
    await db.initialize()

    appt_id, details = await schedule_appointment(
        db,
        phone_number="+15551234567",
        when="tomorrow at 3pm",
        purpose="sales demo",
    )
    assert appt_id
    assert details["purpose"] == "sales demo"

    from call_management.crm.database import CallRecord

    record = CallRecord(
        call_id="call_test_001",
        room_name="room-1",
        from_number="+15551234567",
        outcome="resolved",
        summary="Test summary",
        duration_seconds=120,
    )
    await db.create_call_record(record)
    loaded = await db.get_call_record("call_test_001")
    assert loaded is not None
    assert loaded.summary == "Test summary"
    assert loaded.duration_seconds == 120


def test_receptionist_has_routing_tools():
    agent = ReceptionistAgent()
    tool_names = set()
    for tool in agent.tools:
        name = getattr(tool, "name", None) or getattr(tool, "__name__", "")
        tool_names.add(name)
    for expected in ("to_support", "to_sales", "to_technical", "to_scheduling", "to_escalation"):
        assert expected in tool_names


@pytest.mark.asyncio
async def test_handoff_receptionist_to_sales():
    receptionist = ReceptionistAgent()
    support = SupportAgent()
    ctx = CallContext(
        call_id="call_handoff",
        agents={"receptionist": receptionist, "support": support, "sales": SalesAgent()},
    )
    run_ctx = type("RunCtx", (), {"userdata": ctx})()

    next_agent, message = await receptionist._transfer_to("sales", run_ctx, "Sales inquiry")  # type: ignore[arg-type]
    assert next_agent.agent_name == "sales"
    assert "sales" in message.lower()
    assert ctx.previous_agent_name == "receptionist"


def test_resolve_initial_agent_department_and_vip():
    agents = {
        "receptionist": ReceptionistAgent(),
        "support": SupportAgent(),
        "sales": SalesAgent(),
        "technical": TechnicalAgent(),
        "escalation": EscalationAgent(),
    }

    initial, reason = _resolve_initial_agent(
        agents,
        department_hint="sales",
        is_vip=False,
        vip_skip_receptionist=True,
    )
    assert initial.agent_name == "sales"
    assert reason == "sales"

    initial, reason = _resolve_initial_agent(
        agents,
        department_hint="unknown-dept",
        is_vip=False,
        vip_skip_receptionist=True,
    )
    assert initial.agent_name == "receptionist"

    initial, reason = _resolve_initial_agent(
        agents,
        department_hint=None,
        is_vip=True,
        vip_skip_receptionist=True,
    )
    assert initial.agent_name == "support"
    assert reason == "vip_support"


def test_duration_calculation():
    duration = _calculate_duration_seconds(
        "2026-06-07T10:00:00+00:00",
        "2026-06-07T10:05:30+00:00",
    )
    assert duration == 330


def test_structured_summary():
    ctx = CallContext(
        call_id="call_1",
        from_number="+15551234567",
        call_purpose="Sales inquiry",
        outcome="resolved",
        call_notes=["Customer asked for pricing"],
    )
    summary = build_structured_summary(ctx)
    assert "Sales inquiry" in summary
    assert "resolved" in summary


def test_valid_departments_match_registry():
    assert {"receptionist", "support", "sales", "technical", "escalation"} == VALID_DEPARTMENTS


@pytest.mark.asyncio
async def test_reset_crm_singleton(tmp_path):
    reset_crm_singleton()
    from call_management.crm.database import get_crm

    db1 = await get_crm(tmp_path / "one.db")
    reset_crm_singleton()
    db2 = await get_crm(tmp_path / "two.db")
    assert db1.db_path != db2.db_path
