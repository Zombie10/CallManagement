"""In-process call concurrency limits and active-call registry for supervisor."""

from __future__ import annotations

import asyncio
import os
from collections import defaultdict
from typing import Any

_lock = asyncio.Lock()
_active: dict[str, int] = defaultdict(int)
_active_calls: dict[str, dict[str, Any]] = {}

DEFAULT_MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_CALLS_PER_TENANT", "5"))


async def try_acquire(tenant_id: str, *, limit: int | None = None) -> bool:
    cap = limit or DEFAULT_MAX_CONCURRENT
    async with _lock:
        if _active[tenant_id] >= cap:
            return False
        _active[tenant_id] += 1
        return True


async def release(tenant_id: str) -> None:
    async with _lock:
        if _active[tenant_id] > 0:
            _active[tenant_id] -= 1


def active_count(tenant_id: str) -> int:
    return _active.get(tenant_id, 0)


def global_active() -> int:
    return sum(_active.values())


async def register_active_call(
    call_id: str,
    *,
    tenant_id: str,
    from_number: str,
    channel: str = "sip",
    agent_instance_id: str | None = None,
    started_at: str,
    queued: bool = False,
    recording: bool = False,
) -> None:
    async with _lock:
        _active_calls[call_id] = {
            "call_id": call_id,
            "tenant_id": tenant_id,
            "from_number": from_number,
            "channel": channel,
            "agent_instance_id": agent_instance_id,
            "started_at": started_at,
            "queued": queued,
            "recording": recording,
        }


async def unregister_active_call(call_id: str) -> None:
    async with _lock:
        _active_calls.pop(call_id, None)


async def update_active_call(call_id: str, **fields: Any) -> None:
    async with _lock:
        entry = _active_calls.get(call_id)
        if entry:
            entry.update(fields)


def list_active_calls(*, tenant_id: str | None = None) -> list[dict[str, Any]]:
    items = list(_active_calls.values())
    if tenant_id:
        items = [c for c in items if c.get("tenant_id") == tenant_id]
    return sorted(items, key=lambda c: c.get("started_at", ""), reverse=True)


def supervisor_snapshot(tenant_id: str) -> dict[str, Any]:
    calls = list_active_calls(tenant_id=tenant_id)
    queued = sum(1 for c in calls if c.get("queued"))
    recording = sum(1 for c in calls if c.get("recording"))
    return {
        "active_calls": len(calls),
        "queued_calls": queued,
        "recording_calls": recording,
        "at_capacity": active_count(tenant_id) >= DEFAULT_MAX_CONCURRENT,
        "calls": calls,
    }


def reset_queue_state() -> None:
    """Clear counters and registry (tests)."""
    _active.clear()
    _active_calls.clear()