"""In-memory playground session ownership (chat + browser voice)."""

from __future__ import annotations

import time
from dataclasses import dataclass

DEFAULT_TTL_SECONDS = 30 * 60


@dataclass
class PlaygroundLease:
    session_id: str
    user_id: str
    tenant_id: str
    expires_at: float
    kind: str


_leases: dict[str, PlaygroundLease] = {}


def register_lease(
    session_id: str,
    *,
    user_id: str,
    tenant_id: str,
    kind: str,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> PlaygroundLease:
    if not user_id:
        raise ValueError("Playground session requires an authenticated user")
    if not tenant_id:
        raise ValueError("Playground session requires a tenant")
    lease = PlaygroundLease(
        session_id=session_id,
        user_id=user_id,
        tenant_id=tenant_id,
        expires_at=time.time() + ttl_seconds,
        kind=kind,
    )
    _leases[session_id] = lease
    return lease


def require_lease(session_id: str, *, user_id: str, kind: str | None = None) -> PlaygroundLease:
    lease = _leases.get(session_id)
    if not lease or lease.user_id != user_id:
        raise PermissionError("Sesión no encontrada o no te pertenece")
    if kind and lease.kind != kind:
        raise PermissionError("Sesión no encontrada o no te pertenece")
    if time.time() > lease.expires_at:
        _leases.pop(session_id, None)
        raise PermissionError("Sesión expirada")
    return lease


def drop_lease(session_id: str) -> None:
    _leases.pop(session_id, None)


def reset_leases() -> None:
    _leases.clear()
