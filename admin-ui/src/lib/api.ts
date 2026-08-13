import type {
  AdminRoleOption,
  AdminUserCreate,
  AdminUserRecord,
  AdminUserUpdate,
  AgentInstanceInput,
  AgentInstanceRecord,
  AgentProfile,
  AgentProfileInput,
  AgentScheduleInput,
  AgentScheduleRecord,
  AgentsResponse,
  AnalyticsResponse,
  ApiKeyCreated,
  ApiKeyRecord,
  Appointment,
  AppointmentInput,
  AuthLoginResponse,
  AuthModulesResponse,
  AuthStatusResponse,
  AuthUserResponse,
  CallRecord,
  CallReportPayload,
  CallReportResponse,
  ChatMessageResponse,
  ChatSessionCreate,
  ChatSessionResponse,
  ChatStatusResponse,
  Customer,
  CustomerProfileResponse,
  DashboardResponse,
  DemoCustomer,
  ListResponse,
  LiveKitPlaygroundInput,
  LiveKitPlaygroundResponse,
  LiveKitStatusResponse,
  PasskeyOptionsResponse,
  PasskeyRegisterOptionsResponse,
  PlatformMetricsResponse,
  PlaygroundAgentsResponse,
  ReportOptionsResponse,
  SettingsResponse,
  SupervisorResponse,
  TenantAgentsResponse,
  TenantCreateInput,
  TenantRecord,
  TenantUpdateInput,
  VoiceSessionCompleteInput,
  VoiceSessionConfig,
  VoiceSessionContext,
  VoiceSessionResponse,
  VoiceToolExecuteInput,
  VoiceToolExecuteResponse,
  WebhookCreateInput,
  WebhookDelivery,
  WebhookRecord,
} from "./apiTypes";

const API = `${import.meta.env.BASE_URL.replace(/\/?$/, "")}/api`;

let _tenantId: string | null = null;
let _agentInstanceId: string | null = null;

