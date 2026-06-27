# Call Management

Production-ready **Call Management System** built with [LiveKit Agents](https://github.com/livekit/agents) and **xAI Grok Voice**.

AI voice agents for contact centers and business telephony: multi-agent routing, CRM, SIP telephony, banking support (BAC Credomatic), and a full **web admin console** with voice/text playground.

## Documentation

| Guide | Contents |
|-------|----------|
| [Admin console](docs/ADMIN.md) | Web UI, auth, roles, multi-tenant, playground |
| [Análisis y reportes](docs/ANALYTICS.md) | Filtros, pivot, export CSV, API `/api/reports/*` |
| [Agents & tools](docs/AGENTS.md) | All agents, phone-call behavior, banking tools, handoffs |
| [Deployment](docs/DEPLOYMENT.md) | VPS (nginx + systemd), worker, updates, demo seed |

## Features

| Feature | Description |
|---------|-------------|
| **Multi-tenant** | Orquestador de empresas, agentes por tenant, CRM aislado, límites por plan |
| Multi-agent handoff | Receptionist → support, sales, technical, banking, escalation |
| Natural phone style | Agents listen first, one question at a time — no robotic intake forms |
| BAC banking support | Account/card verification, temporary blocks, CRM lookup by phone |
| Admin web console | Dashboard, CRM, agentes, análisis, webhooks, guía de inicio |
| **Análisis / reportes** | SLA, sentimiento, comparación agentes, pivot, export CSV — [docs/ANALYTICS.md](docs/ANALYTICS.md) |
| **Supervisor** | Panel en tiempo real: llamadas activas, cola, alertas worker |
| **Ficha cliente** | Historial unificado: llamadas, chats, citas, notas, escalaciones |
| Voice playground | **xAI direct** (WebSocket) or **LiveKit production** (white-label por empresa) |
| Text playground | Multi-agent chat con autosave móvil (`localStorage` + aviso al cerrar pestaña) |
| xAI tools | Built-in web search, MCP, code interpreter + custom CRM/SIP function tools |
| Auth & RBAC | Password + WebAuthn; roles + módulos: `supervisor`, `export`, `audit`, `api_keys` |
| Telephony | SIP inbound por DID, grabación Egress→S3, varios números por agente |
| CRM | SQLite por tenant (Postgres opcional con `asyncpg`): customers, calls, appointments |
| Cola y límites | Concurrentes por empresa (env), por agente y por DID; máximo diario por plan |
| Webhooks | `call.started`, `call.ended`, `appointment.*`, `agent.handoff` + auditoría y reintentos |
| **API pública** | API keys por tenant (`/api/public/v1/*`) con scopes |
| Observability | Post-call summaries, dashboard worker LiveKit, analytics accionables |

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │     Admin UI (React + Vite)         │
                    │  /analytics  /my-agents  /calls    │
                    └──────────────┬──────────────────────┘
                                   │ REST + cookies
                    ┌──────────────▼──────────────────────┐
                    │   FastAPI Admin (call-management-   │
                    │   admin) — chat, voice tools, CRM    │
                    └──────────────┬──────────────────────┘
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
  xAI Voice API              LiveKit Room            SQLite CRM
  (browser WebSocket)        + SIP trunk             + admin_auth.db
           │                       │
           └───────────┬───────────┘
                       ▼
              LiveKit AgentServer
              (receptionist → specialists)
```

**Production voice path (SIP):**

```
Phone → SIP trunk → LiveKit room → AgentServer → AgentSession → specialist agents → SIP tools
```

## Quick start

### 1. Install

```bash
uv sync
cd admin-ui && npm install
```

### 2. Configure

```bash
cp .env.example .env
# Set XAI_API_KEY (required for admin voice playground)
# Set LIVEKIT_* when using dev/start worker or LiveKit voice mode
```

### 3. Initialize CRM

```bash
uv run python scripts/init_crm.py
```

### 4. Run admin console (recommended for testing)

```bash
# Terminal 1 — API + static UI
uv run call-management-admin

# Terminal 2 — build UI (first time or after UI changes)
cd admin-ui && npm run dev
# Or production build served by FastAPI:
cd admin-ui && npm run build
```

Open **http://127.0.0.1:8080** — default login from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.

### 5. Console mode (mic, no web UI)

```bash
uv run -m call_management.server console -a banking_support -q
call-management console --text -a receptionist -q
call-management console-help
```

### 6. LiveKit dev worker (production pipeline in playground)

```bash
uv run -m call_management.server dev
```

Requires real `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Then use **LiveKit producción** in the admin playground.

## xAI configuration (recommended)

```bash
XAI_API_KEY=xai-...
MODEL_PROVIDER=xai
USE_GROK_REALTIME=true
GROK_REALTIME_MODEL=grok-voice-latest
GROK_REALTIME_VOICE=ara
```

Built-in tools and per-agent profiles are configured in `.env` and the **Agents** page in the admin UI. See [Agents & tools](docs/AGENTS.md).

## Project structure

```
CallManagement/
├── admin-ui/                 # React admin (Vite, Tailwind)
├── src/call_management/
│   ├── server.py             # LiveKit AgentServer
│   ├── cli.py                # call-management CLI
│   ├── config.py
│   ├── agents/               # receptionist, support, sales, technical,
│   │                         # escalation, banking_support, phone_style
│   ├── admin/                # FastAPI app, auth, chat, voice tools
│   ├── crm/                  # SQLite CRM + banking demo data
│   ├── telephony/            # SIP tools
│   ├── scheduling/
│   └── xai/                  # Voice API helpers, built-in tools, MCP
├── scripts/
│   ├── init_crm.py
│   ├── seed_demo_company.py  # Demo tenant (Café Central)
│   ├── healthcheck.py
│   └── deploy/               # systemd, nginx, worker service
├── data/
│   ├── crm.db, admin_auth.db, platform.db (gitignored)
│   └── tenants/{id}/crm.db # CRM aislado por empresa
├── tests/
└── docs/
```

## Agents (summary)

| Agent | Role |
|-------|------|
| `receptionist` | Greet, listen, route to the right team |
| `banking_support` | BAC Credomatic: accounts, cards, verification, blocks |
| `support` | Accounts, billing, scheduling, callbacks |
| `sales` | Qualification, demos, follow-ups |
| `technical` | Complex troubleshooting, diagnostics |
| `escalation` | Supervisor queue, tickets, callbacks |

Voice agents **do not identify callers automatically** — they greet naturally and use `lookup_customer` only after the caller provides a phone number. Details: [docs/AGENTS.md](docs/AGENTS.md).

## Production deployment

- **Admin web (VPS):** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — nginx reverse proxy, systemd, SQLite data dir.
- **LiveKit agent worker:** `uv run -m call_management.server start` or Docker.
- **Live URL (current):** https://paymercadogo.com/callmgmt/
- **Análisis:** https://paymercadogo.com/callmgmt/analytics

Demo empresa **Café Central** (`cafe-central`):

```bash
uv run python scripts/seed_demo_company.py
```

```bash
docker build -t call-management .
docker run --env-file .env -v $(pwd)/data:/app/data call-management
```

## Testing

```bash
uv run ruff format src tests
uv run ruff check src tests
uv run pytest
cd admin-ui && npm run build
```

CI runs ruff + pytest on every push to `main`.

## Environment variables

See [.env.example](.env.example) for the full list. Key groups:

- **LiveKit** — agent worker + LiveKit voice playground
- **xAI** — voice, LLM, built-in tools, remote MCP
- **Admin** — `ADMIN_HOST`, `ADMIN_PORT`, `ADMIN_RP_ID`, `ADMIN_ORIGIN`, auth DB paths
- **CRM** — `CRM_DB_PATH`, `DEFAULT_LOCALE`, VIP routing, post-call summary

## Resources

- [LiveKit Agents](https://docs.livekit.io/agents/)
- [LiveKit Telephony](https://docs.livekit.io/telephony/)
- [xAI Voice API](https://docs.x.ai/)
- [xAI Tools](https://docs.x.ai/developers/tools/function-calling)

## License

MIT