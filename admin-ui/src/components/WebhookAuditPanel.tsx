import { useQuery } from "@tanstack/react-query";
import { CheckCircle, History, XCircle } from "lucide-react";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";
import clsx from "clsx";

export function WebhookAuditPanel() {
  const { tenantId } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["webhook-deliveries", tenantId],
    queryFn: () => api.webhookDeliveries(),
    enabled: !!tenantId,
  });

  if (!tenantId) return null;

  return (
    <section className="glass-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-violet-400" />
        <h2 className="font-display text-lg font-semibold">Auditoría de webhooks</h2>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando entregas…</p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {data?.items.map((d) => (
            <li key={d.id} className="rounded-xl bg-white/5 px-4 py-2 text-xs">
              <div className="flex items-center gap-2">
                {d.success ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                )}
                <span className="font-mono text-cyan-200">{d.event}</span>
                <span className="text-slate-500">{d.created_at?.slice(0, 19)}</span>
                {d.status_code != null && (
                  <span className={clsx(d.success ? "text-emerald-300" : "text-red-300")}>
                    HTTP {d.status_code}
                  </span>
                )}
                <span className="text-slate-600">×{d.attempts}</span>
              </div>
              <p className="truncate text-slate-500">{d.url}</p>
              {d.error && <p className="text-red-300/80">{d.error}</p>}
            </li>
          ))}
          {!data?.items.length && <p className="text-sm text-slate-500">Sin entregas registradas</p>}
        </ul>
      )}
    </section>
  );
}