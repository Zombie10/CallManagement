"""CRM backend selection — SQLite default, Postgres when configured."""

from __future__ import annotations

import os

from call_management.crm.database import CRMDatabase, get_crm as _get_sqlite_crm

_crm_cache: dict[str, CRMDatabase] = {}


async def get_crm_backend(db_path: str) -> CRMDatabase:
    url = os.getenv("CRM_DATABASE_URL", "").strip()
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        from call_management.crm.postgres_backend import PostgresCRMDatabase

        if db_path not in _crm_cache:
            _crm_cache[db_path] = PostgresCRMDatabase(url, tenant_key=db_path)
            await _crm_cache[db_path].initialize()
        return _crm_cache[db_path]

    return await _get_sqlite_crm(db_path)