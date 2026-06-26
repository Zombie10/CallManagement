"""Persistent per-agent profiles (tools, MCP, voice, locale, provider)."""

from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from call_management.config import LANGUAGE_INSTRUCTIONS, VOICE_PRESETS, XAI_VOICES
from call_management.xai.mcp import AGENT_MCP_PROFILES
from call_management.xai.tools import AGENT_TOOL_PROFILES, ToolName

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROFILES_PATH = Path(os.getenv("AGENT_PROFILES_PATH", PROJECT_ROOT / "data" / "agent_profiles.json"))

AVAILABLE_TOOLS: list[str] = ["web_search", "x_search", "file_search", "code_interpreter"]
AVAILABLE_LOCALES: list[str] = list(LANGUAGE_INSTRUCTIONS.keys())
AVAILABLE_PROVIDERS: list[str] = ["xai", "inference", "direct"]
AVAILABLE_XAI_VOICES: list[str] = ["Ara", "Grok", "Rex", "Sal", "Eve", "Leo"]
PROTECTED_AGENTS: frozenset[str] = frozenset({"receptionist"})
AGENT_NAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


@dataclass
class AgentProfile:
    name: str
    display_name: str = ""
    provider: str = "xai"
    voice: str = "Ara"
    locale: str = "en"
    tools: list[str] = field(default_factory=list)
    mcp_servers: list[str] = field(default_factory=list)
    enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _default_profiles() -> dict[str, AgentProfile]:
    profiles: dict[str, AgentProfile] = {}
    for name in AGENT_TOOL_PROFILES:
        profiles[name] = AgentProfile(
            name=name,
            display_name=name.replace("_", " ").title(),
            provider="xai",
            voice=XAI_VOICES.get(name, "Ara"),
            locale="en",
            tools=list(AGENT_TOOL_PROFILES.get(name, [])),
            mcp_servers=list(AGENT_MCP_PROFILES.get(name, [])),
            enabled=True,
        )
    return profiles


def _validate_tools(tools: list[str]) -> list[str]:
    invalid = [t for t in tools if t not in AVAILABLE_TOOLS]
    if invalid:
        raise ValueError(f"Invalid tools: {', '.join(invalid)}")
    return list(dict.fromkeys(tools))


def _validate_profile(profile: AgentProfile) -> AgentProfile:
    if not AGENT_NAME_RE.match(profile.name):
        raise ValueError(
            "Agent name must be lowercase alphanumeric (a-z, 0-9, _, -), start with a letter"
        )
    if profile.provider not in AVAILABLE_PROVIDERS:
        raise ValueError(f"Invalid provider '{profile.provider}'")
    if profile.locale not in AVAILABLE_LOCALES:
        raise ValueError(f"Invalid locale '{profile.locale}'")
    profile.tools = _validate_tools(profile.tools)
    profile.mcp_servers = list(dict.fromkeys(profile.mcp_servers))
    if profile.provider == "xai" and profile.voice not in AVAILABLE_XAI_VOICES:
        # Allow custom voice strings for forward compatibility
        profile.voice = profile.voice.strip() or "Ara"
    return profile


def _load_raw() -> dict[str, dict[str, Any]]:
    if not PROFILES_PATH.exists():
        return {}
    try:
        data = json.loads(PROFILES_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {PROFILES_PATH}") from exc
    if not isinstance(data, dict):
        raise ValueError("Agent profiles file must be a JSON object")
    return data


def _save_raw(profiles: dict[str, AgentProfile]) -> None:
    PROFILES_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {name: profile.to_dict() for name, profile in sorted(profiles.items())}
    PROFILES_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_profiles(*, force_defaults: bool = False) -> dict[str, AgentProfile]:
    defaults = _default_profiles()
    if force_defaults:
        return defaults

    raw = _load_raw()
    if not raw:
        return defaults

    merged = dict(defaults)
    for name, entry in raw.items():
        if not isinstance(entry, dict):
            continue
        base = merged.get(name, AgentProfile(name=name))
        merged[name] = AgentProfile(
            name=name,
            display_name=str(entry.get("display_name") or base.display_name),
            provider=str(entry.get("provider") or base.provider),
            voice=str(entry.get("voice") or base.voice),
            locale=str(entry.get("locale") or base.locale),
            tools=list(entry.get("tools") or base.tools),
            mcp_servers=list(entry.get("mcp_servers") or base.mcp_servers),
            enabled=bool(entry.get("enabled", base.enabled)),
        )
    return merged


def get_profile(agent_name: str) -> AgentProfile | None:
    return load_profiles().get(agent_name)


def get_tool_profile(agent_name: str) -> list[ToolName]:
    profile = get_profile(agent_name)
    if not profile or not profile.enabled:
        return []
    return [t for t in profile.tools if t in AVAILABLE_TOOLS]  # type: ignore[misc]


def get_mcp_profile(agent_name: str) -> list[str]:
    profile = get_profile(agent_name)
    if not profile or not profile.enabled:
        return []
    return profile.mcp_servers


def get_voice_for_profile(agent_name: str, global_provider: str) -> str:
    if global_provider != "xai":
        return VOICE_PRESETS.get(agent_name, VOICE_PRESETS["receptionist"])

    profile = get_profile(agent_name)
    if not profile:
        return XAI_VOICES.get(agent_name, XAI_VOICES["receptionist"])

    if profile.provider == "xai":
        return profile.voice or XAI_VOICES.get(agent_name, "Ara")
    return VOICE_PRESETS.get(agent_name, VOICE_PRESETS["receptionist"])


def get_locale_for_agent(agent_name: str, fallback: str = "en") -> str:
    profile = get_profile(agent_name)
    if profile and profile.locale:
        return profile.locale
    return fallback


def list_agent_names() -> list[str]:
    return sorted(load_profiles().keys())


def get_catalog() -> dict[str, Any]:
    return {
        "available_tools": AVAILABLE_TOOLS,
        "available_locales": AVAILABLE_LOCALES,
        "available_providers": AVAILABLE_PROVIDERS,
        "available_xai_voices": AVAILABLE_XAI_VOICES,
        "protected_agents": sorted(PROTECTED_AGENTS),
    }


def upsert_profile(data: dict[str, Any]) -> AgentProfile:
    name = str(data.get("name", "")).strip().lower()
    if not name:
        raise ValueError("Agent name is required")

    existing = load_profiles().get(name)
    profile = AgentProfile(
        name=name,
        display_name=str(data.get("display_name") or (existing.display_name if existing else name.title())),
        provider=str(data.get("provider") or (existing.provider if existing else "xai")),
        voice=str(data.get("voice") or (existing.voice if existing else "Ara")),
        locale=str(data.get("locale") or (existing.locale if existing else "en")),
        tools=list(data.get("tools") if data.get("tools") is not None else (existing.tools if existing else [])),
        mcp_servers=list(
            data.get("mcp_servers")
            if data.get("mcp_servers") is not None
            else (existing.mcp_servers if existing else [])
        ),
        enabled=bool(data.get("enabled", existing.enabled if existing else True)),
    )
    profile = _validate_profile(profile)

    profiles = load_profiles()
    profiles[name] = profile
    _save_raw(profiles)
    return profile


def delete_profile(agent_name: str) -> None:
    if agent_name in PROTECTED_AGENTS:
        raise ValueError(f"Cannot delete protected agent '{agent_name}'")

    profiles = load_profiles()
    if agent_name not in profiles:
        raise ValueError(f"Agent '{agent_name}' not found")

    del profiles[agent_name]
    _save_raw(profiles)