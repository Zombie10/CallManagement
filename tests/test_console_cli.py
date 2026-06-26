"""Tests for console CLI overrides."""

from __future__ import annotations

import os

import pytest

from call_management.console_cli import apply_console_cli_overrides
from call_management.server import _parse_session_overrides


@pytest.fixture(autouse=True)
def _clear_console_env(monkeypatch):
    for key in (
        "CALL_INITIAL_AGENT",
        "CALL_FROM_NUMBER",
        "CALL_CUSTOMER_NAME",
        "CALL_VIP",
        "CALL_QUIET_CONSOLE",
        "LIVEKIT_LOG_LEVEL",
    ):
        monkeypatch.delenv(key, raising=False)


def test_apply_console_agent_and_quiet():
    argv = apply_console_cli_overrides(
        ["call-management", "console", "-a", "support", "-q", "--text"]
    )
    assert argv == ["call-management", "console", "--text"]
    assert os.environ["CALL_INITIAL_AGENT"] == "support"
    assert os.environ["LIVEKIT_LOG_LEVEL"] == "INFO"


def test_parse_session_overrides_metadata_and_env(monkeypatch):
    monkeypatch.setenv("CALL_INITIAL_AGENT", "sales")
    monkeypatch.setenv("CALL_FROM_NUMBER", "+15550001111")
    monkeypatch.setenv("CALL_VIP", "true")

    result = _parse_session_overrides(
        '{"department":"support","phone_number":"+15559998888","customer_name":"Ana","vip":false}'
    )
    assert result["department_hint"] == "sales"
    assert result["from_number"] == "+15550001111"
    assert result["customer_name"] == "Ana"
    assert result["vip"] is True