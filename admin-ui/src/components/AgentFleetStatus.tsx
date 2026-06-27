import { useQuery } from "@tanstack/react-query";
import { Bot, PhoneCall, Radio } from "lucide-react";
import { api } from "../lib/api";
import {
  countAgentsByStatus,
  deriveAgentLiveState,
  statusLabel,
  type AgentFleetItem,
} from "../lib/agentStatus";
import clsx from "clsx";

type Props = {
  tenantId: string;
  variant?: "compact" | "epic";
  className?: string;
};

function StatusDot({
  pulse,
  className,
  size = "sm",
}: {
  pulse?: boolean;
  className: string;
  size?: "sm" | "xs";
}) {
  const dim = size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span className={clsx("relative flex shrink-0", dim)}>
      {pulse && (
        <span className={clsx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", className)} />
      )}
      <span className={clsx("relative inline-flex rounded-full", dim, className)} />
    </span>
  );
}

export function AgentFleetStatus({ tenantId, variant = "compact", className }: Props) {
  const { data, isFetching } = useQuery({
    queryKey: ["supervisor", tenantId],
    queryFn: () => api.supervisor(),
    enabled: !!tenantId,
    refetchInterval: 5000,
  });

  const agents = data?.agents ?? [];
  const counts = countAgentsByStatus(agents);

  if (variant === "compact") {
    const subtitle = [
      counts.onCall > 0 ? `${counts.onCall} en llamada` : null,
      counts.paused > 0 ? `${counts.paused} pausado${counts.paused > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div className={clsx("min-w-0", className)}>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          Agentes activos
          <Radio className={clsx("h-2.5 w-2.5", isFetching && "animate-pulse text-cyan-400/80")} />
        </p>
        <p className="text-2xl font-semibold text-violet-200">
          {counts.active}
          <span className="text-lg font-normal text-slate-500">/{counts.total}</span>
        </p>
        {subtitle && <p className="mt-0.5 truncate text-[10px] text-slate-500">{subtitle}</p>}
        {agents.length > 0 && (
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
            {agents.map((agent) => {
              const live = deriveAgentLiveState(agent);
              return (
                <span
                  key={agent.id}
                  title={`${agent.display_name} · ${live.label}`}
                  className="inline-flex min-w-0 max-w-[5.5rem] items-center gap-0.5 text-[10px] text-slate-500"
                >
                  <StatusDot pulse={live.pulse} className={live.dotClass} size="xs" />
                  <span className="truncate">{agent.display_name}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className={clsx("relative overflow-hidden glass-card p-6", className)}>
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-500/20 ring-1 ring-white/10">
              <Bot className="h-6 w-6 text-violet-200" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold">Flota de agentes</h2>
              <p className="text-xs text-slate-500">Estados en tiempo real · actualiza cada 5s</p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
            <StatusDot pulse className="bg-emerald-400" />
            {isFetching ? "Sincronizando…" : "En vivo"}
          </span>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-surface-900 to-cyan-500/5 p-5">
              <p className="text-xs uppercase tracking-wide text-slate-500">Operativos ahora</p>
              <p className="mt-1 font-display text-5xl font-bold tabular-nums text-transparent bg-gradient-to-r from-violet-200 via-cyan-200 to-emerald-200 bg-clip-text">
                {counts.active}
                <span className="text-2xl font-semibold text-slate-500">/{counts.total}</span>
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {counts.onCall} en llamada · {counts.available} disponibles
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              {(
                [
                  { label: "En llamada", value: counts.onCall, color: "text-cyan-300", bg: "bg-cyan-500/10" },
                  { label: "Pausados", value: counts.paused, color: "text-amber-300", bg: "bg-amber-500/10" },
                  { label: "Borrador", value: counts.draft, color: "text-slate-400", bg: "bg-white/5" },
                ] as const
              ).map((s) => (
                <div key={s.label} className={clsx("rounded-xl px-2 py-3", s.bg)}>
                  <p className={clsx("font-display text-lg font-semibold", s.color)}>{s.value}</p>
                  <p className="text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {agents.length === 0 ? (
              <p className="col-span-2 text-sm text-slate-500">Sin agentes configurados</p>
            ) : (
              agents.map((agent) => {
                const live = deriveAgentLiveState(agent);
                const onCall = (agent.active_calls ?? 0) > 0;
                return (
                  <div
                    key={agent.id}
                    className={clsx(
                      "group relative overflow-hidden rounded-xl border px-4 py-3 transition",
                      onCall
                        ? "border-cyan-400/30 bg-gradient-to-br from-cyan-500/15 to-violet-500/5 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20",
                    )}
                  >
                    {onCall && (
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.15),transparent_55%)]" />
                    )}
                    <div className="relative flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-100">{agent.display_name}</p>
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                          {statusLabel(agent.status)}
                        </p>
                      </div>
                      <StatusDot pulse={live.pulse} className={live.dotClass} />
                    </div>
                    <div className="relative mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className={clsx("rounded-md px-2 py-0.5", live.textClass, "bg-white/5")}>
                        {live.label}
                      </span>
                      {onCall && (
                        <span className="flex items-center gap-1 text-cyan-200">
                          <PhoneCall className="h-3 w-3" />
                          {agent.active_calls}
                          {agent.max_concurrent_calls != null && `/${agent.max_concurrent_calls}`}
                        </span>
                      )}
                      <span className="text-slate-500">{agent.call_count_today} hoy</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}