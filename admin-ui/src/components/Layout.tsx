import { useMutation } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import {
  Bot,
  Fingerprint,
  Headphones,
  LayoutDashboard,
  LogOut,
  Phone,
  Settings2,
  Users,
  MessageSquare,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../contexts/AuthContext";
import { registerPasskey } from "../pages/Login";
import { useState } from "react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings", label: "Configuración", icon: Settings2 },
  { to: "/playground", label: "Probar agente", icon: MessageSquare },
  { to: "/agents", label: "Agentes & Tools", icon: Bot },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/calls", label: "Llamadas", icon: Phone },
  { to: "/appointments", label: "Citas", icon: Headphones },
];

export function Layout() {
  const { user, logout, refresh } = useAuth();
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null);

  const registerPasskeyMutation = useMutation({
    mutationFn: async () => {
      const name =
        typeof window !== "undefined" && /iPhone|iPad|Mac/.test(navigator.userAgent)
          ? "Face ID / Touch ID"
          : "Huella / Passkey";
      await registerPasskey(name);
    },
    onSuccess: async () => {
      setPasskeyMsg("Passkey registrado correctamente");
      await refresh();
    },
    onError: (err: Error) => setPasskeyMsg(err.message),
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 p-4 md:p-6">
      <aside className="glass-card animate-fade-in hidden w-64 shrink-0 flex-col p-4 md:flex">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-glow">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold">Call Management</p>
              <p className="text-xs text-slate-400">Admin Console</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => clsx("nav-item", isActive && "nav-item-active")}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
          <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-200">{user?.display_name}</p>
            <p className="truncate text-xs text-slate-500">@{user?.username}</p>
          </div>
          <button
            type="button"
            className="btn-ghost w-full justify-start text-xs"
            disabled={registerPasskeyMutation.isPending}
            onClick={() => {
              setPasskeyMsg(null);
              registerPasskeyMutation.mutate();
            }}
          >
            <Fingerprint className="h-4 w-4" />
            {registerPasskeyMutation.isPending ? "Registrando…" : "Añadir passkey"}
          </button>
          {passkeyMsg && <p className="px-1 text-xs text-cyan-300/90">{passkeyMsg}</p>}
          <button type="button" className="btn-ghost w-full justify-start text-xs text-red-300" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <nav className="glass-card flex gap-1 overflow-x-auto p-2 md:hidden">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx("nav-item shrink-0 text-xs", isActive && "nav-item-active")
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="min-w-0 flex-1 animate-page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  );
}