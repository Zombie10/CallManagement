"""Tests for escalation notifications."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from call_management.utils.notifications import notify_escalation


@pytest.mark.asyncio
async def test_notify_escalation_without_webhook():
    result = await notify_escalation(
        call_id="call_1",
        from_number="+15551234567",
        customer_name="Test User",
        priority="high",
        details="Needs supervisor",
    )
    assert result is False


@pytest.mark.asyncio
async def test_send_webhook_success(monkeypatch):
    monkeypatch.setenv("ESCALATION_WEBHOOK_URL", "https://example.com/webhook")

    with patch(
        "call_management.utils.notifications.send_webhook",
        new=AsyncMock(return_value=True),
    ) as mock_send:
        result = await notify_escalation(
            call_id="call_1",
            from_number="+15551234567",
            customer_name="Test User",
            priority="immediate",
            details="Needs supervisor",
            immediate=True,
        )

    assert result is True
    mock_send.assert_awaited_once()
