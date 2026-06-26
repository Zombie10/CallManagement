"""xAI built-in provider tools + per-agent tool profiles."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Literal

from livekit.agents import Agent, ProviderTool
from livekit.plugins.openai import tools as openai_provider_tools
from livekit.plugins.xai.tools import FileSearch, WebSearch, XAITool, XSearch

from call_management.xai.mcp import build_remote_mcp_tools_for_agent, load_remote_mcp_config

logger = logging.getLogger("call-management.xai.tools")

ToolName = Literal["web_search", "x_search", "file_search", "code_interpreter"]

AGENT_TOOL_PROFILES: dict[str, list[ToolName]] = {
    "receptionist": ["web_search"],
    "support": ["web_search", "file_search"],
    "sales": ["web_search", "x_search"],
    "technical": ["web_search", "code_interpreter", "file_search"],
    "escalation": ["web_search"],
}


@dataclass
class CodeInterpreter(XAITool):
    """xAI code interpreter / code execution (server-side sandbox)."""

    def __post_init__(self) -> None:
        super().__init__(id="xai_code_interpreter")

    def to_dict(self) -> dict[str, Any]:
        return {"type": "code_interpreter"}


@dataclass
class ClassicXSearch(openai_provider_tools.OpenAITool):
    """x_search for the classic xAI Responses pipeline."""

    allowed_x_handles: list[str] | None = None

    def __post_init__(self) -> None:
        super().__init__(id="xai_x_search_classic")

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"type": "x_search"}
        if self.allowed_x_handles:
            result["allowed_x_handles"] = self.allowed_x_handles
        return result


@dataclass
class XAIToolsConfig:
    enable_web_search: bool = True
    enable_x_search: bool = False
    enable_file_search: bool = False
    enable_code_interpreter: bool = False
    vector_store_ids: list[str] = field(default_factory=list)
    allowed_x_handles: list[str] = field(default_factory=list)
    max_file_search_results: int | None = None


def _parse_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "")
    if not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def get_xai_tools_config() -> XAIToolsConfig:
    return XAIToolsConfig(
        enable_web_search=os.getenv("XAI_ENABLE_WEB_SEARCH", "true").lower() == "true",
        enable_x_search=os.getenv("XAI_ENABLE_X_SEARCH", "false").lower() == "true",
        enable_file_search=os.getenv("XAI_ENABLE_FILE_SEARCH", "false").lower() == "true",
        enable_code_interpreter=os.getenv("XAI_ENABLE_CODE_INTERPRETER", "false").lower() == "true",
        vector_store_ids=_parse_csv_env("XAI_VECTOR_STORE_IDS"),
        allowed_x_handles=_parse_csv_env("XAI_ALLOWED_X_HANDLES"),
        max_file_search_results=int(os.getenv("XAI_MAX_FILE_SEARCH_RESULTS", "0")) or None,
    )


def _is_enabled(tool_name: ToolName, cfg: XAIToolsConfig) -> bool:
    return {
        "web_search": cfg.enable_web_search,
        "x_search": cfg.enable_x_search,
        "file_search": cfg.enable_file_search and bool(cfg.vector_store_ids),
        "code_interpreter": cfg.enable_code_interpreter,
    }[tool_name]


def _build_realtime_tool(tool_name: ToolName, cfg: XAIToolsConfig) -> ProviderTool | None:
    if tool_name == "web_search":
        return WebSearch()
    if tool_name == "x_search":
        return XSearch(allowed_x_handles=cfg.allowed_x_handles or None)
    if tool_name == "file_search":
        return FileSearch(
            vector_store_ids=cfg.vector_store_ids,
            max_num_results=cfg.max_file_search_results,
        )
    if tool_name == "code_interpreter":
        return CodeInterpreter()
    return None


def _build_classic_tool(tool_name: ToolName, cfg: XAIToolsConfig) -> ProviderTool | None:
    if tool_name == "web_search":
        return openai_provider_tools.WebSearch()
    if tool_name == "x_search":
        return ClassicXSearch(allowed_x_handles=cfg.allowed_x_handles or None)
    if tool_name == "file_search":
        return openai_provider_tools.FileSearch(
            vector_store_ids=cfg.vector_store_ids,
            max_num_results=cfg.max_file_search_results,
        )
    if tool_name == "code_interpreter":
        return openai_provider_tools.CodeInterpreter()
    return None


def build_provider_tools_for_agent(
    agent_name: str,
    *,
    realtime: bool,
    cfg: XAIToolsConfig | None = None,
) -> list[ProviderTool]:
    from call_management.agent_store import get_tool_profile

    cfg = cfg or get_xai_tools_config()
    profile = get_tool_profile(agent_name) or AGENT_TOOL_PROFILES.get(agent_name, [])
    tools: list[ProviderTool] = []

    for tool_name in profile:
        if not _is_enabled(tool_name, cfg):
            continue
        tool = _build_realtime_tool(tool_name, cfg) if realtime else _build_classic_tool(tool_name, cfg)
        if tool is not None:
            tools.append(tool)

    tools.extend(build_remote_mcp_tools_for_agent(agent_name, realtime=realtime))
    return tools


def attach_xai_provider_tools(
    agents_registry: dict[str, Agent],
    *,
    realtime: bool,
    cfg: XAIToolsConfig | None = None,
) -> dict[str, list[str]]:
    """Attach enabled xAI provider tools to each agent. Returns enabled tool ids per agent."""
    cfg = cfg or get_xai_tools_config()
    mcp_cfg = load_remote_mcp_config()
    attached: dict[str, list[str]] = {}

    for agent_name, agent in agents_registry.items():
        provider_tools = build_provider_tools_for_agent(agent_name, realtime=realtime, cfg=cfg)
        if provider_tools:
            agent.tools.extend(provider_tools)
            attached[agent_name] = [tool.id for tool in provider_tools]

    if attached:
        logger.info(
            "Attached xAI provider tools (realtime=%s, remote_mcp=%s): %s",
            realtime,
            mcp_cfg.enabled,
            attached,
        )
    else:
        logger.info("No xAI provider tools enabled")

    return attached
