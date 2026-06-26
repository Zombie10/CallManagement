import { useQuery } from "@tanstack/react-query";
import { Activity, Crown, Phone, Radio, Users, Calendar, Clock } from "lucide-react";
import { api } from "../lib/api";
import { StatCard } from "../components/StatCard";
import clsx from "clsx";

function CallsByDayChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  if (!data.length) {
    return <p className="text-sm text-slate-500">Sin datos de los últimos 14 días</p>;
  }
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d) => (
        <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-gradient-to-t from-cyan-600/60 to-cyan-400/40 transition group-hover:from-cyan-500/70"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
            title={`${d.day}: ${d.count}`}
          />
          <span className="hidden text-[10px] text-slate-500 sm:block">
            {d.day.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando dashboard...</div>;
  }

  const { stats, runtime, worker, analytics, tenant } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-slate-400">
            {tenant.name} · Vista general del contact center
          </p>
        </div>
        {tenant.logo_url && (
          <img src={tenant.logo_url} alt="" className="h-10 rounded-lg object-contain" />
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Clientes" value={stats.customers} icon={Users} />
        <StatCard title="Llamadas" value={stats.calls} icon={Phone} accent="from-violet-500/20 to-purple-600/10" />
        <StatCard title="Citas" value={stats.appointments} icon={Calendar} accent="from-emerald-500/20 to-green-600/10" />
        <StatCard title="VIP" value={stats.vip_customers} icon={Crown} accent="from-amber-500/20 to-orange-600/10" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <h2 className="mb-4 font-display text-lg font-semibold">Llamadas por día</h2>
          <CallsByDayChart data={analytics.calls_by_day} />
          <p className="mt-3 text-xs text-slate-500">
            Duración promedio: {analytics.avg_duration_seconds}s · Activas ahora: {worker.active_calls_tenant}
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">Worker</h2>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">LiveKit</dt>
              <dd className={clsx(worker.livekit_ready ? "text-emerald-300" : "text-red-300")}>
                {worker.livekit_ready ? "Listo" : "No configurado"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Worker</dt>
              <dd>{worker.requires_worker ? "Requerido" : "OK"}</dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Llamadas activas</dt>
              <dd className="font-medium text-cyan-300">
                {worker.active_calls_tenant} / {worker.active_calls_global} global
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Hoy (empresa)</dt>
              <dd>{tenant.metrics?.calls_today ?? 0} / {tenant.metrics?.max_calls_per_day ?? "—"}</dd>
            </div>
          </dl>
          {worker.livekit_issues.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs text-amber-200">
              {worker.livekit_issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">Runtime</h2>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Provider</dt>
              <dd className="font-medium text-cyan-300">{runtime.provider}</dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Grok Realtime</dt>
              <dd>{runtime.grok_realtime ? "Activo" : "Off"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Remote MCP</dt>
              <dd>{runtime.remote_mcp ? `Activo (${runtime.mcp_servers} servers)` : "Off"}</dd>
            </div>
          </dl>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">Outcomes</h2>
          </div>
          <div className="space-y-2">
            {Object.entries(analytics.outcomes).map(([outcome, count]) => (
              <div key={outcome} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="capitalize text-slate-300">{outcome.replaceAll("_", " ")}</span>
                <span className="font-semibold text-cyan-300">{count}</span>
              </div>
            ))}
            {Object.keys(analytics.outcomes).length === 0 && (
              <p className="text-sm text-slate-500">Sin llamadas registradas aún</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}