import { useMutation, useQuery } from "@tanstack/react-query";
import { Fingerprint, KeyRound, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import {
  credentialToJSON,
  passkeySupported,
  prepareCreationOptions,
  prepareRequestOptions,
} from "../lib/webauthn";
import clsx from "clsx";
import { normalizeAppPath } from "../lib/paths";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"passkey" | "password">("password");

  const { data: authStatus } = useQuery({ queryKey: ["auth-status"], queryFn: api.authStatus });
  const canPasskey = passkeySupported();

  const from = (location.state as { from?: string } | null)?.from;

  const finishLogin = async (loginResult?: { default_route?: string }) => {
    try {
      const me = await refresh();
      const target = normalizeAppPath(
        from || loginResult?.default_route || me.default_route || "/",
      );
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo validar la sesión");
    }
  };

  const passwordLogin = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (data) => finishLogin(data),
    onError: (err: Error) => setError(err.message),
  });

  const passkeyLogin = useMutation({
    mutationFn: async () => {
      if (!canPasskey) throw new Error("Passkeys no disponibles en este navegador");
      const { challenge_id, options } = await api.passkeyLoginOptions(username || undefined);
      const credential = (await navigator.credentials.get({
        publicKey: prepareRequestOptions(options),
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error("Inicio con passkey cancelado");
      return api.passkeyLoginVerify(challenge_id, credentialToJSON(credential));
    },
    onSuccess: (data) => finishLogin(data),
    onError: (err: Error) => setError(err.message),
  });

  const busy = passwordLogin.isPending || passkeyLogin.isPending;

  return (
    <div className="login-scene relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="login-orb login-orb-a" />
      <div className="login-orb login-orb-b" />
      <div className="login-grid" />

      <div className="animate-fade-in-up relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 shadow-glow-lg">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Call Management</h1>
          <p className="mt-2 text-sm text-slate-400">Acceso seguro al panel de administración</p>
        </div>

        <div className="glass-card-elevated p-6 sm:p-8">
          <div className="mb-6 flex rounded-xl bg-white/5 p-1">
            <button
              type="button"
              className={clsx(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300",
                mode === "passkey"
                  ? "bg-cyan-500/20 text-cyan-100 shadow-inner"
                  : "text-slate-400 hover:text-slate-200",
              )}
              onClick={() => setMode("passkey")}
            >
              <Fingerprint className="mr-1.5 inline h-4 w-4" />
              Passkey
            </button>
            <button
              type="button"
              className={clsx(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300",
                mode === "password"
                  ? "bg-cyan-500/20 text-cyan-100 shadow-inner"
                  : "text-slate-400 hover:text-slate-200",
              )}
              onClick={() => setMode("password")}
            >
              <KeyRound className="mr-1.5 inline h-4 w-4" />
              Contraseña
            </button>
          </div>

          <label className="mb-4 block space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Usuario</span>
            <input
              className="input-field"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          </label>

          {mode === "password" && (
            <label className="mb-6 block space-y-1.5 animate-fade-in">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Contraseña</span>
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password) passwordLogin.mutate();
                }}
              />
            </label>
          )}

          {mode === "passkey" ? (
            <button
              type="button"
              className="btn-primary btn-shine w-full py-3"
              disabled={!canPasskey || busy}
              onClick={() => {
                setError(null);
                passkeyLogin.mutate();
              }}
            >
              {passkeyLogin.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Fingerprint className="h-5 w-5" />
              )}
              Entrar con huella / Face ID
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary w-full py-3"
              disabled={!password || busy}
              onClick={() => {
                setError(null);
                passwordLogin.mutate();
              }}
            >
              {passwordLogin.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
              Iniciar sesión
            </button>
          )}

          {!canPasskey && mode === "passkey" && (
            <p className="mt-3 text-center text-xs text-amber-300/90">
              Passkeys requieren HTTPS o localhost en un navegador compatible.
            </p>
          )}

          {error && (
            <p className="mt-4 animate-fade-in rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          {authStatus?.hint && (
            <div
              className={clsx(
                "mt-6 flex items-start gap-2 rounded-xl border p-3 text-xs",
                authStatus.password_configured
                  ? "border-cyan-400/10 bg-cyan-500/5 text-slate-400"
                  : "border-amber-400/20 bg-amber-500/10 text-amber-100",
              )}
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div className="space-y-1">
                <p>{authStatus.hint}</p>
                {!authStatus.password_configured && (
                  <p className="text-amber-200/90">
                    Terminal:{" "}
                    <code className="text-amber-50">uv run python -m call_management.admin.reset_password</code>
                  </p>
                )}
                <p>
                  Passkey: usa <code className="text-cyan-200/80">http://localhost:8080</code>
                  {authStatus.rp_id && <> · RP: <code className="text-cyan-200/80">{authStatus.rp_id}</code></>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export async function registerPasskey(deviceName: string): Promise<void> {
  const { challenge_id, options } = await api.passkeyRegisterOptions(deviceName);
  const credential = (await navigator.credentials.create({
    publicKey: prepareCreationOptions(options),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Registro cancelado");
  await api.passkeyRegisterVerify(challenge_id, credentialToJSON(credential), deviceName);
}