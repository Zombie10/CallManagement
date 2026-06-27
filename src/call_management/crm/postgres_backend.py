"""Postgres CRM adapter with per-tenant row isolation."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from call_management.crm.database import CRMDatabase
from call_management.utils.time import utc_now_iso

logger = logging.getLogger("call-management.crm.postgres")

_pools: dict[str, object] = {}


def _tenant_id_from_key(tenant_key: str) -> str:
    path = Path(tenant_key)
    if path.parent.name and path.parent.name != "tenants":
        return path.parent.name
    return path.stem.replace("crm", "default") or "default"


def _to_pg_sql(sql: str, *, start: int = 1) -> str:
    idx = start

    def repl(_match: re.Match) -> str:
        nonlocal idx
        out = f"${idx}"
        idx += 1
        return out

    return re.sub(r"\?", repl, sql)


class PostgresCRMDatabase(CRMDatabase):
    """Native Postgres when asyncpg is installed; otherwise SQLite fallback."""

    def __init__(self, database_url: str, *, tenant_key: str) -> None:
        self.database_url = database_url
        self.tenant_key = tenant_key
        self.tenant_id = _tenant_id_from_key(tenant_key)
        self._use_postgres = False
        try:
            import asyncpg  # noqa: F401
        except ImportError:
            super().__init__(tenant_key)
            logger.info(
                "asyncpg not installed — using SQLite at %s (pip install asyncpg for Postgres)",
                tenant_key,
            )
            return
        self.db_path = Path(tenant_key)
        self._use_postgres = True

    async def _get_pool(self):
        import asyncpg

        if self.database_url not in _pools:
            _pools[self.database_url] = await asyncpg.create_pool(self.database_url, min_size=1, max_size=5)
        return _pools[self.database_url]

    @property
    def _pg(self) -> bool:
        return self._use_postgres

    async def initialize(self) -> None:
        if not self._pg:
            return await super().initialize()

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS customers (
                    tenant_id TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    name TEXT,
                    email TEXT,
                    notes TEXT,
                    vip BOOLEAN DEFAULT FALSE,
                    created_at TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (tenant_id, phone_number)
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS call_records (
                    tenant_id TEXT NOT NULL,
                    call_id TEXT NOT NULL,
                    room_name TEXT,
                    from_number TEXT,
                    to_number TEXT,
                    start_time TEXT,
                    end_time TEXT,
                    outcome TEXT,
                    summary TEXT,
                    agent_notes TEXT,
                    transferred_to TEXT,
                    duration_seconds INTEGER,
                    transcript TEXT,
                    recording_url TEXT,
                    agent_instance_id TEXT,
                    channel TEXT DEFAULT 'sip',
                    PRIMARY KEY (tenant_id, call_id)
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS appointments (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    customer_phone TEXT,
                    scheduled_time TEXT,
                    purpose TEXT,
                    notes TEXT,
                    created_at TEXT,
                    PRIMARY KEY (tenant_id, id)
                )
                """
            )
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    tenant_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    customer_phone TEXT,
                    customer_name TEXT,
                    agent_instance_id TEXT,
                    started_at TEXT,
                    ended_at TEXT,
                    transcript TEXT,
                    message_count INTEGER DEFAULT 0,
                    PRIMARY KEY (tenant_id, session_id)
                )
                """
            )
            await conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                4,
                utc_now_iso(),
            )

    async def _connect(self):
        if not self._pg:
            async with super()._connect() as db:
                yield db
            return

        pool = await self._get_pool()

        class _PgConn:
            def __init__(self, connection, tenant_id: str) -> None:
                self._conn = connection
                self.tenant_id = tenant_id

            async def execute(self, sql: str, params=()):
                pg_sql = _to_pg_sql(sql)
                if "INSERT OR REPLACE" in pg_sql:
                    pg_sql = pg_sql.replace("INSERT OR REPLACE", "INSERT")
                if "INSERT OR IGNORE" in pg_sql:
                    pg_sql = pg_sql.replace("INSERT OR IGNORE", "INSERT")
                    pg_sql += " ON CONFLICT DO NOTHING"
                return await self._conn.execute(pg_sql, *params)

            async def commit(self) -> None:
                pass

            def execute_ctx(self, sql: str, params=()):
                return _PgCursor(self, sql, params)

        class _PgCursor:
            def __init__(self, parent: _PgConn, sql: str, params) -> None:
                self._parent = parent
                self._sql = sql
                self._params = params
                self._rows = None

            async def __aenter__(self):
                pg_sql = _to_pg_sql(self._sql)
                if " FROM customers " in pg_sql and "tenant_id" not in pg_sql:
                    pg_sql = pg_sql.replace(" FROM customers ", " FROM customers WHERE tenant_id = $1 ")
                    self._params = (self._parent.tenant_id, *self._params)
                elif " FROM call_records " in pg_sql and "tenant_id" not in pg_sql:
                    pg_sql = pg_sql.replace(" FROM call_records ", " FROM call_records WHERE tenant_id = $1 ")
                    self._params = (self._parent.tenant_id, *self._params)
                elif " FROM appointments " in pg_sql and "tenant_id" not in pg_sql:
                    pg_sql = pg_sql.replace(" FROM appointments ", " FROM appointments WHERE tenant_id = $1 ")
                    self._params = (self._parent.tenant_id, *self._params)
                elif " FROM chat_sessions " in pg_sql and "tenant_id" not in pg_sql:
                    pg_sql = pg_sql.replace(" FROM chat_sessions ", " FROM chat_sessions WHERE tenant_id = $1 ")
                    self._params = (self._parent.tenant_id, *self._params)
                elif pg_sql.strip().startswith("SELECT COUNT(*)") and "customers" in pg_sql:
                    pg_sql = pg_sql.replace("FROM customers", "FROM customers WHERE tenant_id = $1")
                    self._params = (self._parent.tenant_id, *self._params)
                elif pg_sql.strip().startswith("SELECT COUNT(*)") and "call_records" in pg_sql:
                    pg_sql = pg_sql.replace("FROM call_records", "FROM call_records WHERE tenant_id = $1")
                    self._params = (self._parent.tenant_id, *self._params)
                elif pg_sql.strip().startswith("SELECT COUNT(*)") and "appointments" in pg_sql:
                    pg_sql = pg_sql.replace("FROM appointments", "FROM appointments WHERE tenant_id = $1")
                    self._params = (self._parent.tenant_id, *self._params)
                self._rows = await self._parent._conn.fetch(pg_sql, *self._params)
                return self

            async def __aexit__(self, *args) -> None:
                return None

            async def fetchone(self):
                if not self._rows:
                    return None
                return self._rows[0]

            async def fetchall(self):
                return self._rows or []

        conn = await pool.acquire()
        try:
            yield _PgConn(conn, self.tenant_id)
        finally:
            await pool.release(conn)

    async def get_or_create_customer(self, phone_number: str):
        if not self._pg:
            return await super().get_or_create_customer(phone_number)

        from call_management.crm.database import Customer

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM customers WHERE tenant_id = $1 AND phone_number = $2",
                self.tenant_id,
                phone_number,
            )
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
            await conn.execute(
                """
                INSERT INTO customers (tenant_id, phone_number, created_at, updated_at)
                VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
                """,
                self.tenant_id,
                phone_number,
                now,
                now,
            )
            row = await conn.fetchrow(
                "SELECT * FROM customers WHERE tenant_id = $1 AND phone_number = $2",
                self.tenant_id,
                phone_number,
            )
            return Customer(
                phone_number=row["phone_number"],
                name=row["name"],
                email=row["email"],
                notes=row["notes"],
                vip=bool(row["vip"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    async def update_customer(self, customer) -> None:
        if not self._pg:
            return await super().update_customer(customer)

        customer.updated_at = utc_now_iso()
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO customers (tenant_id, phone_number, name, email, notes, vip, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (tenant_id, phone_number) DO UPDATE SET
                    name = EXCLUDED.name, email = EXCLUDED.email, notes = EXCLUDED.notes,
                    vip = EXCLUDED.vip, updated_at = EXCLUDED.updated_at
                """,
                self.tenant_id,
                customer.phone_number,
                customer.name,
                customer.email,
                customer.notes,
                customer.vip,
                customer.created_at or customer.updated_at,
                customer.updated_at,
            )

    async def create_call_record(self, record) -> None:
        if not self._pg:
            return await super().create_call_record(record)

        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO call_records
                (tenant_id, call_id, room_name, from_number, to_number, start_time, end_time,
                 outcome, summary, agent_notes, transferred_to, duration_seconds,
                 transcript, recording_url, agent_instance_id, channel)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
                ON CONFLICT (tenant_id, call_id) DO UPDATE SET
                    end_time = EXCLUDED.end_time, outcome = EXCLUDED.outcome,
                    summary = EXCLUDED.summary, agent_notes = EXCLUDED.agent_notes,
                    transferred_to = EXCLUDED.transferred_to, duration_seconds = EXCLUDED.duration_seconds,
                    transcript = EXCLUDED.transcript, recording_url = EXCLUDED.recording_url
                """,
                self.tenant_id,
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
                record.channel,
            )

    async def create_appointment(self, appt) -> str:
        if not self._pg:
            return await super().create_appointment(appt)

        if not appt.id:
            appt.id = (
                f"appt_{utc_now_iso().replace(':', '').replace('-', '')[:15]}_{appt.customer_phone[-4:]}"
            )
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO appointments
                (tenant_id, id, customer_phone, scheduled_time, purpose, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                self.tenant_id,
                appt.id,
                appt.customer_phone,
                appt.scheduled_time,
                appt.purpose,
                appt.notes,
                appt.created_at,
            )
        return appt.id