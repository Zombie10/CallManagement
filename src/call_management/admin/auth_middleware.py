"""Protect admin API routes with session cookies."""

from __future__ import annotations

import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from call_management.admin.auth_routes import PUBLIC_PATHS
from call_management.admin.auth_store import SESSION_COOKIE, get_session_user


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

        return await call_next(request)