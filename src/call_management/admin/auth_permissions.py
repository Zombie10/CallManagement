"""Role-based access control for the admin API and UI."""

from __future__ import annotations

from typing import Literal

AdminRole = Literal["admin", "playground", "viewer"]

ROLES: list[dict[str, str]] = [
    {"id": "admin", "label": "Administrador", "description": "Acceso completo al panel"},
    {"id": "playground", "label": "Probar agente", "description": "Solo playground de voz/texto"},
    {"id": "viewer", "label": "Solo lectura", "description": "Dashboard, clientes y llamadas (sin editar)"},
]

# API prefixes allowed per role (admin always has full access)
_ROLE_API_PREFIXES: dict[str, tuple[str, ...]] = {
    "playground": (
        "/api/auth/",
        "/api/health",
        "/api/chat/",
        "/api/voice/",
        "/api/livekit/",
    ),
    "viewer": (
        "/api/auth/",
        "/api/health",
        "/api/dashboard",
        "/api/customers",
        "/api/calls",
        "/api/appointments",
    ),
}

# Frontend routes allowed per role
_ROLE_ROUTES: dict[str, tuple[str, ...]] = {
    "admin": ("/", "/settings", "/playground", "/agents", "/customers", "/calls", "/appointments", "/profile", "/users"),
    "playground": ("/playground", "/profile"),
    "viewer": ("/", "/customers", "/calls", "/appointments", "/profile"),
}


def normalize_role(role: str | None) -> AdminRole:
    value = (role or "admin").strip().lower()
    if value in ("admin", "playground", "viewer"):
        return value  # type: ignore[return-value]
    return "viewer"


def can_access_api(role: str, path: str) -> bool:
    role = normalize_role(role)
    if role == "admin":
        return True
    for prefix in _ROLE_API_PREFIXES.get(role, ()):
        if path.startswith(prefix):
            return True
    return False


def can_access_route(role: str, route: str) -> bool:
    role = normalize_role(role)
    allowed = _ROLE_ROUTES.get(role, ())
    if route in allowed:
        return True
    if route == "/" and "/" in allowed:
        return True
    return False


def default_route_for_role(role: str) -> str:
    role = normalize_role(role)
    if role == "playground":
        return "/playground"
    return "/"