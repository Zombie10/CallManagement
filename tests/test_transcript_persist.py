"""Tests for transcript extraction and interaction persistence."""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from call_management.agents.base import CallContext
from call_management.crm.database import CRMDatabase
from call_management.crm.session_persist import finalize_interaction
from call_management.utils.transcript import content_to_text, transcript_from_agent_session


def test_content_to_text_handles_strings_and_lists():
    assert content_to_text("hola") == "hola"
    assert content_to_text(["uno", "dos"]) == "uno dos"
    assert content_to_text([{"text": "desde dict"}]) == "desde dict"


def test_transcript_from_agent_session_dedupes_messages():
    items = [
        SimpleNamespace(type="message", role="user", content=["Hola"]),
        SimpleNamespace(type="message", role="assistant", content=["Bienvenido"]),
        SimpleNamespace(type="message", role="user", content=["Hola"]),
    ]
    history = SimpleNamespace(items=items)
    session = SimpleNamespace(history=history, current_agent=SimpleNamespace(agent_name="support"))
    text = transcript_from_agent_session(session)
    assert "[Cliente] Hola" in text
    assert "[Agente (support)] Bienvenido" in text
    assert text.count("[Cliente] Hola") == 1


@pytest.mark.asyncio
async def test_finalize_interaction_saves_transcript(tmp_path, monkeypatch):
    monkeypatch.setenv("ENABLE_POST_CALL_SUMMARY", "false")
    db = CRMDatabase(tmp_path / "crm.db")
    await db.initialize()

    @dataclass
    class FakeSession:
        history: object = field(default_factory=lambda: SimpleNamespace(items=[
            SimpleNamespace(type="message", role="user", content=["Necesito ayuda"]),
            SimpleNamespace(type="message", role="assistant", content=["Con gusto"]),
        ]))
        current_agent: object = field(default_factory=lambda: SimpleNamespace(agent_name="support"))

    ctx = CallContext(
        call_id="chat_test_001",
        room_name="admin-playground",
        from_number="+15551230001",
        crm=db,
        channel="chat",
        agent_session=FakeSession(),
    )

    saved = await finalize_interaction(ctx, enable_summary=False)
    assert saved is True

    record = await db.get_call_record("chat_test_001")
    assert record is not None
    loaded = await db.list_call_records()
    item = loaded["items"][0]
    assert "Necesito ayuda" in (item["transcript"] or "")
    assert item["channel"] == "chat"