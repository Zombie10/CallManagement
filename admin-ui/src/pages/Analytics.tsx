import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Download,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "../components/Select";
import { PivotTable } from "../components/reports/PivotTable";
import {
  OutcomeDonut,
  SeriesBarChart,
  SummaryTiles,
  TabButton,
} from "../components/reports/ReportCharts";
import { useTenant } from "../contexts/TenantContext";
import { api, type CustomReportFilter } from "../lib/api";
import {
  defaultFilters,
  exportDetailCsv,
  exportPivotCsv,
  FILTER_FIELDS,
  FILTER_OPS,
  filtersToPayload,
  loadPresets,
  savePresets,
  type ReportFiltersState,
  type ReportPreset,
} from "../lib/reports";
import clsx from "clsx";

type TabId = "summary" | "series" | "pivot" | "detail";

function MultiCheck({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={clsx(
              "rounded-lg px-2 py-1 text-xs transition",
              selected.includes(o.value)
                ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30"
                : "bg-white/5 text-slate-400 hover:bg-white/10",
            )}
          >
            {o.label}
          </button>
        ))}
        {!options.length && <span className="text-xs text-slate-600">Sin opciones</span>}
      </div>
    </div>
  );
}

export function Analytics() {
  const { tenant, tenantId } = useTenant();
  const [filters, setFilters] = useState<ReportFiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFiltersState>(defaultFilters);
  const [tab, setTab] = useState<TabId>("summary");
  const [presets, setPresets] = useState<ReportPreset[]>(loadPresets);
  const [presetName, setPresetName] = useState("");

  const { data: options } = useQuery({
    queryKey: ["report-options", tenantId],
    queryFn: api.reportOptions,
    enabled: !!tenantId,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics", tenantId],
    queryFn: api.analytics,
    enabled: !!tenantId,
  });

  const {
    data,
    isLoading: reportLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["report", tenantId, appliedFilters],
    queryFn: () => api.queryReport(filtersToPayload(appliedFilters)),
    enabled: !!tenantId,
  });

  const runReport = useCallback(() => {
    setAppliedFilters({ ...filters });
  }, [filters]);

  useEffect(() => {
    if (tenantId) setAppliedFilters(defaultFilters());
  }, [tenantId]);

  const outcomeOptions = useMemo(
    () => (options?.outcomes || []).map((o) => ({ value: o, label: o.replaceAll("_", " ") })),
    [options?.outcomes],
  );

  const agentOptions = useMemo(
    () => (options?.agents || []).map((a) => ({ value: a.id, label: a.label })),
    [options?.agents],
  );

  const dimensionOptions = useMemo(
    () =>
      (options?.dimensions || []).map((d) => ({
        value: d.id,
        label: d.label,
      })),
    [options?.dimensions],
  );

  const metricOptions = useMemo(
    () =>
      (options?.metrics || []).map((m) => ({
        value: m.id,
        label: m.label,
      })),
    [options?.metrics],
  );

  const addCustomFilter = () => {
    setFilters((f) => ({
      ...f,
      customFilters: [...f.customFilters, { field: "outcome", op: "eq", value: "" }],
    }));
  };

  const updateCustomFilter = (i: number, patch: Partial<CustomReportFilter>) => {
    setFilters((f) => {
      const next = [...f.customFilters];
      next[i] = { ...next[i], ...patch };
      return { ...f, customFilters: next };
    });
  };

  const removeCustomFilter = (i: number) => {
    setFilters((f) => ({
      ...f,
      customFilters: f.customFilters.filter((_, j) => j !== i),
    }));
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const preset: ReportPreset = {
      id: crypto.randomUUID(),
      name: presetName.trim(),
      filters: { ...filters },
    };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    setPresetName("");
  };

  const applyPreset = (p: ReportPreset) => {
    setFilters(p.filters);
    setAppliedFilters(p.filters);
  };

  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    savePresets(next);
  };

  if (!tenantId) {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        Selecciona una empresa para ver análisis y reportes.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Análisis y reportes</h1>
          <p className="mt-1 text-slate-400">
            {tenant?.name} · Filtros interactivos, series y tabla pivot
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={isFetching}
          onClick={runReport}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Ejecutar reporte
        </button>
      </header>

      {analyticsData?.actionable && (
        <section className="glass-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">SLA</p>
            <p className="text-2xl font-semibold text-emerald-300">
              {analyticsData.actionable.sla_compliance_pct}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Escalaciones</p>
            <p className="text-2xl font-semibold text-amber-200">
              {analyticsData.actionable.escalations}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Sentimiento</p>
            <p className="text-2xl font-semibold capitalize">
              {analyticsData.actionable.sentiment_label}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Exportar</p>
            <a href={api.exportCallsCsvUrl()} className="text-sm text-cyan-300 hover:text-cyan-200">
              Descargar CSV de llamadas
            </a>
          </div>
          {analyticsData.actionable.agent_comparison.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="mb-2 text-xs font-medium uppercase text-slate-500">Comparación agentes</p>
              <div className="flex flex-wrap gap-2">
                {analyticsData.actionable.agent_comparison.map((a) => (
                  <span
                    key={a.agent_instance_id}
                    className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300"
                  >
                    {a.agent_instance_id}: {a.call_count} llamadas · {a.avg_duration_seconds}s avg
                    {a.escalations > 0 && ` · ${a.escalations} escal.`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="glass-card space-y-5 p-5 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
            <Filter className="h-4 w-4 text-cyan-400" />
            Filtros
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Desde</span>
              <input
                type="date"
                className="input-field w-full"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Hasta</span>
              <input
                type="date"
                className="input-field w-full"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
              />
            </label>
          </div>

          <MultiCheck
            label="Outcomes"
            options={outcomeOptions}
            selected={filters.outcomes}
            onChange={(outcomes) => setFilters((f) => ({ ...f, outcomes }))}
          />

          <MultiCheck
            label="Agentes"
            options={agentOptions}
            selected={filters.agentIds}
            onChange={(agentIds) => setFilters((f) => ({ ...f, agentIds }))}
          />

          <label className="block space-y-1">
            <span className="text-xs text-slate-500">Teléfono origen (contiene)</span>
            <input
              className="input-field w-full"
              placeholder="+502..."
              value={filters.fromNumber}
              onChange={(e) => setFilters((f) => ({ ...f, fromNumber: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Duración min (s)</span>
              <input
                type="number"
                className="input-field w-full"
                value={filters.minDuration}
                onChange={(e) => setFilters((f) => ({ ...f, minDuration: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">Duración max (s)</span>
              <input
                type="number"
                className="input-field w-full"
                value={filters.maxDuration}
                onChange={(e) => setFilters((f) => ({ ...f, maxDuration: e.target.value }))}
              />
            </label>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Filtros personalizados
              </span>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={addCustomFilter}>
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2">
              {filters.customFilters.map((cf, i) => (
                <div key={i} className="flex flex-wrap gap-1 rounded-lg bg-white/[0.03] p-2">
                  <select
                    className="input-field w-24 text-xs"
                    value={cf.field}
                    onChange={(e) => updateCustomFilter(i, { field: e.target.value })}
                  >
                    {FILTER_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input-field w-20 text-xs"
                    value={cf.op}
                    onChange={(e) => updateCustomFilter(i, { op: e.target.value })}
                  >
                    {FILTER_OPS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input-field min-w-0 flex-1 text-xs"
                    placeholder="valor"
                    value={String(cf.value ?? "")}
                    onChange={(e) => {
                      const v = e.target.value;
                      const parsed =
                        cf.op === "in"
                          ? v.split(",").map((s) => s.trim()).filter(Boolean)
                          : cf.field === "duration_seconds"
                            ? v === ""
                              ? ""
                              : Number(v)
                            : v;
                      updateCustomFilter(i, { value: parsed });
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost px-1 text-red-300"
                    onClick={() => removeCustomFilter(i)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-white/5 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Agrupación / Pivot
            </p>
            <Select
              className="w-full"
              size="sm"
              value={filters.groupBy}
              onChange={(v) => setFilters((f) => ({ ...f, groupBy: v as ReportFiltersState["groupBy"] }))}
              options={dimensionOptions}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-500">Pivot filas</span>
                <Select
                  className="w-full"
                  size="sm"
                  value={filters.pivotRow}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, pivotRow: v as ReportFiltersState["pivotRow"] }))
                  }
                  options={dimensionOptions}
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500">Pivot columnas</span>
                <Select
                  className="w-full"
                  size="sm"
                  value={filters.pivotCol}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, pivotCol: v as ReportFiltersState["pivotCol"] }))
                  }
                  options={dimensionOptions}
                />
              </div>
            </div>
            <Select
              className="w-full"
              size="sm"
              value={filters.metric}
              onChange={(v) =>
                setFilters((f) => ({ ...f, metric: v as ReportFiltersState["metric"] }))
              }
              options={metricOptions}
            />
          </div>

          <div className="border-t border-white/5 pt-4">
            <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase text-slate-500">
              <Bookmark className="h-3 w-3" />
              Presets guardados
            </p>
            <div className="mb-2 flex gap-1">
              <input
                className="input-field min-w-0 flex-1 text-xs"
                placeholder="Nombre del preset"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button type="button" className="btn-ghost px-2 text-xs" onClick={savePreset}>
                Guardar
              </button>
            </div>
            <ul className="space-y-1">
              {presets.map((p) => (
                <li key={p.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn-ghost min-w-0 flex-1 justify-start truncate text-xs"
                    onClick={() => applyPreset(p)}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-1 text-red-300"
                    onClick={() => deletePreset(p.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
              {!presets.length && (
                <li className="text-xs text-slate-600">Guarda combinaciones de filtros frecuentes</li>
              )}
            </ul>
          </div>
        </aside>

        <div className="space-y-4">
          {isError && (
            <div className="glass-card border-red-500/30 p-4 text-sm text-red-300">
              {(error as Error).message}
            </div>
          )}

          {!data && !reportLoading && (
            <div className="glass-card py-16 text-center text-slate-500">
              Configura filtros y pulsa <strong className="text-slate-300">Ejecutar reporte</strong>
            </div>
          )}

          {data && (
            <>
              <SummaryTiles summary={data.summary} />

              <div className="flex flex-wrap gap-2">
                <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
                  Resumen
                </TabButton>
                <TabButton active={tab === "series"} onClick={() => setTab("series")}>
                  Series
                </TabButton>
                <TabButton active={tab === "pivot"} onClick={() => setTab("pivot")}>
                  Pivot
                </TabButton>
                <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
                  Detalle
                </TabButton>
              </div>

              {tab === "summary" && (
                <div className="glass-card p-6">
                  <h2 className="mb-4 font-display text-lg font-semibold">Distribución por outcome</h2>
                  <OutcomeDonut series={data.outcome_breakdown} />
                  {!data.outcome_breakdown.length && (
                    <p className="text-sm text-slate-500">Sin datos en el período</p>
                  )}
                </div>
              )}

              {tab === "series" && (
                <div className="glass-card p-6">
                  <h2 className="mb-4 font-display text-lg font-semibold">
                    Serie por {data.group_by}
                  </h2>
                  <SeriesBarChart series={data.series} metric={filters.metric} />
                </div>
              )}

              {tab === "pivot" && (
                <div className="glass-card p-6">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-semibold">
                      Tabla pivot
                      {data.pivot && (
                        <span className="ml-2 text-sm font-normal text-slate-500">
                          {data.pivot.row_dimension} × {data.pivot.col_dimension} · {data.pivot.metric}
                        </span>
                      )}
                    </h2>
                    {data.pivot && (
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => exportPivotCsv(data.pivot!)}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Exportar CSV
                      </button>
                    )}
                  </div>
                  {data.pivot ? (
                    <PivotTable pivot={data.pivot} />
                  ) : (
                    <p className="text-sm text-slate-500">Configura dimensiones pivot en los filtros</p>
                  )}
                </div>
              )}

              {tab === "detail" && (
                <div className="glass-card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm text-slate-300">
                      <Table2 className="h-4 w-4" />
                      {data.detail.length} filas (máx. 100)
                    </p>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => exportDetailCsv(data.detail)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Exportar CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-white/[0.02] text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-4 py-2">Fecha</th>
                          <th className="px-4 py-2">Origen</th>
                          <th className="px-4 py-2">Outcome</th>
                          <th className="px-4 py-2">Duración</th>
                          <th className="px-4 py-2">Agente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.detail.map((row) => (
                          <tr key={row.call_id} className="border-t border-white/5">
                            <td className="px-4 py-2 text-xs text-slate-400">
                              {row.start_time ? new Date(row.start_time).toLocaleString() : "—"}
                            </td>
                            <td className="px-4 py-2 font-mono text-cyan-200/90">{row.from_number}</td>
                            <td className="px-4 py-2 capitalize">{row.outcome?.replaceAll("_", " ") || "—"}</td>
                            <td className="px-4 py-2 tabular-nums">{row.duration_seconds ?? "—"}s</td>
                            <td className="px-4 py-2 text-xs text-slate-500">
                              {options?.agents.find((a) => a.id === row.agent_instance_id)?.label ||
                                row.agent_instance_id ||
                                "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}