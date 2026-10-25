"""Call report queries: filters, grouping, pivot."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

_DAY_KEY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")

# utc_now_iso() stores an offset timestamp SQLite date()/datetime() reject.
# The first 19 characters are YYYY-MM-DDTHH:MM:SS on every stored call.
CALL_START_EXPR = "datetime(replace(substr(start_time, 1, 19), 'T', ' '))"

DIMENSIONS: dict[str, tuple[str, str]] = {
    "day": (f"date({CALL_START_EXPR})", "Día"),
    "hour": (f"CAST(strftime('%H', {CALL_START_EXPR}) AS INTEGER)", "Hora"),
    "weekday": (f"strftime('%w', {CALL_START_EXPR})", "Día semana"),
    "outcome": ("COALESCE(outcome, 'unknown')", "Outcome"),
    "agent": ("COALESCE(NULLIF(agent_instance_id, ''), 'unassigned')", "Agente instancia"),
    "template": ("COALESCE(NULLIF(transferred_to, ''), 'sin_plantilla')", "Plantilla agente"),
    "channel": ("COALESCE(channel, 'sip')", "Canal"),
    "month": (f"strftime('%Y-%m', {CALL_START_EXPR})", "Mes"),
}

WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

FILTER_FIELDS = frozenset(
    {
        "outcome",
        "agent_instance_id",
        "from_number",
        "to_number",
        "duration_seconds",
        "start_time",
        "channel",
        "transferred_to",
    }
)

CHANNEL_LABELS = {
    "sip": "Teléfono",
    "voice_livekit": "Voz LiveKit",
    "voice_xai": "Voz xAI",
    "chat": "Chat",
}

TEMPLATE_LABELS = {
    "receptionist": "Recepción",
    "support": "Soporte",
    "sales": "Ventas",
    "technical": "Técnico",
    "escalation": "Escalación",
    "banking_support": "Soporte bancario",
    "sin_plantilla": "Sin plantilla",
    "unassigned": "Sin asignar",
}

METRIC_SQL = {
    "count": "COUNT(*)",
    "sum_duration": "COALESCE(SUM(duration_seconds), 0)",
    "avg_duration": "COALESCE(CAST(AVG(duration_seconds) AS INTEGER), 0)",
}


@dataclass
class CallReportQuery:
    date_from: str | None = None
    date_to: str | None = None
    outcomes: list[str] = field(default_factory=list)
    agent_instance_ids: list[str] = field(default_factory=list)
    from_number: str | None = None
    min_duration: int | None = None
    max_duration: int | None = None
    group_by: str = "day"
    pivot_row: str | None = None
    pivot_col: str | None = None
    metric: str = "count"
    channels: list[str] = field(default_factory=list)
    custom_filters: list[dict[str, Any]] = field(default_factory=list)
    detail_limit: int = 100


def _dimension_expr(name: str) -> str:
    if name not in DIMENSIONS:
        raise ValueError(f"Dimensión inválida: {name}")
    return DIMENSIONS[name][0]


def format_report_day(key: str) -> str:
    """Day-first label with the year. Series shows this instead of a raw ISO day."""
    match = _DAY_KEY.match(str(key).strip())
    if not match:
        return str(key)
    year, month, day = match.groups()
    return f"{day}/{month}/{year}"


def _label_key(key: str, dimension: str) -> str:
    if dimension == "day":
        return format_report_day(key)
    if dimension == "weekday" and str(key).isdigit():
        idx = int(key)
        if 0 <= idx < len(WEEKDAY_LABELS):
            return WEEKDAY_LABELS[idx]
    if dimension == "outcome":
        return key.replace("_", " ")
    if dimension == "channel":
        return CHANNEL_LABELS.get(key, key)
    if dimension == "template":
        return TEMPLATE_LABELS.get(key, key.replace("_", " "))
    if dimension == "agent":
        if key in {"unassigned", "None", ""}:
            return "Sin asignar"
        return key
    return key


def default_period(*, days: int = 30) -> tuple[str, str]:
    """Calendar window Análisis opens with. The Dashboard uses full stored history."""
    today = datetime.now(UTC).date()
    return (today - timedelta(days=days)).isoformat(), today.isoformat()


def _date_bound(value: str, *, end: bool) -> str:
    if "T" in value:
        return value
    return f"{value}T23:59:59" if end else f"{value}T00:00:00"


def build_where(query: CallReportQuery) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if query.date_from:
        clauses.append(f"{CALL_START_EXPR} >= datetime(replace(substr(?, 1, 19), 'T', ' '))")
        params.append(_date_bound(query.date_from, end=False))
    if query.date_to:
        clauses.append(f"{CALL_START_EXPR} <= datetime(replace(substr(?, 1, 19), 'T', ' '))")
        params.append(_date_bound(query.date_to, end=True))
    if query.outcomes:
        placeholders = ",".join("?" * len(query.outcomes))
        clauses.append(f"COALESCE(outcome, 'unknown') IN ({placeholders})")
        params.extend(query.outcomes)
    if query.agent_instance_ids:
        placeholders = ",".join("?" * len(query.agent_instance_ids))
        clauses.append(f"COALESCE(agent_instance_id, 'unassigned') IN ({placeholders})")
        params.extend(query.agent_instance_ids)
    if query.from_number:
        clauses.append("from_number LIKE ?")
        params.append(f"%{query.from_number.strip()}%")
    if query.min_duration is not None:
        clauses.append("duration_seconds >= ?")
        params.append(query.min_duration)
    if query.max_duration is not None:
        clauses.append("duration_seconds <= ?")
        params.append(query.max_duration)
    if query.channels:
        placeholders = ",".join("?" * len(query.channels))
        clauses.append(f"COALESCE(channel, 'sip') IN ({placeholders})")
        params.extend(query.channels)

    for flt in query.custom_filters:
        field = str(flt.get("field", ""))
        op = str(flt.get("op", "eq"))
        value = flt.get("value")
        if field not in FILTER_FIELDS:
            continue
        col = field
        if op == "eq":
            clauses.append(f"{col} = ?")
            params.append(value)
        elif op == "neq":
            clauses.append(f"{col} != ?")
            params.append(value)
        elif op == "contains" and value is not None:
            clauses.append(f"{col} LIKE ?")
            params.append(f"%{value}%")
        elif op == "gte":
            clauses.append(f"{col} >= ?")
            params.append(value)
        elif op == "lte":
            clauses.append(f"{col} <= ?")
            params.append(value)
        elif op == "in" and isinstance(value, list) and value:
            placeholders = ",".join("?" * len(value))
            clauses.append(f"{col} IN ({placeholders})")
            params.extend(value)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


def metric_select(metric: str) -> str:
    if metric not in METRIC_SQL:
        raise ValueError(f"Métrica inválida: {metric}")
    return METRIC_SQL[metric]