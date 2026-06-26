# Call Management — Admin UI

React + Vite + Tailwind admin console for Call Management.

## Scripts

```bash
npm install
npm run dev      # http://127.0.0.1:5173 — proxies /api to :8080
npm run build    # output: dist/ — served by call-management-admin
npm run preview
```

Start the API first:

```bash
uv run call-management-admin
```

## Production build

**Root path** (e.g. `http://127.0.0.1:8080`):

```bash
npm run build
```

**Subpath** (e.g. `https://example.com/callmgmt/`):

```bash
VITE_BASE=/callmgmt/ npm run build
```

The `VITE_BASE` value must match the nginx location prefix. See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).

## Structure

```
src/
├── pages/        # Dashboard, Playground, Agents, Customers, ...
├── components/   # Select, ToolCallLog, Layout, ...
├── hooks/        # useXaiVoice, useLiveKitVoice, useChatAutoScroll
├── lib/          # api.ts, agents.ts, audio.ts, webauthn.ts
└── contexts/     # AuthContext
```

## Playground

- **xAI direct** — browser WebSocket to Grok Voice; tools via `/api/voice/tools/execute`
- **LiveKit** — production agent worker pipeline
- **Text** — multi-agent chat with tool log

Full docs: [docs/ADMIN.md](../docs/ADMIN.md)