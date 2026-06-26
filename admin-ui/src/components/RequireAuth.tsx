import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { routeAllowed } from "../lib/permissions";
import { normalizeAppPath } from "../lib/paths";

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

  const allowed =
    user.allowed_routes?.length
      ? routeAllowed(path, user.allowed_routes)
      : path === "/profile";

  if (!allowed) {
    const fallback = user.default_route || (user.role === "playground" ? "/playground" : "/");
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}