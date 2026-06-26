"""One-time migration of legacy single-tenant data."""

from __future__ import annotations

import shutil
from pathlib import Path

from call_management.admin.env_store import PROJECT_ROOT
from call_management.tenancy.paths import tenant_crm_path
from call_management.tenancy.platform_store import get_platform_store


def migrate_legacy_crm_if_needed() -> None:
    legacy = Path(PROJECT_ROOT / "data" / "crm.db")
    if not legacy.exists():
        return
    store = get_platform_store()
    tenant = store.ensure_default_tenant()
    target = tenant_crm_path(tenant.id)
    if target.exists():
        return
    shutil.copy2(legacy, target)