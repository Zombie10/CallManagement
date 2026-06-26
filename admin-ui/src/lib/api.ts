const API = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
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

export interface AgentProfile {
  name: string;
  display_name: string;
  provider: string;
  voice: string;
  locale: string;
  tools: string[];
  mcp_servers: string[];
  enabled: boolean;
}

export interface AgentProfileInput {
  name: string;
  display_name?: string;
  provider?: string;
  voice?: string;
  locale?: string;
  tools?: string[];
  mcp_servers?: string[];
  enabled?: boolean;
}

export interface AgentsCatalog {
  available_tools: string[];
  available_locales: string[];
  available_providers: string[];
  available_xai_voices: string[];
  protected_agents: string[];
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