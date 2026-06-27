import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Webhook } from "lucide-react";
import { useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

export function WebhooksPanel() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["call.ended", "call.started", "appointment.created"]);
  const [error, setError] = useState<string | null>(null);

  const { data: eventCatalog } = useQuery({
    queryKey: ["webhook-events"],
    queryFn: api.webhookEvents,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["webhooks", tenantId],
    queryFn: api.listWebhooks,
    enabled: !!tenantId,
  });

  const create = useMutation({
    mutationFn: () => api.createWebhook({ url, events }),
    onSuccess: async () => {
      setUrl("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  if (!tenantId) {
    return <p className="text-sm text-slate-500">Selecciona una empresa para gestionar webhooks.</p>;
  }

  return (
    <section className="glass-card p-6">
      <div className="mb-5 flex items-center gap-2">
        <Webhook className="h-5 w-5 text-cyan-400" />
        <h2 className="font-display text-lg font-semibold">Webhooks</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Eventos: call.started, call.ended, appointment.*, agent.handoff (con reintentos y auditoría).
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {(eventCatalog?.events || ["call.ended"]).map((ev) => (
          <button
            key={ev}
            type="button"
            onClick={() =>
              setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]))
            }
            className={`rounded-lg px-2 py-1 font-mono text-xs ${
              events.includes(ev) ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-500"
            }`}
          >
            {ev}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-300">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input-field min-w-[240px] flex-1"
          placeholder="https://tu-servidor.com/hooks/calls"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={!url.startsWith("http") || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <ul className="space-y-2">
          {(data?.webhooks || []).map((hook) => (
            <li
              key={hook.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-cyan-200/90">{hook.url}</p>
                <p className="text-xs text-slate-500">{hook.events.join(", ")}</p>
              </div>
              <button
                type="button"
                className="btn-ghost px-2 text-red-300"
                disabled={remove.isPending}
                onClick={() => remove.mutate(hook.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {!data?.webhooks.length && (
            <li className="py-4 text-center text-sm text-slate-500">Sin webhooks configurados</li>
          )}
        </ul>
      )}
    </section>
  );
}