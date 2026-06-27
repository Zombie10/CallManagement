"""Protect admin API routes with session cookies."""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from call_management.admin.auth_permissions import can_access_api, is_read_only_role
from call_management.admin.auth_routes import PUBLIC_API_PREFIX, PUBLIC_PATHS
from call_management.admin.auth_store import SESSION_COOKIE, get_session_user

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def auth_disabled() -> bool:
    return os.getenv("ADMIN_AUTH_DISABLED", "false").lower() == "true"


class AdminAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if auth_disabled():
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/") or path in PUBLIC_PATHS or path.startswith(PUBLIC_API_PREFIX):
            return await call_next(request)

        user = get_session_user(request.cookies.get(SESSION_COOKIE))
        if not user:
            return JSONResponse(status_code=401, content={"detail": "No autenticado"})

        if not can_access_api(user.role, path, user.modules):
            return JSONResponse(status_code=403, content={"detail": "Sin permiso para este recurso"})

        if (
            is_read_only_role(user.role)
            and request.method in _MUTATING_METHODS
            and not path.startswith("/api/auth/")
        ):
            return JSONResponse(status_code=403, content={"detail": "Solo lectura: no puedes modificar datos"})

        request.state.user = {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "modules": user.modules,
            "enabled": user.enabled,
        }
        return await call_next(request)