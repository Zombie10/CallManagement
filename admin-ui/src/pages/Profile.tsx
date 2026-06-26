import { useMutation } from "@tanstack/react-query";
import { Fingerprint, KeyRound, Loader2, Shield, Trash2, UserCircle } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { registerPasskey } from "./Login";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  playground: "Probar agente",
  viewer: "Solo lectura",
};

export function Profile() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveProfile = useMutation({
    mutationFn: () => api.updateProfile(displayName.trim()),
    onSuccess: async () => {
      setMessage("Perfil actualizado");
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const changePassword = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setMessage("Contraseña cambiada");
      setError(null);
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err: Error) => setError(err.message),
  });

  const addPasskey = useMutation({
    mutationFn: async () => {
      const name =
        typeof window !== "undefined" && /iPhone|iPad|Mac/.test(navigator.userAgent)
          ? "Face ID / Touch ID"
          : "Huella / Passkey";
      await registerPasskey(name);
    },
    onSuccess: async () => {
      setMessage("Passkey registrado");
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const removePasskey = useMutation({
    mutationFn: (id: string) => api.deletePasskey(id),
    onSuccess: async () => {
      setMessage("Passkey eliminado");
      setError(null);
      await refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!user) return null;

  return (
    <div className="animate-page-enter mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Mi perfil</h1>
        <p className="mt-1 text-slate-400">Contraseña, passkeys y datos de tu cuenta</p>
      </header>

      {(message || error) && (
        <div
          className={`glass-card p-4 text-sm ${error ? "border-red-500/30 text-red-300" : "border-cyan-500/20 text-cyan-200"}`}
        >
          {error || message}
        </div>
      )}

      <section className="glass-card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/10">
            <UserCircle className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100">@{user.username}</p>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Shield className="h-3 w-3" />
              {ROLE_LABELS[user.role] || user.role}
            </p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">Nombre para mostrar</span>
          <input
            className="input-field"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>

        <button
          type="button"
          className="btn-primary"
          disabled={saveProfile.isPending || !displayName.trim()}
          onClick={() => saveProfile.mutate()}
        >
          {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar perfil
        </button>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-medium text-slate-200">
          <KeyRound className="h-4 w-4 text-cyan-400" />
          Cambiar contraseña
        </h2>
        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">Contraseña actual</span>
          <input
            type="password"
            className="input-field"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm text-slate-400">Nueva contraseña (mín. 8)</span>
          <input
            type="password"
            className="input-field"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button
          type="button"
          className="btn-ghost"
          disabled={
            changePassword.isPending || !currentPassword || newPassword.length < 8
          }
          onClick={() => changePassword.mutate()}
        >
          {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Actualizar contraseña
        </button>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-medium text-slate-200">
          <Fingerprint className="h-4 w-4 text-cyan-400" />
          Passkeys (huella / Face ID)
        </h2>
        <p className="text-sm text-slate-500">
          Inicia sesión sin contraseña desde este dispositivo.
        </p>

        {user.passkeys?.length ? (
          <ul className="space-y-2">
            {user.passkeys.map((pk) => (
              <li
                key={pk.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-200">{pk.device_name}</p>
                  <p className="text-xs text-slate-500">
                    Registrado {new Date(pk.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost px-2 text-red-300"
                  disabled={removePasskey.isPending}
                  onClick={() => removePasskey.mutate(pk.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Aún no tienes passkeys registrados.</p>
        )}

        <button
          type="button"
          className="btn-primary"
          disabled={addPasskey.isPending}
          onClick={() => addPasskey.mutate()}
        >
          {addPasskey.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
          Añadir passkey
        </button>
      </section>
    </div>
  );
}