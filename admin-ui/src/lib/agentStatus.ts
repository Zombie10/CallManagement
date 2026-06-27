import type { ScheduleStatus } from "./api";

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

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  draft: "Borrador",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function deriveAgentLiveState(agent: AgentFleetItem): AgentLiveState {
  if (agent.status === "draft") {
    return {
      key: "draft",
      label: "Borrador",
      dotClass: "bg-slate-500",
      textClass: "text-slate-400",
    };
  }
  if (agent.status === "paused") {
    return {
      key: "paused",
      label: "Pausado",
      dotClass: "bg-amber-400",
      textClass: "text-amber-200",
    };
  }
  if (agent.schedule_status === "closed") {
    return {
      key: "closed",
      label: "Fuera de horario",
      dotClass: "bg-red-400",
      textClass: "text-red-300",
    };
  }
  const onCall = (agent.active_calls ?? 0) > 0;
  if (onCall) {
    return {
      key: "on_call",
      label: agent.at_capacity ? "En llamada · lleno" : "En llamada",
      dotClass: "bg-cyan-400",
      textClass: "text-cyan-200",
      pulse: true,
    };
  }
  if (agent.at_capacity) {
    return {
      key: "capacity",
      label: "Al máximo",
      dotClass: "bg-orange-400",
      textClass: "text-orange-200",
    };
  }
  return {
    key: "available",
    label: "Disponible",
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