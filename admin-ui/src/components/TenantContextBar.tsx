import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Select } from "./Select";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

const TENANT_SCOPED_ROLES = new Set(["super_admin", "admin", "playground", "viewer"]);

type Props = {
  /** Stronger styling for playground / agent testing */
  emphasis?: boolean;
  agentLabel?: string | null;
};

export function TenantContextBar({ emphasis = false, agentLabel }: Props) {
  const { tenant, tenantId, isSuperAdmin, setTenantId, loading } = useTenant();
  const { data: tenantsList } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants,
    enabled: isSuperAdmin,
  });

  const tenantOptions =
    tenantsList?.tenants.map((t) => ({
      value: t.id,
      label: t.name,
      description: t.slug,
    })) ?? [];

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-500">
        Cargando empresa…
      </div>
    );
  }

  const accent = tenant?.brand_color || "#06b6d4";
  const showTenantPicker = isSuperAdmin && tenantOptions.length > 0;

  return (
    <div
      className={clsx(
        "flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-2.5",
        emphasis
          ? "border-cyan-400/25 bg-gradient-to-r from-cyan-500/10 to-transparent shadow-glow"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      {!showTenantPicker && (
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}33` }}
          >
            <Building2 className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Empresa activa
            </p>
            {tenant ? (
              <p className="truncate font-medium text-slate-100">
                {tenant.name}
                <span className="ml-2 font-mono text-xs font-normal text-slate-500">{tenant.slug}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-300">Ninguna empresa seleccionada</p>
            )}
            {agentLabel && (
              <p className="truncate text-xs text-cyan-300/90">
                Agente: <span className="font-medium">{agentLabel}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {showTenantPicker && (
        <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${accent}33` }}
          >
            <Building2 className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Empresa activa
            </p>
            {tenant ? (
              <p className="truncate font-medium text-slate-100">
                {tenant.name}
                <span className="ml-2 font-mono text-xs font-normal text-slate-500">{tenant.slug}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-300">Ninguna empresa seleccionada</p>
            )}
            {agentLabel && (
              <p className="truncate text-xs text-cyan-300/90">
                Agente: <span className="font-medium">{agentLabel}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        {showTenantPicker && (
          <div className="w-full min-w-0 sm:w-56">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500 sm:sr-only">
              Empresa activa
            </p>
            <Select
              className="w-full"
              value={tenantId || ""}
              onChange={(id) => setTenantId(id || null)}
              options={tenantOptions}
              placeholder="Cambiar empresa…"
              size="sm"
            />
          </div>
        )}
        {isSuperAdmin && (
          <Link to="/tenants" className="btn-ghost w-full justify-center px-2 py-1.5 text-xs sm:w-auto">
            Empresas
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
        {!tenantId && (
          <Link
            to={isSuperAdmin ? "/tenants" : "/my-agents"}
            className="btn-primary w-full justify-center px-3 py-1.5 text-xs sm:w-auto"
          >
            {isSuperAdmin ? "Elegir empresa" : "Configurar empresa"}
          </Link>
        )}
      </div>

      {showTenantPicker && agentLabel && (
        <p className="truncate text-xs text-cyan-300/90 sm:hidden">
          Agente: <span className="font-medium">{agentLabel}</span>
        </p>
      )}
    </div>
  );
}

export function shouldShowTenantBar(role: string | undefined): boolean {
  return !!role && TENANT_SCOPED_ROLES.has(role);
}