import type { CallReportPayload } from "./api";
import { filtersToPayload, type ReportFiltersState } from "./reports";

const API = `${import.meta.env.BASE_URL.replace(/\/?$/, "")}/api`;

function buildHeaders(tenantId?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (tenantId) headers["X-Tenant-Id"] = tenantId;
  return headers;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^";\n]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadReportXlsx(
  filters: ReportFiltersState,
  tenantId: string,
): Promise<void> {
  const payload: CallReportPayload = {
    ...filtersToPayload(filters),
    detail_limit: 500,
  };
  const res = await fetch(`${API}/reports/export.xlsx`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(tenantId),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : "Error al exportar Excel");
  }
  const blob = await res.blob();
  const filename = parseFilename(res.headers.get("Content-Disposition"), "reporte-llamadas.xlsx");
  downloadBlob(blob, filename);
}

export function buildCallsCsvUrl(filters: ReportFiltersState, tenantId: string): string {
  const p = filtersToPayload(filters);
  const q = new URLSearchParams();
  if (p.date_from) q.set("date_from", p.date_from);
  if (p.date_to) q.set("date_to", p.date_to);
  if (p.outcomes?.length) q.set("outcomes", p.outcomes.join(","));
  if (p.agent_instance_ids?.length) q.set("agent_instance_ids", p.agent_instance_ids.join(","));
  if (p.channels?.length) q.set("channels", p.channels.join(","));
  if (p.from_number) q.set("from_number", p.from_number);
  if (p.min_duration != null) q.set("min_duration", String(p.min_duration));
  if (p.max_duration != null) q.set("max_duration", String(p.max_duration));
  const qs = q.toString();
  return `${API}/export/calls.csv${qs ? `?${qs}` : ""}`;
}

/** Fetch CSV with tenant header (plain <a> cannot send X-Tenant-Id). */
export async function downloadCallsCsv(filters: ReportFiltersState, tenantId: string): Promise<void> {
  const url = buildCallsCsvUrl(filters, tenantId);
  const res = await fetch(url, {
    credentials: "include",
    headers: buildHeaders(tenantId),
  });
  if (!res.ok) {
    throw new Error("Error al exportar CSV");
  }
  const blob = await res.blob();
  const filename = parseFilename(res.headers.get("Content-Disposition"), "llamadas.csv");
  downloadBlob(blob, filename);
}