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

export interface AppointmentInput {
  customer_phone: string;
  scheduled_time: string;
  purpose: string;
  notes?: string | null;
}

export interface CustomerProfileResponse {
  customer: Customer;
  calls: CallRecord[];
  chat_sessions: Array<{
    session_id: string;
    customer_phone: string;
    started_at: string;
    message_count: number;
  }>;
  appointments: Appointment[];
  stats: {
    total_calls: number;
    handoffs: number;
    escalations: number;
    appointments: number;
  };
}

export interface SupervisorResponse {
  active_calls: number;
  queued_calls: number;
  recording_calls: number;
  at_capacity: boolean;
  calls: Array<{
    call_id: string;
    from_number: string;
    channel: string;
    started_at: string;
    queued?: boolean;
    recording?: boolean;
  }>;
  tenant_metrics?: TenantMetrics;
  tenant_limit?: { key: string; active: number; cap: number; at_capacity: boolean };
  agent_limits?: Array<{
    agent_instance_id: string;
    display_name: string;
    active: number;
    cap: number;
    at_capacity: boolean;
  }>;
  number_limits?: Array<{
    phone_number: string;
    agent_instance_id: string;
    active: number;
    cap: number;
    at_capacity: boolean;
  }>;
  agents?: Array<{
    id: string;
    display_name: string;
    status: string;
    schedule_status?: ScheduleStatus;
    call_count_today: number;
    max_concurrent_calls?: number | null;
    active_calls?: number;
    at_capacity?: boolean;
  }>;
  recordings?: { egress_configured: boolean };
  alerts: Array<{ level: string; message: string }>;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  url: string;
  status_code: number | null;
  success: boolean;
  attempts: number;
  error: string | null;
  created_at: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  enabled: boolean;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKeyRecord {
  api_key: string;
}

export interface DashboardResponse {
  stats: {
    customers: number;
    calls: number;
    appointments: number;
    vip_customers: number;
    outcomes: Record<string, number>;
  };
  analytics: CallAnalytics;
  tenant: {
    id: string;
    name: string;
    brand_color?: string | null;
    logo_url?: string | null;
    metrics?: TenantMetrics;
  };
  runtime: {
    provider: string;
    grok_realtime: boolean;
    remote_mcp: boolean;
    mcp_servers: number;
  };
  worker: {
    livekit_ready: boolean;
    livekit_issues: string[];
    xai_voice_ready: boolean;
    requires_worker: boolean;
    active_calls_tenant: number;
    active_calls_global: number;
  };
  recordings?: {
    egress_configured: boolean;
    s3_bucket?: string;
    active_recordings: number;
  };
  actionable?: ActionableAnalytics;
}

export interface ActionableAnalytics {
  sla_seconds: number;
  sla_compliance_pct: number;
  handoffs: number;
  escalations: number;
  sentiment_score: number;
  sentiment_label: string;
  topic_keywords: Record<string, number>;
  agent_comparison: Array<{
    agent_instance_id: string;
    call_count: number;
    avg_duration_seconds: number;
    escalations: number;
  }>;
}

export interface CallAnalytics {
  calls_by_day: Array<{ day: string; count: number }>;
  outcomes: Record<string, number>;
  avg_duration_seconds: number;
}

export interface AnalyticsResponse extends CallAnalytics {
  metrics: TenantMetrics;
  active_calls: number;
  actionable?: ActionableAnalytics;
}

export type ReportDimension =
  | "day"
  | "hour"
  | "weekday"
  | "outcome"
  | "agent"
  | "template"
  | "channel"
  | "month";

export interface CustomReportFilter {
  field: string;
  op: string;
  value: string | number | string[] | null;
}

export interface CallReportPayload {
  date_from?: string | null;
  date_to?: string | null;
  outcomes?: string[];
  agent_instance_ids?: string[];
  from_number?: string | null;
  min_duration?: number | null;
  max_duration?: number | null;
  channels?: string[];
  group_by?: ReportDimension;
  pivot_row?: ReportDimension | null;
  pivot_col?: ReportDimension | null;
  metric?: "count" | "sum_duration" | "avg_duration";
  custom_filters?: CustomReportFilter[];
  detail_limit?: number;
}

export interface ReportOptionsResponse {
  outcomes: string[];
  agent_instance_ids: string[];
  agents: Array<{ id: string; label: string; slug: string }>;
  date_min: string | null;
  date_max: string | null;
  dimensions: Array<{ id: ReportDimension; label: string }>;
  metrics: Array<{ id: string; label: string }>;
}

export interface CallReportSummary {
  total_calls: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
  unique_callers: number;
  handoffs?: number;
  channels?: Array<{ key: string; label: string; count: number }>;
}

export interface CallReportDetailRow {
  call_id: string;
  from_number: string;
  to_number?: string | null;
  start_time: string;
  end_time?: string | null;
  outcome?: string | null;
  duration_seconds?: number | null;
  agent_instance_id?: string | null;
  transferred_to?: string | null;
  channel?: string | null;
  summary?: string | null;
  agent_notes?: string | null;
  has_transcript?: boolean;
  has_recording?: boolean;
}

export interface CallReportSeries {
  key: string;
  label: string;
  count: number;
  sum_duration: number;
  avg_duration: number;
}

export interface CallReportPivot {
  row_dimension: string;
  col_dimension: string;
  metric: string;
  row_labels: string[];
  col_labels: string[];
  row_keys: string[];
  col_keys: string[];
  cells: number[][];
}

export interface CallReportResponse {
  summary: CallReportSummary;
  series: CallReportSeries[];
  outcome_breakdown: CallReportSeries[];
  pivot: CallReportPivot | null;
  detail: CallReportDetailRow[];
  group_by: string;
  filters_applied: Record<string, unknown>;
}

export interface WebhookRecord {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  secret?: string | null;
  enabled: boolean;
  created_at: string;
}

export interface WebhookCreateInput {
  url: string;
  events?: string[];
  secret?: string | null;
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
  to_number?: string;
  outcome?: string;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  summary?: string;
  transferred_to?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  agent_instance_id?: string | null;
  agent_notes?: string | null;
  channel?: string;
}

export interface Appointment {
  id: string;
  customer_phone: string;
  scheduled_time: string;
  purpose: string;
  notes?: string | null;
  created_at?: string;
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

export type AdminRole = "super_admin" | "admin" | "playground" | "viewer";

export interface AdminRoleOption {
  id: AdminRole;
  label: string;
  description: string;
}

export interface AdminModule {
  id: string;
  label: string;
  route: string;
  category: string;
}

export interface AuthModulesResponse {
  modules: AdminModule[];
  role_defaults: Record<string, string[]>;
  role_ceilings: Record<string, string[]>;
}

export interface AuthUserResponse {
  id: string;
  username: string;
  display_name: string;
  role: AdminRole;
  tenant_id?: string | null;
  enabled?: boolean;
  modules?: string[] | null;
  effective_modules?: string[];
  allowed_routes?: string[];
  passkeys: Array<{ id: string; device_name: string; created_at: string; last_used_at?: string }>;
  has_passkeys: boolean;
  default_route?: string;
}

export interface AuthLoginResponse {
  username: string;
  display_name: string;
  role?: AdminRole;
  default_route?: string;
}

export interface AdminUserRecord {
  id: string;
  username: string;
  display_name: string;
  role: AdminRole;
  enabled: boolean;
  tenant_id?: string | null;
  modules?: string[] | null;
  effective_modules?: string[];
  allowed_routes?: string[];
}

export interface AdminUserCreate {
  username: string;
  password: string;
  display_name: string;
  role: AdminRole;
  tenant_id?: string | null;
  modules?: string[] | null;
}

export interface AdminUserUpdate {
  display_name?: string;
  role?: AdminRole;
  enabled?: boolean;
  password?: string;
  tenant_id?: string | null;
  modules?: string[] | null;
}

export interface VoiceSessionContext {
  phone_number?: string;
  customer_name?: string;
  tenant_id?: string;
  agent_instance_id?: string;
}

export interface TenantMetrics {
  tenant_id: string;
  agent_count: number;
  active_agents: number;
  paused_agents: number;
  draft_agents: number;
  calls_today: number;
  max_agents: number;
  max_calls_per_day: number;
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
  logo_url?: string | null;
  brand_color?: string | null;
  max_agents: number;
  max_calls_per_day: number;
  timezone: string;
  metrics?: TenantMetrics;
}

export interface TenantCreateInput {
  slug: string;
  name: string;
  status?: string;
  logo_url?: string | null;
  brand_color?: string;
  max_agents?: number;
  max_calls_per_day?: number;
}

export interface TenantUpdateInput {
  name?: string;
  status?: string;
  logo_url?: string | null;
  brand_color?: string;
  max_agents?: number;
  max_calls_per_day?: number;
}

export type ScheduleStatus = "open" | "closed" | "always";

export type TelephonyMode = "playground_only" | "livekit_pstn" | "demo_did";

export interface TelephonyChannel {
  id: string;
  label: string;
  available: boolean;
  description: string;
}

export interface TelephonyPhoneDetail {
  phone_number: string;
  is_demo: boolean;
  is_livekit_phone_number: boolean;
  dispatch_assigned: boolean;
  dispatch_rule_id?: string | null;
}

export interface AgentTelephonySummary {
  mode: TelephonyMode;
  mode_label: string;
  channels: TelephonyChannel[];
  phones: TelephonyPhoneDetail[];
  livekit_configured: boolean;
  worker_livekit_ready: boolean;
  worker_xai_ready: boolean;
}

export interface TelephonyProvisionResult {
  phone: string;
  configured: boolean;
  auto_setup?: boolean;
  is_livekit_phone_number?: boolean;
  dispatch_rule_id?: string;
  message: string;
}

export interface AgentInstanceRecord {
  id: string;
  tenant_id: string;
  slug: string;
  display_name: string;
  template_id: string;
  status: "draft" | "active" | "paused";
  phone_number?: string | null;
  phone_numbers?: string[];
  sip_trunk_id?: string | null;
  provider: string;
  voice: string;
  locale: string;
  voice_language?: string;
  custom_instructions?: string;
  tools: string[];
  function_tools: string[];
  mcp_servers: string[];
  brand_name?: string | null;
  call_count_today?: number;
  max_concurrent_calls?: number | null;
  phone_limits?: Record<string, number | null>;
  phone_routes?: Array<{ phone_number: string; max_concurrent_calls?: number | null }>;
  schedule_status?: ScheduleStatus;
  default_instructions?: string;
  telephony?: AgentTelephonySummary;
  telephony_provision?: TelephonyProvisionResult[];
}

export interface AgentInstanceInput {
  slug: string;
  display_name: string;
  template_id: string;
  status?: string;
  phone_number?: string | null;
  phone_numbers?: string[];
  sip_trunk_id?: string | null;
  provider?: string;
  voice?: string;
  locale?: string;
  voice_language?: string;
  custom_instructions?: string;
  tools?: string[];
  function_tools?: string[];
  mcp_servers?: string[];
  brand_name?: string | null;
  max_concurrent_calls?: number | null;
  phone_limits?: Record<string, number | null>;
}

export interface TenantAgentsResponse {
  tenant: TenantRecord;
  agents: AgentInstanceRecord[];
  catalog: AgentsResponse["catalog"];
  worker?: { livekit_ready: boolean; xai_voice_ready: boolean };
}

export interface PlaygroundAgentOption {
  id: string;
  display_name: string;
  template_id: string;
  status: string;
  phone_number?: string | null;
}

export interface PlaygroundAgentsResponse {
  tenant: Pick<TenantRecord, "id" | "name" | "slug">;
  agents: PlaygroundAgentOption[];
}

export interface PlatformMetricsResponse {
  tenant_count: number;
  active_tenants: number;
  total_agents: number;
  tenants: TenantMetrics[];
}

export interface AgentScheduleRecord {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
}

export interface AgentScheduleInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string;
}

export interface VoiceToolExecuteInput {
  function_name: string;
  arguments?: Record<string, unknown>;
  phone_number: string;
  customer_name?: string;
  tenant_id?: string;
}

export interface VoiceToolExecuteResponse {
  output: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  status?: "ok" | "error";
  duration_ms?: number;
  handoff_agent?: string;
  event?: { type: string; detail: string };
}

export interface DemoCustomer {
  phone_number: string;
  name: string;
  email: string;
  vip: boolean;
  institution: string;
  account_masked: string;
  account_type: string;
  debit_card_masked: string;
  debit_card_exp: string;
  credit_card_masked?: string | null;
  products: string[];
  hint: string;
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
  tenant_id?: string;
  agent_instance_id?: string;
  vip?: boolean;
}

export interface LiveKitPlaygroundResponse {
  call_id?: string;
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

export interface VoiceSessionCompleteInput {
  call_id: string;
  agent: string;
  phone_number: string;
  customer_name?: string;
  tenant_id?: string;
  agent_instance_id?: string;
  start_time?: string;
  transcript: string;
}

export interface VoiceSessionResponse {
  call_id?: string;
  start_time?: string;
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
  tenant_id?: string;
  agent_instance_id?: string;
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
  events: { type: string; detail: string; tool?: string }[];
}