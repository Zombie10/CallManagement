"""Analytics export: XLSX workbook and filtered CSV."""

from __future__ import annotations

import pytest

from call_management.crm.database import CRMDatabase, CallRecord
from call_management.crm.export_report import build_analytics_workbook
from call_management.crm.reports import CallReportQuery
from call_management.admin.export_calls import build_calls_csv


@pytest.fixture
async def crm_export_data(tmp_path):
    db = CRMDatabase(tmp_path / "export.db")
    await db.initialize()
    await db.create_call_record(
        CallRecord(
            call_id="c-export-1",
            room_name="r1",
            from_number="+15105551234",
            to_number="+15109379101",
            start_time="2026-06-15T10:00:00",
            end_time="2026-06-15T10:05:00",
            outcome="resolved",
            summary="Cliente preguntó por horario.",
            duration_seconds=300,
            agent_instance_id="agent-1",
            transferred_to="receptionist",
            channel="sip",
        ),
    )
    return db


@pytest.mark.asyncio
async def test_build_analytics_workbook(crm_export_data):
    report = await crm_export_data.query_call_report(
        CallReportQuery(date_from="2026-06-01", date_to="2026-06-30", pivot_row="outcome", pivot_col="channel")
    )
    content = build_analytics_workbook(
        tenant_name="Café Central",
        report=report,
        agent_labels={"agent-1": "Recepción Demo"},
    )
    assert content[:2] == b"PK"
    assert len(content) > 2000


@pytest.mark.asyncio
async def test_filtered_csv_export(crm_export_data):
    rows = await crm_export_data.export_calls_filtered(
        CallReportQuery(date_from="2026-06-01", date_to="2026-06-30"),
    )
    csv_text = build_calls_csv(rows, agent_labels={"agent-1": "Recepción Demo"})
    assert csv_text.startswith("\ufeff")
    assert "id_llamada" in csv_text
    assert "+15105551234" in csv_text
    assert "Recepción Demo" in csv_text