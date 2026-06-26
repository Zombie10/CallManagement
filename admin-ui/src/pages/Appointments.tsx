import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { api } from "../lib/api";

export function Appointments() {
  const { data, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.appointments(),
  });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando citas...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Citas & Callbacks</h1>
        <p className="mt-1 text-slate-400">{data.total} citas programadas</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {data.items.map((appt) => (
          <div key={appt.id} className="glass-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-500/10 p-2">
                <Calendar className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-200">{appt.purpose}</p>
                <p className="mt-1 text-sm text-cyan-300">{appt.scheduled_time}</p>
                <p className="mt-1 font-mono text-xs text-slate-500">{appt.customer_phone}</p>
                <p className="mt-1 font-mono text-xs text-slate-600">{appt.id}</p>
              </div>
            </div>
          </div>
        ))}
        {data.items.length === 0 && (
          <div className="glass-card col-span-full py-12 text-center text-slate-500">
            Sin citas programadas
          </div>
        )}
      </div>
    </div>
  );
}