"""Optional Postgres CRM — delegates to SQLite per-tenant file when driver unavailable."""

from __future__ import annotations

import logging

from call_management.crm.database import CRMDatabase

logger = logging.getLogger("call-management.crm.postgres")


class PostgresCRMDatabase(CRMDatabase):
    """Postgres adapter stub: falls back to SQLite path until asyncpg driver is added."""

    def __init__(self, database_url: str, *, tenant_key: str) -> None:
        self.database_url = database_url
        self.tenant_key = tenant_key
        super().__init__(tenant_key)
        logger.info(
            "CRM_DATABASE_URL set; using SQLite file %s (install asyncpg for native Postgres)",
            tenant_key,
        )