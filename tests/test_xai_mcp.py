"""Tests for xAI Remote MCP integration."""

from __future__ import annotations

import json

from call_management.agents import SupportAgent, TechnicalAgent
from call_management.xai.mcp import (
    ClassicRemoteMCP,
    RemoteMCP,
    build_remote_mcp_tools_for_agent,
    get_remote_mcp_summary,
    load_remote_mcp_config,
)
from call_management.xai.tools import attach_xai_provider_tools, build_provider_tools_for_agent

SAMPLE_SERVERS = [
    {
        "id": "deepwiki",
        "server_url": "https://mcp.deepwiki.com/mcp",
        "server_label": "deepwiki",
        "server_description": "Public documentation lookup",
        "agents": ["technical"],
    },
    {
        "id": "knowledge",
        "server_url": "https://kb.example.com/mcp",
        "server_label": "knowledge",
        "allowed_tools": ["search_articles"],
        "authorization_env": "KB_MCP_TOKEN",
    },
    {
        "id": "tickets",
        "server_url": "https://zendesk.example.com/mcp",
        "server_label": "zendesk",
        "agents": ["escalation", "support"],
    },
]


def _configure_mcp(monkeypatch):
    monkeypatch.setenv("XAI_ENABLE_REMOTE_MCP", "true")
    monkeypatch.setenv("XAI_MCP_SERVERS", json.dumps(SAMPLE_SERVERS))
    monkeypatch.setenv("KB_MCP_TOKEN", "secret-token")


def test_remote_mcp_disabled_by_default(monkeypatch):
    monkeypatch.delenv("XAI_ENABLE_REMOTE_MCP", raising=False)
    monkeypatch.delenv("XAI_MCP_SERVERS", raising=False)
    cfg = load_remote_mcp_config()
    assert cfg.enabled is False
    assert build_remote_mcp_tools_for_agent("technical", realtime=True) == []


def test_load_remote_mcp_config(monkeypatch):
    _configure_mcp(monkeypatch)
    cfg = load_remote_mcp_config()
    assert cfg.enabled is True
    assert len(cfg.servers) == 3
    knowledge = next(server for server in cfg.servers if server.id == "knowledge")
    assert knowledge.authorization == "secret-token"
    assert knowledge.allowed_tools == ["search_articles"]


def test_agent_profiles_and_explicit_agents(monkeypatch):
    _configure_mcp(monkeypatch)

    technical_tools = build_remote_mcp_tools_for_agent("technical", realtime=True)
    assert len(technical_tools) == 2
    labels = {tool.server_label for tool in technical_tools if isinstance(tool, RemoteMCP)}
    assert labels == {"deepwiki", "knowledge"}

    escalation_tools = build_remote_mcp_tools_for_agent("escalation", realtime=True)
    assert len(escalation_tools) == 1
    assert escalation_tools[0].server_label == "zendesk"


def test_remote_mcp_to_dict_realtime():
    tool = RemoteMCP(
        server_url="https://mcp.example.com/mcp",
        server_label="example",
        server_description="Example MCP",
        allowed_tools=["lookup_order"],
        authorization="Bearer test",
        headers={"X-Tenant": "acme"},
    )
    payload = tool.to_dict()
    assert payload == {
        "type": "mcp",
        "server_url": "https://mcp.example.com/mcp",
        "server_label": "example",
        "server_description": "Example MCP",
        "allowed_tools": ["lookup_order"],
        "authorization": "Bearer test",
        "headers": {"X-Tenant": "acme"},
    }


def test_remote_mcp_classic_pipeline():
    tool = ClassicRemoteMCP(
        server_url="https://mcp.example.com/mcp",
        server_label="example",
    )
    assert tool.to_dict()["type"] == "mcp"


def test_build_provider_tools_includes_remote_mcp(monkeypatch):
    _configure_mcp(monkeypatch)
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "false")

    tools = build_provider_tools_for_agent("support", realtime=True)
    mcp_ids = [tool.id for tool in tools if tool.id.startswith("xai_remote_mcp_")]
    assert "xai_remote_mcp_knowledge" in mcp_ids
    assert "xai_remote_mcp_zendesk" in mcp_ids


def test_attach_remote_mcp_to_agents(monkeypatch):
    _configure_mcp(monkeypatch)
    monkeypatch.setenv("XAI_ENABLE_WEB_SEARCH", "false")

    agents = {
        "support": SupportAgent(),
        "technical": TechnicalAgent(),
    }
    attached = attach_xai_provider_tools(agents, realtime=True)
    assert "xai_remote_mcp_knowledge" in attached["support"]
    assert "xai_remote_mcp_deepwiki" in attached["technical"]

    summary = get_remote_mcp_summary()
    assert "knowledge" in summary["support"]
    assert "deepwiki" in summary["technical"]
