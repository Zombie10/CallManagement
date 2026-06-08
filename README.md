# Call Management

Production-ready **Call Management System** built with the [LiveKit Agents](https://github.com/livekit/agents) framework.

AI-powered voice agents for modern contact centers and business telephony:

- Intelligent inbound call handling & routing (receptionist, support, sales, technical)
- Multi-agent workflows with seamless handoffs
- Full SIP telephony integration (inbound + outbound calls)
- CRM integration & customer context
- Appointment scheduling & callbacks
- Call transfers (cold & warm), conferencing, and lifecycle management
- Structured call logging, notes, and analytics hooks
- Production-grade agent server with prewarming, graceful shutdowns

## Features

| Feature                    | Description                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| Multi-Agent Handoff        | Receptionist → Specialist agents with shared context & history             |
| Telephony Native           | Works seamlessly with LiveKit SIP (Twilio, Telnyx, Plivo, etc.)            |
| SIP Tools                  | End calls, warm/cold transfers, add participants, DTMF handling            |
| Customer Context           | Automatic CRM lookup by phone number, persistent notes & history           |
| Scheduling                 | Book appointments, schedule callbacks with tools                           |
| Outbound Calling           | Programmatic + agent-initiated outbound dials                              |
| Flexible Models            | Use LiveKit Inference or direct OpenAI/Deepgram/Cartesia/ElevenLabs/etc.   |
| Testing Modes              | `console` (local mic), `dev` (hot reload), `start` (production)            |
| Observability Ready        | Works great with LiveKit Cloud transcripts, traces, and dispatch metadata  |

## Architecture Overview

```
Phone Call (SIP)
    ↓
LiveKit SIP Trunk + Dispatch Rule
    ↓
LiveKit Room + SIP Participant (with attributes: phone, trunk, callStatus)
    ↓
CallManagement AgentServer (dispatched automatically)
    ↓
AgentSession with VAD + STT/LLM/TTS pipeline
    ↓
ReceptionistAgent (or context-specific entry agent)
    ↓ (tool-driven handoff)
Specialist Agents (Support / Sales / Technical / Escalation)
    ↓ (SIP tools)
Transfer / Conference / End Call
```

Uses the proven patterns from LiveKit's restaurant_agent and SIP lifecycle recipes.

## Quick Start (Local Testing)

### 1. Install dependencies

```bash
uv sync
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your LiveKit credentials + model keys
```

### 3. (Recommended) Use xAI Grok for Voice

This project has first-class support for **xAI / Grok** as the voice brain.

1. Get an API key at [https://console.x.ai/](https://console.x.ai/)
2. In your `.env`, set:

```bash
XAI_API_KEY=xai-...

MODEL_PROVIDER=xai
USE_GROK_REALTIME=true          # Full Grok Voice Agent API (best)
GROK_REALTIME_VOICE=Ara
```

You can also use the classic pipeline (`USE_GROK_REALTIME=false`) with Grok STT + LLM + TTS individually.

Grok models excel at tool use, reasoning, and natural conversation — perfect for call management.

### 4. Run in console mode (uses your local microphone/speakers)

```bash
uv run -m call_management.server console
# or the installed script:
call-management console
```

This is the fastest way to test the conversation flow without any telephony.

### 4. Run in development mode (with hot reload)

```bash
uv run -m call_management.server dev
```

Connect via the [LiveKit Agents Playground](https://agents-playground.livekit.io/) or any LiveKit client SDK.

## Telephony Setup (Real Phone Calls)

### Prerequisites

- A LiveKit Cloud project (or self-hosted LiveKit server)
- A SIP trunk provider (recommended: Telnyx, Twilio, Plivo)
- A phone number purchased from the provider

### High-Level Steps

1. **Create Inbound Trunk** in LiveKit (or via API/CLI)
2. **Create Dispatch Rule** that routes calls to your agent
3. **Configure your SIP provider** to send calls to the LiveKit trunk
4. **Run your agent** (`dev` or `start`)
5. Call your phone number — the agent answers automatically

See the full guide in the [LiveKit Telephony docs](https://docs.livekit.io/telephony/).

### Sample Dispatch Rule (JSON)

```json
{
  "name": "CallManagement-Inbound",
  "type": "direct",
  "room": "call-${sip.phoneNumber}-${timestamp}",
  "agent": {
    "agent_name": "call-management",
    "metadata": "{\"department\":\"support\"}"
  }
}
```

You can create dispatch rules via `lk sip dispatch create ...` CLI or the dashboard.

### Outbound Calls

The agent can initiate outbound calls using the `create_sip_participant` tool (requires `SIP_TRUNK_ID` in env).

You can also trigger outbound from your own backend using the LiveKit Server API.

## Project Structure

```
src/call_management/
├── __init__.py
├── server.py                 # AgentServer, prewarm, entrypoint, SIP event handlers
├── cli.py                    # CLI entrypoint wrapper
├── config.py                 # Settings, model selection
├── agents/
│   ├── __init__.py
│   ├── base.py               # BaseAgent with shared handoff + context logic
│   ├── receptionist.py
│   ├── support.py
│   ├── sales.py
│   ├── technical.py
│   └── escalation.py
├── telephony/
│   ├── __init__.py
│   └── sip_tools.py          # end_call, transfer, add_participant, etc.
├── crm/
│   ├── __init__.py
│   └── database.py           # SQLite-backed customer & call records
├── scheduling/
│   └── calendar.py           # Mock scheduling tools
└── utils/
    └── logging.py
```

## Customization

- **Change voices / models**: Edit `config.py` or pass via inference strings.
- **Add new departments**: Create a new agent class inheriting from `BaseAgent` and register it.
- **Connect real CRM**: Replace the SQLite layer in `crm/database.py` with your Postgres/REST/GraphQL client.
- **Add tools**: Use the `@function_tool` decorator. Tools can return text or trigger agent handoff by returning `(next_agent, message)`.
- **Dispatch metadata**: Read `ctx.job.metadata` in the entrypoint to select initial agent or load business-specific config.

## Production Deployment

### LiveKit Cloud (Recommended)

```bash
# After testing locally
uv run -m call_management.server start
```

Deploy as a Docker container or use LiveKit's managed agent hosting (see docs).

### Self-hosted / Kubernetes

Use the official [LiveKit Agents deployment guides](https://docs.livekit.io/agents/ops/deployment.md).

Key environment variables for production:

- Set proper `LOG_LEVEL=INFO`
- Use a persistent volume for `CRM_DB_PATH`
- Enable `preemptive_generation` and good turn detection for lower latency
- Monitor via LiveKit Cloud observability or your own logging + traces

## Testing & Quality

```bash
# Format & lint
uv run ruff format
uv run ruff check --fix

# Run tests
uv run pytest
```

## Next Steps & Roadmap Ideas

- Real calendar integration (Google Calendar, Calendly)
- Human escalation via SMS / Slack / Zendesk ticket + warm transfer
- Call recording + post-call AI summarization
- DTMF fallback + IVR-style menu as backup
- Analytics dashboard (FastAPI + HTMX or Streamlit)
- Multi-language support
- PCI-compliant payment collection flows

## Resources

- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [LiveKit Telephony / SIP](https://docs.livekit.io/telephony/)
- [Voice AI Quickstart](https://docs.livekit.io/agents/start/voice-ai.md)
- [Restaurant Agent Example](https://github.com/livekit/agents/blob/main/examples/voice_agents/restaurant_agent.py) (heavily inspired by this)
- [SIP Lifecycle Recipe](https://docs.livekit.io/reference/recipes/sip_lifecycle/)
- LiveKit Community Slack

## License

MIT

## Contributing

Pull requests welcome! This is intended as a strong starting point / reference implementation for real-world call center automation with LiveKit Agents.

---

Built with ❤️ using LiveKit Agents.
