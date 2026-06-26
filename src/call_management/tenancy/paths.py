"""Filesystem paths for per-tenant isolated data."""

from __future__ import annotations

import os
from pathlib import Path

from call_management.admin.env_store import PROJECT_ROOT

TENANTS_ROOT = Path(os.getenv("TENANTS_DATA_ROOT", PROJECT_ROOT / "data" / "tenants"))


def tenant_dir(tenant_id: str) -> Path:
    path = TENANTS_ROOT / tenant_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def tenant_crm_path(tenant_id: str) -> Path:
    return tenant_dir(tenant_id) / "crm.db"


def platform_db_path() -> Path:
    return Path(os.getenv("PLATFORM_DB_PATH", PROJECT_ROOT / "data" / "platform.db"))