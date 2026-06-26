"""Tests for xAI Voice Agent helpers."""

from __future__ import annotations

from call_management.config import normalize_xai_voice
from call_management.xai.voice import build_voice_tools, language_hint_for_locale


def test_normalize_xai_voice_legacy():
    assert normalize_xai_voice("Grok") == "rex"
    assert normalize_xai_voice("Ara") == "ara"
    assert normalize_xai_voice("eve") == "eve"


def test_language_hint_spanish():
    assert language_hint_for_locale("es") == "es-MX"
    assert language_hint_for_locale("en") == "en"
    assert language_hint_for_locale("multi") is None


def test_build_voice_tools_web_search(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    tools = build_voice_tools("receptionist")
    assert any(t["type"] == "web_search" for t in tools)


def test_build_voice_tools_includes_handoff_functions():
    tools = build_voice_tools("receptionist")
    fn_names = {t.get("name") for t in tools if t.get("type") == "function"}
    assert "transfer_to_support" in fn_names
    assert "transfer_to_sales" in fn_names