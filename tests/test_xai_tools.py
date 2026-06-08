"""Tests for xAI provider tool integration."""

from __future__ import annotations

from call_management.agents import ReceptionistAgent, SalesAgent, TechnicalAgent
from call_management.xai.tools import (
    attach_xai_provider_tools,
    build_provider_tools_for_agent,
    get_xai_tools_config,
)


def test_default_web_search_enabled_for_receptionist(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    monkeypatch.setenv("XAI_ENABLE_X_SEARCH", "false")
    monkeypatch.setenv("XAI_ENABLE_FILE_SEARCH", "false")
    monkeypatch.setenv("XAI_ENABLE_CODE_INTERPRETER", "false")

    tools = build_provider_tools_for_agent("receptionist", realtime=True)
    assert len(tools) == 1
    assert tools[0].id == "xai_web_search"


def test_sales_gets_x_search_when_enabled(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    monkeypatch.setenv("XAI_ENABLE_X_SEARCH", "true")

    tools = build_provider_tools_for_agent("sales", realtime=True)
    tool_ids = {tool.id for tool in tools}
    assert "xai_web_search" in tool_ids
    assert "xai_x_search" in tool_ids


def test_file_search_requires_vector_store_ids(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_FILE_SEARCH", "true")
    monkeypatch.delenv("XAI_VECTOR_STORE_IDS", raising=False)

    tools = build_provider_tools_for_agent("support", realtime=True)
    assert all(tool.id != "xai_file_search" for tool in tools)

    monkeypatch.setenv("XAI_VECTOR_STORE_IDS", "vs_123,vs_456")
    tools = build_provider_tools_for_agent("support", realtime=True)
    tool_ids = {tool.id for tool in tools}
    assert "xai_file_search" in tool_ids


def test_technical_code_interpreter_realtime(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    monkeypatch.setenv("XAI_ENABLE_CODE_INTERPRETER", "true")

    tools = build_provider_tools_for_agent("technical", realtime=True)
    tool_ids = {tool.id for tool in tools}
    assert "xai_code_interpreter" in tool_ids


def test_attach_xai_provider_tools_to_agents(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "true")
    agents = {
        "receptionist": ReceptionistAgent(),
        "sales": SalesAgent(),
        "technical": TechnicalAgent(),
    }
    attached = attach_xai_provider_tools(agents, realtime=True)
    assert "receptionist" in attached
    assert "xai_web_search" in attached["receptionist"]


def test_get_xai_tools_config_parses_csv(monkeypatch):
    monkeypatch.setenv("XAI_VECTOR_STORE_IDS", "vs_a, vs_b")
    monkeypatch.setenv("XAI_ALLOWED_X_HANDLES", "@acme,@support")
    cfg = get_xai_tools_config()
    assert cfg.vector_store_ids == ["vs_a", "vs_b"]
    assert cfg.allowed_x_handles == ["@acme", "@support"]
