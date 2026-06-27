# Telefonía — LiveKit + SIP

Guía para recibir llamadas PSTN (celular/fijo) en Call Management usando [LiveKit Telephony](https://docs.livekit.io/telephony/).

**Producción actual:** proyecto LiveKit **call management**, número de prueba US `+15109379101`.

## Arquitectura

```
Celular → PSTN → LiveKit (número / SIP) → Dispatch rule → room call-*
    → Worker `call-management` (VPS) → AgentSession → agentes (receptionist, banking, …)
    → CRM + Supervisor + grabación opcional
```

El worker se registra con `agent_name="call-management"` (ver `server.py`). La dispatch rule **debe** apuntar a ese nombre.

## Un proyecto LiveKit, tres identificadores

En [cloud.livekit.io](https://cloud.livekit.io) el mismo proyecto muestra distintos valores según el uso:

| Concepto | Ejemplo (call management) | Uso |
|--------|---------------------------|-----|
| **Project ID** | `p_39db3sg0f79` | Identificador interno, CLI `lk project list` |
| **SIP URI** | `sip:39db3sg0f79.sip.livekit.cloud` | Trunks SIP **externos** (Telnyx, DIDWW) envían INVITE aquí |
| **WebSocket URL** | `wss://call-management-6g9fmqf0.livekit.cloud` | Worker, API, playground LiveKit |

Las **API keys** (Settings → Keys) funcionan con la **WebSocket URL**, no con el subdominio del SIP URI.

```bash
# Correcto en .env del worker
LIVEKIT_URL=wss://call-management-6g9fmqf0.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...

# Incorrecto — 401 con las mismas keys
# LIVEKIT_URL=wss://39db3sg0f79.livekit.cloud
```

## Opciones de número telefónico

### A) LiveKit Phone Numbers (recomendado para empezar)

1. LiveKit Cloud → **Telephony** → **Phone numbers** → comprar/asignar DID (ej. `+15109379101`).
2. Crear **dispatch rule** (ver abajo) y asignarla al número.
3. No hace falta inbound trunk manual ni proveedor SIP externo.

### B) Proveedor SIP externo (Telnyx, DIDWW, Twilio, …)

1. Comprar DID en el proveedor (ej. Nicaragua +505 con DIDWW o Telnyx).
2. Configurar el trunk del proveedor con destino **SIP endpoint** LiveKit: `39db3sg0f79.sip.livekit.cloud` (sin `sip:`).
3. En LiveKit: **inbound trunk** + **dispatch rule**.
4. Guías: [SIP trunk setup](https://docs.livekit.io/telephony/start/sip-trunk-setup/), [Telnyx + LiveKit](https://docs.livekit.io/sip/quickstarts/configuring-telnyx-trunk.md).

### C) Prueba sin PSTN

Admin → **Playground** → modo **LiveKit producción** (misma pipeline, sin marcar por teléfono).

## Checklist de configuración

### 1. Variables en el servidor (VPS o local)

```bash
LIVEKIT_URL=wss://call-management-6g9fmqf0.livekit.cloud
LIVEKIT_API_KEY=API...
LIVEKIT_API_SECRET=...
XAI_API_KEY=xai-...
MODEL_PROVIDER=xai
USE_GROK_REALTIME=true
MAX_CONCURRENT_CALLS_PER_TENANT=12
```

Reiniciar tras cambios:

```bash
sudo systemctl restart callmanagement callmanagement-worker
```

### 2. Worker conectado

```bash
journalctl -u callmanagement-worker -n 20 | grep registered
# Debe mostrar: agent_name: call-management
```

En LiveKit Cloud → **Agents**: worker **Connected**.

Dashboard admin → **LiveKit listo: Sí**.

### 3. Dispatch rule (obligatoria)

Sin dispatch rule la llamada no crea sala ni despacha el agente.

**Automático (recomendado):**

```bash
cd /opt/callmanagement   # o raíz del repo
uv run python scripts/setup_livekit_inbound.py --phone +15109379101
```

Idempotente: si la regla ya existe, no duplica.

**Manual** — LiveKit Cloud → Telephony → Dispatch rules → JSON:

```json
{
  "name": "Call Management inbound",
  "rule": {
    "dispatchRuleIndividual": {
      "roomPrefix": "call-"
    }
  },
  "inboundNumbers": ["+15109379101"],
  "roomConfig": {
    "agents": [
      {
        "agentName": "call-management"
      }
    ]
  }
}
```

Con **LiveKit Phone Numbers**, asigna esta regla al DID en la página del número.

**Trunk externo:** añade `--with-trunk` al script o crea inbound trunk en la consola.

### 4. Agente en Call Management

Admin → **Mis agentes** (empresa activa):

- Teléfono E.164 exacto: `+15109379101` (sin espacios)
- Estado: **Activo**
- Plantilla, voz, instrucciones según necesidad

O usar **Setup** (`/setup`) en el admin.

El routing usa `sip.trunkPhoneNumber` → `platform.db` → `phone_routes` → instancia de agente.

### 5. Probar

Marca `+1 510 937 9101` (desde US o internacional desde otro país).

Verificar:

- LiveKit → Telephony → call logs
- Admin → **Supervisor** (llamada activa)
- Admin → **Llamadas** (registro al colgar)

[Testing guide LiveKit](https://docs.livekit.io/telephony/testing/)

## Límites de concurrencia

Tres capas (ver [ADMIN.md](ADMIN.md)):

| Capa | Config |
|------|--------|
| Empresa | `MAX_CONCURRENT_CALLS_PER_TENANT` en `.env` |
| Agente | Mis agentes → máx. simultáneas |
| DID | Mis agentes → máx. por número |

## Grabación SIP (opcional)

Variables `RECORDINGS_S3_*` + credenciales LiveKit. El worker inicia Egress al conectar la llamada. Ver [DEPLOYMENT.md](DEPLOYMENT.md).

## Llamadas salientes

Requiere proveedor SIP externo (LiveKit Phone Numbers no soporta outbound aún). Configura `SIP_TRUNK_ID` y outbound trunk en LiveKit. Ver `examples/outbound_call.py`.

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Ocupa / no conecta | Dispatch rule ausente o número en otro proyecto LiveKit | Verificar proyecto `p_39db3sg0f79`, regla y DID |
| Suena, sin agente | Worker caído o `LIVEKIT_*` incorrectos | `systemctl status callmanagement-worker`, logs |
| Agente genérico | DID no en Mis agentes | `+15109379101` en instancia activa |
| 401 en worker | URL equivocada (SIP subdomain vs WebSocket URL) | Usar `wss://call-management-6g9fmqf0.livekit.cloud` |
| 403 SIP | Credenciales trunk externo | Revisar usuario/contraseña en proveedor y LiveKit |

```bash
# Logs worker
sudo journalctl -u callmanagement-worker -f

# Verificar dispatch vía API (en el servidor)
uv run python scripts/setup_livekit_inbound.py --phone +15109379101
# Si existe: "Dispatch rule already exists"
```

## Nicaragua (+505) y otros países

LiveKit Phone Numbers puede no tener +505. Opciones:

1. **Prueba inmediata:** número US de LiveKit; marcar desde Nicaragua (internacional).
2. **+505 rápido:** [DIDWW](https://www.didww.com/) móvil +505 → SIP hacia `39db3sg0f79.sip.livekit.cloud`.
3. **Producción:** [Telnyx](https://telnyx.com/phone-numbers/nicaragua) + guía LiveKit Telnyx.

## Referencias

- [LiveKit Telephony](https://docs.livekit.io/telephony/)
- [Dispatch rules](https://docs.livekit.io/telephony/accepting-calls/dispatch-rule/)
- [SIP troubleshooting](https://docs.livekit.io/reference/telephony/troubleshooting/)
- [DEPLOYMENT.md](DEPLOYMENT.md) — VPS, systemd, nginx
- [ADMIN.md](ADMIN.md) — consola, Setup, Supervisor