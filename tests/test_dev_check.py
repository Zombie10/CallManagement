"""Tests for LiveKit dev preflight checks."""

from __future__ import annotations

from call_management.dev_check import check_livekit_env


def test_placeholder_credentials_detected(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://your-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "AP...")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "secret")

    issues = check_livekit_env()
    assert len(issues) >= 2


def test_real_looking_credentials_pass(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://callmgmt-abc123.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "APIxxxxxxxxxxxx")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "a" * 40)

    issues = check_livekit_env()
    assert issues == []