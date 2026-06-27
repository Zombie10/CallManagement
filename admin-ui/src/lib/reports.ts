import type { CallReportResponse, CustomReportFilter, ReportDimension } from "./api";

export const PRESETS_KEY = "callmgmt-report-presets";

export type ReportPreset = {
  id: string;
  name: string;
  filters: ReportFiltersState;
};

export type ReportFiltersState = {
  dateFrom: string;
  dateTo: string;
  outcomes: string[];
  agentIds: string[];
  fromNumber: string;
  minDuration: string;
  maxDuration: string;
  channels: string[];
  groupBy: ReportDimension;
  pivotRow: ReportDimension;
  pivotCol: ReportDimension;
  metric: "count" | "sum_duration" | "avg_duration";
  customFilters: CustomReportFilter[];
};

export function defaultFilters(): ReportFiltersState {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: today.toISOString().slice(0, 10),
    outcomes: [],
    agentIds: [],
    fromNumber: "",
    minDuration: "",
    maxDuration: "",
    channels: [],
    groupBy: "day",
    pivotRow: "weekday",
    pivotCol: "outcome",
    metric: "count",
    customFilters: [],
  };
}

export function loadPresets(): ReportPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    return raw ? (JSON.parse(raw) as ReportPreset[]) : [];
  } catch {
    return [];
  }
}

export function savePresets(presets: ReportPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function filtersToPayload(f: ReportFiltersState) {
  return {
    date_from: f.dateFrom || null,
    date_to: f.dateTo || null,
    outcomes: f.outcomes,
    agent_instance_ids: f.agentIds,
    from_number: f.fromNumber || null,
    min_duration: f.minDuration ? Number(f.minDuration) : null,
    max_duration: f.maxDuration ? Number(f.maxDuration) : null,
    channels: f.channels,
    group_by: f.groupBy,
    pivot_row: f.pivotRow,
    pivot_col: f.pivotCol,
    metric: f.metric,
    custom_filters: f.customFilters.filter((c) => c.field && c.value !== "" && c.value !== null),
  };
}

export function exportDetailCsv(detail: CallReportResponse["detail"]) {
  const headers = [
    "id_llamada",
    "origen",
    "destino",
    "inicio",
    "fin",
    "canal",
    "outcome",
    "duracion_seg",
    "agente_id",
    "plantilla",
    "transcript",
    "grabacion",
    "resumen",
    "notas_agente",
  ];
  const keys = [
    "call_id",
    "from_number",
    "to_number",
    "start_time",
    "end_time",
    "channel",
    "outcome",
    "duration_seconds",
    "agent_instance_id",
    "transferred_to",
    "has_transcript",
    "has_recording",
    "summary",
    "agent_notes",
  ] as const;
  const rows = detail.map((r) =>
    keys.map((k) => {
      let v: unknown = r[k as keyof typeof r];
      if (k === "has_transcript") v = r.has_transcript ? "Sí" : "No";
      if (k === "has_recording") v = r.has_recording ? "Sí" : "No";
      const s = v == null ? "" : String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","),
  );
  downloadCsv([headers.join(","), ...rows].join("\n"), "llamadas-detalle.csv");
}

export function exportPivotCsv(pivot: NonNullable<CallReportResponse["pivot"]>) {
  const header = ["", ...pivot.col_labels].join(",");
  const rows = pivot.row_labels.map((label, i) =>
    [label, ...pivot.cells[i].map(String)].join(","),
  );
  downloadCsv([header, ...rows].join("\n"), "pivot-llamadas.csv");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const FILTER_OPS = [
  { value: "eq", label: "igual a" },
  { value: "neq", label: "distinto de" },
  { value: "contains", label: "contiene" },
  { value: "gte", label: ">=" },
  { value: "lte", label: "<=" },
  { value: "in", label: "en lista (coma)" },
] as const;

export const FILTER_FIELDS = [
  { value: "outcome", label: "Outcome" },
  { value: "agent_instance_id", label: "Agente ID" },
  { value: "transferred_to", label: "Plantilla agente" },
  { value: "channel", label: "Canal" },
  { value: "from_number", label: "Teléfono origen" },
  { value: "to_number", label: "Teléfono destino" },
  { value: "duration_seconds", label: "Duración (s)" },
  { value: "start_time", label: "Fecha inicio" },
] as const;