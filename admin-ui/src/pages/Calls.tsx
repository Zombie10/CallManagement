import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { api } from "../lib/api";

export function Calls() {
  const { data, isLoading } = useQuery({ queryKey: ["calls"], queryFn: () => api.calls() });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando llamadas...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Historial de llamadas</h1>
        <p className="mt-1 text-slate-400">{data.total} registros</p>
      </header>

      <div className="space-y-3">
        {data.items.map((call) => (
          <div key={call.call_id} className="glass-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm text-cyan-300">{call.call_id}</p>
                <p className="mt-1 text-sm text-slate-300">
                  <Phone className="mr-1 inline h-3.5 w-3.5" />
                  {call.from_number}
                </p>
              </div>
              <div className="text-right text-sm">
                <span className="rounded-lg bg-white/5 px-2 py-1 capitalize text-slate-300">
                  {call.outcome?.replaceAll("_", " ") || "unknown"}
                </span>
                {call.duration_seconds != null && (
                  <p className="mt-1 text-xs text-slate-500">{call.duration_seconds}s</p>
                )}
              </div>
            </div>
            {call.summary && (
              <p className="mt-3 line-clamp-2 text-sm text-slate-400">{call.summary}</p>
            )}
          </div>
        ))}
        {data.items.length === 0 && (
          <div className="glass-card py-12 text-center text-slate-500">Sin llamadas registradas</div>
        )}
      </div>
    </div>
  );
}