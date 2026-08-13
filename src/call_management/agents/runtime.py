"""Canonical runtime agent config from a tenant instance + template seed."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from call_management.agents.catalog import normalize_template
from call_management.agent_store import (
    get_effective_instructions,
    get_function_tool_profile,
    get_mcp_profile,
    get_profile,
    get_tool_profile,
)
from call_management.config import XAI_VOICES, get_model_config, normalize_xai_voice
from call_management.xai.voice import language_hint_for_locale

if TYPE_CHECKING:
    from call_management.tenancy.platform_store import AgentInstance


@dataclass
class RuntimeAgentConfig:
    template_id: str
    display_name: str
    provider: str
    voice: str
    locale: str
    voice_language: str
    instructions: str
    tools: list[str] = field(default_factory=list)
    function_tools: list[str] = field(default_factory=list)
    mcp_servers: list[str] = field(default_factory=list)
    instance_id: str | None = None
    tenant_id: str | None = None


def build_runtime_agent(
    *,
    instance: AgentInstance | None = None,
    template_id: str | None = None,
    extra_notes: str = "",
    for_voice: bool = True,
) -> RuntimeAgentConfig:
    """Compose the live agent: instance fields win; template fills the rest."""
    template = normalize_template(
        instance.template_id if instance else template_id,
    )
    profile = get_profile(template)
    cfg = get_model_config()

    display_name = (
        instance.display_name
        if instance and instance.display_name
        else (profile.display_name if profile else template.replace("_", " ").title())
    )
    provider = (
        instance.provider
        if instance and instance.provider
        else (profile.provider if profile else cfg.provider)
    )
    voice = normalize_xai_voice(
        (instance.voice if instance and instance.voice else None)
        or (profile.voice if profile else None)
        or XAI_VOICES.get(template, cfg.grok_realtime_voice)
    )
    locale = (
        instance.locale
        if instance and instance.locale
        else (profile.locale if profile and profile.locale else "es")
    )
    voice_language = (
        instance.voice_language
        if instance and instance.voice_language
        else (profile.voice_language if profile else "")
    )

    if instance and instance.tools:
        tools = list(instance.tools)
    else:
        tools = list(get_tool_profile(template))

    if instance and instance.function_tools:
        function_tools = list(instance.function_tools)
    else:
        function_tools = list(get_function_tool_profile(template))

    if instance and instance.mcp_servers:
        mcp_servers = list(instance.mcp_servers)
    else:
        mcp_servers = list(get_mcp_profile(template))

    if instance and instance.custom_instructions.strip():
        from call_management.agents.phone_style import phone_style_for_agent
        from call_management.config import get_language_instruction

        language = get_language_instruction(locale)
        phone_style = phone_style_for_agent(template, locale)
        routing = ""
        transfer_tools = [t for t in function_tools if t.startswith("to_")]
        if transfer_tools:
            routing = (
                "\n\nWhen routing is needed, call the transfer tool "
                f"({', '.join(transfer_tools)}) — don't only say you'll transfer."
            )
        voice_note = (
            "\n\nLive voice call: short spoken replies, natural pacing, no monologues."
            if for_voice
            else ""
        )
        instructions = (
            f"{instance.custom_instructions.strip()}\n\n{phone_style}\n\n"
            f"{language}{routing}{voice_note}"
        ).strip()
    else:
        instructions = get_effective_instructions(template, for_voice=for_voice)

    if extra_notes:
        instructions = f"{instructions}{extra_notes}"

    return RuntimeAgentConfig(
        template_id=template,
        display_name=display_name,
        provider=provider,
        voice=voice,
        locale=locale,
        voice_language=voice_language,
        instructions=instructions,
        tools=tools,
        function_tools=function_tools,
        mcp_servers=mcp_servers,
        instance_id=instance.id if instance else None,
        tenant_id=instance.tenant_id if instance else None,
    )


def language_hint_for_runtime(runtime: RuntimeAgentConfig) -> str | None:
    if runtime.voice_language:
        return None if runtime.voice_language == "multi" else runtime.voice_language
    return language_hint_for_locale(runtime.locale)


def runtime_to_voice_payload(runtime: RuntimeAgentConfig) -> dict[str, Any]:
    """Browser / API session config from a resolved runtime agent."""
    from call_management.xai.voice import build_voice_session_payload

    payload = build_voice_session_payload(
        runtime.template_id,
        tools_override=runtime.tools,
        function_tools_override=runtime.function_tools,
        mcp_override=runtime.mcp_servers,
        instructions_override=runtime.instructions,
        voice_override=runtime.voice,
        language_hint_override=language_hint_for_runtime(runtime),
    )
    payload["agent"] = runtime.template_id
    payload["display_name"] = runtime.display_name
    return payload
