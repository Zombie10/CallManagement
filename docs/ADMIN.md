# Admin console

The admin console is a **React** SPA (`admin-ui/`) backed by a **FastAPI** app (`call-management-admin`). It manages multi-tenant companies, agent instances, CRM, analytics, settings, users, and provides voice/text playgrounds.

**Production:** https://paymercadogo.com/callmgmt/

## Running locally

```bash
# Backend (serves API + built static files from admin-ui/dist)
uv run call-management-admin

# Development — hot reload for UI (proxies /api to :8080)
cd admin-ui && npm run dev   # http://127.0.0.1:5173
```

Production build (served by FastAPI on port 8080):

```bash
cd admin-ui && npm run build
uv run call-management-admin
```

Subpath (e.g. `/callmgmt/` on VPS):

```bash
cd admin-ui && VITE_BASE=/callmgmt/ npm run build
```

Default URL: **http://127.0.0.1:8080**

## Multi-tenant (orquestador)

| Route | Description | Roles |
|-------|-------------|-------|
| `/tenants` | Crear y gestionar empresas, logo/color, métricas | `super_admin` |
| `/my-agents` | Agentes por empresa: voz, teléfonos, horarios, estado | `super_admin`, `admin` |
| `/setup` | Guía para primera llamada real (worker + DID) | `super_admin`, `admin` |

Cada empresa tiene:

- CRM SQLite aislado: `data/tenants/{tenant_id}/crm.db`
- Límites: `max_agents`, `max_calls_per_day`
- Branding: `logo_url`, `brand_color` (visible en Playground)
- Webhooks por tenant (`call.started`, `call.ended`, `appointment.*`, `agent.handoff`)
- API keys para integraciones (`/api/public/v1/*`)

Los agentes son **instancias** (plantilla + config + teléfono(s)), no solo plantillas del sistema (`/agents`).

**Header API:** `X-Tenant-Id` (super admin cambia empresa en la barra de contexto).  
**Header opcional:** `X-Agent-Instance-Id` (playground con instancia concreta).

### Demo: Café Central

```bash
uv run python scripts/seed_demo_company.py
# Variables opcionales: DEMO_TENANT_SLUG, DEMO_PHONE_RECEPCION, etc.
```

## Pages

| Route | Description | Roles |
|-------|-------------|-------|
| `/` | Dashboard — stats, worker LiveKit, gráfico llamadas | super_admin, admin, viewer |
| `/analytics` | Reportes interactivos, filtros, pivot, CSV | super_admin, admin, viewer |
| `/tenants` | Orquestador de empresas | super_admin |
| `/my-agents` | Agentes de la empresa activa | super_admin, admin |
| `/setup` | Wizard primera llamada SIP | super_admin, admin |
| `/playground` | Voz (xAI / LiveKit) + chat texto | super_admin, admin, playground |
| `/agents` | Plantillas de sistema (globales) | super_admin |
| `/customers` | CRM clientes | super_admin, admin, viewer |
| `/customers/:phone` | Ficha cliente unificada (llamadas, chats, citas, notas) | super_admin, admin, viewer |
| `/calls` | Registros con transcript/grabación | super_admin, admin, viewer |
| `/appointments` | Citas — crear, editar, eliminar | super_admin, admin (viewer solo lectura) |
| `/supervisor` | Panel tiempo real: activas, cola, alertas | super_admin, admin, viewer |
| `/settings` | `.env`, webhooks, auditoría, API keys (super_admin) | super_admin, admin |
| `/users` | Usuarios, empresa y **permisos por módulo** | super_admin, admin |
| `/profile` | Contraseña, passkeys | all |

Ver [ANALYTICS.md](ANALYTICS.md) para filtros, pivot y API de reportes.

## Permisos por módulo

Además del **rol**, cada usuario puede tener módulos personalizados (entradas del menú + APIs asociadas).

En **Usuarios** → crear o editar → **Módulos permitidos**:

- **Todos del rol** — acceso por defecto según rol (admin, viewer, playground…)
- **Personalizado** — elige módulos concretos (Dashboard, Análisis, Llamadas, Playground, etc.)

Los módulos disponibles dependen del rol (techo máximo). Un usuario `viewer` no puede recibir Configuración aunque se intente asignar.

API: `GET /api/auth/modules` — catálogo, defaults y techos por rol.  
El perfil (`/api/auth/me`) incluye `effective_modules` y `allowed_routes` para la UI.

## Authentication

### Password login

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

Reset via CLI:

