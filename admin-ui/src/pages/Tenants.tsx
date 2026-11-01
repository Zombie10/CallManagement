import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "../contexts/TenantContext";
import { useUiLocale } from "../contexts/LocaleContext";
import { api, type TenantCreateInput, type TenantRecord, type TenantUpdateInput } from "../lib/api";
import clsx from "clsx";

export function Tenants() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setTenantId } = useTenant();
  const { t } = useUiLocale();
  const { data, isLoading } = useQuery({ queryKey: ["tenants"], queryFn: api.listTenants });
  const { data: platform } = useQuery({ queryKey: ["platform-metrics"], queryFn: api.platformMetrics });
  const [form, setForm] = useState<TenantCreateInput>({ slug: "", name: "" });
  const [editing, setEditing] = useState<TenantRecord | null>(null);
  const [editDraft, setEditDraft] = useState<TenantUpdateInput>({});
  const [activeNotice, setActiveNotice] = useState<string | null>(null);

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

  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error(t("tenants.missing"));
      return api.updateTenant(editing.id, editDraft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setEditing(null);
    },
  });

  const openEdit = (t: TenantRecord) => {
    setEditing(t);
    setEditDraft({
      name: t.name,
      brand_color: t.brand_color || "#06b6d4",
      logo_url: t.logo_url || "",
      max_agents: t.max_agents,
      max_calls_per_day: t.max_calls_per_day,
    });
  };

  if (isLoading) {
    return <div className="glass-card p-8 text-slate-400">{t("tenants.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("tenants.title")}</h1>
        <p className="mt-1 text-slate-400">
          {t("tenants.summary", {
            companies: platform?.tenant_count ?? 0,
            agents: platform?.total_agents ?? 0,
          })}
        </p>
      </header>
      {activeNotice && (
        <p role="status" className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          {t("common.activeCompany", { name: activeNotice })}
        </p>
      )}

      <div className="glass-card p-4">
        <p className="mb-3 text-sm font-medium text-slate-300">{t("tenants.new")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]">
          <input
            className="input-field min-w-0 w-full"
            placeholder={t("tenants.slugPlaceholder")}
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          />
          <input
            className="input-field min-w-0 w-full"
            placeholder={t("tenants.namePlaceholder")}
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
            {t("common.create")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.tenants || []).map((company) => (
          <div key={company.id} className="glass-card p-5 transition hover:ring-1 hover:ring-cyan-400/20">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: (company.brand_color || "#06b6d4") + "33" }}
                >
                  <Building2 className="h-5 w-5 text-cyan-300" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">{company.name}</p>
                  <p className="text-xs text-slate-500">{company.slug}</p>
                </div>
              </div>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs",
                  company.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
                )}
              >
                {company.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
              <p>{t("tenants.agents", { used: company.metrics?.agent_count ?? 0, max: company.max_agents })}</p>
              <p>{t("tenants.activeAgents", { count: company.metrics?.active_agents ?? 0 })}</p>
              <p>{t("tenants.callsToday", { count: company.metrics?.calls_today ?? 0 })}</p>
              <p>{t("tenants.dailyLimit", { count: company.max_calls_per_day })}</p>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1 text-sm"
                onClick={() => {
                  setTenantId(company.id);
                  setActiveNotice(company.name);
                  navigate("/my-agents", { state: { activeCompanyNotice: company.name } });
                }}
              >
                {t("tenants.manage")}
              </button>
              <button type="button" className="btn-ghost px-2" onClick={() => openEdit(company)}>
                <Pencil className="h-4 w-4" />
              </button>
              {company.slug !== "default" && (
                <button
                  type="button"
                  className="btn-ghost text-red-300"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(t("tenants.confirmDelete", { name: company.name }))) {
                      remove.mutate(company.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="glass-card fixed inset-x-4 bottom-4 z-40 max-h-[80vh] overflow-y-auto p-6 shadow-2xl md:inset-x-auto md:left-1/2 md:top-1/2 md:w-[420px] md:-translate-x-1/2 md:-translate-y-1/2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t("tenants.edit", { name: editing.name })}</h2>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{t("common.name")}</span>
              <input
                className="input-field w-full"
                value={editDraft.name || ""}
                onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{t("tenants.logoUrl")}</span>
              <input
                className="input-field w-full"
                placeholder="https://..."
                value={editDraft.logo_url || ""}
                onChange={(e) => setEditDraft((d) => ({ ...d, logo_url: e.target.value || null }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500">{t("tenants.brandColor")}</span>
              <div className="flex gap-2">
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
                  value={editDraft.brand_color || "#06b6d4"}
                  onChange={(e) => setEditDraft((d) => ({ ...d, brand_color: e.target.value }))}
                />
                <input
                  className="input-field flex-1 font-mono text-sm"
                  value={editDraft.brand_color || ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, brand_color: e.target.value }))}
                />
              </div>
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={update.isPending}
              onClick={() => update.mutate()}
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}