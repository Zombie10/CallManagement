"""Call report queries: filters, grouping, pivot."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

DIMENSIONS: dict[str, tuple[str, str]] = {
    "day": ("date(start_time)", "Día"),
    "hour": ("CAST(strftime('%H', start_time) AS INTEGER)", "Hora"),
    "weekday": ("strftime('%w', start_time)", "Día semana"),
    "outcome": ("COALESCE(outcome, 'unknown')", "Outcome"),
    "agent": ("COALESCE(agent_instance_id, 'unassigned')", "Agente"),
    "month": ("strftime('%Y-%m', start_time)", "Mes"),
}

WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]

FILTER_FIELDS = frozenset(
    {"outcome", "agent_instance_id", "from_number", "to_number", "duration_seconds", "start_time"}
)

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
    custom_filters: list[dict[str, Any]] = field(default_factory=list)
    detail_limit: int = 100


def _dimension_expr(name: str) -> str:
    if name not in DIMENSIONS:
        raise ValueError(f"Dimensión inválida: {name}")
    return DIMENSIONS[name][0]


def _label_key(key: str, dimension: str) -> str:
    if dimension == "weekday" and key.isdigit():
        idx = int(key)
        if 0 <= idx < len(WEEKDAY_LABELS):
            return WEEKDAY_LABELS[idx]
    if dimension == "outcome":
        return key.replace("_", " ")
    return key


def build_where(query: CallReportQuery) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []

    if query.date_from:
        clauses.append("start_time >= ?")
        params.append(query.date_from if "T" in query.date_from else f"{query.date_from}T00:00:00")
    if query.date_to:
        clauses.append("start_time <= ?")
        params.append(query.date_to if "T" in query.date_to else f"{query.date_to}T23:59:59")
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