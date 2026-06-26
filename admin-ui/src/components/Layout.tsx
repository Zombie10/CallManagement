import { NavLink, Outlet } from "react-router-dom";
import {
  Bot,
  Building2,
  Headphones,
  LayoutDashboard,
  LogOut,
  Phone,
  Settings2,
  Users,
  MessageSquare,
  UserCircle,
  Wrench,
  Network,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../contexts/AuthContext";
import type { AdminRole } from "../lib/api";

const ALL_NAV: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles: AdminRole[] }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "viewer"] },
  { to: "/tenants", label: "Empresas", icon: Building2, roles: ["super_admin"] },
  { to: "/my-agents", label: "Mis agentes", icon: Network, roles: ["super_admin", "admin"] },
  { to: "/settings", label: "Configuración", icon: Settings2, roles: ["super_admin", "admin"] },
  { to: "/playground", label: "Probar agente", icon: MessageSquare, roles: ["super_admin", "admin", "playground"] },
  { to: "/agents", label: "Plantillas sistema", icon: Bot, roles: ["super_admin"] },
  { to: "/customers", label: "Clientes", icon: Users, roles: ["super_admin", "admin", "viewer"] },
  { to: "/calls", label: "Llamadas", icon: Phone, roles: ["super_admin", "admin", "viewer"] },
  { to: "/appointments", label: "Citas", icon: Headphones, roles: ["super_admin", "admin", "viewer"] },
  { to: "/users", label: "Usuarios", icon: Users, roles: ["super_admin", "admin"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  const nav = ALL_NAV.filter((item) => user && item.roles.includes(user.role));

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
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              clsx("block rounded-xl px-3 py-2.5 transition-colors", isActive ? "bg-cyan-500/10" : "bg-white/[0.03] hover:bg-white/[0.05]")
            }
          >
            <p className="truncate text-sm font-medium text-slate-200">{user?.display_name}</p>
            <p className="truncate text-xs text-slate-500">@{user?.username} · Perfil</p>
          </NavLink>
          <NavLink to="/profile" className="btn-ghost w-full justify-start text-xs">
            <UserCircle className="h-4 w-4" />
            Mi perfil
          </NavLink>
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