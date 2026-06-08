"""xAI integrations for Call Management."""

from call_management.xai.mcp import (
    AGENT_MCP_PROFILES,
    RemoteMCP,
    build_remote_mcp_tools_for_agent,
    get_remote_mcp_summary,
    load_remote_mcp_config,
)
from call_management.xai.tools import (
    attach_xai_provider_tools,
    build_provider_tools_for_agent,
    get_xai_tools_config,
)

__all__ = [
    "AGENT_MCP_PROFILES",
    "RemoteMCP",
    "attach_xai_provider_tools",
    "build_provider_tools_for_agent",
    "build_remote_mcp_tools_for_agent",
    "get_remote_mcp_summary",
    "get_xai_tools_config",
    "load_remote_mcp_config",
]