function buildHeaders(init?: RequestInit): Record<string, string> {
  const extra = (init?.headers as Record<string, string>) || {};
  const base: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  if (!extra["X-Tenant-Id"] && _tenantId) base["X-Tenant-Id"] = _tenantId;
  if (!extra["X-Agent-Instance-Id"] && _agentInstanceId) {
    base["X-Agent-Instance-Id"] = _agentInstanceId;
  }
  return base;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: buildHeaders(init),
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
  authRoles: () => request<{ roles: AdminRoleOption[] }>("/auth/roles"),
  authModules: () => request<AuthModulesResponse>("/auth/modules"),
  updateProfile: (displayName: string) =>
    request<AuthUserResponse>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ display_name: displayName }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>("/auth/me/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    }),
  deletePasskey: (credentialId: string) =>
    request<{ deleted: string }>(`/auth/passkey/${encodeURIComponent(credentialId)}`, {
      method: "DELETE",
    }),
  listUsers: () => request<{ users: AdminUserRecord[] }>("/auth/users"),
  createUser: (data: AdminUserCreate) =>
    request<AdminUserRecord>("/auth/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateUser: (userId: string, data: AdminUserUpdate) =>
    request<AdminUserRecord>(`/auth/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteUser: (userId: string) =>
    request<{ deleted: string }>(`/auth/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),
  demoCustomers: () => request<{ customers: DemoCustomer[] }>("/demo/customers"),
  health: () => request<{ status: string }>("/health"),
  dashboard: (tenantId?: string | null) =>
    request<DashboardResponse>("/dashboard", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
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
  createVoiceSession: (agent: string, context?: VoiceSessionContext) =>
    request<VoiceSessionResponse>("/voice/session", {
      method: "POST",
      body: JSON.stringify({ agent, ...context }),
    }),
  completeVoiceSession: (data: VoiceSessionCompleteInput) =>
    request<{ saved: boolean; call_id: string; transcript_lines: number }>("/voice/complete", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  executeVoiceTool: (data: VoiceToolExecuteInput) =>
    request<VoiceToolExecuteResponse>("/voice/tools/execute", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  voiceConfig: (agent: string) =>
    request<VoiceSessionConfig>(`/voice/config/${encodeURIComponent(agent)}`),
  /** Short MP3 sample via xAI TTS for the selected voice + language. */
  previewVoice: async (body: {
    voice_id: string;
    language?: string;
    text?: string;
  }): Promise<Blob> => {
    const res = await fetch(`${API}/voice/preview`, {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      let message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ")
            : res.statusText;
      if (res.status === 405) {
        message =
          "Method Not Allowed: el servidor no tiene POST /api/voice/preview (reinicia callmanagement). Voces xAI TTS.";
      } else if (res.status === 401) {
        message = "Sesión expirada — vuelve a iniciar sesión para probar voces xAI.";
      } else if (!message) {
        message = `Voice preview failed (${res.status})`;
      }
      throw new Error(message);
    }
    const type = res.headers.get("content-type") || "";
    if (!type.includes("audio") && !type.includes("octet-stream") && !type.includes("mpeg")) {
      // Defensive: sometimes errors come as text/html with 200 from wrong route.
      const text = await res.clone().text().catch(() => "");
      if (text.trim().startsWith("{") || text.trim().startsWith("<")) {
        throw new Error("Respuesta inválida del preview de voz xAI");
      }
    }
    return res.blob();
  },
  livekitStatus: () => request<LiveKitStatusResponse>("/livekit/status"),
  listPlaygroundAgents: (tenantId?: string | null) =>
    request<PlaygroundAgentsResponse>("/playground/agents", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  createLiveKitPlayground: (data: LiveKitPlaygroundInput) =>
    request<LiveKitPlaygroundResponse>("/livekit/playground", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  customers: (limit = 500, tenantId?: string | null) =>
    request<ListResponse<Customer>>(`/customers?limit=${limit}`, {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  calls: (limit = 100, offset = 0, tenantId?: string | null) =>
    request<ListResponse<CallRecord>>(`/calls?limit=${limit}&offset=${offset}`, {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  getCall: (callId: string) => request<CallRecord>(`/calls/${encodeURIComponent(callId)}`),
  recordingStreamUrl: (callId: string, tenantId?: string | null) => {
    const base = `${API}/calls/${encodeURIComponent(callId)}/recording`;
    if (!tenantId) return base;
    return `${base}?tenant_id=${encodeURIComponent(tenantId)}`;
  },
  fetchRecordingBlob: async (callId: string, recordingUrl?: string | null, tenantId?: string | null) => {
    const url =
      recordingUrl && recordingUrl.startsWith("http")
        ? recordingUrl
        : api.recordingStreamUrl(callId, tenantId ?? _tenantId);
    const headers: Record<string, string> = {};
    const tid = tenantId ?? _tenantId;
    if (tid && !(recordingUrl && recordingUrl.startsWith("http"))) {
      headers["X-Tenant-Id"] = tid;
    }
    const res = await fetch(url, { credentials: "include", headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      const detail = err.detail;
      throw new Error(typeof detail === "string" ? detail : res.statusText || "Error al cargar grabación");
    }
    return res.blob();
  },
  uploadCallRecording: async (callId: string, blob: Blob, ext = "webm") => {
    const form = new FormData();
    form.append("file", blob, `${callId}.${ext}`);
    const headers: Record<string, string> = {};
    if (_tenantId) headers["X-Tenant-Id"] = _tenantId;
    if (_agentInstanceId) headers["X-Agent-Instance-Id"] = _agentInstanceId;
    const res = await fetch(`${API}/calls/${encodeURIComponent(callId)}/recording`, {
      method: "POST",
      credentials: "include",
      headers,
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(typeof err.detail === "string" ? err.detail : res.statusText);
    }
    return res.json() as Promise<{ saved: boolean; call_id: string; recording_url: string }>;
  },
  appointments: (limit = 200, tenantId?: string | null) =>
    request<ListResponse<Appointment>>(`/appointments?limit=${limit}`, {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  createAppointment: (data: AppointmentInput) =>
    request<Appointment>("/appointments", { method: "POST", body: JSON.stringify(data) }),
  updateAppointment: (id: string, data: Partial<AppointmentInput>) =>
    request<Appointment>(`/appointments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAppointment: (id: string) =>
    request<{ deleted: string }>(`/appointments/${encodeURIComponent(id)}`, { method: "DELETE" }),
  customerProfile: (phone: string) =>
    request<CustomerProfileResponse>(`/customers/${encodeURIComponent(phone)}/profile`),
  supervisor: () => request<SupervisorResponse>("/supervisor"),
  webhookDeliveries: (limit = 50) =>
    request<ListResponse<WebhookDelivery>>(`/webhooks/deliveries?limit=${limit}`),
  exportCallsCsvUrl: () => `${API}/export/calls.csv`,
  listApiKeys: () => request<{ api_keys: ApiKeyRecord[] }>("/api-keys"),
  createApiKey: (data: { name: string; scopes: string[] }) =>
    request<ApiKeyCreated>("/api-keys", { method: "POST", body: JSON.stringify(data) }),
  revokeApiKey: (id: string) =>
    request<{ revoked: string }>(`/api-keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateCustomer: (phone: string, data: Partial<Customer>) =>
    request(`/customers/${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  setTenantHeaders: (tenantId: string | null, agentInstanceId?: string | null) => {
    _tenantId = tenantId;
    _agentInstanceId = agentInstanceId ?? null;
  },
  platformMetrics: () => request<PlatformMetricsResponse>("/platform/metrics"),
  listTenants: () => request<{ tenants: TenantRecord[] }>("/tenants"),
  tenantMine: () => request<TenantRecord>("/tenants/mine"),
  createTenant: (data: TenantCreateInput) =>
    request<TenantRecord>("/tenants", { method: "POST", body: JSON.stringify(data) }),
  updateTenant: (id: string, data: TenantUpdateInput) =>
    request<TenantRecord>(`/tenants/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteTenant: (id: string) =>
    request<{ deleted: string }>(`/tenants/${encodeURIComponent(id)}`, { method: "DELETE" }),
  listTenantAgents: (tenantId?: string | null) =>
    request<TenantAgentsResponse>("/tenant-agents", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  listOperationsAgents: (tenantId?: string | null) =>
    request<TenantAgentsResponse>("/operations/agents", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  createTenantAgent: (data: AgentInstanceInput) =>
    request<AgentInstanceRecord>("/tenant-agents", { method: "POST", body: JSON.stringify(data) }),
  updateTenantAgent: (id: string, data: AgentInstanceInput) =>
    request<AgentInstanceRecord>(`/tenant-agents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  duplicateTenantAgent: (id: string, data: { slug: string; display_name: string }) =>
    request<AgentInstanceRecord>(`/tenant-agents/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteTenantAgent: (id: string) =>
    request<{ deleted: string }>(`/tenant-agents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getAgentSchedules: (id: string) =>
    request<{ schedules: AgentScheduleRecord[] }>(`/tenant-agents/${encodeURIComponent(id)}/schedules`),
  saveAgentSchedules: (id: string, schedules: AgentScheduleInput[]) =>
    request<{ schedules: AgentScheduleRecord[] }>(`/tenant-agents/${encodeURIComponent(id)}/schedules`, {
      method: "PUT",
      body: JSON.stringify({ schedules }),
    }),
  analytics: (tenantId?: string | null) =>
    request<AnalyticsResponse>("/analytics", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  reportOptions: (tenantId?: string | null) =>
    request<ReportOptionsResponse>("/reports/options", {
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  queryReport: (payload: CallReportPayload, tenantId?: string | null) =>
    request<CallReportResponse>("/reports/calls", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    }),
  listWebhooks: () => request<{ webhooks: WebhookRecord[] }>("/webhooks"),
  createWebhook: (data: WebhookCreateInput) =>
    request<WebhookRecord>("/webhooks", { method: "POST", body: JSON.stringify(data) }),
  deleteWebhook: (id: string) =>
    request<{ deleted: string }>(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" }),
  webhookEvents: () => request<{ events: string[] }>("/webhooks/events"),
};

export * from "./apiTypes";
