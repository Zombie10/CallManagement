"""Async SQLite-backed CRM for Call Management."""

from __future__ import annotations

import os
import sqlite3
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

import aiosqlite

from call_management.utils.time import utc_now_iso

DB_PATH = Path(os.getenv("CRM_DB_PATH", "./data/crm.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SCHEMA_VERSION = 2


@dataclass
class Customer:
    phone_number: str
    name: str | None = None
    email: str | None = None
    notes: str | None = None
    vip: bool = False
    created_at: str = field(default_factory=utc_now_iso)
    updated_at: str = field(default_factory=utc_now_iso)


@dataclass
class CallRecord:
    call_id: str
    room_name: str
    from_number: str
    to_number: str | None = None
    start_time: str = field(default_factory=utc_now_iso)
    end_time: str | None = None
    outcome: str | None = None
    summary: str | None = None
    agent_notes: str | None = None
    transferred_to: str | None = None
    duration_seconds: int | None = None
    transcript: str | None = None
    recording_url: str | None = None
    agent_instance_id: str | None = None


@dataclass
class Appointment:
    id: str | None = None
    customer_phone: str = ""
    scheduled_time: str = ""
    purpose: str = ""
    notes: str | None = None
    created_at: str = field(default_factory=utc_now_iso)


class CRMDatabase:
    """Thin async wrapper around SQLite for the call management domain."""

    def __init__(self, db_path: Path | str = DB_PATH) -> None:
        self.db_path = Path(db_path)

    async def initialize(self) -> None:
        async with self._connect() as db:
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS customers (
                    phone_number TEXT PRIMARY KEY,
                    name TEXT,
                    email TEXT,
                    notes TEXT,
                    vip INTEGER DEFAULT 0,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS call_records (
                    call_id TEXT PRIMARY KEY,
                    room_name TEXT,
                    from_number TEXT,
                    to_number TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    outcome TEXT,
                    summary TEXT,
                    agent_notes TEXT,
                    transferred_to TEXT,
                    duration_seconds INTEGER
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS appointments (
                    id TEXT PRIMARY KEY,
                    customer_phone TEXT,
                    scheduled_time TEXT,
                    purpose TEXT,
                    notes TEXT,
                    created_at TEXT,
                    FOREIGN KEY(customer_phone) REFERENCES customers(phone_number)
                )
                """
            )
            await db.execute(
                "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                (1, utc_now_iso()),
            )
            await self._migrate_v2(db)
            await db.commit()

    async def _migrate_v2(self, db: aiosqlite.Connection) -> None:
        async with db.execute("SELECT MAX(version) AS v FROM schema_migrations") as cur:
            row = await cur.fetchone()
            current = row["v"] if row and row["v"] else 1
        if current >= 2:
            return
        for col, typ in (
            ("transcript", "TEXT"),
            ("recording_url", "TEXT"),
            ("agent_instance_id", "TEXT"),
        ):
            try:
                await db.execute(f"ALTER TABLE call_records ADD COLUMN {col} {typ}")
            except Exception:
                pass
        await db.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
            (2, utc_now_iso()),
        )

    @asynccontextmanager
    async def _connect(self):
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = sqlite3.Row
            yield db

    async def get_or_create_customer(self, phone_number: str) -> Customer:
        async with self._connect() as db:
            async with db.execute(
                "SELECT * FROM customers WHERE phone_number = ?", (phone_number,)
            ) as cursor:
                row = await cursor.fetchone()
            if row:
                return Customer(
                    phone_number=row["phone_number"],
                    name=row["name"],
                    email=row["email"],
                    notes=row["notes"],
                    vip=bool(row["vip"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )

            now = utc_now_iso()
            await db.execute(
                "INSERT OR IGNORE INTO customers (phone_number, created_at, updated_at) VALUES (?, ?, ?)",
                (phone_number, now, now),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM customers WHERE phone_number = ?", (phone_number,)
            ) as cursor:
                row = await cursor.fetchone()
            return Customer(
                phone_number=row["phone_number"],
                name=row["name"],
                email=row["email"],
                notes=row["notes"],
                vip=bool(row["vip"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    async def update_customer(self, customer: Customer) -> None:
        customer.updated_at = utc_now_iso()
        async with self._connect() as db:
            await db.execute(
                """
                UPDATE customers SET
                    name = ?, email = ?, notes = ?, vip = ?, updated_at = ?
                WHERE phone_number = ?
                """,
                (
                    customer.name,
                    customer.email,
                    customer.notes,
                    int(customer.vip),
                    customer.updated_at,
                    customer.phone_number,
                ),
            )
            await db.commit()

    async def add_customer_note(self, phone_number: str, note: str) -> None:
        customer = await self.get_or_create_customer(phone_number)
        existing = customer.notes or ""
        separator = "\n---\n" if existing else ""
        customer.notes = f"{existing}{separator}{utc_now_iso()}: {note}"
        await self.update_customer(customer)

    async def create_call_record(self, record: CallRecord) -> None:
        async with self._connect() as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO call_records
                (call_id, room_name, from_number, to_number, start_time, end_time,
                 outcome, summary, agent_notes, transferred_to, duration_seconds,
                 transcript, recording_url, agent_instance_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.call_id,
                    record.room_name,
                    record.from_number,
                    record.to_number,
                    record.start_time,
                    record.end_time,
                    record.outcome,
                    record.summary,
                    record.agent_notes,
                    record.transferred_to,
                    record.duration_seconds,
                    record.transcript,
                    record.recording_url,
                    record.agent_instance_id,
                ),
            )
            await db.commit()

    async def update_call_record(self, record: CallRecord) -> None:
        async with self._connect() as db:
            await db.execute(
                """
                UPDATE call_records SET
                    end_time = ?, outcome = ?, summary = ?, agent_notes = ?,
                    transferred_to = ?, duration_seconds = ?
                WHERE call_id = ?
                """,
                (
                    record.end_time,
                    record.outcome,
                    record.summary,
                    record.agent_notes,
                    record.transferred_to,
                    record.duration_seconds,
                    record.call_id,
                ),
            )
            await db.commit()

    async def get_call_record(self, call_id: str) -> CallRecord | None:
        async with self._connect() as db:
            async with db.execute("SELECT * FROM call_records WHERE call_id = ?", (call_id,)) as cursor:
                row = await cursor.fetchone()
            if not row:
                return None
            return CallRecord(
                call_id=row["call_id"],
                room_name=row["room_name"],
                from_number=row["from_number"],
                to_number=row["to_number"],
                start_time=row["start_time"],
                end_time=row["end_time"],
                outcome=row["outcome"],
                summary=row["summary"],
                agent_notes=row["agent_notes"],
                transferred_to=row["transferred_to"],
                duration_seconds=row["duration_seconds"],
            )

    async def create_appointment(self, appt: Appointment) -> str:
        if not appt.id:
            appt.id = (
                f"appt_{utc_now_iso().replace(':', '').replace('-', '')[:15]}_{appt.customer_phone[-4:]}"
            )
        async with self._connect() as db:
            await db.execute(
                """
                INSERT INTO appointments (id, customer_phone, scheduled_time, purpose, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    appt.id,
                    appt.customer_phone,
                    appt.scheduled_time,
                    appt.purpose,
                    appt.notes,
                    appt.created_at,
                ),
            )
            await db.commit()
        return appt.id

    async def list_customers(self, limit: int = 50, offset: int = 0) -> dict:
        async with self._connect() as db:
            async with db.execute("SELECT COUNT(*) AS c FROM customers") as cursor:
                total = (await cursor.fetchone())["c"]
            async with db.execute(
                "SELECT * FROM customers ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ) as cursor:
                rows = await cursor.fetchall()
        items = [
            {
                "phone_number": r["phone_number"],
                "name": r["name"],
                "email": r["email"],
                "notes": r["notes"],
                "vip": bool(r["vip"]),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def list_call_records(self, limit: int = 50, offset: int = 0) -> dict:
        async with self._connect() as db:
            async with db.execute("SELECT COUNT(*) AS c FROM call_records") as cursor:
                total = (await cursor.fetchone())["c"]
            async with db.execute(
                "SELECT * FROM call_records ORDER BY start_time DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ) as cursor:
                rows = await cursor.fetchall()
        items = [
            {
                "call_id": r["call_id"],
                "room_name": r["room_name"],
                "from_number": r["from_number"],
                "to_number": r["to_number"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "outcome": r["outcome"],
                "summary": r["summary"],
                "duration_seconds": r["duration_seconds"],
                "transferred_to": r["transferred_to"],
                "agent_notes": r["agent_notes"] if "agent_notes" in r.keys() else None,
                "transcript": r["transcript"] if "transcript" in r.keys() else None,
                "recording_url": r["recording_url"] if "recording_url" in r.keys() else None,
                "agent_instance_id": r["agent_instance_id"] if "agent_instance_id" in r.keys() else None,
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def get_report_options(self) -> dict:
        async with self._connect() as db:
            async with db.execute(
                "SELECT DISTINCT COALESCE(outcome, 'unknown') AS o FROM call_records ORDER BY o"
            ) as cursor:
                outcomes = [r["o"] for r in await cursor.fetchall()]
            async with db.execute(
                "SELECT DISTINCT agent_instance_id FROM call_records WHERE agent_instance_id IS NOT NULL"
            ) as cursor:
                agent_ids = [r["agent_instance_id"] for r in await cursor.fetchall()]
            async with db.execute(
                "SELECT MIN(start_time) AS mn, MAX(start_time) AS mx FROM call_records"
            ) as cursor:
                row = await cursor.fetchone()
                date_min = row["mn"] if row else None
                date_max = row["mx"] if row else None
        from call_management.crm.reports import DIMENSIONS

        return {
            "outcomes": outcomes,
            "agent_instance_ids": agent_ids,
            "date_min": date_min,
            "date_max": date_max,
            "dimensions": [
                {"id": k, "label": v[1]} for k, v in DIMENSIONS.items()
            ],
            "metrics": [
                {"id": "count", "label": "Cantidad de llamadas"},
                {"id": "sum_duration", "label": "Duración total (s)"},
                {"id": "avg_duration", "label": "Duración promedio (s)"},
            ],
        }

    async def query_call_report(self, query) -> dict:
        from call_management.crm.reports import (
            CallReportQuery,
            DIMENSIONS,
            _label_key,
            build_where,
            metric_select,
        )

        if not isinstance(query, CallReportQuery):
            raise TypeError("query must be CallReportQuery")

        where, params = build_where(query)
        metric = metric_select(query.metric)
        group_by = query.group_by if query.group_by in DIMENSIONS else "day"
        group_expr = DIMENSIONS[group_by][0]

        async with self._connect() as db:
            async with db.execute(
                f"""
                SELECT
                    COUNT(*) AS total_calls,
                    COALESCE(CAST(AVG(duration_seconds) AS INTEGER), 0) AS avg_duration,
                    COALESCE(SUM(duration_seconds), 0) AS total_duration,
                    COUNT(DISTINCT from_number) AS unique_callers
                FROM call_records {where}
                """,
                params,
            ) as cursor:
                summary_row = await cursor.fetchone()
            summary = {
                "total_calls": summary_row["total_calls"] if summary_row else 0,
                "avg_duration_seconds": summary_row["avg_duration"] if summary_row else 0,
                "total_duration_seconds": summary_row["total_duration"] if summary_row else 0,
                "unique_callers": summary_row["unique_callers"] if summary_row else 0,
            }

            async with db.execute(
                f"""
                SELECT {group_expr} AS dim_key,
                       COUNT(*) AS cnt,
                       COALESCE(SUM(duration_seconds), 0) AS sum_dur,
                       COALESCE(CAST(AVG(duration_seconds) AS INTEGER), 0) AS avg_dur
                FROM call_records {where}
                GROUP BY dim_key ORDER BY dim_key
                """,
                params,
            ) as cursor:
                series = [
                    {
                        "key": r["dim_key"],
                        "label": _label_key(str(r["dim_key"]), group_by),
                        "count": r["cnt"],
                        "sum_duration": r["sum_dur"],
                        "avg_duration": r["avg_dur"],
                    }
                    for r in await cursor.fetchall()
                ]

            async with db.execute(
                f"""
                SELECT COALESCE(outcome, 'unknown') AS dim_key,
                       COUNT(*) AS cnt,
                       COALESCE(SUM(duration_seconds), 0) AS sum_dur,
                       COALESCE(CAST(AVG(duration_seconds) AS INTEGER), 0) AS avg_dur
                FROM call_records {where}
                GROUP BY dim_key ORDER BY cnt DESC
                """,
                params,
            ) as cursor:
                outcome_breakdown = [
                    {
                        "key": r["dim_key"],
                        "label": _label_key(str(r["dim_key"]), "outcome"),
                        "count": r["cnt"],
                        "sum_duration": r["sum_dur"],
                        "avg_duration": r["avg_dur"],
                    }
                    for r in await cursor.fetchall()
                ]

            pivot = None
            if query.pivot_row and query.pivot_col:
                row_dim = query.pivot_row if query.pivot_row in DIMENSIONS else "weekday"
                col_dim = query.pivot_col if query.pivot_col in DIMENSIONS else "outcome"
                row_expr = DIMENSIONS[row_dim][0]
                col_expr = DIMENSIONS[col_dim][0]
                async with db.execute(
                    f"""
                    SELECT {row_expr} AS row_key, {col_expr} AS col_key, {metric} AS value
                    FROM call_records {where}
                    GROUP BY row_key, col_key
                    ORDER BY row_key, col_key
                    """,
                    params,
                ) as cursor:
                    cells_raw = await cursor.fetchall()
                row_keys = sorted({str(r["row_key"]) for r in cells_raw}, key=str)
                col_keys = sorted({str(r["col_key"]) for r in cells_raw}, key=str)
                lookup = {(str(r["row_key"]), str(r["col_key"])): r["value"] for r in cells_raw}
                cells = [
                    [lookup.get((rk, ck), 0) for ck in col_keys]
                    for rk in row_keys
                ]
                pivot = {
                    "row_dimension": row_dim,
                    "col_dimension": col_dim,
                    "metric": query.metric,
                    "row_labels": [_label_key(rk, row_dim) for rk in row_keys],
                    "col_labels": [_label_key(ck, col_dim) for ck in col_keys],
                    "row_keys": row_keys,
                    "col_keys": col_keys,
                    "cells": cells,
                }

            detail_params = list(params)
            async with db.execute(
                f"""
                SELECT call_id, from_number, to_number, start_time, outcome,
                       duration_seconds, agent_instance_id
                FROM call_records {where}
                ORDER BY start_time DESC LIMIT ?
                """,
                [*detail_params, query.detail_limit],
            ) as cursor:
                detail = [dict(r) for r in await cursor.fetchall()]

        return {
            "summary": summary,
            "series": series,
            "outcome_breakdown": outcome_breakdown,
            "pivot": pivot,
            "detail": detail,
            "group_by": group_by,
            "filters_applied": {
                "date_from": query.date_from,
                "date_to": query.date_to,
                "outcomes": query.outcomes,
                "agent_instance_ids": query.agent_instance_ids,
                "from_number": query.from_number,
                "min_duration": query.min_duration,
                "max_duration": query.max_duration,
                "custom_filters": query.custom_filters,
            },
        }

    async def get_call_analytics(self, *, days: int = 14) -> dict:
        async with self._connect() as db:
            async with db.execute(
                """
                SELECT date(start_time) AS day, COUNT(*) AS c
                FROM call_records
                WHERE start_time >= datetime('now', ?)
                GROUP BY day ORDER BY day
                """,
                (f"-{days} days",),
            ) as cursor:
                by_day = [{"day": r["day"], "count": r["c"]} for r in await cursor.fetchall()]
            async with db.execute(
                """
                SELECT outcome, COUNT(*) AS c FROM call_records
                WHERE outcome IS NOT NULL GROUP BY outcome
                """
            ) as cursor:
                outcomes = {r["outcome"]: r["c"] for r in await cursor.fetchall()}
            async with db.execute(
                "SELECT AVG(duration_seconds) AS avg_dur FROM call_records WHERE duration_seconds IS NOT NULL"
            ) as cursor:
                row = await cursor.fetchone()
                avg_duration = int(row["avg_dur"] or 0) if row else 0
        return {"calls_by_day": by_day, "outcomes": outcomes, "avg_duration_seconds": avg_duration}

    async def list_appointments(self, limit: int = 50, offset: int = 0) -> dict:
        async with self._connect() as db:
            async with db.execute("SELECT COUNT(*) AS c FROM appointments") as cursor:
                total = (await cursor.fetchone())["c"]
            async with db.execute(
                "SELECT * FROM appointments ORDER BY scheduled_time DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ) as cursor:
                rows = await cursor.fetchall()
        items = [
            {
                "id": r["id"],
                "customer_phone": r["customer_phone"],
                "scheduled_time": r["scheduled_time"],
                "purpose": r["purpose"],
                "notes": r["notes"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def get_dashboard_stats(self) -> dict:
        async with self._connect() as db:
            async with db.execute("SELECT COUNT(*) AS c FROM customers") as cursor:
                customers = (await cursor.fetchone())["c"]
            async with db.execute("SELECT COUNT(*) AS c FROM call_records") as cursor:
                calls = (await cursor.fetchone())["c"]
            async with db.execute("SELECT COUNT(*) AS c FROM appointments") as cursor:
                appointments = (await cursor.fetchone())["c"]
            async with db.execute("SELECT COUNT(*) AS c FROM customers WHERE vip = 1") as cursor:
                vip_customers = (await cursor.fetchone())["c"]
            async with db.execute(
                """
                SELECT outcome, COUNT(*) AS c FROM call_records
                WHERE outcome IS NOT NULL GROUP BY outcome ORDER BY c DESC LIMIT 5
                """
            ) as cursor:
                outcomes = {row["outcome"]: row["c"] for row in await cursor.fetchall()}
        return {
            "customers": customers,
            "calls": calls,
            "appointments": appointments,
            "vip_customers": vip_customers,
            "outcomes": outcomes,
        }

    async def get_upcoming_appointments(self, phone_number: str, limit: int = 5) -> list[Appointment]:
        async with self._connect() as db:
            async with db.execute(
                """
                SELECT * FROM appointments
                WHERE customer_phone = ?
                ORDER BY scheduled_time ASC
                LIMIT ?
                """,
                (phone_number, limit),
            ) as cursor:
                rows = await cursor.fetchall()
            return [
                Appointment(
                    id=r["id"],
                    customer_phone=r["customer_phone"],
                    scheduled_time=r["scheduled_time"],
                    purpose=r["purpose"],
                    notes=r["notes"],
                    created_at=r["created_at"],
                )
                for r in rows
            ]

    async def close(self) -> None:
        pass


_db: CRMDatabase | None = None


async def get_crm(db_path: Path | str | None = None) -> CRMDatabase:
    global _db
    if db_path is not None:
        db = CRMDatabase(db_path)
        await db.initialize()
        return db
    if _db is None:
        _db = CRMDatabase()
        await _db.initialize()
    return _db


def reset_crm_singleton() -> None:
    """Reset the process-wide CRM singleton (useful in tests)."""
    global _db
    _db = None
