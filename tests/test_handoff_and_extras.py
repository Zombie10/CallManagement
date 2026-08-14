"""Instance handoff overlay and SIP voice extras builder."""

from __future__ import annotations

import pytest

from call_management.agents.base import CallContext
from call_management.agents.receptionist import ReceptionistAgent
from call_management.agents.runtime import resolve_instance_for_template
from call_management.agents.support import SupportAgent
from call_management.tenancy.platform_store import get_platform_store
from call_management.server import _build_session
from call_management.xai.voice import build_sip_voice_extras


@pytest.mark.asyncio
async def test_transfer_applies_tenant_instance_voice_and_instructions():
    store = get_platform_store()
    tenant = store.create_tenant(slug="handoff-co", name="Handoff Co")
    instance = store.create_agent(
        tenant.id,
        slug="support-acme",
        display_name="Soporte ACME",
        template_id="support",
        status="active",
        voice="celeste",
        custom_instructions="Eres el soporte de ACME, habla corto.",
    )
    receptionist = ReceptionistAgent()
    support = SupportAgent()
    ctx = CallContext(
        call_id="call_inst",
        tenant_id=tenant.id,
        agents={"receptionist": receptionist, "support": support},
        tenant_instances={"support": instance},
    )
    run_ctx = type("RunCtx", (), {"userdata": ctx})()
    next_agent, _ = await receptionist._transfer_to("support", run_ctx, "need help")
    assert next_agent is support
    assert support.preferred_voice == "celeste"
    assert "ACME" in support._instructions
    resolved = resolve_instance_for_template(store, tenant.id, "support")
    assert resolved.id == instance.id


def _sip_extras_env(monkeypatch) -> None:
    monkeypatch.setenv("XAI_API_KEY", "test-sip-extras-key")
    monkeypatch.setenv("MODEL_PROVIDER", "xai")
    monkeypatch.setenv("USE_GROK_REALTIME", "true")
    monkeypatch.setenv("GROK_VOICE_IDLE_TIMEOUT_MS", "8000")
    monkeypatch.setenv("GROK_VOICE_KEYTERMS", "BAC,débito")
    monkeypatch.setenv("GROK_VOICE_REPLACE", '{"BAC":"be a ce"}')
    monkeypatch.setenv("GROK_VOICE_OUTPUT_SPEED", "1.2")
    monkeypatch.setenv("GROK_VOICE_RESUMPTION", "true")


def test_sip_extras_builder_reads_settings_env(monkeypatch):
    _sip_extras_env(monkeypatch)
    extras = build_sip_voice_extras()
    assert extras["idle_timeout_ms"] == 8000
    assert "BAC" in extras["keyterms"]
    assert extras["replace"]["BAC"] == "be a ce"
    assert extras["output_speed"] == 1.2
    assert extras["resumption_enabled"] is True


@pytest.mark.asyncio
async def test_build_session_applies_extras_to_realtime_model(monkeypatch):
    _sip_extras_env(monkeypatch)
    ctx = CallContext(call_id="sip1")
    job = type("Job", (), {"proc": type("Proc", (), {"userdata": {"vad": object()}})()})()
    session = _build_session(ctx, job, voice_override="carina")
    model = session.llm
    assert model._opts.speed == 1.2
    assert model._opts.turn_detection.idle_timeout_ms == 8000
    assert "BAC" in list(model._opts.input_audio_transcription.keyterms)
    rt_session = model.session()
    try:
        queued = rt_session._msg_ch._queue
        assert queued, "RealtimeSession.__init__ must queue the first session.update"
        event = queued[0]
        payload = event.model_dump() if hasattr(event, "model_dump") else event
        body = payload["session"]
        assert body["audio"]["input"]["turn_detection"]["idle_timeout_ms"] == 8000
        assert "BAC" in body["audio"]["input"]["transcription"]["keyterms"]
        assert body["audio"]["output"]["speed"] == 1.2
        assert body["replace"]["BAC"] == "be a ce"
        assert body["resumption"]["enabled"] is True
    finally:
        await rt_session.aclose()
