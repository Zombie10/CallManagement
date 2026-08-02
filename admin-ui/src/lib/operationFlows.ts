/** Flujogramas operativos (Mermaid) para la página Flujos / Operación. */

export type FlowSection = {
  id: string;
  title: string;
  summary: string;
  mermaid: string;
  notes?: string[];
};

export const OPERATION_FLOWS: FlowSection[] = [
  {
    id: "mapa-general",
    title: "1. Mapa general del negocio",
    summary: "Piezas de la plataforma y servicios externos (LiveKit, xAI, DID).",
    mermaid: `flowchart TB
  subgraph Clientes["Clientes / usuarios"]
    CALLER["Llamante PSTN"]
    STAFF["Staff empresa · admin"]
  end
  subgraph Plataforma["Call Management"]
    UI["Admin UI"]
    API["Admin API FastAPI"]
    WORKER["Worker LiveKit"]
    CRM["CRM por tenant"]
    PLATFORM["Platform DB"]
  end
  subgraph Externos["Externos"]
    LK["LiveKit Cloud"]
    XAI["xAI Grok Voice"]
    SIP["Proveedor DID"]
  end
  CALLER --> SIP --> LK
  LK --> WORKER
  WORKER --> XAI
  WORKER --> CRM
  WORKER --> PLATFORM
  STAFF --> UI --> API
  API --> CRM
  API --> PLATFORM
  API --> XAI
  API --> LK
  UI -.->|playground voz| XAI`,
  },
  {
    id: "multi-empresa",
    title: "2. Estructura multi-empresa",
    summary: "Orquestador → empresas → instancias de agente → CRM aislado.",
    mermaid: `flowchart TB
  ORCH["Orquestador super_admin"]
  ORCH --> T1["Empresa A"]
  ORCH --> T2["Empresa B"]
  T1 --> A1["Instancia Recepción"]
  T1 --> A2["Instancia Banca"]
  T1 --> CRM1["CRM aislado"]
  T1 --> LIM1["Límites plan"]
  subgraph Plantillas["Plantillas sistema"]
    P1["receptionist"]
    P2["support"]
    P3["sales"]
    P4["technical"]
    P5["escalation"]
    P6["banking_support"]
  end
  A1 -.usa.-> P1
  A2 -.usa.-> P6`,
    notes: [
      "Plantilla = comportamiento base en /agents",
      "Instancia = agente de una empresa (voz, DID, horario) en Mis agentes",
    ],
  },
  {
    id: "canales",
    title: "3. Canales de entrada",
    summary: "Cómo llega una conversación y qué channel queda en registros.",
    mermaid: `flowchart LR
  C1["Teléfono PSTN"] --> S1["sip"]
  C2["Playground xAI"] --> S2["voice_xai"]
  C3["Playground LiveKit"] --> S3["voice_livekit"]
  C4["Chat texto"] --> S4["chat"]
  S1 --> REG["Registros /calls"]
  S2 --> REG
  S3 --> REG
  S4 --> REG`,
  },
  {
    id: "pstn",
    title: "4. Llamada telefónica PSTN (completa)",
    summary: "Del celular al worker, cola, Grok Voice, CRM y webhooks.",
    mermaid: `sequenceDiagram
  actor Caller as Llamante
  participant PSTN as Red telefónica
  participant LK as LiveKit
  participant W as Worker
  participant XAI as xAI Grok
  participant CRM as CRM tenant
  Caller->>PSTN: Marca DID
  PSTN->>LK: SIP / Phone Number
  LK->>W: Job room call-*
  W->>W: DID → tenant + agente
  W->>W: Cola 3 capas
  W->>CRM: get_or_create_customer
  W->>XAI: Sesión voz + tools
  loop Diálogo
    Caller->>XAI: Habla
    XAI->>W: function_call
    W->>CRM: lookup / cita
    XAI->>Caller: Responde
  end
  Caller->>LK: Cuelga
  W->>CRM: call + summary
  W->>W: release cola`,
  },
  {
    id: "did",
    title: "5. Resolución DID → agente",
    summary: "El número marcado define empresa e instancia.",
    mermaid: `flowchart TD
  START["to_number = DID marcado"] --> DISP{"¿DID en instancia activa?"}
  DISP -->|Sí| TEN["Tenant dueño del DID"]
  DISP -->|No| DEF["Fallback receptionist"]
  TEN --> INST["agent_instance"]
  INST --> TPL["template_id + voz xAI"]
  TPL --> OUT["department_hint inicial"]
  DEF --> OUT`,
  },
  {
    id: "cola",
    title: "6. Cola y límites de concurrencia",
    summary: "Empresa → agente → DID. Si una capa está llena, mensaje de espera.",
    mermaid: `flowchart TD
  IN["Nueva llamada"] --> L1{"Empresa OK?"}
  L1 -->|No| B["Cola / mensaje ocupado"]
  L1 -->|Sí| L2{"Agente OK?"}
  L2 -->|No| B
  L2 -->|Sí| L3{"DID OK?"}
  L3 -->|No| B
  L3 -->|Sí| OK["Atiende normal"]
  B --> END["Al colgar: release"]
  OK --> END`,
  },
  {
    id: "horario",
    title: "7. Horario y estado del agente",
    summary: "Pausado, draft o fuera de horario cambian el mensaje y el routing.",
    mermaid: `flowchart TD
  START["Instancia por DID"] --> ST{"status"}
  ST -->|paused/draft| FALL["Default receptionist"]
  ST -->|active| SCH{"¿En horario?"}
  SCH -->|No| AH["After-hours: horario + callback"]
  SCH -->|Sí| INC["Atiende con plantilla"]`,
  },
  {
    id: "dialogo",
    title: "8. Atención de la llamada (diálogo)",
    summary: "Escucha → razona → tool opcional → respuesta corta.",
    mermaid: `flowchart TD
  A["Sesión Grok Voice"] --> B["Escucha server VAD"]
  B --> C["Razona en paralelo"]
  C --> D{"¿Tool?"}
  D -->|No| E["Respuesta corta"]
  D -->|Sí| F["function_call"]
  F --> G["Ejecuta CRM/handoff/SIP"]
  G --> H["Resultado al modelo"]
  H --> E
  E --> I{"¿Sigue?"}
  I -->|Sí| B
  I -->|No| J["Fin"]`,
    notes: [
      "Una pregunta a la vez; no asumir identidad",
      "CRM solo con teléfono que dice el cliente",
    ],
  },
  {
    id: "handoffs",
    title: "9. Recepción y handoffs",
    summary: "Receptionist enruta a especialistas; cualquier agente puede escalar o volver.",
    mermaid: `flowchart TD
  START["Inicio"] --> VIP{"VIP skip?"}
  VIP -->|Sí| SPEC["Especialista"]
  VIP -->|No| REC["receptionist"]
  REC --> DEC{"Motivo"}
  DEC --> SUP["support"]
  DEC --> SA["sales"]
  DEC --> TE["technical"]
  DEC --> BA["banking_support"]
  DEC --> ES["escalation"]
  SUP --> H["Handoff + webhook"]
  SA --> H
  TE --> H
  BA --> H
  ES --> H
  H --> CONT["Continúa especialista"]`,
  },
  {
    id: "banking",
    title: "10. Soporte bancario (BAC)",
    summary: "Flujo en español: lookup por teléfono y tools de verificación/bloqueo.",
    mermaid: `flowchart TD
  IN["Entrada banca"] --> OPEN["Saludo BAC"]
  OPEN --> PH["Pide teléfono"]
  PH --> LOOK["lookup_customer"]
  LOOK --> ACT{"Acción"}
  ACT --> SUM["account summary"]
  ACT --> ACC["verify account"]
  ACT --> CARD["verify card"]
  ACT --> BLK["block temporal"]
  SUM --> OUT["Respuesta sin PAN"]
  ACC --> OUT
  CARD --> OUT
  BLK --> OUT
  OUT --> END["Despedida / escalación"]`,
  },
  {
    id: "tools",
    title: "11. Herramientas CRM, SIP y xAI",
    summary: "Qué ejecuta el modelo server-side vs function tools de la app.",
    mermaid: `flowchart TB
  AG["Agente en voz"] --> DEC{"Tipo tool"}
  DEC --> BUILTIN["xAI: search MCP code"]
  DEC --> FN["Function tools"]
  FN --> CRM["CRM lookup cita nota"]
  FN --> HO["Handoffs"]
  FN --> SIP["SIP transfer end_call"]
  BUILTIN --> BACK["Resultado al modelo"]
  CRM --> BACK
  HO --> BACK
  SIP --> BACK
  BACK --> SPEAK["Habla al caller"]`,
  },
  {
    id: "fin-llamada",
    title: "12. Fin de llamada y post-proceso",
    summary: "Transcript, summary, CRM, webhooks y grabación opcional.",
    mermaid: `flowchart TD
  END["Cuelga / end_call"] --> REL["release cola"]
  END --> REC["Egress → MinIO opcional"]
  END --> TR["Transcript"]
  TR --> SUM["Post-call summary"]
  SUM --> CRM["Persiste en CRM"]
  CRM --> WH["Webhook call.ended"]
  CRM --> REG["Registros + Analytics"]`,
  },
  {
    id: "playground-xai",
    title: "13. Playground voz xAI",
    summary: "Prueba en browser sin sala LiveKit; tools vía API admin.",
    mermaid: `sequenceDiagram
  actor U as Operador
  participant UI as Admin UI
  participant API as FastAPI
  participant XAI as xAI Realtime
  U->>UI: Iniciar voz
  UI->>API: /voice/session
  API-->>UI: token + config
  UI->>XAI: WebSocket session
  U->>XAI: Audio
  XAI-->>UI: Audio + tools
  UI->>API: /voice/tools/execute
  UI->>API: /voice/complete`,
  },
  {
    id: "playground-lk",
    title: "14. Playground LiveKit producción",
    summary: "Misma pipeline que PSTN, sin marcar por teléfono.",
    mermaid: `flowchart TD
  U["Operador"] --> API["/livekit/playground"]
  API --> ROOM["room admin-voice-*"]
  ROOM --> W["Worker call-management"]
  W --> SAME["Mismo flujo que SIP"]`,
  },
  {
    id: "chat",
    title: "15. Chat de texto multi-agente",
    summary: "Prueba handoffs y CRM en texto.",
    mermaid: `flowchart TD
  U["Operador"] --> S["chat session"]
  S --> M["messages"]
  M --> LLM["LLM texto"]
  LLM --> T{"Tool?"}
  T -->|Sí| EX["CRM / handoff"]
  EX --> LLM
  T -->|No| R["Respuesta UI"]
  R --> CRM["Registro chat"]`,
  },
  {
    id: "alta",
    title: "16. Alta de empresa y agente",
    summary: "Setup operativo hasta la primera llamada real.",
    mermaid: `flowchart TD
  SA["super_admin"] --> TEN["Crear empresa"]
  TEN --> AG["Nuevo agente"]
  AG --> TPL["Plantilla + voz xAI"]
  TPL --> DID["Asignar DID"]
  DID --> PROV["Dispatch LiveKit"]
  PROV --> ACT["status active"]
  ACT --> T1["Playground xAI"]
  T1 --> T2["Playground LiveKit"]
  T2 --> T3["Llamada real"]`,
  },
  {
    id: "roles",
    title: "17. Roles y permisos",
    summary: "Quién ve qué en el admin.",
    mermaid: `flowchart TD
  LOGIN["Login"] --> ROLE{"Rol"}
  ROLE --> SA["super_admin"]
  ROLE --> AD["admin"]
  ROLE --> VW["viewer"]
  ROLE --> PG["playground"]
  SA --> UI["Módulos efectivos"]
  AD --> UI
  VW --> UI2["Lectura"]
  PG --> UI3["Solo prueba"]`,
  },
  {
    id: "vps",
    title: "18. Servicios en el VPS",
    summary: "nginx, admin API y worker de voz.",
    mermaid: `flowchart LR
  NET["HTTPS"] --> NGX["nginx /callmgmt/"]
  NGX --> ADM["callmanagement.service"]
  WK["callmanagement-worker"] --> LK["LiveKit"]
  WK --> XAI["xAI"]
  ADM --> XAI
  ADM --> DATA["data + .env"]
  WK --> DATA`,
  },
  {
    id: "resumen",
    title: "Resumen de una página",
    summary: "Setup → cada llamada → operación diaria.",
    mermaid: `flowchart TB
  subgraph Setup
    S1["Empresa + plantillas"]
    S2["Instancia + voz"]
    S3["DID + dispatch"]
    S4["Worker online"]
  end
  subgraph Run
    R1["Marca DID"]
    R2["Worker"]
    R3["Cola"]
    R4["Grok + tools"]
    R5["Handoffs"]
    R6["CRM"]
  end
  S1 --> S2 --> S3 --> S4 --> R1
  R1 --> R2 --> R3 --> R4 --> R5 --> R6`,
  },
];
