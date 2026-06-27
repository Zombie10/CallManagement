"""Role-based access control with per-user module grants."""

from __future__ import annotations

from typing import Literal, TypedDict

AdminRole = Literal["super_admin", "admin", "playground", "viewer"]

ROLES: list[dict[str, str]] = [
    {"id": "super_admin", "label": "Orquestador", "description": "Gestiona todas las empresas"},
    {"id": "admin", "label": "Administrador", "description": "Acceso completo a su empresa"},
    {"id": "playground", "label": "Probar agente", "description": "Solo playground de voz/texto"},
    {"id": "viewer", "label": "Solo lectura", "description": "Dashboard, clientes y llamadas (sin editar)"},
]


class ModuleDef(TypedDict):
    id: str
    label: str
    route: str
    category: str
    api_prefixes: tuple[str, ...]


# Módulos = entradas del menú + APIs asociadas
MODULES: tuple[ModuleDef, ...] = (
    {"id": "dashboard", "label": "Dashboard", "route": "/", "category": "General", "api_prefixes": ("/api/dashboard",)},
    {"id": "tenants", "label": "Empresas", "route": "/tenants", "category": "Orquestador", "api_prefixes": ("/api/tenants", "/api/platform/")},
    {"id": "my_agents", "label": "Mis agentes", "route": "/my-agents", "category": "Operación", "api_prefixes": ("/api/tenant-agents",)},
    {"id": "setup", "label": "Guía inicio", "route": "/setup", "category": "Operación", "api_prefixes": ()},
    {"id": "analytics", "label": "Análisis", "route": "/analytics", "category": "Reportes", "api_prefixes": ("/api/reports/", "/api/analytics")},
    {"id": "customers", "label": "Clientes", "route": "/customers", "category": "CRM", "api_prefixes": ("/api/customers",)},
    {
        "id": "calls",
        "label": "Registros",
        "route": "/calls",
        "category": "CRM",
        "api_prefixes": ("/api/calls",),
    },
    {
        "id": "recordings",
        "label": "Escuchar grabaciones",
        "route": "/calls",
        "category": "CRM",
        "api_prefixes": ("/api/calls/",),
    },
    {"id": "appointments", "label": "Citas", "route": "/appointments", "category": "CRM", "api_prefixes": ("/api/appointments",)},
    {
        "id": "supervisor",
        "label": "Supervisor",
        "route": "/supervisor",
        "category": "Operación",
        "api_prefixes": ("/api/supervisor",),
    },
    {"id": "playground", "label": "Probar agente", "route": "/playground", "category": "Pruebas", "api_prefixes": ("/api/chat/", "/api/voice/", "/api/livekit/", "/api/demo/")},
    {
        "id": "settings",
        "label": "Configuración",
        "route": "/settings",
        "category": "Sistema",
        "api_prefixes": ("/api/settings", "/api/webhooks", "/api/api-keys", "/api/webhooks/deliveries"),
    },
    {
        "id": "audit",
        "label": "Auditoría webhooks",
        "route": "/settings",
        "category": "Sistema",
        "api_prefixes": ("/api/webhooks/deliveries",),
    },
    {
        "id": "export",
        "label": "Exportar datos",
        "route": "/analytics",
        "category": "Reportes",
        "api_prefixes": ("/api/export/",),
    },
    {
        "id": "api_keys",
        "label": "API pública",
        "route": "/settings",
        "category": "Sistema",
        "api_prefixes": ("/api/api-keys",),
    },
    {"id": "agents", "label": "Plantillas sistema", "route": "/agents", "category": "Sistema", "api_prefixes": ("/api/agents",)},
    {"id": "users", "label": "Usuarios", "route": "/users", "category": "Sistema", "api_prefixes": ("/api/auth/users", "/api/auth/roles", "/api/auth/modules")},
)

MODULE_BY_ID: dict[str, ModuleDef] = {m["id"]: m for m in MODULES}
ROUTE_TO_MODULE: dict[str, str] = {m["route"]: m["id"] for m in MODULES}

