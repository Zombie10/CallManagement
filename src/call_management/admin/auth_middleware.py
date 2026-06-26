"""Protect admin API routes with session cookies."""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from call_management.admin.auth_permissions import can_access_api
from call_management.admin.auth_routes import PUBLIC_PATHS
from call_management.admin.auth_store import SESSION_COOKIE, get_session_user

_MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def auth_disabled() -> bool:
    return os.getenv("ADMIN_AUTH_DISABLED", "false").lower() == "true"


class AdminAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if auth_disabled():
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api/") or path in PUBLIC_PATHS:
            return await call_next(request)

        user = get_session_user(request.cookies.get(SESSION_COOKIE))
        if not user:
            return JSONResponse(status_code=401, content={"detail": "No autenticado"})

        if not can_access_api(user.role, path):
            return JSONResponse(status_code=403, content={"detail": "Sin permiso para este recurso"})

        if (
            user.role == "viewer"
            and request.method in _MUTATING_METHODS
            and not path.startswith("/api/auth/")
        ):
            return JSONResponse(status_code=403, content={"detail": "Solo lectura: no puedes modificar datos"})

        return await call_next(request)