import { ChevronRight, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTenant } from "../contexts/TenantContext";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  settings: "Configuración",
  tenants: "Empresas",
  "my-agents": "Mis agentes",
  agents: "Plantillas sistema",
  customers: "Clientes",
  calls: "Llamadas",
  analytics: "Análisis",
  appointments: "Citas",
  playground: "Probar agente",
  profile: "Mi perfil",
  users: "Usuarios",
  setup: "Guía de inicio",
};

export function Breadcrumbs() {
  const location = useLocation();
  const { tenant } = useTenant();
  const segments = location.pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs: Array<{ label: string; to: string }> = [{ label: "Dashboard", to: "/" }];
  let path = "";
  for (const seg of segments) {
    path += `/${seg}`;
    crumbs.push({ label: ROUTE_LABELS[seg] || seg, to: path });
  }

  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
      <Link to="/" className="flex items-center gap-1 transition hover:text-cyan-300">
        <Home className="h-3 w-3" />
      </Link>
      {tenant && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="truncate text-slate-400">{tenant.name}</span>
        </>
      )}
      {crumbs.slice(1).map((crumb, i) => (
        <span key={crumb.to} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 shrink-0" />
          {i === crumbs.length - 2 ? (
            <span className="font-medium text-slate-300">{crumb.label}</span>
          ) : (
            <Link to={crumb.to} className="transition hover:text-cyan-300">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}