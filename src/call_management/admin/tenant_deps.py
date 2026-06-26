"""FastAPI dependencies for multi-tenant requests."""

from __future__ import annotations

from fastapi import Header, HTTPException, Request

from call_management.admin.auth_routes import get_current_user
from call_management.tenancy.context import TenantContext, get_tenant_context


def _is_super_admin(user: dict) -> bool:
    return str(user.get("role")) == "super_admin"


async def require_tenant_context(
    request: Request,
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-Id"),
    x_agent_instance_id: str | None = Header(default=None, alias="X-Agent-Instance-Id"),
) -> TenantContext:
    from call_management.admin.auth_middleware import auth_disabled

    user = getattr(request.state, "user", None)
    if not user and not auth_disabled():
        try:
            user = get_current_user(request)
        except Exception as exc:
            raise HTTPException(status_code=401, detail="No autenticado") from exc

    try:
        return get_tenant_context(
            tenant_id=x_tenant_id,
            agent_instance_id=x_agent_instance_id,
            user_tenant_id=user.get("tenant_id") if user else None,
            is_super_admin=_is_super_admin(user) if user else True,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def require_super_admin(request: Request) -> dict:
    from call_management.admin.auth_middleware import auth_disabled

    if auth_disabled():
        return {"role": "super_admin", "tenant_id": None}
    user = getattr(request.state, "user", None) or get_current_user(request)
    if not _is_super_admin(user):
        raise HTTPException(status_code=403, detail="Solo orquestador / super admin")
    return user