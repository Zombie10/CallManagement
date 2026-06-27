import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Plus, Shield, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTenant } from "../contexts/TenantContext";
import { ListFilterBar } from "../components/ListFilterBar";
import { ModulePermissionPicker } from "../components/ModulePermissionPicker";
import { Select } from "../components/Select";
import { TableScroll } from "../components/TableScroll";
import { api, type AdminRole, type AdminUserRecord } from "../lib/api";
import clsx from "clsx";

function canManageUsers(role?: AdminRole) {
  return role === "admin" || role === "super_admin";
}

export function Users() {
  const { user } = useAuth();
  const { isSuperAdmin } = useTenant();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "playground" as AdminRole,
    tenant_id: "" as string,
  });
  const [formCustomModules, setFormCustomModules] = useState(false);
  const [formModules, setFormModules] = useState<string[]>([]);
  const [permissionsUserId, setPermissionsUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");

  const { data: rolesData } = useQuery({
    queryKey: ["auth-roles"],
    queryFn: api.authRoles,
  });

  const { data: modulesData } = useQuery({
    queryKey: ["auth-modules"],
    queryFn: api.authModules,
  });

  const { data: tenantsData } = useQuery({
    queryKey: ["tenants"],
    queryFn: api.listTenants,
    enabled: isSuperAdmin,
  });

  const tenantOptions = (tenantsData?.tenants || []).map((t) => ({
    value: t.id,
    label: t.name,
    description: t.slug,
  }));

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.listUsers,
    enabled: canManageUsers(user?.role),
  });

  useEffect(() => {
    if (modulesData && !formCustomModules) {
      setFormModules(modulesData.role_defaults[form.role] || []);
    }
  }, [form.role, modulesData, formCustomModules]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        ...form,
        tenant_id: form.tenant_id || null,
        modules: formCustomModules ? formModules : null,
      }),
    onSuccess: async () => {
      setShowForm(false);
      setForm({ username: "", password: "", display_name: "", role: "playground", tenant_id: "" });
      setFormCustomModules(false);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateUser>[1] }) =>
      api.updateUser(id, patch),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!canManageUsers(user?.role)) {
    return <Navigate to="/" replace />;
  }

  const roles = rolesData?.roles || [];
  const catalog = modulesData?.modules || [];
  const roleDefaults = modulesData?.role_defaults || {};
  const roleCeilings = modulesData?.role_ceilings || {};

  const filteredUsers = useMemo(() => {
    const users = data?.users || [];
    const q = search.trim().toLowerCase();
    return users.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (statusFilter === "enabled" && !row.enabled) return false;
      if (statusFilter === "disabled" && row.enabled) return false;
      if (isSuperAdmin && tenantFilter !== "all") {
        const tid = row.tenant_id || "";
        if (tenantFilter === "none" && tid) return false;
        if (tenantFilter !== "none" && tid !== tenantFilter) return false;
      }
      if (!q) return true;
      return (
        row.username.toLowerCase().includes(q) ||
        row.display_name.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q)
      );
    });
  }, [data?.users, isSuperAdmin, roleFilter, search, statusFilter, tenantFilter]);

  const clearUserFilters = () => {
    setRoleFilter("all");
    setStatusFilter("all");
    setTenantFilter("all");
  };

  return (
    <div className="animate-page-enter space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-3xl">Usuarios</h1>
          <p className="mt-1 text-sm text-slate-400 sm:text-base">
            Roles y módulos de acceso por usuario (entradas del menú y APIs)
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
          <UserPlus className="h-4 w-4" />
          Nuevo usuario
        </button>
      </header>

      {error && (
        <div className="glass-card border-red-500/30 p-4 text-sm text-red-300">{error}</div>
      )}

      {showForm && modulesData && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-medium">
            <Plus className="h-4 w-4 text-cyan-400" />
            Crear usuario
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm text-slate-400">Usuario</span>
              <input
                className="input-field"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="demo"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm text-slate-400">Nombre</span>
              <input
                className="input-field"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm text-slate-400">Contraseña</span>
              <input
                type="password"
                className="input-field"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm text-slate-400">Rol</span>
              <Select
                value={form.role}
                onChange={(role) => {
                  setForm((f) => ({ ...f, role: role as AdminRole }));
                  setFormCustomModules(false);
                }}
                options={roles.map((r) => ({
                  value: r.id,
                  label: r.label,
                  description: r.description,
                }))}
              />
            </label>
            {isSuperAdmin && (
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-sm text-slate-400">Empresa (opcional)</span>
                <Select
                  value={form.tenant_id}
                  onChange={(v) => setForm((f) => ({ ...f, tenant_id: v }))}
                  options={[
                    { value: "", label: "Sin empresa (global)" },
                    ...tenantOptions,
                  ]}
                />
              </label>
            )}
          </div>

          <ModulePermissionPicker
            role={form.role}
            catalog={catalog}
            roleDefaults={roleDefaults}
            roleCeilings={roleCeilings}
            custom={formCustomModules}
            selected={formModules}
            onCustomChange={setFormCustomModules}
            onSelectedChange={setFormModules}
          />

          <button
            type="button"
            className="btn-primary"
            disabled={
              createMutation.isPending ||
              !form.username ||
              !form.display_name ||
              form.password.length < 8 ||
              (formCustomModules && !formModules.length)
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear
          </button>
        </div>
      )}

      <ListFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por usuario, nombre o rol…"
        resultCount={filteredUsers.length}
        totalCount={data?.users.length ?? 0}
        onClear={clearUserFilters}
      >
        <select
          className="input-field w-full sm:w-40"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Todos los roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          className="input-field w-full sm:w-36"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="all">Todos</option>
          <option value="enabled">Activos</option>
          <option value="disabled">Desactivados</option>
        </select>
        {isSuperAdmin && (
          <select
            className="input-field w-full sm:w-44"
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
          >
            <option value="all">Todas las empresas</option>
            <option value="none">Sin empresa</option>
            {tenantOptions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        )}
      </ListFilterBar>

      {isLoading ? (
        <div className="glass-card p-6 text-sm text-slate-500">Cargando usuarios…</div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredUsers.map((row) => (
              <UserMobileCard
                key={row.id}
                row={row}
                roles={roles}
                catalog={catalog}
                roleDefaults={roleDefaults}
                roleCeilings={roleCeilings}
                isSelf={row.id === user?.id}
                isSuperAdmin={isSuperAdmin}
                tenantOptions={tenantOptions}
                tenantName={tenantOptions.find((t) => t.value === row.tenant_id)?.label || "—"}
                busy={updateMutation.isPending || deleteMutation.isPending}
                showPermissions={permissionsUserId === row.id}
                onTogglePermissions={() =>
                  setPermissionsUserId((id) => (id === row.id ? null : row.id))
                }
                onToggleEnabled={() =>
                  updateMutation.mutate({ id: row.id, patch: { enabled: !row.enabled } })
                }
                onRoleChange={(role) => updateMutation.mutate({ id: row.id, patch: { role } })}
                onTenantChange={(tenant_id) =>
                  updateMutation.mutate({ id: row.id, patch: { tenant_id: tenant_id || null } })
                }
                onSaveModules={(modules) =>
                  updateMutation.mutate({ id: row.id, patch: { modules } })
                }
                onDelete={() => deleteMutation.mutate(row.id)}
              />
            ))}
          </div>

          <div className="glass-card hidden w-full md:block">
            <TableScroll>
              <table className={`data-table ${isSuperAdmin ? "min-w-[980px]" : "min-w-[860px]"}`}>
                <colgroup>
                  <col style={{ width: isSuperAdmin ? "18%" : "22%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: isSuperAdmin ? "24%" : "28%" }} />
                  {isSuperAdmin && <col style={{ width: "16%" }} />}
                  <col style={{ width: "10%" }} />
                  <col style={{ width: isSuperAdmin ? "18%" : "20%" }} />
                </colgroup>
                <thead className="border-b border-white/5 bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Usuario</th>
                    <th className="px-4 py-3">Rol</th>
                    <th className="px-4 py-3">Módulos</th>
                    {isSuperAdmin && <th className="px-4 py-3">Empresa</th>}
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <UserRow
                      key={row.id}
                      row={row}
                      roles={roles}
                      catalog={catalog}
                      roleDefaults={roleDefaults}
                      roleCeilings={roleCeilings}
                      isSelf={row.id === user?.id}
                      isSuperAdmin={isSuperAdmin}
                      tenantOptions={tenantOptions}
                      tenantName={tenantOptions.find((t) => t.value === row.tenant_id)?.label || "—"}
                      busy={updateMutation.isPending || deleteMutation.isPending}
                      showPermissions={permissionsUserId === row.id}
                      onTogglePermissions={() =>
                        setPermissionsUserId((id) => (id === row.id ? null : row.id))
                      }
                      onToggleEnabled={() =>
                        updateMutation.mutate({ id: row.id, patch: { enabled: !row.enabled } })
                      }
                      onRoleChange={(role) => updateMutation.mutate({ id: row.id, patch: { role } })}
                      onTenantChange={(tenant_id) =>
                        updateMutation.mutate({ id: row.id, patch: { tenant_id: tenant_id || null } })
                      }
                      onSaveModules={(modules) =>
                        updateMutation.mutate({ id: row.id, patch: { modules } })
                      }
                      onDelete={() => deleteMutation.mutate(row.id)}
                    />
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </>
      )}
    </div>
  );
}

function UserMobileCard({
  row,
  roles,
  catalog,
  roleDefaults,
  roleCeilings,
  isSelf,
  isSuperAdmin,
  tenantOptions,
  tenantName,
  busy,
  showPermissions,
  onTogglePermissions,
  onToggleEnabled,
  onRoleChange,
  onTenantChange,
  onSaveModules,
  onDelete,
}: {
  row: AdminUserRecord;
  roles: Array<{ id: string; label: string }>;
  catalog: import("../lib/api").AdminModule[];
  roleDefaults: Record<string, string[]>;
  roleCeilings: Record<string, string[]>;
  isSelf: boolean;
  isSuperAdmin: boolean;
  tenantOptions: Array<{ value: string; label: string }>;
  tenantName: string;
  busy: boolean;
  showPermissions: boolean;
  onTogglePermissions: () => void;
  onToggleEnabled: () => void;
  onRoleChange: (role: AdminRole) => void;
  onTenantChange: (tenantId: string) => void;
  onSaveModules: (modules: string[] | null) => void;
  onDelete: () => void;
}) {
  const isProtected = row.username === "admin";
  const [custom, setCustom] = useState(!!row.modules?.length);
  const [selected, setSelected] = useState(row.modules?.length ? row.modules : row.effective_modules || []);

  useEffect(() => {
    setCustom(!!row.modules?.length);
    setSelected(row.modules?.length ? row.modules : roleDefaults[row.role] || []);
  }, [row.id, row.modules, row.role, roleDefaults]);

  const moduleCount = row.effective_modules?.length ?? 0;
  const customLabel = row.modules?.length ? "Personalizado" : "Rol completo";

  return (
    <article className="glass-card space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-200">{row.display_name}</p>
          <p className="text-xs text-slate-500">@{row.username}</p>
        </div>
        {!isSelf && !isProtected && (
          <button type="button" className="btn-ghost shrink-0 px-2 text-red-300" disabled={busy} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="grid gap-3">
        <label className="space-y-1.5">
          <span className="text-xs text-slate-500">Rol</span>
          {isProtected ? (
            <span className="inline-flex items-center gap-1 text-sm text-cyan-300">
              <Shield className="h-3 w-3" />
              Super admin
            </span>
          ) : (
            <Select
              className="w-full"
              size="sm"
              value={row.role}
              options={roles.map((r) => ({ value: r.id, label: r.label }))}
              disabled={busy}
              onChange={(role) => onRoleChange(role as AdminRole)}
            />
          )}
        </label>

        {isSuperAdmin && (
          <label className="space-y-1.5">
            <span className="text-xs text-slate-500">Empresa</span>
            {isProtected ? (
              <span className="text-sm text-slate-400">{tenantName}</span>
            ) : (
              <Select
                className="w-full"
                size="sm"
                value={row.tenant_id || ""}
                options={[{ value: "", label: "Global" }, ...tenantOptions]}
                disabled={busy}
                onChange={onTenantChange}
              />
            )}
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"
            disabled={isProtected}
            onClick={onTogglePermissions}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {moduleCount} módulos · {customLabel}
          </button>
          <button
            type="button"
            className={clsx(
              "rounded-full px-2.5 py-1 text-xs",
              row.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300",
            )}
            disabled={isProtected || busy}
            onClick={onToggleEnabled}
          >
            {row.enabled ? "Activo" : "Desactivado"}
          </button>
        </div>
      </div>

      {showPermissions && !isProtected && catalog.length > 0 && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          <ModulePermissionPicker
            role={row.role}
            catalog={catalog}
            roleDefaults={roleDefaults}
            roleCeilings={roleCeilings}
            custom={custom}
            selected={selected}
            onCustomChange={setCustom}
            onSelectedChange={setSelected}
            disabled={busy}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={busy || (custom && !selected.length)}
              onClick={() => onSaveModules(custom ? selected : null)}
            >
              Guardar permisos
            </button>
            <button type="button" className="btn-ghost text-sm" onClick={onTogglePermissions}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function UserRow({
  row,
  roles,
  catalog,
  roleDefaults,
  roleCeilings,
  isSelf,
  isSuperAdmin,
  tenantOptions,
  tenantName,
  busy,
  showPermissions,
  onTogglePermissions,
  onToggleEnabled,
  onRoleChange,
  onTenantChange,
  onSaveModules,
  onDelete,
}: {
  row: AdminUserRecord;
  roles: Array<{ id: string; label: string }>;
  catalog: import("../lib/api").AdminModule[];
  roleDefaults: Record<string, string[]>;
  roleCeilings: Record<string, string[]>;
  isSelf: boolean;
  isSuperAdmin: boolean;
  tenantOptions: Array<{ value: string; label: string }>;
  tenantName: string;
  busy: boolean;
  showPermissions: boolean;
  onTogglePermissions: () => void;
  onToggleEnabled: () => void;
  onRoleChange: (role: AdminRole) => void;
  onTenantChange: (tenantId: string) => void;
  onSaveModules: (modules: string[] | null) => void;
  onDelete: () => void;
}) {
  const isProtected = row.username === "admin";
  const [custom, setCustom] = useState(!!row.modules?.length);
  const [selected, setSelected] = useState(row.modules?.length ? row.modules : row.effective_modules || []);

  useEffect(() => {
    setCustom(!!row.modules?.length);
    setSelected(row.modules?.length ? row.modules : roleDefaults[row.role] || []);
  }, [row.id, row.modules, row.role, roleDefaults]);

  const moduleCount = row.effective_modules?.length ?? 0;
  const customLabel = row.modules?.length ? "Personalizado" : "Rol completo";

  return (
    <>
      <tr className="border-b border-white/5 last:border-0">
        <td className="px-4 py-3">
          <p className="font-medium text-slate-200">{row.display_name}</p>
          <p className="text-xs text-slate-500">@{row.username}</p>
        </td>
        <td className="px-4 py-3">
          {isProtected ? (
            <span className="inline-flex items-center gap-1 text-cyan-300">
              <Shield className="h-3 w-3" />
              Super admin
            </span>
          ) : (
            <Select
              className="w-44"
              size="sm"
              value={row.role}
              options={roles.map((r) => ({ value: r.id, label: r.label }))}
              disabled={busy}
              onChange={(role) => onRoleChange(role as AdminRole)}
            />
          )}
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"
            disabled={isProtected}
            onClick={onTogglePermissions}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {moduleCount} · {customLabel}
          </button>
        </td>
        {isSuperAdmin && (
          <td className="px-4 py-3">
            {isProtected ? (
              <span className="text-xs text-slate-500">{tenantName}</span>
            ) : (
              <Select
                className="w-40"
                size="sm"
                value={row.tenant_id || ""}
                options={[{ value: "", label: "Global" }, ...tenantOptions]}
                disabled={busy}
                onChange={onTenantChange}
              />
            )}
          </td>
        )}
        <td className="px-4 py-3">
          <button
            type="button"
            className={clsx(
              "rounded-full px-2 py-0.5 text-xs",
              row.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300",
            )}
            disabled={isProtected || busy}
            onClick={onToggleEnabled}
          >
            {row.enabled ? "Activo" : "Desactivado"}
          </button>
        </td>
        <td className="px-4 py-3 text-right">
          {!isSelf && !isProtected && (
            <button type="button" className="btn-ghost px-2 text-red-300" disabled={busy} onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </td>
      </tr>
      {showPermissions && !isProtected && catalog.length > 0 && (
        <tr>
          <td colSpan={isSuperAdmin ? 6 : 5} className="border-b border-white/5 bg-white/[0.02] px-4 py-4">
            <ModulePermissionPicker
              role={row.role}
              catalog={catalog}
              roleDefaults={roleDefaults}
              roleCeilings={roleCeilings}
              custom={custom}
              selected={selected}
              onCustomChange={setCustom}
              onSelectedChange={setSelected}
              disabled={busy}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy || (custom && !selected.length)}
                onClick={() => onSaveModules(custom ? selected : null)}
              >
                Guardar permisos
              </button>
              <button type="button" className="btn-ghost text-sm" onClick={onTogglePermissions}>
                Cerrar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}