```bash
uv run python -m call_management.admin.reset_password
```

### Passkeys (WebAuthn)

```bash
ADMIN_RP_ID=paymercadogo.com
ADMIN_ORIGIN=https://paymercadogo.com/callmgmt
```

`ADMIN_RP_ID` = hostname (sin path). `ADMIN_ORIGIN` = URL exacta que abre el usuario (incluye `/callmgmt` si aplica).

### Roles

| Role | Access |
|------|--------|
| `super_admin` | Todo: empresas, plantillas sistema, usuarios globales |
| `admin` | Su empresa: agentes, settings, playground, usuarios |
| `playground` | Solo `/playground` y perfil |
| `viewer` | Lectura: dashboard, CRM, llamadas, análisis |

Usuarios pueden tener `tenant_id` asignado (visible en `/users` para super_admin).

Disable auth for local dev only:

```bash
ADMIN_AUTH_DISABLED=true
```

## Playground

### Voice — xAI direct

- WebSocket vía token efímero (`/api/voice/session`).
- Herramientas CRM en servidor (`/api/voice/tools/execute`).
- Solo requiere `XAI_API_KEY`.

### Voice — LiveKit production

- Misma pipeline que llamadas SIP reales.
- Requiere `LIVEKIT_*` y worker activo (`callmanagement-worker`).

### White-label

Si la empresa tiene `logo_url` y `brand_color`, el playground muestra branding de la empresa activa.

### Text chat

Sesión multi-agente con handoffs y log de herramientas.

### Persistencia móvil (iOS/Safari)

El playground de texto guarda borrador en `localStorage` (autosave cada ~800 ms). Si cierras la pestaña con conversación sin guardar en servidor, el navegador muestra aviso. Al iniciar sesión nueva se limpia el borrador.

## API overview

All routes under `/api/` unless noted. Tenant-scoped routes require session + `X-Tenant-Id` (o tenant del usuario).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/auth/*` | * | Login, logout, passkeys, users |
| `/api/dashboard` | GET | Stats + analytics + worker status |
| `/api/reports/options` | GET | Filtros disponibles para reportes |
| `/api/reports/calls` | GET/POST | Reporte con filtros y pivot |
| `/api/analytics` | GET | Analytics resumido del tenant |
| `/api/tenants` | * | CRUD empresas (super_admin) |
| `/api/tenant-agents` | * | Instancias de agente |
| `/api/webhooks` | * | Webhooks del tenant |
| `/api/agents` | GET/POST/DELETE | Plantillas globales |
| `/api/customers` | GET/POST/PATCH | CRM |
| `/api/customers/{phone}/profile` | GET | Ficha cliente unificada |
| `/api/calls` | GET | Registros (transcript, grabación) |
| `/api/appointments` | GET/POST/PATCH/DELETE | Citas CRUD |
| `/api/supervisor` | GET | Llamadas activas, alertas, agentes |
| `/api/export/calls.csv` | GET | Export CSV (módulo `export`) |
| `/api/webhooks/deliveries` | GET | Auditoría de entregas webhook |
| `/api/webhooks/events` | GET | Catálogo de eventos |
| `/api/api-keys` | GET/POST/DELETE | API keys (super_admin) |
| `/api/public/v1/*` | * | API pública (header `X-Api-Key`) |
| `/api/chat/*` | * | Text playground |
| `/api/voice/*` | * | xAI voice session + tools |
| `/api/livekit/*` | * | LiveKit playground |
| `/api/settings` | GET/PUT | Environment settings |
| `/api/demo/customers` | GET | Demo BAC customers |

Session cookie: `cm_admin_session` (httpOnly, path `/`).

## Data storage

| Path | Purpose |
|------|---------|
| `data/platform.db` | Empresas, agentes, rutas, webhooks, API keys, auditoría webhook |
| `data/tenants/{id}/crm.db` | CRM por empresa |
| `data/admin_auth.db` | Usuarios, sesiones, passkeys |
| `data/crm.db` | Legacy / tenant default (migración automática) |

Use absolute paths in production. See [DEPLOYMENT.md](DEPLOYMENT.md).

## CORS

```bash
ADMIN_CORS_ORIGINS=https://paymercadogo.com,https://www.paymercadogo.com
```

## Subpath deployment

```bash
cd admin-ui && VITE_BASE=/callmgmt/ npm run build
```

nginx must proxy `/callmgmt/` and `/callmgmt/api/`. See [DEPLOYMENT.md](DEPLOYMENT.md).