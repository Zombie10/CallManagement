"""xAI Voice Agent API helpers (model, voices, session tools).

Aligned with Speech-to-Speech docs:
https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech
"""

from __future__ import annotations

import json
import os
from typing import Any

from call_management.config import (
    get_model_config,
    normalize_xai_voice,
)
from call_management.xai.mcp import load_remote_mcp_config
from call_management.xai.tools import get_xai_tools_config

XAI_REALTIME_WS = "wss://api.x.ai/v1/realtime"
XAI_CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets"
# Flagship speech-to-speech model (docs.x.ai Speech to Speech).
# grok-voice-latest moves from think-fast-1.0 → think-fast-2.0 on 2026-08-05.
DEFAULT_REALTIME_MODEL = "grok-voice-think-fast-2.0"
THINK_FAST_MODELS = frozenset(
    {
        "grok-voice-latest",
        "grok-voice-think-fast-1.0",
        "grok-voice-think-fast-2.0",
    }
)

# Locale → BCP-47 language_hint. Spanish/Portuguese must be regional variants.
_LOCALE_LANGUAGE_HINTS = {
    "en": "en",
    "es": "es-MX",
    "es-mx": "es-MX",
    "es-es": "es-ES",
    "pt": "pt-BR",
    "pt-br": "pt-BR",
    "pt-pt": "pt-PT",
    "fr": "fr",
    "de": "de",
    "it": "it",
    "ja": "ja",
    "ko": "ko",
    "zh": "zh",
    "hi": "hi",
    "multi": None,
}


def language_hint_for_locale(locale: str | None) -> str | None:
    if not locale:
        return None
    code = locale.strip()
    if not code or code.lower() == "multi":
        return None
    mapped = _LOCALE_LANGUAGE_HINTS.get(code.lower())
    if mapped is not None or code.lower() in _LOCALE_LANGUAGE_HINTS:
        return mapped
    # Already a BCP-47 tag from voice_language options (e.g. es-MX, ar-SA).
    return code


def language_hint_for_agent(agent_name: str) -> str | None:
    from call_management.agent_store import get_voice_language_for_agent

    return get_voice_language_for_agent(agent_name)


