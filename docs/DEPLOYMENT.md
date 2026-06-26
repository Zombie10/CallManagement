# Deployment

This project has two deployable components:

1. **Admin web** — FastAPI + React (`call-management-admin`) — CRM UI and playground
2. **LiveKit agent worker** — `call-management start` — real SIP/room voice agents

They can run on the same or different hosts.

## Admin web — VPS (nginx + systemd)

Current production example: **https://paymercadogo.com/callmgmt/** on Ubuntu VPS with existing nginx + Let's Encrypt.

### Prerequisites

- Ubuntu 22.04+ (or similar)
- nginx with SSL already configured for your domain
- Git, curl
- Port `8080` free on `127.0.0.1`

### First-time install

```bash
# On the server
sudo mkdir -p /opt/callmanagement/data
sudo chown ubuntu:ubuntu /opt/callmanagement

# Clone
git clone https://github.com/Zombie10/CallManagement.git /opt/callmanagement
cd /opt/callmanagement

# Create production .env (see below)
nano .env

# Build admin UI with subpath (if using /callmgmt/)
cd admin-ui && npm ci && VITE_BASE=/callmgmt/ npm run build

# Run installer (uv, systemd, nginx snippet)
sudo bash scripts/deploy/install.sh
```

### Production `.env` example

```bash
# xAI (required for voice playground)
XAI_API_KEY=xai-...

MODEL_PROVIDER=xai
USE_GROK_REALTIME=true
GROK_REALTIME_MODEL=grok-voice-latest
GROK_REALTIME_VOICE=ara

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

# LiveKit (optional — only for LiveKit voice mode in playground + worker)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

### nginx

The installer inserts a snippet into your existing HTTPS `server` block **before** `location /`, so other apps on the same vhost are untouched.

Manual reference: `scripts/deploy/nginx-callmgmt.conf`

```nginx
location = /callmgmt {
    return 301 https://$host/callmgmt/;
}

location ^~ /callmgmt/api/ {
    proxy_pass http://127.0.0.1:8080/api/;
    # ... standard proxy headers ...
}

location ^~ /callmgmt/ {
    proxy_pass http://127.0.0.1:8080/;
    # ... standard proxy headers, WebSocket upgrade ...
}
```

### systemd

Service file: `scripts/deploy/callmanagement.service`

```bash
sudo systemctl status callmanagement
sudo systemctl restart callmanagement
sudo journalctl -u callmanagement -f
```

### Subdomain alternative

If you prefer `call.example.com` instead of a path:

1. Add DNS **A** record → server IP
2. Create a dedicated nginx `server` block
3. Build UI with `npm run build` (no `VITE_BASE`)
4. Set `ADMIN_ORIGIN=https://call.example.com` and `ADMIN_RP_ID=call.example.com`
5. Run `sudo certbot --nginx -d call.example.com`

### Updates

```bash
ssh ubuntu@<server>
cd /opt/callmanagement
git pull

# Rebuild UI if frontend changed
cd admin-ui && VITE_BASE=/callmgmt/ npm run build

# Or upload dist from your machine:
# rsync -avz admin-ui/dist/ ubuntu@<server>:/opt/callmanagement/admin-ui/dist/

sudo systemctl restart callmanagement
```

### Health check

```bash
curl -s http://127.0.0.1:8080/api/health
curl -s https://paymercadogo.com/callmgmt/api/health
```

## Admin web — root path (localhost / dedicated host)

For `http://127.0.0.1:8080` or a dedicated subdomain at `/`:

```bash
cd admin-ui && npm run build
uv run call-management-admin
```

No `VITE_BASE` needed.

## LiveKit agent worker

### Development (hot reload)

```bash
uv run -m call_management.server dev
```

### Production

```bash
uv run -m call_management.server start
# or
call-management start
```

Requires valid `LIVEKIT_*` credentials. Deploy alongside admin or on a separate VM.

### Docker (agent worker)

```bash
docker build -t call-management .
docker run -d --name call-management \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  call-management
```

Healthcheck uses `scripts/healthcheck.py`.

### LiveKit Cloud

See [LiveKit Agents deployment](https://docs.livekit.io/agents/ops/deployment/).

## Database

The admin app and agent worker use **SQLite** by default:

| File | Variable |
|------|----------|
| CRM | `CRM_DB_PATH` |
| Admin users | `ADMIN_AUTH_DB_PATH` |

Initialize CRM:

```bash
uv run python scripts/init_crm.py
```

Demo banking customers are seeded on admin startup (`demo_seed.py`).

**PostgreSQL:** The CRM layer is SQLite-only today. To use Postgres, extend `crm/database.py` or sync SQLite → Postgres externally.

## Coexistence with other services

The paymercadogo VPS runs mercadogo (5000), loan (5001), jukebox (5055), and PostgreSQL for those apps. Call Management:

- Listens on **8080** (localhost only)
- Uses **SQLite** in `/opt/callmanagement/data/` — does not share Postgres
- nginx routes only `/callmgmt/*` — does not alter `/` or `/jukebox/`

Always backup nginx before changes:

```bash
sudo cp /etc/nginx/sites-available/paymercadogo /etc/nginx/sites-available/paymercadogo.bak.$(date +%s)
sudo nginx -t && sudo systemctl reload nginx
```

## Security checklist

- [ ] Change `ADMIN_PASSWORD` from default
- [ ] Keep `.env` mode `600`, owned by service user
- [ ] Use HTTPS for passkeys (`ADMIN_RP_ID` / `ADMIN_ORIGIN`)
- [ ] Do not commit `.env` or `data/*.db`
- [ ] Restrict playground role for external testers (`playground` RBAC)
- [ ] Rotate `XAI_API_KEY` if exposed

## Troubleshooting

| Symptom | Check |
|---------|-------|
| 502 on `/callmgmt/` | `systemctl status callmanagement`, port 8080 listening |
| Voice won't connect | `XAI_API_KEY` in `.env`, `/api/chat/status` → `xai_voice_ready` |
| LiveKit mode fails | Worker running, `LIVEKIT_*` set, `/api/livekit/status` |
| Login works but UI blank | Rebuild `admin-ui/dist` with correct `VITE_BASE` |
| Agent identifies caller immediately | Expected fixed — agent must ask for phone; check latest deploy |
| Assets 404 | `VITE_BASE` must match nginx path prefix |