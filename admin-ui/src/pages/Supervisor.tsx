import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Headphones, Phone, Radio, Users } from "lucide-react";
import { api } from "../lib/api";
import clsx from "clsx";

export function Supervisor() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["supervisor"],
    queryFn: api.supervisor,
    refetchInterval: 5000,
  });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando panel supervisor…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Supervisor</h1>
          <p className="mt-1 text-slate-400">Llamadas activas y alertas en tiempo real</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => refetch()} disabled={isFetching}>
          <Radio className={clsx("h-4 w-4", isFetching && "animate-pulse")} />
          Actualizar
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Activas</p>
          <p className="font-display text-2xl font-semibold text-cyan-200">{data.active_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">En cola</p>
          <p className="font-display text-2xl font-semibold text-amber-200">{data.queued_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Grabando</p>
          <p className="font-display text-2xl font-semibold text-emerald-200">{data.recording_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">Llamadas hoy</p>
          <p className="font-display text-2xl font-semibold">{data.tenant_metrics?.calls_today ?? 0}</p>
        </div>
      </div>

      {data.alerts?.length > 0 && (
        <section className="glass-card space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Alertas
          </h2>
          {data.alerts.map((a, i) => (
            <p
              key={i}
              className={clsx(
                "rounded-lg px-3 py-2 text-sm",
                a.level === "warning" ? "bg-amber-500/10 text-amber-200" : "bg-cyan-500/10 text-cyan-200",
              )}
            >
              {a.message}
            </p>
          ))}
        </section>
      )}

      <section className="glass-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Phone className="h-5 w-5 text-cyan-400" />
          Llamadas en curso
        </h2>
        {data.calls?.length ? (
          <div className="space-y-2">
            {data.calls.map((c) => (
              <div
                key={c.call_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-mono text-cyan-200">{c.from_number}</p>
                  <p className="text-xs text-slate-500">
                    {c.channel} · {c.started_at?.slice(0, 19)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.queued && (
                    <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs text-amber-200">Cola</span>
                  )}
                  {c.recording && (
                    <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">
                      <Headphones className="inline h-3 w-3" /> REC
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sin llamadas activas</p>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5 text-violet-400" />
          Agentes
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.agents?.map((a) => (
            <div key={a.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
              <p className="font-medium text-slate-200">{a.display_name}</p>
              <p className="text-xs text-slate-500">
                {a.status} · {a.call_count_today} llamadas hoy
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Grabación SIP: {data.recordings?.egress_configured ? "S3/Egress configurado" : "Solo local/playground"}
        </p>
      </section>
    </div>
  );
}