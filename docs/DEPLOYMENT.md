# Deployment

This project has two deployable components:

1. **Admin web** — FastAPI + React (`call-management-admin`) — CRM UI, analytics, playground
2. **LiveKit agent worker** — `call-management start` — real SIP/room voice agents

They can run on the same or different hosts.

## Admin web — VPS (nginx + systemd)

**Production:** https://paymercadogo.com/callmgmt/  
**Server:** Ubuntu VPS (`mercadogo-vps` / `51.81.84.230`)  
**Install path:** `/opt/callmanagement`  
**Services:** `callmanagement`, `callmanagement-worker`

### Prerequisites

- Ubuntu 22.04+ (or similar)
- nginx with SSL (Let's Encrypt)
- Git, curl, [uv](https://docs.astral.sh/uv/)
- Port `8080` on `127.0.0.1`
- Node.js **only on build machine** — the VPS may not have `npm`; upload `admin-ui/dist/` via rsync

### First-time install

```bash
# On the server
sudo mkdir -p /opt/callmanagement/data
sudo chown ubuntu:ubuntu /opt/callmanagement

git clone https://github.com/Zombie10/CallManagement.git /opt/callmanagement
cd /opt/callmanagement

nano .env   # see Production .env example below

# Build UI locally OR on server if npm is available:
cd admin-ui && npm ci && VITE_BASE=/callmgmt/ npm run build

sudo bash scripts/deploy/install.sh
```

`install.sh` installs **both** units plus a stack target:

| Unit | Role |
|------|------|
| `callmanagement.service` | Admin API + SPA (`call-management-admin`) |
| `callmanagement-worker.service` | LiveKit agent worker (`python -m call_management.server start`) |
| `callmanagement.target` | Start/stop/restart **both** together |

```bash
# Stack (recommended)
sudo systemctl enable --now callmanagement.target
sudo bash scripts/deploy/manage.sh status
sudo bash scripts/deploy/manage.sh restart
sudo bash scripts/deploy/manage.sh logs        # both
sudo bash scripts/deploy/manage.sh logs worker
sudo bash scripts/deploy/manage.sh health
```

### Production `.env` example

```bash
# xAI (required for voice playground)
XAI_API_KEY=xai-...

MODEL_PROVIDER=xai
USE_GROK_REALTIME=true
GROK_REALTIME_MODEL=grok-voice-think-fast-2.0
GROK_REALTIME_VOICE=carina
GROK_VOICE_IDLE_TIMEOUT_MS=10000
GROK_VOICE_RESUMPTION=true

# Admin server
ADMIN_HOST=127.0.0.1
ADMIN_PORT=8080
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
ADMIN_RP_ID=paymercadogo.com
ADMIN_ORIGIN=https://paymercadogo.com/callmgmt
ADMIN_CORS_ORIGINS=https://paymercadogo.com,https://www.paymercadogo.com

# Data (absolute paths)
CRM_DB_PATH=/opt/callmanagement/data/crm.db
ADMIN_AUTH_DB_PATH=/opt/callmanagement/data/admin_auth.db

LOG_LEVEL=INFO
DEFAULT_LOCALE=es

# Multi-tenant limits (global per company; worker in-process)
MAX_CONCURRENT_CALLS_PER_TENANT=12

# Per-agent / per-DID limits are configured in Admin → Mis agentes
# (max_concurrent_calls on agent instance; optional cap per phone number).
# All three layers apply: tenant env cap AND agent cap AND number cap when set.

# LiveKit — project "call management" (p_39db3sg0f79)
# WebSocket URL from Settings → Keys (NOT the SIP URI subdomain)
LIVEKIT_URL=wss://call-management-6g9fmqf0.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...

# SIP URI for external trunks only: sip:39db3sg0f79.sip.livekit.cloud
# Inbound dispatch (once per project / DID):
#   uv run python scripts/setup_livekit_inbound.py --phone +15109379101
# See docs/TELEPHONY.md

# SIP recording — LiveKit Egress → MinIO (self-hosted on VPS)
# sudo bash scripts/setup_recordings_minio.sh
# RECORDINGS_S3_BUCKET=callmgmt-recordings
# RECORDINGS_S3_ACCESS_KEY=cmegressXXXX   # 3–20 chars, no hyphens
# RECORDINGS_S3_SECRET=...
# RECORDINGS_S3_REGION=us-east-1
# RECORDINGS_S3_ENDPOINT=https://paymercadogo.com   # NOT .../s3 (see nginx below)
# RECORDINGS_S3_FORCE_PATH_STYLE=true
# RECORDINGS_S3_PREFIX=callmanagement/recordings

# Optional: Postgres CRM (requires: uv sync --extra postgres)
# CRM_DATABASE_URL=postgresql://user:pass@host/db
```

### nginx

Reference: `scripts/deploy/nginx-callmgmt.conf`

```nginx
location = /callmgmt {
    return 301 https://$host/callmgmt/;
}

location ^~ /callmgmt/api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location ^~ /callmgmt/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**MinIO / SIP recordings** — append `scripts/deploy/nginx-minio-s3.conf` inside the same `server { }` block, **before** `location /`:

- Path-style S3 at `https://paymercadogo.com/callmgmt-recordings/...`
- MinIO listens on `127.0.0.1:9000` (`minio.service`)
- LiveKit Cloud egress needs a **public** endpoint; do not use `127.0.0.1` in `RECORDINGS_S3_ENDPOINT`

One-shot telephony + recordings bootstrap:

```bash
sudo APP_DIR=/opt/callmanagement PHONE=+15109379101 bash scripts/bootstrap_telephony.sh
```

### systemd

| Unit | Unit file | Command |
|------|-----------|---------|
| Admin API + UI | `scripts/deploy/callmanagement.service` | `.venv/bin/call-management-admin` |
| LiveKit worker | `scripts/deploy/callmanagement-worker.service` | `.venv/bin/python -m call_management.server start` |
| **Stack** | `scripts/deploy/callmanagement.target` | starts both (`PartOf` / `Wants`) |

Modern units use the project **venv** (not `~/.local/bin/uv run`), `Type=exec`, journal logging, restart limits, and sandboxing (`ProtectSystem=strict`, `PrivateTmp`, `NoNewPrivileges`). Writable paths: `data/` (+ `.env` for admin Settings UI).

```bash
# Preferred
sudo systemctl status callmanagement.target
sudo systemctl restart callmanagement.target
sudo bash /opt/callmanagement/scripts/deploy/manage.sh logs

# Or per-service
sudo systemctl restart callmanagement callmanagement-worker
sudo journalctl -u callmanagement-admin -u callmanagement-worker -f
# (SyslogIdentifier: callmanagement-admin / callmanagement-worker)
sudo journalctl -u callmanagement -u callmanagement-worker -f
```

After pulling unit file changes:

```bash
sudo bash /opt/callmanagement/scripts/deploy/manage.sh reload-units
# or: sudo bash scripts/deploy/install.sh --skip-nginx
```

### Updates (recommended workflow)

**From your dev machine** (has Node.js):

```bash
# 1. Push to GitHub
git push origin main

# 2. Pull on VPS
ssh mercadogo-vps 'cd /opt/callmanagement && git pull origin main'

# 3. Build UI locally and upload dist (VPS often has no npm)
cd admin-ui && VITE_BASE=/callmgmt/ npm run build
rsync -avz admin-ui/dist/ mercadogo-vps:/opt/callmanagement/admin-ui/dist/

# 4. Sync Python deps on VPS (if pyproject.toml changed)
ssh mercadogo-vps 'cd /opt/callmanagement && uv sync'

# 5. Restart stack
ssh mercadogo-vps 'sudo systemctl restart callmanagement.target'
# or: ssh mercadogo-vps 'sudo bash /opt/callmanagement/scripts/deploy/manage.sh restart'
```

**On VPS only** (if npm installed):

```bash
cd /opt/callmanagement
git pull origin main
cd admin-ui && VITE_BASE=/callmgmt/ npm run build
sudo systemctl restart callmanagement.target
```

### Health check

```bash
curl -s http://127.0.0.1:8080/api/health
curl -s https://paymercadogo.com/callmgmt/api/health
```

### Demo tenant after deploy

```bash
cd /opt/callmanagement
uv run python scripts/seed_demo_company.py
sudo systemctl restart callmanagement.target
```

Creates **Café Central** (`cafe-central`) with 3 agentes de demo.

## Admin web — root path (localhost)

```bash
cd admin-ui && npm run build
uv run call-management-admin
```

No `VITE_BASE` needed. Open http://127.0.0.1:8080

## LiveKit agent worker

### Development (hot reload)

```bash
uv run -m call_management.server dev
```

### Production

```bash
uv run -m call_management.server start
# or: call-management start
```

Requires valid `LIVEKIT_*`. On VPS, use `callmanagement-worker.service`.

Worker registers as `call-management`. Inbound PSTN needs a **dispatch rule** in LiveKit Cloud (script or manual). Full guide: [TELEPHONY.md](TELEPHONY.md).

```bash
# Verify worker registered
journalctl -u callmanagement-worker -n 30 | grep registered

# Create or verify dispatch rule for your DID
uv run python scripts/setup_livekit_inbound.py --phone +15109379101
```

### Docker (agent worker)

```bash
docker build -t call-management .
docker run -d --name call-management \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  call-management
```

Healthcheck: `scripts/healthcheck.py`

## Database

| File | Variable / path | Contents |
|------|-----------------|----------|
| Platform | `data/platform.db` | Tenants, agents, phone routes, schedules, webhooks |
| CRM per tenant | `data/tenants/{id}/crm.db` | Customers, calls, appointments |
| Admin auth | `ADMIN_AUTH_DB_PATH` | Users, sessions, passkeys |
| Legacy CRM | `CRM_DB_PATH` | Migrated to default tenant on startup |

Initialize legacy CRM:

```bash
uv run python scripts/init_crm.py
```

Demo banking customers seed on admin startup (`demo_seed.py`).

**PostgreSQL:** Set `CRM_DATABASE_URL` and install `asyncpg` (`uv sync --extra postgres`). Uses row-level `tenant_id` isolation. Without asyncpg, falls back to SQLite per tenant.

**SIP recordings:** Run `scripts/setup_recordings_minio.sh` (or `bootstrap_telephony.sh`). Worker starts LiveKit egress on connect; on hangup persists the call record and attaches `/api/calls/{id}/recording` when egress completes. See [TELEPHONY.md](TELEPHONY.md#grabación-sip).

## Coexistence with other services (paymercadogo VPS)

| App | Port | Notes |
|-----|------|-------|
| mercadogo | 5000 | Existing app |
| loan | 5001 | Existing app |
| jukebox | 5055 | Existing app |
| **Call Management** | **8080** (localhost) | `/callmgmt/*` only |
| **MinIO** | **9000** (localhost) | S3 API; public via `/callmgmt-recordings/` |

Call Management uses **SQLite** in `/opt/callmanagement/data/` — does not share Postgres with other apps.

SIP recordings are mirrored to `data/recordings/{tenant_id}/` after egress completes.

Backup nginx before changes:

```bash
sudo cp /etc/nginx/sites-available/paymercadogo /etc/nginx/sites-available/paymercadogo.bak.$(date +%s)
sudo nginx -t && sudo systemctl reload nginx
```

## Security checklist

- [ ] Change `ADMIN_PASSWORD` from default
- [ ] `.env` mode `600`, owned by `ubuntu`
- [ ] HTTPS for passkeys (`ADMIN_RP_ID` / `ADMIN_ORIGIN` with correct path)
- [ ] Do not commit `.env` or `data/*.db`
- [ ] Use `playground` role for external testers
- [ ] Rotate `XAI_API_KEY` if exposed
- [ ] Webhook secrets recommended for all events (`call.started`, `call.ended`, `appointment.*`, `agent.handoff`)
- [ ] Rotate API keys after sharing; scopes mínimos (`calls.read`, etc.)
- [ ] `RECORDINGS_S3_*` only if using LiveKit Egress for SIP audio

## Troubleshooting

| Symptom | Check |
|---------|-------|
| 502 on `/callmgmt/` | `systemctl status callmanagement.target`, port 8080, `manage.sh health` |
| UI blank / assets 404 | Rebuild with `VITE_BASE=/callmgmt/`, rsync `dist/` |
| Voice won't connect | `XAI_API_KEY`, `/api/chat/status` → `xai_voice_ready` |
| LiveKit / SIP fails | `systemctl status callmanagement-worker`, `manage.sh logs worker`, `LIVEKIT_*` (WebSocket URL, not SIP subdomain) |
| Call rings, no agent | Dispatch rule → `call-management`; worker Connected in LiveKit Agents |
| Wrong agent / no CRM route | DID en E.164 en **Mis agentes** (ej. `+15109379101`) |
| No calls in analytics | Tenant context (`X-Tenant-Id`), data in `data/tenants/*/crm.db` |
| Passkey fails | `ADMIN_ORIGIN` must be `https://paymercadogo.com/callmgmt` (no trailing issues) |
| git pull conflicts on VPS | `git stash -u` then `git pull`, or reset to `origin/main` |

## Repository

- **GitHub:** https://github.com/Zombie10/CallManagement.git
- **Branch:** `main`
- **CI:** ruff + pytest on push