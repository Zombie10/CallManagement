"""Configuration and model selection for Call Management agents."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from dotenv import load_dotenv

load_dotenv()

Provider = Literal["inference", "xai", "direct"]


@dataclass
class ModelConfig:
    """Central configuration for the voice pipeline (STT / LLM / TTS / Realtime)."""

    provider: Provider = "xai"

    # --- xAI / Grok settings (when provider == "xai") ---
    use_grok_realtime: bool = True
    grok_realtime_model: str = "grok-voice-think-fast-1.0"
    grok_realtime_voice: str = "Ara"

    xai_stt_model: str = "grok-stt"
    xai_llm_model: str = "grok-3"
    xai_tts_model: str = "grok-tts"
    xai_tts_voice: str = "Ara"

    # --- LiveKit Inference (when provider == "inference") ---
    stt_model: str = "deepgram/nova-3"
    llm_model: str = "openai/gpt-4.1-mini"
    tts_model: str = "cartesia/sonic-3"
    tts_voice: str = "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc"

    language: str = "en"
    default_locale: str = "en"

    vad_model: str = "silero"
    max_tool_steps: int = 8
    preemptive_generation: bool = True
    vip_skip_receptionist: bool = True
    enable_post_call_summary: bool = True


def get_model_config() -> ModelConfig:
    """Load configuration from environment variables with sensible xAI defaults."""
    provider = os.getenv("MODEL_PROVIDER", "xai").lower()
    if provider not in ("inference", "xai", "direct"):
        provider = "xai"

    cfg = ModelConfig(provider=provider)  # type: ignore[arg-type]

    cfg.use_grok_realtime = os.getenv("USE_GROK_REALTIME", "true").lower() == "true"
    cfg.grok_realtime_model = os.getenv("GROK_REALTIME_MODEL", cfg.grok_realtime_model)
    cfg.grok_realtime_voice = os.getenv("GROK_REALTIME_VOICE", cfg.grok_realtime_voice)
    cfg.xai_stt_model = os.getenv("XAI_STT_MODEL", cfg.xai_stt_model)
    cfg.xai_llm_model = os.getenv("XAI_LLM_MODEL", cfg.xai_llm_model)
    cfg.xai_tts_model = os.getenv("XAI_TTS_MODEL", cfg.xai_tts_model)
    cfg.xai_tts_voice = os.getenv("XAI_TTS_VOICE", cfg.xai_tts_voice)

    cfg.stt_model = os.getenv("STT_MODEL", cfg.stt_model)
    cfg.llm_model = os.getenv("LLM_MODEL", cfg.llm_model)
    cfg.tts_model = os.getenv("TTS_MODEL", cfg.tts_model)
    cfg.tts_voice = os.getenv("TTS_VOICE", cfg.tts_voice)
    cfg.language = os.getenv("STT_LANGUAGE", cfg.language)
    cfg.default_locale = os.getenv("DEFAULT_LOCALE", cfg.default_locale)

    cfg.max_tool_steps = int(os.getenv("MAX_TOOL_STEPS", str(cfg.max_tool_steps)))
    cfg.preemptive_generation = os.getenv("PREEMPTIVE_GENERATION", "true").lower() == "true"
    cfg.vip_skip_receptionist = os.getenv("VIP_SKIP_RECEPTIONIST", "true").lower() == "true"
    cfg.enable_post_call_summary = os.getenv("ENABLE_POST_CALL_SUMMARY", "true").lower() == "true"

    return cfg


XAI_VOICES = {
    "receptionist": "Ara",
    "support": "Ara",
    "sales": "Grok",
    "technical": "Grok",
    "escalation": "Ara",
}

VOICE_PRESETS = {
    "receptionist": "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
    "support": "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
    "sales": "5ee9feff-1265-424a-9d7f-8e4d431a12c7",
    "technical": "a167e0f3-df7e-4d52-a9c3-f949145efdab",
    "escalation": "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
}

LANGUAGE_INSTRUCTIONS = {
    "en": "Respond in English unless the caller clearly prefers another language.",
    "es": "Responde en español a menos que el cliente prefiera claramente otro idioma.",
    "multi": "Mirror the caller's language. Default to English if unclear.",
}


def get_language_instruction(locale: str | None = None) -> str:
    return LANGUAGE_INSTRUCTIONS.get(locale or "multi", LANGUAGE_INSTRUCTIONS["multi"])


def get_voice_for_agent(agent_name: str, provider: Provider) -> str:
    if provider == "xai":
        return XAI_VOICES.get(agent_name, XAI_VOICES["receptionist"])
    return VOICE_PRESETS.get(agent_name, VOICE_PRESETS["receptionist"])
