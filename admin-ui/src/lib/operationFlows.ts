/** Flujos operativos interactivos para la página Flujos / Operación. */

export type FlowCategory = "vision" | "llamadas" | "agentes" | "pruebas" | "admin";

export type FlowNodeKind = "start" | "process" | "decision" | "system" | "end" | "external";

export type FlowBranch = {
  label: string;
  targetId: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
};

export type FlowStep = {
  id: string;
  title: string;
  description?: string;
  kind: FlowNodeKind;
  actor?: string;
  /** Next step when linear; ignored if branches present. */
  next?: string;
  branches?: FlowBranch[];
  details?: string[];
  tags?: string[];
};

export type FlowSection = {
  id: string;
  title: string;
  summary: string;
  category: FlowCategory;
  durationHint?: string;
  steps: FlowStep[];
};

export const FLOW_CATEGORIES: Array<{ id: FlowCategory | "all"; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "vision", label: "Visión" },
  { id: "llamadas", label: "Llamadas" },
  { id: "agentes", label: "Agentes" },
  { id: "pruebas", label: "Pruebas" },
  { id: "admin", label: "Admin" },
];

export const OPERATION_FLOWS: FlowSection[] = [
  {
    id: "mapa-general",
    title: "Mapa general del negocio",
    summary: "Piezas de la plataforma y cómo se conectan clientes, admin y voz xAI.",
    category: "vision",
    durationHint: "Vista 2 min",
    steps: [
      {
        id: "caller",
        title: "Cliente llama o escribe",
        description: "Llamante PSTN o staff en el admin.",
        kind: "start",
        actor: "Cliente / staff",
        next: "channels",
        details: ["Teléfono real, playground o chat de prueba."],
      },
      {
        id: "channels",
        title: "Canal de entrada",
        description: "SIP, voz xAI, LiveKit playground o chat.",
        kind: "decision",
        actor: "Plataforma",
        branches: [
          { label: "Teléfono PSTN", targetId: "livekit", tone: "ok" },
          { label: "Admin playground", targetId: "admin-api", tone: "neutral" },
        ],
      },
      {
        id: "livekit",
        title: "LiveKit Cloud",
        description: "Room + dispatch al worker call-management.",
        kind: "external",
        actor: "LiveKit",
        next: "worker",
        tags: ["SIP", "Rooms"],
      },
      {
        id: "admin-api",
        title: "Admin API + UI",
        description: "FastAPI sirve CRM, settings y playgrounds.",
        kind: "system",
        actor: "callmanagement.service",
        next: "xai",
        tags: ["FastAPI", "React"],
      },
      {
        id: "worker",
        title: "Worker de agentes",
        description: "Sesión de voz, cola, handoffs y tools.",
        kind: "system",
        actor: "callmanagement-worker",
        next: "xai",
      },
      {
        id: "xai",
        title: "xAI Grok Voice",
        description: "Speech-to-speech + TTS preview (voces oficiales xAI).",
        kind: "external",
        actor: "xAI",
        next: "crm",
        tags: ["Think Fast 2.0"],
      },
      {
        id: "crm",
        title: "CRM por empresa",
        description: "Clientes, llamadas y citas aislados por tenant.",
        kind: "process",
        actor: "Tenant DB",
        next: "done",
      },
      {
        id: "done",
        title: "Registro y operación",
        description: "Visible en Registros, Supervisor y Analytics.",
        kind: "end",
        actor: "Admin",
      },
    ],
  },
  {
    id: "multi-empresa",
    title: "Estructura multi-empresa",
    summary: "Orquestador → empresas → instancias de agente → CRM aislado.",
    category: "vision",
    steps: [
      {
        id: "orch",
        title: "Orquestador",
        description: "super_admin crea y gestiona empresas.",
        kind: "start",
        actor: "super_admin",
        next: "tenant",
      },
      {
        id: "tenant",
        title: "Empresa (tenant)",
        description: "Branding, plan, límites diarios y webhooks.",
        kind: "process",
        actor: "Platform DB",
        next: "instance",
        details: ["CRM en data/tenants/{id}/", "API keys por tenant"],
      },
      {
        id: "instance",
        title: "Instancia de agente",
        description: "Plantilla + voz xAI + DID + horario + estado.",
        kind: "process",
        actor: "Mis agentes",
        next: "template",
        branches: [
          { label: "Plantilla receptionist", targetId: "template", tone: "neutral" },
          { label: "Plantilla banking", targetId: "template", tone: "ok" },
        ],
      },
      {
        id: "template",
        title: "Plantilla sistema",
        description: "Comportamiento base en /agents (handoffs y tools).",
        kind: "system",
        next: "end",
        tags: ["receptionist", "support", "sales", "technical", "escalation", "banking_support"],
      },
      {
        id: "end",
        title: "Listo para recibir",
        description: "Con DID + worker online puede atender llamadas.",
        kind: "end",
      },
    ],
  },
  {
    id: "pstn",
    title: "Llamada telefónica PSTN",
    summary: "Flujo completo: marca DID → LiveKit → worker → Grok → CRM.",
    category: "llamadas",
    durationHint: "Producción",
    steps: [
      {
        id: "dial",
        title: "Cliente marca el DID",
        description: "Número de la empresa (LiveKit Phone o SIP externo).",
        kind: "start",
        actor: "Llamante",
        next: "lk",
      },
      {
        id: "lk",
        title: "LiveKit recibe la llamada",
        description: "Dispatch rule apunta a agent_name = call-management.",
        kind: "external",
        actor: "LiveKit Cloud",
        next: "job",
        tags: ["dispatch rule"],
      },
      {
        id: "job",
        title: "Worker toma el job",
        description: "entrypoint en server.py: room, from/to, SIP attrs.",
        kind: "system",
        actor: "Worker",
        next: "resolve",
      },
      {
        id: "resolve",
        title: "Resolver empresa y agente",
        description: "DID → tenant + instancia + plantilla.",
        kind: "process",
        next: "limits",
        details: ["to_number = línea marcada", "from_number = caller ID"],
      },
      {
        id: "limits",
        title: "¿Hay cupo?",
        description: "Límite diario + 3 capas de concurrencia.",
        kind: "decision",
        branches: [
          { label: "Cupo OK", targetId: "session", tone: "ok" },
          { label: "Lleno / límite día", targetId: "busy", tone: "warn" },
        ],
      },
      {
        id: "busy",
        title: "Mensaje de espera o cierre",
        description: "El agente informa cola, límite o reintentar mañana.",
        kind: "process",
        next: "session",
        tags: ["cola"],
      },
      {
        id: "session",
        title: "Sesión de voz con Grok",
        description: "Realtime xAI + tools + handoffs según plantilla.",
        kind: "process",
        actor: "xAI + Worker",
        next: "dialog",
        tags: ["Think Fast 2.0"],
      },
      {
        id: "dialog",
        title: "Diálogo y herramientas",
        description: "Escucha, tools CRM/SIP, posibles transferencias.",
        kind: "process",
        next: "hangup",
      },
      {
        id: "hangup",
        title: "Cierre de llamada",
        description: "Transcript, summary, webhooks, release de cola.",
        kind: "end",
        actor: "CRM + Supervisor",
        details: ["channel = sip", "Registros y analytics se actualizan"],
      },
    ],
  },
  {
    id: "did",
    title: "Resolución DID → agente",
    summary: "El número marcado define qué empresa y qué agente atiende.",
    category: "llamadas",
    steps: [
      {
        id: "to",
        title: "DID marcado (to_number)",
        description: "Atributos SIP / trunk phone number.",
        kind: "start",
        next: "lookup",
      },
      {
        id: "lookup",
        title: "Buscar asignación",
        description: "Platform store: número → instancia.",
        kind: "decision",
        branches: [
          { label: "Asignado y active", targetId: "hit", tone: "ok" },
          { label: "Sin match", targetId: "miss", tone: "warn" },
        ],
      },
      {
        id: "hit",
        title: "Tenant + instancia",
        description: "Voz xAI, locale e instrucciones de esa línea.",
        kind: "process",
        next: "hint",
      },
      {
        id: "miss",
        title: "Fallback",
        description: "Tenant default / plantilla receptionist.",
        kind: "process",
        next: "hint",
      },
      {
        id: "hint",
        title: "department_hint inicial",
        description: "Primer agente en la sesión (puede cambiar con handoff).",
        kind: "end",
      },
    ],
  },
  {
    id: "cola",
    title: "Cola y límites",
    summary: "Tres capas: empresa, agente y DID. Todas deben tener cupo.",
    category: "llamadas",
    steps: [
      {
        id: "in",
        title: "Nueva llamada concurrente",
        description: "try_acquire con límites resueltos del store.",
        kind: "start",
        next: "t1",
      },
      {
        id: "t1",
        title: "Capa empresa",
        description: "MAX_CONCURRENT_CALLS_PER_TENANT",
        kind: "decision",
        branches: [
          { label: "OK", targetId: "t2", tone: "ok" },
          { label: "Llena", targetId: "block", tone: "danger" },
        ],
      },
      {
        id: "t2",
        title: "Capa agente",
        description: "Máx. simultáneas de la instancia (opcional).",
        kind: "decision",
        branches: [
          { label: "OK / sin límite", targetId: "t3", tone: "ok" },
          { label: "Llena", targetId: "block", tone: "warn" },
        ],
      },
      {
        id: "t3",
        title: "Capa DID",
        description: "Máx. por número telefónico (opcional).",
        kind: "decision",
        branches: [
          { label: "OK / sin límite", targetId: "ok", tone: "ok" },
          { label: "Llena", targetId: "block", tone: "warn" },
        ],
      },
      {
        id: "block",
        title: "Slot no adquirido",
        description: "Sesión con nota de cola; Supervisor muestra capa bloqueada.",
        kind: "process",
        next: "release",
      },
      {
        id: "ok",
        title: "Slot adquirido",
        description: "Atiende con capacidad normal.",
        kind: "process",
        next: "release",
      },
      {
        id: "release",
        title: "Al colgar: release",
        description: "Libera cupo para la siguiente llamada.",
        kind: "end",
      },
    ],
  },
  {
    id: "horario",
    title: "Horario y estado",
    summary: "Pausado, draft o fuera de horario cambian el mensaje.",
    category: "agentes",
    steps: [
      {
        id: "s0",
        title: "Instancia resuelta",
        description: "Tras match de DID.",
        kind: "start",
        next: "status",
      },
      {
        id: "status",
        title: "¿Estado active?",
        description: "draft / paused no reciben la línea.",
        kind: "decision",
        branches: [
          { label: "active", targetId: "hours", tone: "ok" },
          { label: "paused / draft", targetId: "fallback", tone: "warn" },
        ],
      },
      {
        id: "hours",
        title: "¿Dentro de horario?",
        description: "Schedules por día de la semana.",
        kind: "decision",
        branches: [
          { label: "Sí", targetId: "serve", tone: "ok" },
          { label: "No", targetId: "after", tone: "warn" },
        ],
      },
      {
        id: "fallback",
        title: "Routing default",
        description: "No usa la instancia; receptionist genérico.",
        kind: "process",
        next: "end",
      },
      {
        id: "after",
        title: "After-hours",
        description: "Indica horario, mensaje o callback. No transferir.",
        kind: "process",
        next: "end",
      },
      {
        id: "serve",
        title: "Atiende normal",
        description: "increment_agent_calls + plantilla de la instancia.",
        kind: "end",
      },
      {
        id: "end",
        title: "Sesión de voz",
        description: "Continúa el diálogo con Grok.",
        kind: "end",
      },
    ],
  },
  {
    id: "dialogo",
    title: "Diálogo de atención",
    summary: "Cómo el agente escucha, razona y usa tools (estilo teléfono natural).",
    category: "agentes",
    steps: [
      {
        id: "on",
        title: "Sesión activa",
        description: "Grok Voice Think Fast 2.0 + server VAD.",
        kind: "start",
        actor: "xAI",
        next: "listen",
      },
      {
        id: "listen",
        title: "Escucha al caller",
        description: "No interroga al inicio; deja explicar el motivo.",
        kind: "process",
        next: "think",
      },
      {
        id: "think",
        title: "Razona en paralelo",
        description: "Puede planear tools mientras habla.",
        kind: "process",
        next: "need",
      },
      {
        id: "need",
        title: "¿Necesita herramienta?",
        description: "CRM, handoff, SIP o search xAI.",
        kind: "decision",
        branches: [
          { label: "Sí → tool", targetId: "tool", tone: "ok" },
          { label: "No → hablar", targetId: "speak", tone: "neutral" },
        ],
      },
      {
        id: "tool",
        title: "Ejecuta function / built-in",
        description: "Worker o /api/voice/tools/execute según canal.",
        kind: "system",
        next: "speak",
        tags: ["CRM", "handoff", "SIP"],
      },
      {
        id: "speak",
        title: "Respuesta corta",
        description: "Una pregunta a la vez; confirma solo lo irreversible.",
        kind: "process",
        next: "more",
      },
      {
        id: "more",
        title: "¿Sigue la llamada?",
        kind: "decision",
        branches: [
          { label: "Sí", targetId: "listen", tone: "ok" },
          { label: "Cuelga", targetId: "end", tone: "neutral" },
        ],
      },
      {
        id: "end",
        title: "Fin del diálogo",
        description: "Pasa a post-proceso de la llamada.",
        kind: "end",
      },
    ],
  },
  {
    id: "handoffs",
    title: "Recepción y handoffs",
    summary: "Cómo se enruta entre receptionist y especialistas.",
    category: "agentes",
    steps: [
      {
        id: "start",
        title: "Inicio de sesión",
        description: "Plantilla inicial (suele ser receptionist).",
        kind: "start",
        next: "vip",
      },
      {
        id: "vip",
        title: "¿VIP skip receptionist?",
        description: "Si VIP_SKIP_RECEPTIONIST y cliente VIP en CRM.",
        kind: "decision",
        branches: [
          { label: "Sí", targetId: "spec", tone: "ok" },
          { label: "No", targetId: "rec", tone: "neutral" },
        ],
      },
      {
        id: "rec",
        title: "Receptionist",
        description: "Saludo breve y escucha el motivo.",
        kind: "process",
        actor: "receptionist",
        next: "route",
      },
      {
        id: "route",
        title: "Elige destino",
        description: "function tools to_support, to_sales, to_banking…",
        kind: "decision",
        branches: [
          { label: "Soporte", targetId: "spec", tone: "ok" },
          { label: "Ventas", targetId: "spec", tone: "ok" },
          { label: "Banca", targetId: "spec", tone: "ok" },
          { label: "Escalación", targetId: "esc", tone: "warn" },
        ],
      },
      {
        id: "spec",
        title: "Especialista activo",
        description: "Cambia agente + CallContext + webhook agent.handoff.",
        kind: "process",
        next: "cont",
        tags: ["handoff"],
      },
      {
        id: "esc",
        title: "Escalation",
        description: "Empatía, ticket, posible humano.",
        kind: "process",
        actor: "escalation",
        next: "cont",
      },
      {
        id: "cont",
        title: "Continúa o vuelve",
        description: "Puede to_receptionist o end_call.",
        kind: "end",
      },
    ],
  },
  {
    id: "banking",
    title: "Soporte bancario BAC",
    summary: "Flujo en español con verificación y bloqueo temporal.",
    category: "agentes",
    steps: [
      {
        id: "in",
        title: "Entra a banking_support",
        description: "Por DID de banca o handoff desde recepción.",
        kind: "start",
        next: "hi",
      },
      {
        id: "hi",
        title: "Saludo BAC",
        description: "Buenos días, ¿en qué le puedo ayudar?",
        kind: "process",
        actor: "banking_support",
        next: "phone",
      },
      {
        id: "phone",
        title: "Pide teléfono del cliente",
        description: "No asume identidad al conectar.",
        kind: "process",
        next: "lookup",
      },
      {
        id: "lookup",
        title: "lookup_customer",
        description: "CRM tenant por phone_number.",
        kind: "system",
        next: "found",
      },
      {
        id: "found",
        title: "¿Encontrado?",
        kind: "decision",
        branches: [
          { label: "Sí → acción", targetId: "act", tone: "ok" },
          { label: "No → reintentar", targetId: "phone", tone: "warn" },
        ],
      },
      {
        id: "act",
        title: "Acción bancaria",
        description: "Resumen, verify account/card o bloqueo temporal.",
        kind: "process",
        next: "safe",
        tags: ["verify", "block"],
        details: ["Nunca dictar PAN completo en voz"],
      },
      {
        id: "safe",
        title: "Respuesta segura",
        description: "Confirma resultado y ofrece más ayuda.",
        kind: "end",
      },
    ],
  },
  {
    id: "tools",
    title: "Herramientas del agente",
    summary: "Built-ins xAI vs function tools de la app (CRM / handoff / SIP).",
    category: "agentes",
    steps: [
      {
        id: "need",
        title: "Modelo decide tool",
        description: "Durante la respuesta o antes de hablar.",
        kind: "start",
        next: "type",
      },
      {
        id: "type",
        title: "Tipo de herramienta",
        kind: "decision",
        branches: [
          { label: "Built-in xAI", targetId: "xai", tone: "ok" },
          { label: "Function CRM", targetId: "crm", tone: "neutral" },
          { label: "Handoff", targetId: "ho", tone: "warn" },
          { label: "SIP (solo worker)", targetId: "sip", tone: "danger" },
        ],
      },
      {
        id: "xai",
        title: "web_search / MCP / code",
        description: "Ejecuta en la nube de xAI.",
        kind: "external",
        next: "back",
      },
      {
        id: "crm",
        title: "CRM local",
        description: "lookup, notas, citas en el tenant.",
        kind: "system",
        next: "back",
      },
      {
        id: "ho",
        title: "Cambio de agente",
        description: "Actualiza contexto y tools del especialista.",
        kind: "process",
        next: "back",
      },
      {
        id: "sip",
        title: "Transfer / end_call",
        description: "LiveKit SIP APIs en el worker.",
        kind: "external",
        next: "back",
      },
      {
        id: "back",
        title: "Resultado al modelo",
        description: "Sigue hablando con el caller.",
        kind: "end",
      },
    ],
  },
  {
    id: "fin-llamada",
    title: "Fin de llamada",
    summary: "Post-proceso: cola, grabación, summary, webhooks.",
    category: "llamadas",
    steps: [
      {
        id: "close",
        title: "Cuelga o end_call",
        kind: "start",
        next: "rel",
      },
      {
        id: "rel",
        title: "Release de cola",
        description: "Libera capas empresa/agente/DID.",
        kind: "system",
        next: "rec",
      },
      {
        id: "rec",
        title: "Grabación opcional",
        description: "LiveKit Egress → MinIO/S3.",
        kind: "process",
        next: "sum",
        tags: ["Egress"],
      },
      {
        id: "sum",
        title: "Transcript + summary",
        description: "Post-call LLM si está habilitado.",
        kind: "process",
        next: "crm",
      },
      {
        id: "crm",
        title: "Persiste en CRM",
        description: "calls, outcome, notas, channel.",
        kind: "system",
        next: "wh",
      },
      {
        id: "wh",
        title: "Webhooks call.ended",
        description: "Integraciones externas + auditoría.",
        kind: "end",
        tags: ["webhooks"],
      },
    ],
  },
  {
    id: "playground-xai",
    title: "Playground voz xAI",
    summary: "Prueba en browser: WebSocket directo a Grok + tools en la API.",
    category: "pruebas",
    steps: [
      {
        id: "pick",
        title: "Elegir empresa y agente",
        description: "Playground del admin.",
        kind: "start",
        actor: "Operador",
        next: "sess",
      },
      {
        id: "sess",
        title: "POST /api/voice/session",
        description: "Token efímero + instrucciones + tools + voz xAI.",
        kind: "system",
        next: "ws",
      },
      {
        id: "ws",
        title: "WebSocket xAI Realtime",
        description: "session.update con Think Fast 2.0.",
        kind: "external",
        next: "talk",
        tags: ["Grok Voice"],
      },
      {
        id: "talk",
        title: "Conversación + tools",
        description: "function_call → /api/voice/tools/execute.",
        kind: "process",
        next: "done",
      },
      {
        id: "done",
        title: "Complete sesión",
        description: "Guarda registro channel=voice_xai.",
        kind: "end",
      },
    ],
  },
  {
    id: "playground-lk",
    title: "Playground LiveKit",
    summary: "Misma pipeline que PSTN sin marcar el DID.",
    category: "pruebas",
    steps: [
      {
        id: "start",
        title: "Iniciar LiveKit producción",
        kind: "start",
        actor: "Operador",
        next: "api",
      },
      {
        id: "api",
        title: "Crear room + token",
        description: "/api/livekit/playground → room admin-voice-*.",
        kind: "system",
        next: "job",
      },
      {
        id: "job",
        title: "Worker atiende",
        description: "entrypoint con channel=voice_livekit.",
        kind: "process",
        next: "same",
      },
      {
        id: "same",
        title: "Flujo idéntico a SIP",
        description: "Tenant, cola, agentes, CRM, handoffs.",
        kind: "end",
        tags: ["QA producción"],
      },
    ],
  },
  {
    id: "chat",
    title: "Chat de texto",
    summary: "Probar handoffs y CRM sin audio.",
    category: "pruebas",
    steps: [
      {
        id: "s",
        title: "Crear sesión de chat",
        kind: "start",
        next: "m",
      },
      {
        id: "m",
        title: "Mensajes del operador",
        description: "POST .../messages",
        kind: "process",
        next: "llm",
      },
      {
        id: "llm",
        title: "LLM + tools",
        description: "Puede handoff entre agentes en texto.",
        kind: "process",
        next: "save",
      },
      {
        id: "save",
        title: "Registro channel=chat",
        kind: "end",
      },
    ],
  },
  {
    id: "alta",
    title: "Alta empresa y agente",
    summary: "Del alta de tenant a la primera llamada real.",
    category: "admin",
    steps: [
      {
        id: "ten",
        title: "Crear empresa",
        description: "/tenants — plan y branding.",
        kind: "start",
        actor: "super_admin",
        next: "ag",
      },
      {
        id: "ag",
        title: "Nueva instancia",
        description: "Plantilla + voz xAI + idioma.",
        kind: "process",
        actor: "Mis agentes",
        next: "did",
      },
      {
        id: "did",
        title: "Asignar DID",
        description: "E.164 principal y adicionales.",
        kind: "process",
        next: "prov",
      },
      {
        id: "prov",
        title: "Provision LiveKit",
        description: "Dispatch rule / phone number.",
        kind: "external",
        next: "test",
        tags: ["dispatch"],
      },
      {
        id: "test",
        title: "Probar en orden",
        description: "xAI playground → LiveKit playground → llamada real.",
        kind: "process",
        next: "go",
      },
      {
        id: "go",
        title: "Operación normal",
        description: "status active + worker online.",
        kind: "end",
      },
    ],
  },
  {
    id: "roles",
    title: "Roles y permisos",
    summary: "Quién entra a qué módulos del admin.",
    category: "admin",
    steps: [
      {
        id: "login",
        title: "Login",
        description: "Password o passkey.",
        kind: "start",
        next: "role",
      },
      {
        id: "role",
        title: "Rol efectivo",
        kind: "decision",
        branches: [
          { label: "super_admin", targetId: "full", tone: "ok" },
          { label: "admin", targetId: "full", tone: "ok" },
          { label: "viewer", targetId: "read", tone: "neutral" },
          { label: "playground", targetId: "pg", tone: "warn" },
        ],
      },
      {
        id: "full",
        title: "Operación + CRM + flujos",
        description: "Incluye Flujos / Operación, agentes, settings según techo.",
        kind: "process",
        next: "end",
      },
      {
        id: "read",
        title: "Lectura",
        description: "Dashboard, registros, analytics, flujos.",
        kind: "process",
        next: "end",
      },
      {
        id: "pg",
        title: "Solo playground",
        description: "Pruebas de voz/texto.",
        kind: "process",
        next: "end",
      },
      {
        id: "end",
        title: "Rutas filtradas",
        description: "moduleAllowed en menú y APIs.",
        kind: "end",
      },
    ],
  },
  {
    id: "vps",
    title: "Servicios en el VPS",
    summary: "Cómo se despliegan admin y worker en producción.",
    category: "admin",
    steps: [
      {
        id: "https",
        title: "Usuario abre HTTPS",
        description: "paymercadogo.com/callmgmt/",
        kind: "start",
        next: "ngx",
      },
      {
        id: "ngx",
        title: "nginx proxy",
        description: "/callmgmt/api → :8080, static UI.",
        kind: "system",
        next: "adm",
      },
      {
        id: "adm",
        title: "callmanagement.service",
        description: "Admin API + SPA.",
        kind: "system",
        next: "wk",
        tags: ["systemd"],
      },
      {
        id: "wk",
        title: "callmanagement-worker",
        description: "Conecta a LiveKit y xAI para llamadas.",
        kind: "system",
        next: "data",
        tags: ["systemd"],
      },
      {
        id: "data",
        title: "Datos en disco",
        description: ".env, data/, CRM tenants, grabaciones.",
        kind: "end",
      },
    ],
  },
];

export function getFlowById(id: string): FlowSection | undefined {
  return OPERATION_FLOWS.find((f) => f.id === id);
}

export function stepsById(flow: FlowSection): Map<string, FlowStep> {
  return new Map(flow.steps.map((s) => [s.id, s]));
}
