import type { ScheduleStatus } from "./api";
import { DEFAULT_ADMIN_LOCALE, translate, type AdminLocale } from "./i18n";

export type AgentFleetItem = {
  id: string;
  display_name: string;
  status: string;
  call_count_today: number;
  max_concurrent_calls?: number | null;
  active_calls?: number;
  at_capacity?: boolean;
  schedule_status?: ScheduleStatus;
};

export type AgentLiveState = {
  key: string;
  label: string;
  dotClass: string;
  textClass: string;
  pulse?: boolean;
};

const STATUS_KEYS: Record<string, string> = {
  active: "fleet.status.active",
  paused: "fleet.status.paused",
  draft: "fleet.status.draft",
};

export function statusLabel(status: string, locale: AdminLocale = DEFAULT_ADMIN_LOCALE): string {
  const key = STATUS_KEYS[status];
  return key ? translate(key, locale) : status;
}

export function deriveAgentLiveState(
  agent: AgentFleetItem,
  locale: AdminLocale = DEFAULT_ADMIN_LOCALE,
): AgentLiveState {
  if (agent.status === "draft") {
    return {
      key: "draft",
      label: translate("fleet.status.draft", locale),
      dotClass: "bg-slate-500",
      textClass: "text-slate-400",
    };
  }
  if (agent.status === "paused") {
    return {
      key: "paused",
      label: translate("fleet.status.paused", locale),
      dotClass: "bg-amber-400",
      textClass: "text-amber-200",
    };
  }
  if (agent.schedule_status === "closed") {
    return {
      key: "closed",
      label: translate("fleet.live.closed", locale),
      dotClass: "bg-red-400",
      textClass: "text-red-300",
    };
  }
  const onCall = (agent.active_calls ?? 0) > 0;
  if (onCall) {
    return {
      key: "on_call",
      label: translate(agent.at_capacity ? "fleet.live.onCallFull" : "fleet.live.onCall", locale),
      dotClass: "bg-cyan-400",
      textClass: "text-cyan-200",
      pulse: true,
    };
  }
  if (agent.at_capacity) {
    return {
      key: "capacity",
      label: translate("fleet.live.capacity", locale),
      dotClass: "bg-orange-400",
      textClass: "text-orange-200",
    };
  }
  return {
    key: "available",
    label: translate("fleet.live.available", locale),
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-200",
  };
}

export function countAgentsByStatus(agents: AgentFleetItem[]) {
  return {
    total: agents.length,
    active: agents.filter((a) => a.status === "active").length,
    paused: agents.filter((a) => a.status === "paused").length,
    draft: agents.filter((a) => a.status === "draft").length,
    onCall: agents.filter((a) => (a.active_calls ?? 0) > 0).length,
    available: agents.filter((a) => {
      const s = deriveAgentLiveState(a);
      return s.key === "available";
    }).length,
  };
}