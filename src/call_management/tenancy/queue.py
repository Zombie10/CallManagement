"""In-process call concurrency limits per tenant."""

from __future__ import annotations

import asyncio
import os
from collections import defaultdict

_lock = asyncio.Lock()
_active: dict[str, int] = defaultdict(int)

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