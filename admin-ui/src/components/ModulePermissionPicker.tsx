import { useMemo } from "react";
import type { AdminModule, AdminRole } from "../lib/api";
import { defaultModulesForRole, modulesForRole } from "../lib/permissions";
import clsx from "clsx";

type Props = {
  role: AdminRole;
  catalog: AdminModule[];
  roleDefaults: Record<string, string[]>;
  roleCeilings: Record<string, string[]>;
  custom: boolean;
  selected: string[];
  onCustomChange: (custom: boolean) => void;
  onSelectedChange: (modules: string[]) => void;
  disabled?: boolean;
};

export function ModulePermissionPicker({
  role,
  catalog,
  roleDefaults,
  roleCeilings,
  custom,
  selected,
  onCustomChange,
  onSelectedChange,
  disabled,
}: Props) {
  const available = useMemo(
    () => modulesForRole(role, catalog, roleCeilings),
    [role, catalog, roleCeilings],
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, AdminModule[]>();
    for (const m of available) {
      const list = map.get(m.category) || [];
      list.push(m);
      map.set(m.category, list);
    }
    return [...map.entries()];
  }, [available]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    onSelectedChange(next);
  };

  const applyRoleDefaults = () => {
    onSelectedChange(defaultModulesForRole(role, roleDefaults));
    onCustomChange(false);
  };

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-200">Módulos permitidos</p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            className={clsx(
              "rounded-lg px-2 py-1 transition",
              !custom ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500 hover:text-slate-300",
            )}
            disabled={disabled}
            onClick={applyRoleDefaults}
          >
            Todos del rol
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-lg px-2 py-1 transition",
              custom ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500 hover:text-slate-300",
            )}
            disabled={disabled}
            onClick={() => {
              onCustomChange(true);
              if (!selected.length) onSelectedChange(defaultModulesForRole(role, roleDefaults));
            }}
          >
            Personalizado
          </button>
        </div>
      </div>

      {custom && (
        <div className="space-y-3">
          {byCategory.map(([category, mods]) => (
            <div key={category}>
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {category}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(m.id)}
                    className={clsx(
                      "rounded-lg px-2.5 py-1 text-xs transition",
                      selected.includes(m.id)
                        ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30"
                        : "bg-white/5 text-slate-400 hover:bg-white/10",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!selected.length && (
            <p className="text-xs text-amber-200">Selecciona al menos un módulo</p>
          )}
        </div>
      )}

      {!custom && (
        <p className="text-xs text-slate-500">
          Acceso completo según rol <strong className="text-slate-400">{role}</strong> (
          {defaultModulesForRole(role, roleDefaults).length} módulos)
        </p>
      )}
    </div>
  );
}