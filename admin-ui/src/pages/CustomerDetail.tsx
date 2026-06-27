import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar, FileText, MessageSquare, Phone, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

export function CustomerDetail() {
  const { phone = "" } = useParams();
  const decoded = decodeURIComponent(phone);
  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-profile", decoded],
    queryFn: () => api.customerProfile(decoded),
    enabled: !!decoded,
  });

  if (isLoading) {
    return <div className="glass-card p-8 text-slate-400">Cargando ficha cliente…</div>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/customers" className="btn-ghost inline-flex w-fit">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <div className="glass-card p-8 text-red-300">Cliente no encontrado.</div>
      </div>
    );
  }

  const { customer, calls, appointments, chat_sessions, stats } = data;

  return (
    <div className="space-y-6">
      <Link to="/customers" className="btn-ghost inline-flex w-fit">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      <header className="glass-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold">{customer.name || "Sin nombre"}</h1>
            <p className="mt-1 font-mono text-cyan-300">{customer.phone_number}</p>
            {customer.email && <p className="text-sm text-slate-400">{customer.email}</p>}
          </div>
          {customer.vip && (
            <span className="rounded-lg bg-amber-500/15 px-3 py-1 text-sm text-amber-200">VIP</span>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-xs text-slate-500">Llamadas</p>
            <p className="text-xl font-semibold">{stats.total_calls}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-xs text-slate-500">Transferencias</p>
            <p className="text-xl font-semibold">{stats.handoffs}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-xs text-slate-500">Escalaciones</p>
            <p className="text-xl font-semibold">{stats.escalations}</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-xs text-slate-500">Citas</p>
            <p className="text-xl font-semibold">{stats.appointments}</p>
          </div>
        </div>
        {customer.notes && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Notas</p>
            <pre className="whitespace-pre-wrap rounded-xl bg-black/20 p-3 text-sm text-slate-300">
              {customer.notes}
            </pre>
          </div>
        )}
      </header>

      <section className="glass-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Phone className="h-4 w-4 text-cyan-400" />
          Historial de llamadas
        </h2>
        <div className="space-y-2">
          {calls.slice(0, 10).map((c) => (
            <Link
              key={c.call_id}
              to={`/calls/${encodeURIComponent(c.call_id)}`}
              className="block rounded-xl bg-white/5 px-4 py-3 text-sm hover:bg-white/10"
            >
              <span className="font-mono text-cyan-200">{c.call_id}</span>
              <span className="ml-2 text-slate-500">
                {c.start_time?.slice(0, 16)} · {c.outcome || "—"}
              </span>
            </Link>
          ))}
          {!calls.length && <p className="text-sm text-slate-500">Sin llamadas</p>}
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <MessageSquare className="h-4 w-4 text-violet-400" />
          Chats
        </h2>
        <div className="space-y-2">
          {chat_sessions.map((s) => (
            <div key={s.session_id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
              <p className="font-mono text-slate-300">{s.session_id}</p>
              <p className="text-xs text-slate-500">
                {s.started_at?.slice(0, 16)} · {s.message_count} mensajes
              </p>
            </div>
          ))}
          {!chat_sessions.length && <p className="text-sm text-slate-500">Sin chats guardados</p>}
        </div>
      </section>

      <section className="glass-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Calendar className="h-4 w-4 text-emerald-400" />
          Citas
        </h2>
        <div className="space-y-2">
          {appointments.map((a) => (
            <div key={a.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
              <p className="font-medium">{a.purpose}</p>
              <p className="text-xs text-slate-500">{a.scheduled_time}</p>
            </div>
          ))}
          {!appointments.length && <p className="text-sm text-slate-500">Sin citas</p>}
        </div>
      </section>
    </div>
  );
}