_ROLE_MODULE_CEILING: dict[str, frozenset[str]] = {
    "super_admin": frozenset(m["id"] for m in MODULES),
    "admin": frozenset(
        m["id"] for m in MODULES if m["id"] not in ("tenants", "agents", "audit", "api_keys")
    ),
    "playground": frozenset({"playground"}),
    "viewer": frozenset(
        {"dashboard", "analytics", "customers", "calls", "recordings", "appointments", "supervisor"}
    ),
}

_ROLE_DEFAULT_MODULES: dict[str, frozenset[str]] = _ROLE_MODULE_CEILING.copy()

# APIs siempre permitidas con sesión válida
_ALWAYS_API_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/passkey/",
    "/api/auth/status",
    "/api/health",
    "/api/tenants/mine",
)


def normalize_role(role: str | None) -> AdminRole:
    value = (role or "admin").strip().lower()
    if value in ("super_admin", "admin", "playground", "viewer"):
        return value  # type: ignore[return-value]
    return "viewer"


def modules_catalog() -> list[dict[str, str]]:
    return [
        {"id": m["id"], "label": m["label"], "route": m["route"], "category": m["category"]}
        for m in MODULES
    ]


def ceiling_modules_for_role(role: str) -> frozenset[str]:
    return _ROLE_MODULE_CEILING.get(normalize_role(role), frozenset())


def default_modules_for_role(role: str) -> list[str]:
    return sorted(_ROLE_DEFAULT_MODULES.get(normalize_role(role), frozenset()))


def normalize_module_ids(module_ids: list[str] | None, *, role: str) -> list[str] | None:
    """Validate module ids against role ceiling. None or [] = use role defaults."""
    if not module_ids:
        return None
    ceiling = ceiling_modules_for_role(role)
    cleaned = [mid for mid in module_ids if mid in MODULE_BY_ID and mid in ceiling]
    return sorted(set(cleaned)) if cleaned else None


def effective_modules(role: str, module_ids: list[str] | None) -> list[str]:
    ceiling = ceiling_modules_for_role(role)
    if not module_ids:
        return sorted(ceiling)
    granted = {mid for mid in module_ids if mid in ceiling}
    return sorted(granted) if granted else sorted(ceiling)


def effective_routes(role: str, module_ids: list[str] | None) -> list[str]:
    mods = effective_modules(role, module_ids)
    routes = [MODULE_BY_ID[mid]["route"] for mid in mods if mid in MODULE_BY_ID]
    routes.append("/profile")
    return sorted(set(routes), key=lambda r: (r != "/", r))


def can_access_route(role: str, route: str, module_ids: list[str] | None = None) -> bool:
    if route == "/profile" or route.startswith("/login"):
        return True
    allowed_routes = set(effective_routes(role, module_ids))
    return route in allowed_routes


def _is_recording_api(path: str) -> bool:
    return path.startswith("/api/calls/") and "/recording" in path


def can_access_api(role: str, path: str, module_ids: list[str] | None = None) -> bool:
    role = normalize_role(role)
    if any(path.startswith(p) for p in _ALWAYS_API_PREFIXES):
        return True
    if path.startswith("/api/auth/"):
        return True

    mods = effective_modules(role, module_ids)
    mods_set = set(mods)

    if _is_recording_api(path):
        if "recordings" in mods_set:
            return True
        if module_ids is None and role in ("super_admin", "admin"):
            return True
        return False
    prefixes: list[str] = []
    for mid in mods:
        mod = MODULE_BY_ID.get(mid)
        if mod:
            prefixes.extend(mod["api_prefixes"])

    if module_ids is None and role in ("super_admin", "admin"):
        return True

    for prefix in prefixes:
        if path.startswith(prefix):
            return True
    return False


def default_route_for_role(role: str, module_ids: list[str] | None = None) -> str:
    routes = effective_routes(role, module_ids)
    if "/playground" in routes and role == "playground":
        return "/playground"
    if "/" in routes:
        return "/"
    return routes[0] if routes else "/profile"


def is_read_only_role(role: str) -> bool:
    return normalize_role(role) == "viewer"