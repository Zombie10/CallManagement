"""In-process call concurrency limits and active-call registry for supervisor."""

from __future__ import annotations

import asyncio
import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Literal

_lock = asyncio.Lock()
_active_tenant: dict[str, int] = defaultdict(int)
_active_agent: dict[str, int] = defaultdict(int)
_active_number: dict[str, int] = defaultdict(int)
_active_calls: dict[str, dict[str, Any]] = {}

def default_tenant_cap() -> int:
    return int(os.getenv("MAX_CONCURRENT_CALLS_PER_TENANT", "5"))

LayerKind = Literal["tenant", "agent", "number"]


@dataclass(frozen=True)
class QueueLimits:
    tenant_id: str
    tenant_cap: int
    agent_instance_id: str | None = None
    agent_cap: int | None = None
    dialed_number: str | None = None
    number_cap: int | None = None

    def layers(self) -> list[tuple[LayerKind, str, int]]:
        items: list[tuple[LayerKind, str, int]] = [("tenant", self.tenant_id, self.tenant_cap)]
        if self.agent_instance_id and self.agent_cap is not None:
            items.append(("agent", self.agent_instance_id, self.agent_cap))
        if self.dialed_number and self.number_cap is not None:
            items.append(("number", self.dialed_number, self.number_cap))
        return items


def _counter(kind: LayerKind) -> dict[str, int]:
    if kind == "tenant":
        return _active_tenant
    if kind == "agent":
        return _active_agent
    return _active_number


async def try_acquire(limits: QueueLimits) -> tuple[bool, LayerKind | None]:
    """Acquire slots on every configured layer. Returns (ok, blocked_layer)."""
    async with _lock:
        for kind, key, cap in limits.layers():
            counter = _counter(kind)
            if counter[key] >= cap:
                return False, kind
        for kind, key, _cap in limits.layers():
            _counter(kind)[key] += 1
        return True, None


async def release(limits: QueueLimits | None) -> None:
    if not limits:
        return
    async with _lock:
        for kind, key, _cap in limits.layers():
            counter = _counter(kind)
            if counter[key] > 0:
                counter[key] -= 1


def active_count(tenant_id: str) -> int:
    return _active_tenant.get(tenant_id, 0)


def agent_active_count(agent_instance_id: str) -> int:
    return _active_agent.get(agent_instance_id, 0)


def number_active_count(phone_number: str) -> int:
    return _active_number.get(phone_number, 0)


def global_active() -> int:
    return sum(_active_tenant.values())


def build_queue_limits(
    *,
    tenant_id: str,
    agent_instance_id: str | None = None,
    agent_max_concurrent: int | None = None,
    dialed_number: str | None = None,
    number_max_concurrent: int | None = None,
    tenant_cap: int | None = None,
) -> QueueLimits:
    return QueueLimits(
        tenant_id=tenant_id,
        tenant_cap=tenant_cap or default_tenant_cap(),
        agent_instance_id=agent_instance_id,
        agent_cap=agent_max_concurrent,
        dialed_number=dialed_number.strip() if dialed_number else None,
        number_cap=number_max_concurrent,
    )


def resolve_queue_limits_from_store(
    store: Any,
    *,
    tenant_id: str,
    agent_instance_id: str | None,
    dialed_number: str | None,
) -> QueueLimits:
    agent_cap: int | None = None
    number_cap: int | None = None
    normalized_number = dialed_number.strip() if dialed_number else None

    if agent_instance_id:
        agent = store.get_agent(agent_instance_id)
        if agent and agent.max_concurrent_calls is not None:
            agent_cap = agent.max_concurrent_calls

    if normalized_number:
        route = store.resolve_phone(normalized_number)
        if route and route.max_concurrent_calls is not None:
            number_cap = route.max_concurrent_calls

    return build_queue_limits(
        tenant_id=tenant_id,
        agent_instance_id=agent_instance_id,
        agent_max_concurrent=agent_cap,
        dialed_number=normalized_number,
        number_max_concurrent=number_cap,
    )


async def register_active_call(
    call_id: str,
    *,
    tenant_id: str,
    from_number: str,
    channel: str = "sip",
    agent_instance_id: str | None = None,
    dialed_number: str | None = None,
    started_at: str,
    queued: bool = False,
    recording: bool = False,
    queue_blocked_layer: str | None = None,
) -> None:
    async with _lock:
        _active_calls[call_id] = {
            "call_id": call_id,
            "tenant_id": tenant_id,
            "from_number": from_number,
            "channel": channel,
            "agent_instance_id": agent_instance_id,
            "dialed_number": dialed_number,
            "started_at": started_at,
            "queued": queued,
            "recording": recording,
            "queue_blocked_layer": queue_blocked_layer,
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


def _layer_status(kind: LayerKind, key: str, cap: int) -> dict[str, Any]:
    active = _counter(kind).get(key, 0)
    return {
        "key": key,
        "active": active,
        "cap": cap,
        "at_capacity": active >= cap,
    }


def supervisor_snapshot(
    tenant_id: str,
    *,
    agents: list[Any] | None = None,
    phone_routes: list[Any] | None = None,
) -> dict[str, Any]:
    calls = list_active_calls(tenant_id=tenant_id)
    queued = sum(1 for c in calls if c.get("queued"))
    recording = sum(1 for c in calls if c.get("recording"))
    tenant_active = active_count(tenant_id)
    tenant_cap_value = default_tenant_cap()

    agent_limits: list[dict[str, Any]] = []
    for agent in agents or []:
        agent_cap = getattr(agent, "max_concurrent_calls", None)
        if agent_cap is None:
            continue
        active = agent_active_count(agent.id)
        agent_limits.append(
            {
                "agent_instance_id": agent.id,
                "display_name": agent.display_name,
                "active": active,
                "cap": agent_cap,
                "at_capacity": active >= agent_cap,
            }
        )

    number_limits: list[dict[str, Any]] = []
    for route in phone_routes or []:
        number_cap = getattr(route, "max_concurrent_calls", None)
        if number_cap is None:
            continue
        active = number_active_count(route.phone_number)
        number_limits.append(
            {
                "phone_number": route.phone_number,
                "agent_instance_id": route.agent_instance_id,
                "active": active,
                "cap": number_cap,
                "at_capacity": active >= number_cap,
            }
        )

    at_capacity = tenant_active >= tenant_cap_value or any(
        a["at_capacity"] for a in agent_limits
    ) or any(n["at_capacity"] for n in number_limits)

    return {
        "active_calls": len(calls),
        "queued_calls": queued,
        "recording_calls": recording,
        "at_capacity": at_capacity,
        "tenant_limit": _layer_status("tenant", tenant_id, tenant_cap_value),
        "agent_limits": agent_limits,
        "number_limits": number_limits,
        "calls": calls,
    }


def reset_queue_state() -> None:
    """Clear counters and registry (tests)."""
    _active_tenant.clear()
    _active_agent.clear()
    _active_number.clear()
    _active_calls.clear()