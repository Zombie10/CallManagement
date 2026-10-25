import { NavLink, Outlet, useLocation } from "react-router-dom";
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
  Network,
  Rocket,
  BarChart3,
  Eye,
  GitBranch,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../contexts/AuthContext";
import { useUiLocale } from "../contexts/LocaleContext";
import { shouldShowTenantBar, TenantContextBar } from "./TenantContextBar";
import { Breadcrumbs } from "./Breadcrumbs";
import { moduleAllowed } from "../lib/permissions";
import { AppLogo } from "./AppLogo";
import type { AdminLocale } from "../lib/i18n";

const ALL_NAV: Array<{ to: string; icon: typeof LayoutDashboard; module: string }> = [
  { to: "/", icon: LayoutDashboard, module: "dashboard" },
  { to: "/tenants", icon: Building2, module: "tenants" },
  { to: "/my-agents", icon: Network, module: "my_agents" },
  { to: "/setup", icon: Rocket, module: "setup" },
  { to: "/operations", icon: GitBranch, module: "operations" },
  { to: "/settings", icon: Settings2, module: "settings" },
  { to: "/playground", icon: MessageSquare, module: "playground" },
  { to: "/agents", icon: Bot, module: "agents" },
  { to: "/customers", icon: Users, module: "customers" },
  { to: "/calls", icon: Phone, module: "calls" },
  { to: "/analytics", icon: BarChart3, module: "analytics" },
  { to: "/supervisor", icon: Eye, module: "supervisor" },
  { to: "/appointments", icon: Headphones, module: "appointments" },
  { to: "/users", icon: Users, module: "users" },
];

function LanguageSwitch() {
  const { locale, setLocale, t } = useUiLocale();
  const choice = (id: AdminLocale, label: string) => (
    <button
      type="button"
      aria-pressed={locale === id}
      className={clsx(
        "rounded-lg px-2 py-1 text-xs",
        locale === id ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:bg-white/5",
      )}
      onClick={() => setLocale(id)}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-1" role="group" aria-label={t("language.label")}>
      {choice("es", t("language.es"))}
      {choice("en", t("language.en"))}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { t } = useUiLocale();
  const location = useLocation();
  const onPlayground = /\/playground\/?$/.test(location.pathname);
  const nav = ALL_NAV.filter(
    (item) => user && moduleAllowed(item.module, user.effective_modules),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] gap-4 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:gap-6 md:p-6">
      <aside className="glass-card animate-fade-in hidden w-64 shrink-0 flex-col p-4 md:flex">
        <div className="mb-8 px-2">
          <AppLogo size="md" subtitle="Admin Console" />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map(({ to, icon: Icon, module }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => clsx("nav-item", isActive && "nav-item-active")}
            >
              <Icon className="h-4 w-4" />
              {t(`nav.${module}`)}
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
            <p className="truncate text-xs text-slate-500">@{user?.username} · {t("layout.profile")}</p>
          </NavLink>
          <LanguageSwitch />
          <NavLink to="/profile" className="btn-ghost w-full justify-start text-xs">
            <UserCircle className="h-4 w-4" />
            {t("layout.myProfile")}
          </NavLink>
          <button type="button" className="btn-ghost w-full justify-start text-xs text-red-300" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            {t("layout.logout")}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden">
        <nav className="glass-card flex gap-1 overflow-x-auto p-2 md:hidden">
          <LanguageSwitch />
          {nav.map(({ to, icon: Icon, module }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx("nav-item shrink-0 text-xs", isActive && "nav-item-active")
              }
            >
              <Icon className="h-4 w-4" />
              {t(`nav.${module}`)}
            </NavLink>
          ))}
        </nav>
        {shouldShowTenantBar(user?.role) && !onPlayground && (
          <div className="shrink-0">
            <TenantContextBar />
          </div>
        )}
        <main className="min-w-0 flex-1 animate-page-enter space-y-3">
          {!onPlayground && <Breadcrumbs />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}