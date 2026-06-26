import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import type { AdminRole } from "../lib/api";
import { normalizeAppPath } from "../lib/paths";

const ROLE_ROUTES: Record<AdminRole, string[]> = {
  super_admin: [
    "/",
    "/tenants",
    "/my-agents",
    "/setup",
    "/analytics",
    "/settings",
    "/playground",
    "/agents",
    "/customers",
    "/calls",
    "/appointments",
    "/profile",
    "/users",
  ],
  admin: [
    "/",
    "/my-agents",
    "/setup",
    "/analytics",
    "/settings",
    "/playground",
    "/customers",
    "/calls",
    "/appointments",
    "/profile",
    "/users",
  ],
  playground: ["/playground", "/profile"],
  viewer: ["/", "/analytics", "/customers", "/calls", "/appointments", "/profile"],
};

function routeAllowed(role: AdminRole, path: string): boolean {
  const allowed = ROLE_ROUTES[role] || [];
  if (allowed.includes(path)) return true;
  if (path === "/" && allowed.includes("/")) return true;
  return false;
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const path = normalizeAppPath(location.pathname);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-fade-in-up flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
          <p className="text-sm text-slate-400">Verificando sesión…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: path }} />;
  }

  if (!routeAllowed(user.role, path)) {
    const fallback = user.default_route || (user.role === "playground" ? "/playground" : "/");
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}