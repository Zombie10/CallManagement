"""Tests for persistent agent profiles."""

from __future__ import annotations

from call_management.agent_store import (
    delete_profile,
    get_catalog,
    get_effective_instructions,
    get_function_tool_profile,
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
    assert profiles["support"].voice == "eve"
    assert get_tool_profile("support") == ["web_search", "file_search"]
    assert get_locale_for_agent("support") == "es"
    assert get_voice_for_profile("support", "xai") == "eve"


def test_delete_custom_agent():
    upsert_profile({"name": "custom", "tools": []})
    delete_profile("custom")
    assert "custom" not in load_profiles()


def test_catalog_includes_voice_library_and_function_tools():
    catalog = get_catalog()
    assert "voice_library" in catalog
    assert len(catalog["voice_library"]) >= 5
    assert "function_tool_catalog" in catalog
    assert any(t["id"] == "to_support" for t in catalog["function_tool_catalog"])


def test_effective_instructions_include_routing_hint():
    upsert_profile({"name": "receptionist", "function_tools": ["to_support", "to_sales"]})
    text = get_effective_instructions("receptionist")
    assert "transfer function tool" in text.lower()
    assert "to_support" in text


def test_function_tools_persist():
    upsert_profile({"name": "sales", "function_tools": ["to_support", "lookup_customer"]})
    assert get_function_tool_profile("sales") == ["to_support", "lookup_customer"]