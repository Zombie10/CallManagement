import { agentLabel } from "./agents";
import type { CallReportDetailRow } from "./api";
import { translate, type AdminLocale } from "./i18n";

export function channelLabel(channel?: string | null, locale?: AdminLocale): string {
  const id = channel || "sip";
  const key = `channel.${id}`;
  const text = translate(key, locale);
  if (text !== key) return text;
  return channel || translate("channel.sip", locale);
}

export function channelFilterOptions(locale?: AdminLocale) {
  return [
    { value: "sip", label: channelLabel("sip", locale) },
    { value: "voice_livekit", label: channelLabel("voice_livekit", locale) },
    { value: "voice_xai", label: channelLabel("voice_xai", locale) },
    { value: "chat", label: channelLabel("chat", locale) },
  ];
}

export const CHANNEL_FILTER_OPTIONS = channelFilterOptions();

export function dimensionLabel(id: string, locale?: AdminLocale): string {
  const key = `dimension.${id}`;
  const text = translate(key, locale);
  return text === key ? id : text;
}

export function templateAgentFromSummary(summary?: string | null): string | null {
  if (!summary) return null;
  const match = summary.match(/(?:Final agent|Agente final):\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

export type AgentInstanceRef = {
  id: string;
  label: string;
  template_id?: string | null;
};

export function formatAgentsHandled(
  row: Pick<CallReportDetailRow, "agent_instance_id" | "transferred_to" | "summary">,
  agentMap: Map<string, string>,
  instances: AgentInstanceRef[] = [],
): string {
  if (row.agent_instance_id && row.agent_instance_id !== "unassigned") {
    return agentMap.get(row.agent_instance_id) || row.agent_instance_id.slice(0, 8);
  }

  const templateId = (row.transferred_to || templateAgentFromSummary(row.summary) || "").trim();
  if (templateId && templateId !== "unknown" && templateId !== "sin_plantilla") {
    const matches = instances.filter((agent) => agent.template_id === templateId);
    if (matches.length === 1) return matches[0].label;
    return agentLabel(templateId);
  }

  return "—";
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
  if (metric === "sum_duration" || metric === "avg_duration") return formatDuration(value);
  return String(value);
}