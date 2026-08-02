"""Tests for xAI Voice Agent helpers."""

from __future__ import annotations

from call_management.config import normalize_xai_voice
from call_management.xai.voice import (
    DEFAULT_REALTIME_MODEL,
    build_voice_session_payload,
    build_voice_tools,
    language_hint_for_locale,
)
from call_management.xai.voice_catalog import BUILTIN_VOICE_IDS, VOICE_LIBRARY


def test_normalize_xai_voice_legacy():
    assert normalize_xai_voice("Grok") == "rex"
    assert normalize_xai_voice("Ara") == "ara"
    assert normalize_xai_voice("eve") == "eve"


def test_normalize_xai_voice_flagship_and_custom():
    assert normalize_xai_voice("Carina") == "carina"
    assert normalize_xai_voice("castor") == "castor"
    assert normalize_xai_voice("rigel") == "rigel"
    # Custom voice ID pass-through (xAI Custom Voices)
    assert normalize_xai_voice("nlbqfwie") == "nlbqfwie"


def test_voice_library_has_flagship_roster():
    assert len(VOICE_LIBRARY) == 26
    assert len(BUILTIN_VOICE_IDS) == 26
    ids = set(BUILTIN_VOICE_IDS)
    for expected in ("ara", "eve", "carina", "celeste", "castor", "rigel", "naksh", "lux"):
        assert expected in ids


def test_language_hint_spanish():
    assert language_hint_for_locale("es") == "es-MX"
    assert language_hint_for_locale("en") == "en"
    assert language_hint_for_locale("multi") is None
    assert language_hint_for_locale("es-ES") == "es-ES"


def test_build_voice_session_payload_think_fast_2(monkeypatch):
    monkeypatch.setenv("GROK_REALTIME_MODEL", "grok-voice-think-fast-2.0")
    monkeypatch.setenv("GROK_VOICE_IDLE_TIMEOUT_MS", "10000")
    monkeypatch.setenv("GROK_VOICE_KEYTERMS", "LiveKit,SIP,CRM")
    monkeypatch.setenv("GROK_VOICE_REPLACE", '{"API":"A P I"}')
    monkeypatch.setenv("GROK_VOICE_RESUMPTION", "true")
    monkeypatch.setenv("GROK_VOICE_RECORDING_DISCLOSURE", "This call is recorded.")
    payload = build_voice_session_payload("receptionist")
    assert payload["model"] == "grok-voice-think-fast-2.0"
    assert payload["reasoning_effort"] == "high"
    assert payload["turn_detection"]["idle_timeout_ms"] == 10000
    assert payload["keyterms"] == ["LiveKit", "SIP", "CRM"]
    assert payload["replace"] == {"API": "A P I"}
    assert payload["resumption_enabled"] is True
    assert payload["recording_disclosure"] == "This call is recorded."
    assert DEFAULT_REALTIME_MODEL == "grok-voice-think-fast-2.0"


def test_build_voice_tools_web_search(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    tools = build_voice_tools("receptionist")
    assert any(t["type"] == "web_search" for t in tools)


def test_build_voice_tools_includes_handoff_functions():
    tools = build_voice_tools("receptionist")
    fn_names = {t.get("name") for t in tools if t.get("type") == "function"}
    assert "transfer_to_support" in fn_names
    assert "transfer_to_sales" in fn_names


def test_build_voice_tools_includes_crm_functions():
    tools = build_voice_tools("escalation")
    fn_names = {t.get("name") for t in tools if t.get("type") == "function"}
    assert "lookup_customer" in fn_names
    assert "add_call_note" in fn_names


def test_build_voice_tools_code_interpreter(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_CODE_INTERPRETER", "true")
    tools = build_voice_tools("technical")
    assert any(t.get("type") == "code_interpreter" for t in tools)