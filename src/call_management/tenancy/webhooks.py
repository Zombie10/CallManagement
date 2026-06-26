"""Outbound webhooks on platform events."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from call_management.tenancy.platform_store import get_platform_store

logger = logging.getLogger("call-management.webhooks")


async def emit_event(tenant_id: str, event: str, payload: dict[str, Any]) -> None:
    store = get_platform_store()
    hooks = store.list_webhooks(tenant_id, event=event)
    if not hooks:
        return

    body = json.dumps({"event": event, "tenant_id": tenant_id, "data": payload})
    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = []
        for hook in hooks:
            if not hook.get("enabled", True):
                continue
            tasks.append(_post(client, hook["url"], body, hook.get("secret")))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


async def _post(client: httpx.AsyncClient, url: str, body: str, secret: str | None) -> None:
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-CallMgmt-Secret"] = secret
    try:
        resp = await client.post(url, content=body, headers=headers)
        if resp.status_code >= 400:
            logger.warning("Webhook %s returned %s", url, resp.status_code)
    except Exception as exc:
        logger.warning("Webhook %s failed: %s", url, exc)