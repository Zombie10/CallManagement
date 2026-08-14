"""Tenant public API key persistence (separate from tenants/agents)."""

from __future__ import annotations

import json
from typing import Any

from call_management.tenancy.platform_store import _new_id, _utc_iso, get_platform_store


def create_api_key(
    tenant_id: str,
    *,
    name: str,
    scopes: list[str],
    raw_key: str,
    key_hash: str,
) -> dict[str, Any]:
    store = get_platform_store()
    kid = _new_id("key")
    prefix = raw_key[:12]
    now = _utc_iso()
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO tenant_api_keys
            (id, tenant_id, name, key_hash, key_prefix, scopes_json, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (kid, tenant_id, name.strip(), key_hash, prefix, json.dumps(scopes), now),
        )
        conn.commit()
    return {
        "id": kid,
        "tenant_id": tenant_id,
        "name": name.strip(),
        "key_prefix": prefix,
        "scopes": scopes,
        "enabled": True,
        "created_at": now,
        "api_key": raw_key,
    }


def list_api_keys(tenant_id: str) -> list[dict[str, Any]]:
    store = get_platform_store()
    with store._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM tenant_api_keys WHERE tenant_id = ? ORDER BY created_at DESC",
            (tenant_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "tenant_id": r["tenant_id"],
            "name": r["name"],
            "key_prefix": r["key_prefix"],
            "scopes": json.loads(r["scopes_json"] or "[]"),
            "enabled": bool(r["enabled"]),
            "created_at": r["created_at"],
            "last_used_at": r["last_used_at"],
        }
        for r in rows
    ]


def get_api_key_by_hash(key_hash: str) -> dict[str, Any] | None:
    store = get_platform_store()
    with store._connect() as conn:
        row = conn.execute(
            "SELECT * FROM tenant_api_keys WHERE key_hash = ? AND enabled = 1",
            (key_hash,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"],
        "tenant_id": row["tenant_id"],
        "name": row["name"],
        "key_prefix": row["key_prefix"],
        "scopes": json.loads(row["scopes_json"] or "[]"),
        "enabled": bool(row["enabled"]),
        "key_hash": row["key_hash"],
    }


def touch_api_key(key_id: str) -> None:
    store = get_platform_store()
    now = _utc_iso()
    with store._connect() as conn:
        conn.execute(
            "UPDATE tenant_api_keys SET last_used_at = ? WHERE id = ?",
            (now, key_id),
        )
        conn.commit()


def revoke_api_key(key_id: str, tenant_id: str) -> bool:
    store = get_platform_store()
    with store._connect() as conn:
        cur = conn.execute(
            "UPDATE tenant_api_keys SET enabled = 0 WHERE id = ? AND tenant_id = ?",
            (key_id, tenant_id),
        )
        conn.commit()
        return cur.rowcount > 0
