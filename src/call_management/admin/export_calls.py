"""CSV export helpers for call records."""

from __future__ import annotations

import csv
import io
from typing import Any

from call_management.crm.export_report import csv_fieldnames_spanish
from call_management.crm.reports import CHANNEL_LABELS, TEMPLATE_LABELS


def _fmt_duration(seconds: int | float | None) -> str:
    if seconds is None:
        return ""
    s = int(seconds)
    if s < 60:
        return f"{s}s"
    m, rem = divmod(s, 60)
    return f"{m}m {rem}s" if rem else f"{m}m"


def enrich_export_row(row: dict[str, Any], agent_labels: dict[str, str]) -> dict[str, Any]:
    agent_id = row.get("agent_instance_id") or ""
    template = row.get("transferred_to") or ""
    channel = row.get("channel") or "sip"
    return {
        "call_id": row.get("call_id"),
        "start_time": row.get("start_time"),
        "end_time": row.get("end_time"),
        "from_number": row.get("from_number"),
        "to_number": row.get("to_number"),
        "channel": CHANNEL_LABELS.get(channel, channel),
        "outcome": (row.get("outcome") or "").replace("_", " "),
        "duration_seconds": row.get("duration_seconds"),
        "duration_fmt": _fmt_duration(row.get("duration_seconds")),
        "agent_instance_id": agent_id,
        "agent_label": agent_labels.get(agent_id, agent_id or ""),
        "transferred_to": TEMPLATE_LABELS.get(template, template or ""),
        "has_transcript": "Sí"
        if row.get("has_transcript") in (1, True, "1") or (row.get("transcript") or "").strip()
        else "No",
        "has_recording": "Sí"
        if row.get("has_recording") in (1, True, "1") or (row.get("recording_url") or "").strip()
        else "No",
        "summary": row.get("summary") or "",
        "agent_notes": row.get("agent_notes") or "",
    }


def build_calls_csv(
    rows: list[dict[str, Any]],
    *,
    agent_labels: dict[str, str],
) -> str:
    fields = csv_fieldnames_spanish()
    keys = [k for k, _ in fields]
    headers = [h for _, h in fields]
    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(headers)
    for raw in rows:
        row = enrich_export_row(raw, agent_labels)
        writer.writerow([row.get(k, "") for k in keys])
    return buf.getvalue()