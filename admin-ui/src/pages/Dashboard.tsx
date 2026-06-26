import { useQuery } from "@tanstack/react-query";
import { Activity, Crown, Phone, Users, Calendar } from "lucide-react";
import { api } from "../lib/api";
import { StatCard } from "../components/StatCard";

export function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando dashboard...</div>;
  }

  const { stats, runtime } = data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-slate-400">Vista general del contact center y runtime activo</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Clientes" value={stats.customers} icon={Users} />
        <StatCard title="Llamadas" value={stats.calls} icon={Phone} accent="from-violet-500/20 to-purple-600/10" />
        <StatCard title="Citas" value={stats.appointments} icon={Calendar} accent="from-emerald-500/20 to-green-600/10" />
        <StatCard title="VIP" value={stats.vip_customers} icon={Crown} accent="from-amber-500/20 to-orange-600/10" />
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
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Remote MCP</dt>
              <dd>{runtime.remote_mcp ? `Activo (${runtime.mcp_servers} servers)` : "Off"}</dd>
            </div>
          </dl>
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 font-display text-lg font-semibold">Outcomes recientes</h2>
          <div className="space-y-2">
            {Object.entries(stats.outcomes).map(([outcome, count]) => (
              <div key={outcome} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="capitalize text-slate-300">{outcome.replaceAll("_", " ")}</span>
                <span className="font-semibold text-cyan-300">{count}</span>
              </div>
            ))}
            {Object.keys(stats.outcomes).length === 0 && (
              <p className="text-sm text-slate-500">Sin llamadas registradas aún</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}