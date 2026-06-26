# Agents & tools

## Agent roster

| ID | Language default | Purpose |
|----|------------------|---------|
| `receptionist` | en | Short greeting, listen, route to specialist |
| `banking_support` | es | BAC Credomatic banking: accounts, cards, blocks |
| `support` | en | General support, billing, scheduling |
| `sales` | en | Leads, pricing, meeting booking |
| `technical` | en | Engineering, diagnostics, integrations |
| `escalation` | en | Supervisor queue, empathy, tickets |

Profiles are persisted in `data/agent_profiles.yaml` (editable in admin **Agents** page). Defaults live in `src/call_management/agents/`.

## Phone-call behavior

All agents share natural phone style via `phone_style.py` and `get_effective_instructions()`:

- Listen first — let the caller explain before asking for data
- One question at a time — no questionnaires
- Do not ask for name/phone at the start unless required for the task
- Do not repeat questions for information already given
- Short spoken replies in voice mode

Agents **never assume caller identity** at connect. CRM lookup happens only when the caller provides a phone number.

## Banking support (`banking_support`)

Spanish-language agent for BAC Credomatic scenarios.

**Opening:** «BAC Credomatic, buenos días, ¿en qué le puedo ayudar?»

**Tools:**

| Tool | Description |
|------|-------------|
| `lookup_customer` | CRM lookup — requires `phone_number` from caller |
| `verify_bac_account` | Last 4 digits of BAC account |
| `verify_debit_card` | Last 4 digits + optional expiry |
| `block_debit_card_temporarily` | Temporary card block |
| `get_account_summary` | Products summary after lookup |
| `to_escalation` / `to_receptionist` | Handoffs |

**Demo customers** (seeded in CRM — caller says phone in voice):

| Name | Phone |
|------|-------|
| Reynaldo | +15103750043 |
| Francisco | +15105551234 |

Demo data: `src/call_management/crm/banking_data.py`. Never expose full card numbers in speech.

## Handoffs

Receptionist routes via function tools:

- `to_support`, `to_sales`, `to_technical`, `to_scheduling`, `to_banking_support`, `to_escalation`

Any agent can return to receptionist (`to_receptionist`) or escalate (`escalate_to_human`).

Handoffs update `CallContext` (notes, purpose, previous agent) and swap the active LiveKit agent.

## xAI tools (per agent)

Configured in agent profiles and `.env`:

| Tool | Type | Description |
|------|------|-------------|
| `web_search` | Built-in | Public web search |
| `x_search` | Built-in | X/Twitter search |
| `file_search` | Built-in | Vector store RAG |
| `code_interpreter` | Built-in | Python sandbox |
| Remote MCP | Built-in | External MCP servers (Zendesk, KB, etc.) |
| `lookup_customer` | Custom | CRM (voice: server-side in playground) |
| `schedule_appointment` | Custom | Callbacks |
| SIP tools | Custom | Transfer, end call (LiveKit worker only) |

### Environment

```bash
XAI_ENABLE_WEB_SEARCH=true
XAI_ENABLE_X_SEARCH=false
XAI_ENABLE_FILE_SEARCH=false
XAI_ENABLE_CODE_INTERPRETER=false
XAI_ENABLE_REMOTE_MCP=false
# XAI_MCP_SERVERS=[...]
```

### Voice API schemas

Function tool JSON schemas for the xAI browser voice path: `src/call_management/agents/registry.py` (`build_voice_function_tools`).

## Customizing an agent

1. **Admin UI** — Agents page: instructions, voice, locale, tools, function tools.
2. **Code** — Subclass `BaseAgent` in `src/call_management/agents/`, register in `registry.py` and `agents/__init__.py`.
3. **Console test** — `call-management console -a your_agent -q`

### Adding a new agent

```python
# src/call_management/agents/my_agent.py
class MyAgent(BaseAgent):
    def __init__(self) -> None:
        super().__init__(
            name="my_agent",
            instructions="...",
        )
```

Register in `_AGENT_CLASSES` in `registry.py` and add to `AGENT_OPTIONS` in `admin-ui/src/lib/agents.ts`.

## VIP routing

When `VIP_SKIP_RECEPTIONIST=true` and caller is marked VIP in CRM, routing can skip receptionist (configured in entrypoint / dispatch metadata).

## Locales

Per-agent `locale`: `en`, `es`, or `multi`. Banking defaults to Spanish. Set `DEFAULT_LOCALE` in `.env` as fallback.