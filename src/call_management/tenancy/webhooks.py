"""Outbound webhooks on platform events with retries and delivery audit."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from call_management.tenancy.platform_store import get_platform_store

logger = logging.getLogger("call-management.webhooks")

WEBHOOK_EVENTS = frozenset(
    {
        "call.started",
        "call.ended",
        "appointment.created",
        "appointment.updated",
        "appointment.deleted",
        "agent.handoff",
    }
)

MAX_RETRIES = 3
RETRY_DELAYS = (1.0, 3.0, 8.0)


async def emit_event(tenant_id: str, event: str, payload: dict[str, Any]) -> None:
    if event not in WEBHOOK_EVENTS:
        logger.warning("Unknown webhook event: %s", event)
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
            tasks.append(_deliver_with_retries(client, tenant_id, hook, event, body))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


async def _deliver_with_retries(
    client: httpx.AsyncClient,
    tenant_id: str,
    hook: dict[str, Any],
    event: str,
    body: str,
) -> None:
    store = get_platform_store()
    url = hook["url"]
    secret = hook.get("secret")
    last_error: str | None = None
    status_code: int | None = None

    for attempt in range(MAX_RETRIES):
        status_code, last_error = await _post(client, url, body, secret)
        if status_code is not None and status_code < 400:
            store.log_webhook_delivery(
                tenant_id=tenant_id,
                webhook_id=hook["id"],
                event=event,
                url=url,
                status_code=status_code,
                success=True,
                attempts=attempt + 1,
                error=None,
            )
            return
        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(RETRY_DELAYS[attempt])

    store.log_webhook_delivery(
        tenant_id=tenant_id,
        webhook_id=hook["id"],
        event=event,
        url=url,
        status_code=status_code,
        success=False,
        attempts=MAX_RETRIES,
        error=last_error,
    )


async def _post(
    client: httpx.AsyncClient, url: str, body: str, secret: str | None
) -> tuple[int | None, str | None]:
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-CallMgmt-Secret"] = secret
    try:
        resp = await client.post(url, content=body, headers=headers)
        if resp.status_code >= 400:
            logger.warning("Webhook %s returned %s", url, resp.status_code)
            return resp.status_code, resp.text[:500]
        return resp.status_code, None
    except Exception as exc:
        logger.warning("Webhook %s failed: %s", url, exc)
        return None, str(exc)