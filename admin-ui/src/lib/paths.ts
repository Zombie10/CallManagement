export function appBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "") || "";
}

/** Strip deploy base prefix so role checks work even with stale router state. */
export function normalizeAppPath(path: string): string {
  if (!path) return "/";
  const base = appBasePath();
  let normalized = path;
  if (base && normalized.startsWith(base)) {
    normalized = normalized.slice(base.length) || "/";
  }
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  return normalized;
}