def build_voice_tools(
    agent_name: str,
    *,
    tools_override: list[str] | None = None,
    function_tools_override: list[str] | None = None,
    mcp_override: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Build xAI Voice Agent API tool definitions for an agent profile."""
    from call_management.agent_store import get_mcp_profile, get_tool_profile

    cfg = get_xai_tools_config()
    tools: list[dict[str, Any]] = []

    enabled_tools = tools_override if tools_override is not None else get_tool_profile(agent_name)
    for tool_name in enabled_tools:
        if tool_name == "web_search" and cfg.enable_web_search:
            tools.append({"type": "web_search"})
        elif tool_name == "x_search" and cfg.enable_x_search:
            entry: dict[str, Any] = {"type": "x_search"}
            if cfg.allowed_x_handles:
                entry["allowed_x_handles"] = cfg.allowed_x_handles
            tools.append(entry)
        elif tool_name == "file_search" and cfg.enable_file_search and cfg.vector_store_ids:
            tools.append(
                {
                    "type": "file_search",
                    "vector_store_ids": cfg.vector_store_ids,
                    "max_num_results": cfg.max_file_search_results or 10,
                }
            )
        elif tool_name == "code_interpreter" and cfg.enable_code_interpreter:
            tools.append({"type": "code_interpreter"})

    mcp_cfg = load_remote_mcp_config()
    if mcp_cfg.enabled:
        by_id = {server.id: server for server in mcp_cfg.servers}
        mcp_ids = mcp_override if mcp_override is not None else get_mcp_profile(agent_name)
        for server_id in mcp_ids:
            server = by_id.get(server_id)
            if not server:
                continue
            entry = {
                "type": "mcp",
                "server_url": server.server_url,
                "server_label": server.server_label,
            }
            if server.server_description:
                entry["server_description"] = server.server_description
            if server.allowed_tools:
                entry["allowed_tools"] = server.allowed_tools
            tools.append(entry)

    from call_management.agent_store import get_function_tool_profile
    from call_management.agents.registry import build_voice_function_tools

    fn_tools = (
        function_tools_override
        if function_tools_override is not None
        else get_function_tool_profile(agent_name)
    )
    tools.extend(build_voice_function_tools(agent_name, fn_tools))
    return tools


def get_agent_instructions(agent_name: str) -> str:
    from call_management.agent_store import get_effective_instructions

    return get_effective_instructions(agent_name, for_voice=True)


def parse_voice_keyterms() -> list[str]:
    """Domain terms to bias ASR (max 100, each ≤50 chars). Comma-separated env."""
    raw = os.getenv("GROK_VOICE_KEYTERMS", "").strip()
    if not raw:
        return []
    terms: list[str] = []
    for part in raw.split(","):
        term = part.strip()[:50]
        if term and term not in terms:
            terms.append(term)
        if len(terms) >= 100:
            break
    return terms


def parse_voice_replace() -> dict[str, str]:
    """Pronunciation map applied before TTS (spoken audio only). JSON object env."""
    raw = os.getenv("GROK_VOICE_REPLACE", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k): str(v) for k, v in data.items() if str(k).strip() and str(v).strip()}


def _env_int(name: str, default: int | None) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw.strip())
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw.strip())
    except ValueError:
        return default


# Sample phrases for admin voice preview (keyed by language prefix / code).
_PREVIEW_SAMPLES: dict[str, str] = {
    "es": "Hola, soy tu agente de Call Management. Así suena mi voz en este idioma.",
    "es-MX": "Hola, soy tu agente de Call Management. Así suena mi voz en español de México.",
    "es-ES": "Hola, soy tu agente de Call Management. Así suena mi voz en español de España.",
    "en": "Hello, I'm your Call Management agent. This is how my voice sounds in this language.",
    "pt": "Olá, sou o seu agente de Call Management. Assim soa a minha voz neste idioma.",
    "pt-BR": "Olá, sou seu agente de Call Management. Assim soa minha voz em português do Brasil.",
    "fr": "Bonjour, je suis votre agent Call Management. Voici comment ma voix sonne dans cette langue.",
    "de": "Hallo, ich bin Ihr Call-Management-Agent. So klingt meine Stimme in dieser Sprache.",
    "it": "Ciao, sono il tuo agente Call Management. Così suona la mia voce in questa lingua.",
    "ja": "こんにちは。コールマネジメントのエージェントです。この言語での私の声はこのように聞こえます。",
    "multi": "Hello. Hola. This is a multilingual voice sample from Call Management.",
    "auto": "Hello. Hola. This is a multilingual voice sample from Call Management.",
}


def resolve_tts_language(language: str | None) -> str:
    """Map app locale / voice_language to a TTS BCP-47 code (or auto)."""
    if not language or not language.strip():
        return "auto"
    code = language.strip()
    lower = code.lower()
    if lower in {"multi", "auto"}:
        return "auto"
    if lower == "es":
        return "es-MX"
    if lower == "pt":
        return "pt-BR"
    return code


def preview_sample_text(language: str | None) -> str:
    resolved = resolve_tts_language(language)
    if resolved in _PREVIEW_SAMPLES:
        return _PREVIEW_SAMPLES[resolved]
    prefix = resolved.split("-", 1)[0].lower()
    return _PREVIEW_SAMPLES.get(prefix, _PREVIEW_SAMPLES["en"])


async def synthesize_voice_preview(
    *,
    voice_id: str,
    language: str | None = None,
    text: str | None = None,
) -> bytes:
    """Unary TTS sample for the admin voice picker (MP3 bytes)."""
    import aiohttp

    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        raise ValueError("XAI_API_KEY is required for voice preview")

    voice = normalize_xai_voice(voice_id)
    lang = resolve_tts_language(language)
    sample = (text or "").strip() or preview_sample_text(language)
    # Keep previews short for snappy UI + cost control.
    if len(sample) > 280:
        sample = sample[:280]

    payload = {
        "text": sample,
        "voice_id": voice,
        "language": lang,
        "output_format": {"codec": "mp3", "sample_rate": 24000, "bit_rate": 128000},
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.x.ai/v1/tts",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as response:
            body = await response.read()
            if response.status != 200:
                detail = body.decode("utf-8", errors="replace")[:300]
                raise ValueError(f"xAI TTS failed ({response.status}): {detail}")
            return body


async def create_ephemeral_voice_token(*, expires_seconds: int = 300) -> dict[str, Any]:
    import aiohttp

    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        raise ValueError("XAI_API_KEY is required for voice sessions")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            XAI_CLIENT_SECRETS_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={"expires_after": {"seconds": expires_seconds}},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as response:
            if response.status != 200:
                body = await response.text()
                raise ValueError(f"xAI client_secrets failed ({response.status}): {body[:300]}")
            data = await response.json()
            if "value" not in data:
                raise ValueError("Invalid ephemeral token response from xAI")
            return data


def build_voice_session_payload(
    agent_name: str = "receptionist",
    *,
    tools_override: list[str] | None = None,
    function_tools_override: list[str] | None = None,
    mcp_override: list[str] | None = None,
    instructions_override: str | None = None,
    voice_override: str | None = None,
    language_hint_override: str | None = None,
) -> dict[str, Any]:
    """Browser/API session config for Grok Speech-to-Speech (Think Fast 2.0)."""
    from call_management.agent_store import get_profile

    cfg = get_model_config()
    profile = get_profile(agent_name)
    voice = normalize_xai_voice(
        voice_override or (profile.voice if profile else cfg.grok_realtime_voice)
    )
    model = cfg.grok_realtime_model or DEFAULT_REALTIME_MODEL
    language_hint = (
        language_hint_override
        if language_hint_override is not None
        else language_hint_for_agent(agent_name)
    )

    extras = build_sip_voice_extras()
    payload: dict[str, Any] = {
        "model": model,
        "voice": voice,
        "agent": agent_name,
        "instructions": instructions_override or get_agent_instructions(agent_name),
        "language_hint": language_hint,
        "tools": build_voice_tools(
            agent_name,
            tools_override=tools_override,
            function_tools_override=function_tools_override,
            mcp_override=mcp_override,
        ),
        "turn_detection": extras["turn_detection"],
        "reasoning_effort": "high" if model in THINK_FAST_MODELS else None,
        "keyterms": extras["keyterms"],
        "replace": extras["replace"],
        "output_speed": extras["output_speed"],
        "resumption_enabled": extras["resumption_enabled"],
        "idle_timeout_ms": extras["idle_timeout_ms"],
        "recording_disclosure": extras["recording_disclosure"],
    }
    return payload


def build_sip_voice_extras() -> dict[str, Any]:
    """Settings extras applied on both browser session.update and LiveKit/SIP."""
    threshold = _env_float("GROK_VOICE_VAD_THRESHOLD", 0.85)
    threshold = max(0.1, min(0.9, threshold))
    silence_ms = _env_int("GROK_VOICE_SILENCE_MS", 700) or 700
    silence_ms = max(0, min(10_000, silence_ms))
    prefix_ms = _env_int("GROK_VOICE_PREFIX_PADDING_MS", 333) or 333
    prefix_ms = max(0, min(10_000, prefix_ms))
    idle_ms = _env_int("GROK_VOICE_IDLE_TIMEOUT_MS", 10_000)
    if idle_ms is not None and idle_ms <= 0:
        idle_ms = None
    speed = _env_float("GROK_VOICE_OUTPUT_SPEED", 1.0)
    speed = max(0.7, min(1.5, speed))
    resumption = os.getenv("GROK_VOICE_RESUMPTION", "true").lower() == "true"
    keyterms = parse_voice_keyterms()
    replace = parse_voice_replace()
    disclosure = os.getenv("GROK_VOICE_RECORDING_DISCLOSURE", "").strip()
    turn_detection: dict[str, Any] = {
        "type": "server_vad",
        "threshold": threshold,
        "silence_duration_ms": silence_ms,
        "prefix_padding_ms": prefix_ms,
    }
    if idle_ms is not None:
        turn_detection["idle_timeout_ms"] = idle_ms
    return {
        "idle_timeout_ms": idle_ms,
        "keyterms": keyterms or None,
        "replace": replace or None,
        "output_speed": speed,
        "resumption_enabled": resumption,
        "recording_disclosure": disclosure or None,
        "turn_detection": turn_detection,
    }


def livekit_turn_detection(extras: dict[str, Any] | None = None) -> Any:
    """Server VAD for LiveKit RealtimeModel, including xAI idle_timeout_ms."""
    from openai.types.realtime.realtime_audio_input_turn_detection import ServerVad

    extras = extras or build_sip_voice_extras()
    td = extras["turn_detection"]
    kwargs: dict[str, Any] = {
        "type": "server_vad",
        "threshold": td.get("threshold", 0.85),
        "prefix_padding_ms": td.get("prefix_padding_ms", 333),
        "silence_duration_ms": td.get("silence_duration_ms", 700),
        "create_response": True,
        "interrupt_response": True,
    }
    idle_ms = td.get("idle_timeout_ms")
    if idle_ms is not None:
        kwargs["idle_timeout_ms"] = idle_ms
    return ServerVad(**kwargs)


def livekit_input_transcription(extras: dict[str, Any] | None = None) -> Any:
    """Input transcription options, including xAI ASR keyterms."""
    from openai.types.realtime import AudioTranscription

    extras = extras or build_sip_voice_extras()
    payload: dict[str, Any] = {}
    if extras.get("keyterms"):
        payload["keyterms"] = list(extras["keyterms"])
    return AudioTranscription(**payload)


def sip_session_update_fields(extras: dict[str, Any] | None = None) -> dict[str, Any]:
    """Top-level session.update fields matching the browser sendSessionUpdate payload."""
    extras = extras or build_sip_voice_extras()
    fields: dict[str, Any] = {}
    if extras.get("replace"):
        fields["replace"] = dict(extras["replace"])
    if extras.get("resumption_enabled"):
        fields["resumption"] = {"enabled": True}
    return fields


def _merge_session_update(event: Any, fields: dict[str, Any]) -> Any:
    if not fields:
        return event
    if isinstance(event, dict):
        session = event.setdefault("session", {})
        if isinstance(session, dict):
            session.update(fields)
        return event
    session = getattr(event, "session", None)
    if session is not None:
        for key, value in fields.items():
            setattr(session, key, value)
    return event


_SipRealtimeModel: Any | None = None


def _sip_realtime_model_cls() -> Any:
    """xAI RealtimeModel whose session.update includes replace/resumption on the first event."""
    global _SipRealtimeModel
    if _SipRealtimeModel is not None:
        return _SipRealtimeModel

    from livekit.plugins import xai

    class SipRealtimeSession(xai.realtime.RealtimeSession):
        def _create_session_update_event(self) -> Any:
            event = super()._create_session_update_event()
            extras = getattr(self._realtime_model, "_sip_extras", None) or {}
            return _merge_session_update(event, sip_session_update_fields(extras))

    class SipRealtimeModel(xai.realtime.RealtimeModel):
        def __init__(self, *args: Any, sip_extras: dict[str, Any] | None = None, **kwargs: Any) -> None:
            self._sip_extras = sip_extras or {}
            super().__init__(*args, **kwargs)

        def session(self) -> Any:
            sess = SipRealtimeSession(self)
            self._sessions.add(sess)
            return sess

    _SipRealtimeModel = SipRealtimeModel
    return SipRealtimeModel


def apply_sip_voice_extras(realtime_model: Any, extras: dict[str, Any] | None = None) -> dict[str, Any]:
    """Apply settings extras onto a LiveKit RealtimeModel (update_options + session.update)."""
    extras = extras or build_sip_voice_extras()
    realtime_model._sip_extras = extras
    realtime_model.update_options(
        turn_detection=livekit_turn_detection(extras),
        speed=extras["output_speed"],
        input_audio_transcription=livekit_input_transcription(extras),
    )
    return extras


def build_sip_realtime_model(
    *,
    model: str,
    voice: str,
    extras: dict[str, Any] | None = None,
) -> Any:
    """Construct the xAI RealtimeModel used on the LiveKit/SIP path with extras applied."""
    extras = extras or build_sip_voice_extras()
    realtime = _sip_realtime_model_cls()(
        model=model,
        voice=voice,
        turn_detection=livekit_turn_detection(extras),
        sip_extras=extras,
    )
    apply_sip_voice_extras(realtime, extras)
    return realtime
