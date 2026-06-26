"""xAI Remote MCP tools (server-side MCP connections managed by xAI)."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from livekit.agents import ProviderTool
from livekit.plugins.openai import tools as openai_provider_tools
from livekit.plugins.xai.tools import XAITool

logger = logging.getLogger("call-management.xai.mcp")


@dataclass
class RemoteMCPServerConfig:
    """Declarative MCP server entry loaded from environment."""

    id: str
    server_url: str
    server_label: str
    server_description: str | None = None
    allowed_tools: list[str] = field(default_factory=list)
    authorization: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
    agents: list[str] = field(default_factory=list)


@dataclass
class RemoteMCPConfig:
    enabled: bool = False
    servers: list[RemoteMCPServerConfig] = field(default_factory=list)


# Server ids referenced per agent. Override or extend via XAI_MCP_SERVERS "agents" field.
AGENT_MCP_PROFILES: dict[str, list[str]] = {
    "receptionist": [],
    "support": ["knowledge"],
    "sales": ["crm"],
    "technical": ["deepwiki", "knowledge"],
    "escalation": ["tickets"],
}


@dataclass
class RemoteMCP(XAITool):
    """Remote MCP tool for Grok Realtime / Voice Agent API."""

    server_url: str
    server_label: str
    server_description: str | None = None
    allowed_tools: list[str] | None = None
    authorization: str | None = None
    headers: dict[str, str] | None = None

    def __post_init__(self) -> None:
        super().__init__(id=f"xai_remote_mcp_{self.server_label}")

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": "mcp",
            "server_url": self.server_url,
            "server_label": self.server_label,
        }
        if self.server_description:
            payload["server_description"] = self.server_description
        if self.allowed_tools:
            payload["allowed_tools"] = self.allowed_tools
        if self.authorization:
            payload["authorization"] = self.authorization
        if self.headers:
            payload["headers"] = self.headers
        return payload


@dataclass
class ClassicRemoteMCP(openai_provider_tools.OpenAITool):
    """Remote MCP tool for the classic xAI Responses pipeline."""

    server_url: str
    server_label: str
    server_description: str | None = None
    allowed_tools: list[str] | None = None
    authorization: str | None = None
    headers: dict[str, str] | None = None

    def __post_init__(self) -> None:
        super().__init__(id=f"xai_remote_mcp_{self.server_label}")

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": "mcp",
            "server_url": self.server_url,
            "server_label": self.server_label,
        }
        if self.server_description:
            payload["server_description"] = self.server_description
        if self.allowed_tools:
            payload["allowed_tools"] = self.allowed_tools
        if self.authorization:
            payload["authorization"] = self.authorization
        if self.headers:
            payload["headers"] = self.headers
        return payload


def _resolve_authorization(raw: dict[str, Any]) -> str | None:
    if token := raw.get("authorization"):
        return str(token)
    env_name = raw.get("authorization_env")
    if env_name:
        return os.getenv(str(env_name))
    return None


def _parse_server_entry(raw: dict[str, Any]) -> RemoteMCPServerConfig | None:
    server_id = raw.get("id")
    server_url = raw.get("server_url")
    server_label = raw.get("server_label") or server_id
    if not server_id or not server_url or not server_label:
        logger.warning("Skipping invalid MCP server config (requires id, server_url, server_label): %s", raw)
        return None

    allowed_tools = raw.get("allowed_tools") or []
    agents = raw.get("agents") or []
    headers = raw.get("headers") or {}

    return RemoteMCPServerConfig(
        id=str(server_id),
        server_url=str(server_url),
        server_label=str(server_label),
        server_description=raw.get("server_description"),
        allowed_tools=[str(tool) for tool in allowed_tools],
        authorization=_resolve_authorization(raw),
        headers={str(k): str(v) for k, v in headers.items()},
        agents=[str(agent) for agent in agents],
    )


def load_remote_mcp_config() -> RemoteMCPConfig:
    enabled = os.getenv("XAI_ENABLE_REMOTE_MCP", "false").lower() == "true"
    raw_json = os.getenv("XAI_MCP_SERVERS", "").strip()
    if not enabled or not raw_json:
        return RemoteMCPConfig(enabled=enabled and bool(raw_json), servers=[])

    try:
        parsed = json.loads(raw_json)
    except json.JSONDecodeError:
        logger.exception("Invalid JSON in XAI_MCP_SERVERS")
        return RemoteMCPConfig(enabled=False, servers=[])

    if not isinstance(parsed, list):
        logger.warning("XAI_MCP_SERVERS must be a JSON array")
        return RemoteMCPConfig(enabled=False, servers=[])

    servers: list[RemoteMCPServerConfig] = []
    for entry in parsed:
        if not isinstance(entry, dict):
            continue
        server = _parse_server_entry(entry)
        if server:
            servers.append(server)

    return RemoteMCPConfig(enabled=True, servers=servers)


def _servers_for_agent(agent_name: str, cfg: RemoteMCPConfig) -> list[RemoteMCPServerConfig]:
    if not cfg.enabled or not cfg.servers:
        return []

    by_id = {server.id: server for server in cfg.servers}
    selected_ids: list[str] = []

    from call_management.agent_store import get_mcp_profile

    for server_id in get_mcp_profile(agent_name) or AGENT_MCP_PROFILES.get(agent_name, []):
        if server_id in by_id and server_id not in selected_ids:
            selected_ids.append(server_id)

    for server in cfg.servers:
        if agent_name in server.agents and server.id not in selected_ids:
            selected_ids.append(server.id)

    return [by_id[server_id] for server_id in selected_ids if server_id in by_id]


def _build_remote_mcp_tool(server: RemoteMCPServerConfig, *, realtime: bool) -> ProviderTool:
    allowed_tools = server.allowed_tools or None
    headers = server.headers or None
    common = {
        "server_url": server.server_url,
        "server_label": server.server_label,
        "server_description": server.server_description,
        "allowed_tools": allowed_tools,
        "authorization": server.authorization,
        "headers": headers,
    }
    if realtime:
        return RemoteMCP(**common)
    return ClassicRemoteMCP(**common)


def build_remote_mcp_tools_for_agent(
    agent_name: str,
    *,
    realtime: bool,
    cfg: RemoteMCPConfig | None = None,
) -> list[ProviderTool]:
    cfg = cfg or load_remote_mcp_config()
    servers = _servers_for_agent(agent_name, cfg)
    return [_build_remote_mcp_tool(server, realtime=realtime) for server in servers]


def get_remote_mcp_summary(cfg: RemoteMCPConfig | None = None) -> dict[str, list[str]]:
    """Return MCP server labels attached per agent (for logging/tests)."""
    cfg = cfg or load_remote_mcp_config()
    summary: dict[str, list[str]] = {}
    from call_management.agent_store import list_agent_names

    for agent_name in list_agent_names():
        labels = [server.server_label for server in _servers_for_agent(agent_name, cfg)]
        if labels:
            summary[agent_name] = labels
    return summary
