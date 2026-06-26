# Admin console

The admin console is a **React** SPA (`admin-ui/`) backed by a **FastAPI** app (`call-management-admin`). It manages agents, CRM, settings, users, and provides voice/text playgrounds for testing.

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

Default URL: **http://127.0.0.1:8080**

## Pages

| Route | Description | Roles |
|-------|-------------|-------|
| `/` | Dashboard — call stats, system status | admin, viewer |
| `/playground` | Voice (xAI / LiveKit) + text chat | admin, playground |
| `/agents` | Per-agent voice, locale, tools, instructions | admin |
| `/customers` | CRM customers and notes | admin, viewer |
| `/calls` | Call history | admin, viewer |
| `/appointments` | Scheduled callbacks | admin, viewer |
| `/settings` | `.env` editor (masked secrets) | admin |
| `/users` | User management | admin |
| `/profile` | Password change, passkey registration | all |

## Authentication

### Password login

Set in `.env`:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

On startup, the bootstrap admin password is synced from `ADMIN_PASSWORD`. Reset via CLI:

```bash
uv run python -m call_management.admin.reset_password
```

### Passkeys (WebAuthn)

Requires HTTPS in production (or localhost for dev):

```bash
ADMIN_RP_ID=paymercadogo.com
ADMIN_ORIGIN=https://paymercadogo.com/callmgmt
```

`ADMIN_RP_ID` must match the site hostname (no path). `ADMIN_ORIGIN` must match the exact origin users open in the browser.

### Roles

| Role | Access |
|------|--------|
| `admin` | Full panel: settings, agents, users, playground |
| `playground` | Only `/playground` and profile — for testers |
| `viewer` | Read-only dashboard, customers, calls, appointments |

Disable auth for local dev only:

```bash
ADMIN_AUTH_DISABLED=true
```

## Playground

### Voice — xAI direct (default)

- Connects browser WebSocket to xAI Voice API via ephemeral token from `/api/voice/session`.
- CRM function tools run **server-side** (`/api/voice/tools/execute`).
- Live transcript + tool-call log panel.
- **No LiveKit required** — only `XAI_API_KEY`.

Select an agent, click **Conectar**. The agent greets like a real phone call. Say why you're calling; provide your phone number in voice when asked for banking/CRM lookup.

### Voice — LiveKit production

- Creates a LiveKit room and dispatches the real agent worker.
- Same pipeline as SIP production calls.
- Requires `LIVEKIT_*` credentials **and** a running worker:

```bash
uv run -m call_management.server dev
```

### Text chat

- Multi-agent session with handoffs and tool events in the transcript.
- Useful for debugging routing without a microphone.

### Internal caller ID

The playground uses a placeholder phone (`+15551234567`) until the agent collects a real number via `lookup_customer`. Demo banking customers (Reynaldo, Francisco) are in CRM — say their phone number in voice to test BAC flows.

## API overview

All routes are under `/api/` unless noted.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/auth/*` | * | Login, logout, passkeys, users |
| `/api/dashboard` | GET | Stats |
| `/api/agents` | GET/POST/DELETE | Agent profiles |
| `/api/customers` | GET/POST/PATCH | CRM |
| `/api/calls` | GET | Call log |
| `/api/appointments` | GET | Appointments |
| `/api/chat/*` | * | Text playground sessions |
| `/api/voice/session` | POST | xAI ephemeral voice session |
| `/api/voice/tools/execute` | POST | Server-side tool execution |
| `/api/voice/config/{agent}` | GET | Agent voice config (handoffs) |
| `/api/livekit/*` | * | LiveKit playground tokens |
| `/api/demo/customers` | GET | Demo BAC customer list (API only) |
| `/api/settings` | GET/PATCH | Environment settings |

Session cookie: `cm_admin_session` (httpOnly, path `/`).

## Data storage

| File | Purpose |
|------|---------|
| `data/crm.db` | Customers, calls, appointments (`CRM_DB_PATH`) |
| `data/admin_auth.db` | Users, sessions, passkeys (`ADMIN_AUTH_DB_PATH`) |

Both are SQLite. Use absolute paths in production (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## CORS

For dev with Vite on port 5173, defaults allow `localhost:8080`. Production:

```bash
ADMIN_CORS_ORIGINS=https://paymercadogo.com,https://www.paymercadogo.com
```

## Subpath deployment

When served under a URL prefix (e.g. `/callmgmt/`), build the UI with:

```bash
cd admin-ui && VITE_BASE=/callmgmt/ npm run build
```

nginx must proxy both `/callmgmt/` (static) and `/callmgmt/api/` (API). See [DEPLOYMENT.md](DEPLOYMENT.md).