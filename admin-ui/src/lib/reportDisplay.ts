import { agentLabel } from "./agents";
import type { CallReportDetailRow } from "./api";

const CHANNEL_LABELS: Record<string, string> = {
  sip: "Teléfono",
  voice_livekit: "Voz LiveKit",
  voice_xai: "Voz xAI",
  chat: "Chat",
};

const DIMENSION_LABELS: Record<string, string> = {
  day: "Día",
  hour: "Hora",
  weekday: "Día semana",
  outcome: "Outcome",
  agent: "Agente instancia",
  template: "Plantilla agente",
  channel: "Canal",
  month: "Mes",
};

export const CHANNEL_FILTER_OPTIONS = [
  { value: "sip", label: "Teléfono" },
  { value: "voice_livekit", label: "Voz LiveKit" },
  { value: "voice_xai", label: "Voz xAI" },
  { value: "chat", label: "Chat" },
];

export function channelLabel(channel?: string | null): string {
  if (!channel) return "Teléfono";
  return CHANNEL_LABELS[channel] || channel;
}

export function dimensionLabel(id: string): string {
  return DIMENSION_LABELS[id] || id;
}

export function templateAgentFromSummary(summary?: string | null): string | null {
  if (!summary) return null;
  const match = summary.match(/Final agent:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

export function formatAgentsHandled(
  row: Pick<CallReportDetailRow, "agent_instance_id" | "transferred_to" | "summary">,
  agentMap: Map<string, string>,
): string {
  const parts: string[] = [];

  if (row.agent_instance_id && row.agent_instance_id !== "unassigned") {
    parts.push(agentMap.get(row.agent_instance_id) || row.agent_instance_id.slice(0, 8));
  }

  const templateId = row.transferred_to || templateAgentFromSummary(row.summary);
  if (templateId && templateId !== "unknown" && templateId !== "sin_plantilla") {
    const tpl = agentLabel(templateId);
    if (!parts.includes(tpl)) parts.push(tpl);
  }

  return parts.length ? parts.join(" → ") : "—";
}

export function formatDetailExcerpt(row: CallReportDetailRow, maxLen = 160): string {
  const chunks: string[] = [];
  if (row.summary?.trim()) chunks.push(row.summary.trim());
  if (row.agent_notes?.trim()) chunks.push(`Notas: ${row.agent_notes.trim()}`);
  const text = chunks.join(" · ");
  if (!text) return "—";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function formatMetricValue(
  metric: "count" | "sum_duration" | "avg_duration",
  value: number,
): string {
  if (metric === "count") return String(value);
  if (metric === "sum_duration") return formatDuration(value);
  return `${value}s prom.`;
}