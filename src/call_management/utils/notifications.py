"""Outbound notifications for escalations and supervisor alerts."""

from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger("call-management.notifications")


async def send_webhook(
    payload: dict[str, Any],
    *,
    url: str | None = None,
) -> bool:
    """POST a JSON payload to the configured escalation webhook."""
    webhook_url = url or os.getenv("ESCALATION_WEBHOOK_URL") or os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        logger.debug("No escalation webhook configured; skipping notification")
        return False

    try:
        async with (
            aiohttp.ClientSession() as session,
            session.post(webhook_url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp,
        ):
            if resp.status >= 400:
                body = await resp.text()
                logger.warning("Escalation webhook failed (%s): %s", resp.status, body[:300])
                return False
        logger.info("Escalation notification sent")
        return True
    except Exception:
        logger.exception("Failed to send escalation webhook")
        return False


async def notify_escalation(
    *,
    call_id: str,
    from_number: str,
    customer_name: str | None,
    priority: str,
    details: str,
    immediate: bool = False,
) -> bool:
    """Send a structured escalation alert to Slack or a generic webhook."""
    payload = {
        "text": (
            f"{'🚨 IMMEDIATE' if immediate else '⚠️ Escalation'} callback requested\n"
            f"Call: {call_id}\n"
            f"Caller: {customer_name or 'unknown'} ({from_number})\n"
            f"Priority: {priority}\n"
            f"Details: {details}"
        ),
        "call_id": call_id,
        "from_number": from_number,
        "customer_name": customer_name,
        "priority": priority,
        "details": details,
        "immediate": immediate,
    }
    return await send_webhook(payload)
