import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Shield, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTenant } from "../contexts/TenantContext";
import { Select } from "../components/Select";
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
  const [error, setError] = useState<string | null>(null);

  const { data: rolesData } = useQuery({
    queryKey: ["auth-roles"],
    queryFn: api.authRoles,
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

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        ...form,
        tenant_id: form.tenant_id || null,
      }),
    onSuccess: async () => {
      setShowForm(false);
      setForm({ username: "", password: "", display_name: "", role: "playground", tenant_id: "" });
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
  const tenantName = (id: string | null | undefined) =>
    tenantOptions.find((t) => t.value === id)?.label || "—";

  return (
    <div className="animate-page-enter space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-slate-400">
            Crea cuentas con acceso limitado o asignadas a una empresa
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

      {showForm && (
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
                placeholder="Usuario demo"
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
                onChange={(role) => setForm((f) => ({ ...f, role: role as AdminRole }))}
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
                    { value: "", label: "Sin empresa (super admin / global)" },
                    ...tenantOptions,
                  ]}
                />
              </label>
            )}
          </div>
          {form.role === "playground" && (
            <p className="text-xs text-slate-500">
              Solo verá Probar agente y su perfil — ideal para probar voz sin acceso al CRM.
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={
              createMutation.isPending ||
              !form.username ||
              !form.display_name ||
              form.password.length < 8
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Crear
          </button>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando usuarios…</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/5 bg-white/[0.02] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                {isSuperAdmin && <th className="px-4 py-3">Empresa</th>}
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((row) => (
                <UserRow
                  key={row.id}
                  row={row}
                  roles={roles}
                  isSelf={row.id === user?.id}
                  isSuperAdmin={isSuperAdmin}
                  tenantOptions={tenantOptions}
                  tenantName={tenantName(row.tenant_id)}
                  busy={updateMutation.isPending || deleteMutation.isPending}
                  onToggleEnabled={() =>
                    updateMutation.mutate({ id: row.id, patch: { enabled: !row.enabled } })
                  }
                  onRoleChange={(role) => updateMutation.mutate({ id: row.id, patch: { role } })}
                  onTenantChange={(tenant_id) =>
                    updateMutation.mutate({ id: row.id, patch: { tenant_id: tenant_id || null } })
                  }
                  onDelete={() => deleteMutation.mutate(row.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UserRow({
  row,
  roles,
  isSelf,
  isSuperAdmin,
  tenantOptions,
  tenantName,
  busy,
  onToggleEnabled,
  onRoleChange,
  onTenantChange,
  onDelete,
}: {
  row: AdminUserRecord;
  roles: Array<{ id: string; label: string }>;
  isSelf: boolean;
  isSuperAdmin: boolean;
  tenantOptions: Array<{ value: string; label: string }>;
  tenantName: string;
  busy: boolean;
  onToggleEnabled: () => void;
  onRoleChange: (role: AdminRole) => void;
  onTenantChange: (tenantId: string) => void;
  onDelete: () => void;
}) {
  const isProtected = row.username === "admin";

  return (
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
      {isSuperAdmin && (
        <td className="px-4 py-3">
          {isProtected ? (
            <span className="text-xs text-slate-500">{tenantName}</span>
          ) : (
            <Select
              className="w-40"
              size="sm"
              value={row.tenant_id || ""}
              options={[
                { value: "", label: "Global" },
                ...tenantOptions,
              ]}
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
          <button
            type="button"
            className="btn-ghost px-2 text-red-300"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}