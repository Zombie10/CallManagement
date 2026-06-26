import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Shield, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, type AdminRole, type AdminUserRecord } from "../lib/api";
import clsx from "clsx";

export function Users() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    display_name: "",
    role: "playground" as AdminRole,
  });
  const [error, setError] = useState<string | null>(null);

  const { data: rolesData } = useQuery({
    queryKey: ["auth-roles"],
    queryFn: api.authRoles,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.listUsers,
    enabled: user?.role === "admin",
  });

  const createMutation = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: async () => {
      setShowForm(false);
      setForm({ username: "", password: "", display_name: "", role: "playground" });
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

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const roles = rolesData?.roles || [];

  return (
    <div className="animate-page-enter space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-slate-400">
            Crea cuentas con acceso limitado, por ejemplo solo al playground de voz
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
              <select
                className="input-field"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
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
                  isSelf={row.id === user.id}
                  busy={updateMutation.isPending || deleteMutation.isPending}
                  onToggleEnabled={() =>
                    updateMutation.mutate({ id: row.id, patch: { enabled: !row.enabled } })
                  }
                  onRoleChange={(role) => updateMutation.mutate({ id: row.id, patch: { role } })}
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
  busy,
  onToggleEnabled,
  onRoleChange,
  onDelete,
}: {
  row: AdminUserRecord;
  roles: Array<{ id: string; label: string }>;
  isSelf: boolean;
  busy: boolean;
  onToggleEnabled: () => void;
  onRoleChange: (role: AdminRole) => void;
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
            Administrador
          </span>
        ) : (
          <select
            className="input-field w-auto py-1 text-xs"
            value={row.role}
            disabled={busy}
            onChange={(e) => onRoleChange(e.target.value as AdminRole)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </td>
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