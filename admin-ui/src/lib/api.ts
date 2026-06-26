const API = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
          : res.statusText;
    throw new Error(message || "Request failed");
  }
  return res.json();
}

export const api = {
  authStatus: () => request<AuthStatusResponse>("/auth/status"),
  authMe: () => request<AuthUserResponse>("/auth/me"),
  login: (username: string, password: string) =>
    request<AuthLoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  passkeyLoginOptions: (username?: string) =>
    request<PasskeyOptionsResponse>("/auth/passkey/login/options", {
      method: "POST",
      body: JSON.stringify({ username: username || null }),
    }),
  passkeyLoginVerify: (challengeId: string, credential: Record<string, unknown>) =>
    request<AuthLoginResponse>("/auth/passkey/login/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, credential }),
    }),
  passkeyRegisterOptions: (deviceName: string) =>
    request<PasskeyRegisterOptionsResponse>("/auth/passkey/register/options", {
      method: "POST",
      body: JSON.stringify({ device_name: deviceName }),
    }),
  passkeyRegisterVerify: (
    challengeId: string,
    credential: Record<string, unknown>,
    deviceName: string,
  ) =>
    request<{ registered: boolean }>("/auth/passkey/register/verify", {
      method: "POST",
      body: JSON.stringify({
        challenge_id: challengeId,
        credential,
        device_name: deviceName,
      }),
    }),
  health: () => request<{ status: string }>("/health"),
  dashboard: () => request<DashboardResponse>("/dashboard"),
  settings: () => request<SettingsResponse>("/settings"),
  saveSettings: (values: Record<string, string>) =>
    request("/settings", { method: "PUT", body: JSON.stringify({ values }) }),
  agents: () => request<AgentsResponse>("/agents"),
  saveAgent: (name: string, data: AgentProfileInput) =>
    request<AgentProfile>(`/agents/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  createAgent: (data: AgentProfileInput) =>
    request<AgentProfile>("/agents", { method: "POST", body: JSON.stringify(data) }),
  deleteAgent: (name: string) =>
    request<{ deleted: string }>(`/agents/${encodeURIComponent(name)}`, { method: "DELETE" }),
  chatStatus: () => request<ChatStatusResponse>("/chat/status"),
  createChatSession: (data?: ChatSessionCreate) =>
    request<ChatSessionResponse>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify(data || {}),
    }),
  sendChatMessage: (sessionId: string, message: string) =>
    request<ChatMessageResponse>(`/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  resetChatSession: (sessionId: string) =>
    request<ChatSessionResponse>(`/chat/sessions/${sessionId}/reset`, { method: "POST" }),
  deleteChatSession: (sessionId: string) =>
    request<{ deleted: string }>(`/chat/sessions/${sessionId}`, { method: "DELETE" }),
  createVoiceSession: (agent: string) =>
    request<VoiceSessionResponse>("/voice/session", {
      method: "POST",
      body: JSON.stringify({ agent }),
    }),
  voiceConfig: (agent: string) =>
    request<VoiceSessionConfig>(`/voice/config/${encodeURIComponent(agent)}`),
  livekitStatus: () => request<LiveKitStatusResponse>("/livekit/status"),
  createLiveKitPlayground: (data: LiveKitPlaygroundInput) =>
    request<LiveKitPlaygroundResponse>("/livekit/playground", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  customers: (limit = 50) => request<ListResponse<Customer>>(`/customers?limit=${limit}`),
  calls: (limit = 50) => request<ListResponse<CallRecord>>(`/calls?limit=${limit}`),
  appointments: (limit = 50) => request<ListResponse<Appointment>>(`/appointments?limit=${limit}`),
  updateCustomer: (phone: string, data: Partial<Customer>) =>
    request(`/customers/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

export interface DashboardResponse {
  stats: {
    customers: number;
    calls: number;
    appointments: number;
    vip_customers: number;
    outcomes: Record<string, number>;
  };
  runtime: {
    provider: string;
    grok_realtime: boolean;
    remote_mcp: boolean;
    mcp_servers: number;
  };
}

export interface SettingField {
  key: string;
  label: string;
  type: string;
  options?: string[];
  value: string;
  is_secret: boolean;
  has_value: boolean;
}

export interface SettingsResponse {
  env_path: string;
  sections: Record<string, SettingField[]>;
}

export interface VoiceLibraryEntry {
  id: string;
  name: string;
  gender: string;
  age_group: string;
  tone: string;
  description: string;
  languages: string[];
}

export interface VoiceLanguageOption {
  code: string;
  label: string;
}

export interface FunctionToolOption {
  id: string;
  label: string;
}

export interface AgentProfile {
  name: string;
  display_name: string;
  provider: string;
  voice: string;
  locale: string;
  voice_language: string;
  custom_instructions: string;
  tools: string[];
  function_tools: string[];
  mcp_servers: string[];
  enabled: boolean;
  default_instructions?: string;
  has_custom_instructions?: boolean;
}

export interface AgentProfileInput {
  name: string;
  display_name?: string;
  provider?: string;
  voice?: string;
  locale?: string;
  voice_language?: string;
  custom_instructions?: string;
  tools?: string[];
  function_tools?: string[];
  mcp_servers?: string[];
  enabled?: boolean;
}

export interface AgentsCatalog {
  available_tools: string[];
  available_locales: string[];
  available_providers: string[];
  available_xai_voices: string[];
  voice_library: VoiceLibraryEntry[];
  voice_language_options: VoiceLanguageOption[];
  gender_options: string[];
  age_group_options: string[];
  function_tool_catalog: FunctionToolOption[];
  protected_agents: string[];
}

export interface VoiceSessionConfig {
  agent: string;
  model: string;
  voice: string;
  instructions: string;
  language_hint?: string | null;
  tools: Array<Record<string, unknown>>;
  turn_detection: Record<string, unknown>;
  reasoning_effort?: string | null;
}

export interface AgentsResponse {
  profiles: AgentProfile[];
  catalog: AgentsCatalog;
  mcp_server_ids: string[];
}

export interface Customer {
  phone_number: string;
  name?: string;
  email?: string;
  notes?: string;
  vip: boolean;
  updated_at?: string;
}

export interface CallRecord {
  call_id: string;
  from_number: string;
  outcome?: string;
  start_time?: string;
  duration_seconds?: number;
  summary?: string;
}

export interface Appointment {
  id: string;
  customer_phone: string;
  scheduled_time: string;
  purpose: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

export interface AuthStatusResponse {
  enabled: boolean;
  rp_id: string;
  origin: string;
  passkey_supported: boolean;
  password_configured?: boolean;
  hint?: string;
}

export interface AuthUserResponse {
  id: string;
  username: string;
  display_name: string;
  passkeys: Array<{ id: string; device_name: string; created_at: string }>;
  has_passkeys: boolean;
}

export interface AuthLoginResponse {
  username: string;
  display_name: string;
}

export interface PasskeyOptionsResponse {
  challenge_id: string;
  options: PublicKeyCredentialRequestOptions;
}

export interface PasskeyRegisterOptionsResponse {
  challenge_id: string;
  options: PublicKeyCredentialCreationOptions;
  device_name: string;
}

export interface ChatStatusResponse {
  ready: boolean;
  provider: string;
  model: string;
  voice_model?: string;
  voice_ready?: boolean;
  xai_voice_ready?: boolean;
  livekit_ready?: boolean;
  livekit_issues?: string[];
  requires_worker?: boolean;
  active_sessions: number;
  requires_xai_key: boolean;
}

export interface LiveKitStatusResponse {
  ready: boolean;
  issues: string[];
  requires_worker: boolean;
}

export interface LiveKitPlaygroundInput {
  initial_agent?: string;
  phone_number?: string;
  customer_name?: string;
  vip?: boolean;
}

export interface LiveKitPlaygroundResponse {
  room_name: string;
  token: string;
  url: string;
  identity: string;
  initial_agent: string;
  dispatch_id: string;
  agent_name: string;
  provider: string;
  model: string;
  pipeline: string;
}

export interface VoiceSessionResponse {
  client_secret: { value: string; expires_at?: number };
  ws_url: string;
  model: string;
  voice: string;
  agent: string;
  instructions: string;
  language_hint?: string | null;
  tools: Array<Record<string, unknown>>;
  turn_detection: Record<string, unknown>;
  reasoning_effort?: string | null;
}

export interface ChatSessionCreate {
  phone_number?: string;
  customer_name?: string;
  department?: string;
  initial_agent?: string;
  vip?: boolean;
}

export interface ChatSessionResponse {
  session_id: string;
  initial_agent: string;
  phone_number: string;
  provider: string;
  model: string;
  voice: string;
}

export interface ChatMessageResponse {
  reply: string;
  agent: string;
  events: { type: string; detail: string }[];
}