"""Tests for persistent agent profiles."""

from __future__ import annotations

from call_management.agent_store import (
    delete_profile,
    get_locale_for_agent,
    get_tool_profile,
    get_voice_for_profile,
    load_profiles,
    upsert_profile,
)


def test_defaults_when_no_file():
    profiles = load_profiles()
    assert "receptionist" in profiles
    assert "web_search" in profiles["sales"].tools


def test_upsert_and_reload():
    upsert_profile(
        {
            "name": "support",
            "locale": "es",
            "tools": ["web_search", "file_search"],
            "voice": "Eve",
        }
    )
    profiles = load_profiles()
    assert profiles["support"].locale == "es"
    assert profiles["support"].voice == "Eve"
    assert get_tool_profile("support") == ["web_search", "file_search"]
    assert get_locale_for_agent("support") == "es"
    assert get_voice_for_profile("support", "xai") == "Eve"


def test_delete_custom_agent():
    upsert_profile({"name": "custom", "tools": []})
    delete_profile("custom")
    assert "custom" not in load_profiles()