import type { AdminModule, AdminRole } from "./api";

/** Map nav route → module id */
export const ROUTE_MODULE: Record<string, string> = {
  "/": "dashboard",
  "/tenants": "tenants",
  "/my-agents": "my_agents",
  "/setup": "setup",
  "/analytics": "analytics",
  "/customers": "customers",
  "/calls": "calls",
  "/appointments": "appointments",
  "/playground": "playground",
  "/settings": "settings",
  "/agents": "agents",
  "/users": "users",
};

export function routeAllowed(
  path: string,
  allowedRoutes?: string[] | null,
): boolean {
  if (path === "/profile" || path.startsWith("/login")) return true;
  if (!allowedRoutes?.length) return false;
  return allowedRoutes.includes(path);
}

export function moduleAllowed(moduleId: string, effectiveModules?: string[] | null): boolean {
  if (!effectiveModules?.length) return false;
  return effectiveModules.includes(moduleId);
}

export function modulesForRole(
  role: AdminRole,
  catalog: AdminModule[],
  roleCeilings: Record<string, string[]>,
): AdminModule[] {
  const ceiling = new Set(roleCeilings[role] || []);
  return catalog.filter((m) => ceiling.has(m.id));
}

export function defaultModulesForRole(
  role: AdminRole,
  roleDefaults: Record<string, string[]>,
): string[] {
  return roleDefaults[role] || [];
}