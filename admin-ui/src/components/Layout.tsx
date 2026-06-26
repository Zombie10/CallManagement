import { NavLink, Outlet } from "react-router-dom";
import {
  Bot,
  Headphones,
  LayoutDashboard,
  Phone,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";
import clsx from "clsx";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/settings", label: "Configuración", icon: Settings2 },
  { to: "/agents", label: "Agentes & Tools", icon: Bot },
  { to: "/customers", label: "Clientes", icon: Users },
  { to: "/calls", label: "Llamadas", icon: Phone },
  { to: "/appointments", label: "Citas", icon: Headphones },
];

export function Layout() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 p-4 md:p-6">
      <aside className="glass-card hidden w-64 shrink-0 flex-col p-4 md:flex">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600">
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
        <p className="px-2 text-xs text-slate-500">v1.0 · Grok Voice + LiveKit</p>
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
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}