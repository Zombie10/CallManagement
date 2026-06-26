import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../contexts/TenantContext";
import { api, type TenantCreateInput } from "../lib/api";
import clsx from "clsx";

export function Tenants() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setTenantId } = useTenant();
  const { data, isLoading } = useQuery({ queryKey: ["tenants"], queryFn: api.listTenants });
  const { data: platform } = useQuery({ queryKey: ["platform-metrics"], queryFn: api.platformMetrics });
  const [form, setForm] = useState<TenantCreateInput>({ slug: "", name: "" });

  const create = useMutation({
    mutationFn: () => api.createTenant(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setForm({ slug: "", name: "" });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTenant(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenants"] }),
  });

  if (isLoading) {
    return <div className="glass-card p-8 text-slate-400">Cargando empresas…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Orquestador — Empresas</h1>
        <p className="mt-1 text-slate-400">
          {platform?.tenant_count ?? 0} empresas · {platform?.total_agents ?? 0} agentes en total
        </p>
      </header>

      <div className="glass-card p-4">
        <p className="mb-3 text-sm font-medium text-slate-300">Nueva empresa</p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input-field w-40"
            placeholder="slug (bac-hn)"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
          <input
            className="input-field min-w-[200px] flex-1"
            placeholder="Nombre visible"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!form.slug || !form.name || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.tenants || []).map((t) => (
          <div key={t.id} className="glass-card p-5 transition hover:ring-1 hover:ring-cyan-400/20">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: (t.brand_color || "#06b6d4") + "33" }}
                >
                  <Building2 className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.slug}</p>
                </div>
              </div>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs",
                  t.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
                )}
              >
                {t.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <p>Agentes: {t.metrics?.agent_count ?? 0}/{t.max_agents}</p>
              <p>Activos: {t.metrics?.active_agents ?? 0}</p>
              <p>Llamadas hoy: {t.metrics?.calls_today ?? 0}</p>
              <p>Límite/día: {t.max_calls_per_day}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1 text-sm"
                onClick={() => {
                  setTenantId(t.id);
                  navigate("/my-agents");
                }}
              >
                Gestionar
              </button>
              {t.slug !== "default" && (
                <button
                  type="button"
                  className="btn-ghost text-red-300"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(t.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}