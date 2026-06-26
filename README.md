# Call Management

Production-ready **Call Management System** built with [LiveKit Agents](https://github.com/livekit/agents) and **xAI Grok Voice**.

AI voice agents for contact centers and business telephony: multi-agent routing, CRM, SIP telephony, banking support (BAC Credomatic), and a full **web admin console** with voice/text playground.

## Documentation

| Guide | Contents |
|-------|----------|
| [Admin console](docs/ADMIN.md) | Web UI, auth, roles, playground (xAI direct + LiveKit) |
| [Agents & tools](docs/AGENTS.md) | All agents, phone-call behavior, banking tools, handoffs |
| [Deployment](docs/DEPLOYMENT.md) | VPS (nginx + systemd), Docker, LiveKit worker, updates |

## Features

| Feature | Description |
|---------|-------------|
| Multi-agent handoff | Receptionist → support, sales, technical, banking, escalation |
| Natural phone style | Agents listen first, one question at a time — no robotic intake forms |
| BAC banking support | Account/card verification, temporary blocks, CRM lookup by phone |
| Admin web console | React + FastAPI: dashboard, CRM, agents, settings, users |
| Voice playground | **xAI direct** (WebSocket, no LiveKit) or **LiveKit production** pipeline |
| Text playground | Multi-agent chat with tool-call log and handoff events |
| xAI tools | Built-in web search, MCP, code interpreter + custom CRM/SIP function tools |
| Auth & RBAC | Password + WebAuthn passkeys; roles: admin, playground, viewer |
| Telephony | LiveKit SIP inbound/outbound, warm/cold transfer, conferencing |
| CRM | SQLite: customers, calls, appointments, notes, demo banking profiles |
| Observability | Post-call summaries, escalation webhooks, LiveKit Cloud integration |

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │     Admin UI (React + Vite)         │
                    │  /playground  /agents  /customers   │
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
│   ├── healthcheck.py
│   └── deploy/               # systemd, nginx, install.sh
├── data/                     # crm.db, admin_auth.db (gitignored)
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