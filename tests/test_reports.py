"""Call report queries with filters and pivot."""

from __future__ import annotations

import pytest

from call_management.crm.database import CRMDatabase, CallRecord
from call_management.crm.reports import CallReportQuery


@pytest.fixture
async def crm_with_calls(tmp_path):
    db = CRMDatabase(tmp_path / "report.db")
    await db.initialize()
    await db.create_call_record(
        CallRecord(
            call_id="c1",
            room_name="r1",
            from_number="+50211111111",
            to_number="+50299999999",
            start_time="2026-06-01T10:00:00",
            end_time="2026-06-01T10:05:00",
            outcome="resolved",
            duration_seconds=300,
            agent_instance_id="agent-a",
        ),
    )
    await db.create_call_record(
        CallRecord(
            call_id="c2",
            room_name="r2",
            from_number="+50222222222",
            to_number="+50299999999",
            start_time="2026-06-02T14:00:00",
            outcome="abandoned",
            duration_seconds=45,
            agent_instance_id="agent-b",
        ),
    )
    return db


@pytest.mark.asyncio
async def test_report_options(crm_with_calls):
    opts = await crm_with_calls.get_report_options()
    assert "resolved" in opts["outcomes"]
    assert "day" in [d["id"] for d in opts["dimensions"]]


@pytest.mark.asyncio
async def test_report_date_filter(crm_with_calls):
    result = await crm_with_calls.query_call_report(
        CallReportQuery(date_from="2026-06-01", date_to="2026-06-01")
    )
    assert result["summary"]["total_calls"] == 1


@pytest.mark.asyncio
async def test_report_pivot(crm_with_calls):
    result = await crm_with_calls.query_call_report(
        CallReportQuery(
            pivot_row="outcome",
            pivot_col="agent",
            metric="count",
        )
    )
    assert result["pivot"] is not None
    assert len(result["pivot"]["cells"]) >= 1


@pytest.mark.asyncio
async def test_custom_filter(crm_with_calls):
    result = await crm_with_calls.query_call_report(
        CallReportQuery(
            custom_filters=[{"field": "duration_seconds", "op": "gte", "value": 100}],
        )
    )
    assert result["summary"]["total_calls"] == 1