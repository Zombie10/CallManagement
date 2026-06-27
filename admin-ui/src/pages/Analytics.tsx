import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Download,
  Filter,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Table2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "../components/Select";
import { PivotTable } from "../components/reports/PivotTable";
import { ReportDetailGrid } from "../components/reports/ReportDetailGrid";
import { AgentFleetStatus } from "../components/AgentFleetStatus";
import { ExportReportMenu } from "../components/reports/ExportReportMenu";
import { ReportTabFilterBar } from "../components/reports/ReportTabFilterBar";
import {
  OutcomeDonut,
  SeriesBarChart,
  SeriesDataTable,
  SummaryBreakdown,
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
import {
  CHANNEL_FILTER_OPTIONS,
  dimensionLabel,
} from "../lib/reportDisplay";
import clsx from "clsx";

type TabId = "summary" | "series" | "pivot" | "detail";

const FILTERS_COLLAPSED_KEY = "analytics-filters-collapsed";

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
  const [filtersCollapsed, setFiltersCollapsed] = useState(
    () => sessionStorage.getItem(FILTERS_COLLAPSED_KEY) === "1",
  );

  useEffect(() => {
    sessionStorage.setItem(FILTERS_COLLAPSED_KEY, filtersCollapsed ? "1" : "0");
  }, [filtersCollapsed]);

  const { data: options } = useQuery({
    queryKey: ["report-options", tenantId],
    queryFn: () => api.reportOptions(tenantId),
    enabled: !!tenantId,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics", tenantId],
    queryFn: () => api.analytics(tenantId),
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
    queryFn: () => api.queryReport(filtersToPayload(appliedFilters), tenantId),
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

  const agentLabelMap = useMemo(
    () => new Map((options?.agents || []).map((a) => [a.id, a.label])),
    [options?.agents],
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
        <div className="flex flex-wrap items-center gap-2">
          <ExportReportMenu filters={appliedFilters} tenantId={tenantId} />
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
        </div>
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
          <AgentFleetStatus tenantId={tenantId} variant="compact" />
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

      <div
        className={clsx(
          "grid min-w-0 gap-4 transition-all duration-200",
          filtersCollapsed ? "xl:grid-cols-[3rem_minmax(0,1fr)]" : "xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]",
        )}
      >
        {filtersCollapsed ? (
          <aside className="glass-card hidden shrink-0 flex-col items-center gap-2 p-2 xl:flex xl:sticky xl:top-4 xl:self-start">
            <button
              type="button"
              className="btn-ghost w-full justify-center px-1 py-2"
              title="Expandir filtros"
              onClick={() => setFiltersCollapsed(false)}
            >
              <PanelLeftOpen className="h-4 w-4 text-cyan-400" />
            </button>
            <Filter className="h-4 w-4 text-slate-500" aria-hidden />
          </aside>
        ) : (
        <aside className="glass-card space-y-5 p-5 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <Filter className="h-4 w-4 text-cyan-400" />
              Filtros
            </div>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              title="Contraer filtros"
              onClick={() => setFiltersCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
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

          <MultiCheck
            label="Canales"
            options={CHANNEL_FILTER_OPTIONS}
            selected={filters.channels}
            onChange={(channels) => setFilters((f) => ({ ...f, channels }))}
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
        )}

        <div className="min-w-0 space-y-4">
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
                <div className="space-y-4">
                  <ReportTabFilterBar
                    filters={filters}
                    setFilters={setFilters}
                    onApply={runReport}
                    isFetching={isFetching}
                    outcomeOptions={outcomeOptions}
                    agentOptions={agentOptions}
                    resultLabel={`${data.summary.total_calls} llamadas en el período`}
                  />
                  <div className="glass-card p-6">
                    <h2 className="mb-4 font-display text-lg font-semibold">Distribución por outcome</h2>
                    <OutcomeDonut series={data.outcome_breakdown} />
                    {!data.outcome_breakdown.length && (
                      <p className="text-sm text-slate-500">Sin datos en el período</p>
                    )}
                  </div>
                  <div className="glass-card p-6">
                    <h2 className="mb-4 font-display text-lg font-semibold">Desglose del período</h2>
                    <SummaryBreakdown summary={data.summary} outcomeBreakdown={data.outcome_breakdown} />
                  </div>
                </div>
              )}

              {tab === "series" && (
                <div className="space-y-4">
                  <ReportTabFilterBar
                    filters={filters}
                    setFilters={setFilters}
                    onApply={runReport}
                    isFetching={isFetching}
                    outcomeOptions={outcomeOptions}
                    agentOptions={agentOptions}
                    showGroupBy
                    dimensionOptions={dimensionOptions}
                    resultLabel={`${data.series.length} períodos · ${data.summary.total_calls} llamadas`}
                  />
                <div className="glass-card space-y-6 p-6">
                  <div>
                    <h2 className="mb-1 font-display text-lg font-semibold">
                      Serie por {dimensionLabel(data.group_by)}
                    </h2>
                    <p className="mb-4 text-sm text-slate-500">
                      {data.series.length} períodos · métrica:{" "}
                      {metricOptions.find((m) => m.value === appliedFilters.metric)?.label || appliedFilters.metric}
                    </p>
                    <SeriesBarChart series={data.series} metric={appliedFilters.metric} />
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-slate-300">Tabla de la serie</h3>
                    <SeriesDataTable series={data.series} />
                  </div>
                </div>
                </div>
              )}

              {tab === "pivot" && (
                <div className="glass-card p-6">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">Tabla pivot</h2>
                      {data.pivot && (
                        <p className="mt-1 text-sm text-slate-500">
                          {dimensionLabel(data.pivot.row_dimension)} ×{" "}
                          {dimensionLabel(data.pivot.col_dimension)} ·{" "}
                          {metricOptions.find((m) => m.value === data.pivot!.metric)?.label || data.pivot.metric}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <span className="mb-1 block text-[10px] text-slate-500">Filas</span>
                        <Select
                          className="w-36"
                          size="sm"
                          value={filters.pivotRow}
                          onChange={(v) => {
                            const pivotRow = v as ReportFiltersState["pivotRow"];
                            setFilters((f) => ({ ...f, pivotRow }));
                            setAppliedFilters((f) => ({ ...f, pivotRow }));
                          }}
                          options={dimensionOptions}
                        />
                      </div>
                      <div>
                        <span className="mb-1 block text-[10px] text-slate-500">Columnas</span>
                        <Select
                          className="w-36"
                          size="sm"
                          value={filters.pivotCol}
                          onChange={(v) => {
                            const pivotCol = v as ReportFiltersState["pivotCol"];
                            setFilters((f) => ({ ...f, pivotCol }));
                            setAppliedFilters((f) => ({ ...f, pivotCol }));
                          }}
                          options={dimensionOptions}
                        />
                      </div>
                      <div>
                        <span className="mb-1 block text-[10px] text-slate-500">Métrica</span>
                        <Select
                          className="w-40"
                          size="sm"
                          value={filters.metric}
                          onChange={(v) => {
                            const metric = v as ReportFiltersState["metric"];
                            setFilters((f) => ({ ...f, metric }));
                            setAppliedFilters((f) => ({ ...f, metric }));
                          }}
                          options={metricOptions}
                        />
                      </div>
                      {data.pivot && (
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => exportPivotCsv(data.pivot!)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          CSV
                        </button>
                      )}
                    </div>
                  </div>
                  {data.pivot ? (
                    <PivotTable pivot={data.pivot} agentLabels={agentLabelMap} />
                  ) : (
                    <p className="text-sm text-slate-500">Configura dimensiones pivot en los filtros</p>
                  )}
                </div>
              )}

              {tab === "detail" && (
                <div className="space-y-4">
                  <ReportTabFilterBar
                    filters={filters}
                    setFilters={setFilters}
                    onApply={runReport}
                    isFetching={isFetching}
                    outcomeOptions={outcomeOptions}
                    agentOptions={agentOptions}
                    resultLabel={`${data.detail.length} filas en detalle (máx. 100)`}
                  />
                <div className="glass-card min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm text-slate-300">
                      <Table2 className="h-4 w-4 shrink-0" />
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
                  <ReportDetailGrid rows={data.detail} agentLabelMap={agentLabelMap} />
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