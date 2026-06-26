"""Tests for browser voice function tool execution."""

from __future__ import annotations

import pytest

from call_management.admin.voice_tool_runner import execute_voice_function


@pytest.mark.asyncio
async def test_lookup_customer():
    result = await execute_voice_function(
        function_name="lookup_customer",
        phone_number="+15559998888",
        customer_name="Test Caller",
    )
    assert "output" in result
    assert "Test Caller" in result["output"] or "Phone" in result["output"]


@pytest.mark.asyncio
async def test_handoff_returns_agent():
    result = await execute_voice_function(
        function_name="transfer_to_support",
        arguments={"reason": "billing"},
        phone_number="+15551234567",
    )
    assert result["handoff_agent"] == "support"
    assert result["event"]["type"] == "handoff"