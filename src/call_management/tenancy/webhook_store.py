"""Tenant webhook persistence (separate from tenants/agents)."""

from __future__ import annotations

import json
from typing import Any

from call_management.tenancy.platform_store import _new_id, _utc_iso, get_platform_store


def list_webhooks(tenant_id: str, *, event: str | None = None) -> list[dict[str, Any]]:
    store = get_platform_store()
    with store._connect() as conn:
        rows = conn.execute(
            "SELECT * FROM tenant_webhooks WHERE tenant_id = ? ORDER BY created_at DESC",
            (tenant_id,),
        ).fetchall()
    out = []
    for r in rows:
        events = json.loads(r["events_json"] or "[]")
        if event and event not in events:
            continue
        out.append(
            {
                "id": r["id"],
                "tenant_id": r["tenant_id"],
                "url": r["url"],
                "events": events,
                "secret": r["secret"],
                "enabled": bool(r["enabled"]),
                "created_at": r["created_at"],
            }
        )
    return out


def create_webhook(
    tenant_id: str, *, url: str, events: list[str], secret: str | None = None
) -> dict[str, Any]:
    store = get_platform_store()
    wid = _new_id("whk")
    now = _utc_iso()
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO tenant_webhooks (id, tenant_id, url, events_json, secret, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (wid, tenant_id, url.strip(), json.dumps(events or ["call.ended"]), secret, now),
        )
        conn.commit()
    for hook in list_webhooks(tenant_id):
        if hook["id"] == wid:
            return hook
    return {
        "id": wid,
        "tenant_id": tenant_id,
        "url": url.strip(),
        "events": events or ["call.ended"],
        "secret": secret,
        "enabled": True,
        "created_at": now,
    }


def delete_webhook(webhook_id: str) -> None:
    store = get_platform_store()
    with store._connect() as conn:
        conn.execute("DELETE FROM tenant_webhooks WHERE id = ?", (webhook_id,))
        conn.commit()


def log_webhook_delivery(
    *,
    tenant_id: str,
    webhook_id: str | None,
    event: str,
    url: str,
    status_code: int | None,
    success: bool,
    attempts: int,
    error: str | None,
) -> dict[str, Any]:
    store = get_platform_store()
    did = _new_id("whd")
    now = _utc_iso()
    with store._connect() as conn:
        conn.execute(
            """
            INSERT INTO webhook_deliveries
            (id, tenant_id, webhook_id, event, url, status_code, success, attempts, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                did,
                tenant_id,
                webhook_id,
                event,
                url,
                status_code,
                int(success),
                attempts,
                error,
                now,
            ),
        )
        conn.commit()
    return {
        "id": did,
        "tenant_id": tenant_id,
        "webhook_id": webhook_id,
        "event": event,
        "url": url,
        "status_code": status_code,
        "success": success,
        "attempts": attempts,
        "error": error,
        "created_at": now,
    }


def list_webhook_deliveries(tenant_id: str, *, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    store = get_platform_store()
    with store._connect() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS c FROM webhook_deliveries WHERE tenant_id = ?",
            (tenant_id,),
        ).fetchone()["c"]
        rows = conn.execute(
            """
            SELECT * FROM webhook_deliveries WHERE tenant_id = ?
            ORDER BY created_at DESC LIMIT ? OFFSET ?
            """,
            (tenant_id, limit, offset),
        ).fetchall()
    items = [
        {
            "id": r["id"],
            "webhook_id": r["webhook_id"],
            "event": r["event"],
            "url": r["url"],
            "status_code": r["status_code"],
            "success": bool(r["success"]),
            "attempts": r["attempts"],
            "error": r["error"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}
