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
import { DateField } from "../components/DateField";
import { Select } from "../components/Select";
import { PivotTable } from "../components/reports/PivotTable";
import { ReportDetailGrid } from "../components/reports/ReportDetailGrid";
import { AgentFleetStatus } from "../components/AgentFleetStatus";
import { ExportReportMenu } from "../components/reports/ExportReportMenu";

import {
  OutcomeDonut,
  SeriesBarChart,
  SeriesDataTable,
  SummaryBreakdown,
  SummaryTiles,
  TabButton,
} from "../components/reports/ReportCharts";
import { useUiLocale } from "../contexts/LocaleContext";
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
  channelFilterOptions,
  dimensionLabel,
  formatDuration,
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
  const { t } = useUiLocale();
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
        {!options.length && <span className="text-xs text-slate-600">{t("analytics.noOptions")}</span>}
      </div>
    </div>
  );
}

export function Analytics() {
  const { tenant, tenantId } = useTenant();
  const { t, locale } = useUiLocale();
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
    queryKey: ["analytics", tenantId, appliedFilters.dateFrom, appliedFilters.dateTo],
    queryFn: () =>
      api.analytics(tenantId, {
        dateFrom: appliedFilters.dateFrom,
        dateTo: appliedFilters.dateTo,
      }),
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
        label: dimensionLabel(d.id, locale),
      })),
    [locale, options?.dimensions],
  );

  const metricOptions = useMemo(
    () =>
      (options?.metrics || []).map((m) => ({
        value: m.id,
        label: t(`metric.${m.id}`),
      })),
    [options?.metrics, t],
  );

  const agentInstances = useMemo(() => options?.agents || [], [options?.agents]);

  const agentLabelMap = useMemo(
    () => new Map(agentInstances.map((a) => [a.id, a.label])),
    [agentInstances],
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
        {t("analytics.needTenant")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("analytics.title")}</h1>
          <p className="mt-1 text-slate-400">
            {tenant?.name} · {t("analytics.subtitle")}
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
            {t("analytics.runReport")}
          </button>
        </div>
      </header>

      {analyticsData?.actionable && (
        <section className="glass-card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">{t("analytics.sla")}</p>
            <p className="text-2xl font-semibold text-emerald-300">
              {analyticsData.actionable.sla_compliance_pct}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t("analytics.escalations")}</p>
            <p className="text-2xl font-semibold text-amber-200">
              {analyticsData.actionable.escalations}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t("analytics.sentiment")}</p>
            <p className="text-2xl font-semibold capitalize">
              {analyticsData.actionable.sentiment_label}
            </p>
          </div>
          <AgentFleetStatus tenantId={tenantId} variant="compact" />
          {analyticsData.actionable.agent_comparison.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="mb-2 text-xs font-medium uppercase text-slate-500">{t("analytics.agentComparison")}</p>
              <div className="flex flex-wrap gap-2">
                {analyticsData.actionable.agent_comparison.map((a) => {
                  const label = a.label || "—";
                  const calls = a.call_count === 1 ? t("analytics.callOne") : t("analytics.callMany");
                  return (
                    <span
                      key={label}
                      className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300"
                    >
                      {label}: {a.call_count} {calls} · {formatDuration(a.avg_duration_seconds)} {t("analytics.avg")}
                      {a.escalations > 0 && ` · ${a.escalations} ${t("analytics.escalationsShort")}`}
                    </span>
                  );
                })}
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
              title={t("analytics.expandFilters")}
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
              {t("analytics.filters")}
            </div>
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              title={t("analytics.collapseFilters")}
              onClick={() => setFiltersCollapsed(true)}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <DateField
              label={t("analytics.from")}
              value={filters.dateFrom}
              onChange={(dateFrom) => setFilters((f) => ({ ...f, dateFrom }))}
            />
            <DateField
              label={t("analytics.to")}
              value={filters.dateTo}
              onChange={(dateTo) => setFilters((f) => ({ ...f, dateTo }))}
            />
          </div>

          <MultiCheck
            label={t("analytics.outcomes")}
            options={outcomeOptions}
            selected={filters.outcomes}
            onChange={(outcomes) => setFilters((f) => ({ ...f, outcomes }))}
          />

          <MultiCheck
            label={t("analytics.agents")}
            options={agentOptions}
            selected={filters.agentIds}
            onChange={(agentIds) => setFilters((f) => ({ ...f, agentIds }))}
          />

          <MultiCheck
            label={t("analytics.channels")}
            options={channelFilterOptions(locale)}
            selected={filters.channels}
            onChange={(channels) => setFilters((f) => ({ ...f, channels }))}
          />

          <label className="block space-y-1">
            <span className="text-xs text-slate-500">{t("analytics.fromContains")}</span>
            <input
              className="input-field w-full"
              placeholder="+502..."
              value={filters.fromNumber}
              onChange={(e) => setFilters((f) => ({ ...f, fromNumber: e.target.value }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-xs text-slate-500">{t("analytics.minDuration")}</span>
              <input
                type="number"
                className="input-field w-full"
                value={filters.minDuration}
                onChange={(e) => setFilters((f) => ({ ...f, minDuration: e.target.value }))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-slate-500">{t("analytics.maxDuration")}</span>
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
                {t("analytics.customFilters")}
              </span>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={addCustomFilter}>
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2">
              {filters.customFilters.map((cf, i) => (
                <div key={i} className="flex flex-wrap gap-1 rounded-lg bg-white/[0.03] p-2">
                  <Select
                    className="w-28"
                    size="sm"
                    searchableFrom={0}
                    value={cf.field}
                    onChange={(field) => updateCustomFilter(i, { field })}
                    options={FILTER_FIELDS.map((f) => ({ value: f.value, label: t(`analytics.field.${f.value}`) }))}
                  />
                  <Select
                    className="w-24"
                    size="sm"
                    searchableFrom={0}
                    value={cf.op}
                    onChange={(op) => updateCustomFilter(i, { op })}
                    options={FILTER_OPS.map((o) => ({ value: o.value, label: t(`analytics.op.${o.value}`) }))}
                  />
                  <input
                    className="input-field min-w-0 flex-1 text-xs"
                    placeholder={t("analytics.valuePlaceholder")}
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
              {t("analytics.grouping")}
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
                <span className="text-[10px] text-slate-500">{t("analytics.pivotRows")}</span>
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
                <span className="text-[10px] text-slate-500">{t("analytics.pivotCols")}</span>
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
              {t("analytics.savedPresets")}
            </p>
            <div className="mb-2 flex gap-1">
              <input
                className="input-field min-w-0 flex-1 text-xs"
                placeholder={t("analytics.presetName")}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
              <button type="button" className="btn-ghost px-2 text-xs" onClick={savePreset}>
                {t("analytics.save")}
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
                <li className="text-xs text-slate-600">{t("analytics.noPresets")}</li>
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
              {t("analytics.emptyBefore")} <strong className="text-slate-300">{t("analytics.runReport")}</strong>
            </div>
          )}

          {data && (
            <>
              <SummaryTiles summary={data.summary} />

              <div className="flex flex-wrap gap-2">
                <TabButton active={tab === "summary"} onClick={() => setTab("summary")}>
                  {t("analytics.tabSummary")}
                </TabButton>
                <TabButton active={tab === "series"} onClick={() => setTab("series")}>
                  {t("analytics.tabSeries")}
                </TabButton>
                <TabButton active={tab === "pivot"} onClick={() => setTab("pivot")}>
                  {t("analytics.tabPivot")}
                </TabButton>
                <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
                  {t("analytics.tabDetail")}
                </TabButton>
              </div>

              {tab === "summary" && (
                <div className="space-y-4">
                  <div className="glass-card p-6">
                    <h2 className="mb-4 font-display text-lg font-semibold">{t("analytics.outcomeDist")}</h2>
                    <OutcomeDonut series={data.outcome_breakdown} />
                    {!data.outcome_breakdown.length && (
                      <p className="text-sm text-slate-500">{t("analytics.noPeriodData")}</p>
                    )}
                  </div>
                  <div className="glass-card p-6">
                    <h2 className="mb-4 font-display text-lg font-semibold">{t("analytics.periodBreakdown")}</h2>
                    <SummaryBreakdown summary={data.summary} outcomeBreakdown={data.outcome_breakdown} />
                  </div>
                </div>
              )}

              {tab === "series" && (
                <div className="space-y-4">
                <div className="glass-card space-y-6 p-6">
                  <div>
                    <h2 className="mb-1 font-display text-lg font-semibold">
                      {t("analytics.seriesBy", { dimension: dimensionLabel(data.group_by, locale) })}
                    </h2>
                    <p className="mb-4 text-sm text-slate-500">
                      {t("analytics.seriesMeta", {
                        count: data.series.length,
                        metric: metricOptions.find((m) => m.value === appliedFilters.metric)?.label || appliedFilters.metric,
                      })}
                    </p>
                    <SeriesBarChart series={data.series} metric={appliedFilters.metric} />
                  </div>
                  <div>
                    <h3 className="mb-3 text-sm font-medium text-slate-300">{t("analytics.seriesTable")}</h3>
                    <SeriesDataTable series={data.series} />
                  </div>
                </div>
                </div>
              )}

              {tab === "pivot" && (
                <div className="glass-card p-6">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">{t("analytics.pivotTitle")}</h2>
                      {data.pivot && (
                        <p className="mt-1 text-sm text-slate-500">
                          {dimensionLabel(data.pivot.row_dimension, locale)} ×{" "}
                          {dimensionLabel(data.pivot.col_dimension, locale)} ·{" "}
                          {metricOptions.find((m) => m.value === data.pivot!.metric)?.label || data.pivot.metric}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <span className="mb-1 block text-[10px] text-slate-500">{t("analytics.rows")}</span>
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
                        <span className="mb-1 block text-[10px] text-slate-500">{t("analytics.columns")}</span>
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
                        <span className="mb-1 block text-[10px] text-slate-500">{t("analytics.metric")}</span>
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
                    <p className="text-sm text-slate-500">{t("analytics.pivotEmpty")}</p>
                  )}
                </div>
              )}

              {tab === "detail" && (
                <div className="space-y-4">
                <div className="glass-card min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm text-slate-300">
                      <Table2 className="h-4 w-4 shrink-0" />
                      {t("analytics.detailRows", { count: data.detail.length })}
                    </p>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() => exportDetailCsv(data.detail)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {t("analytics.exportCsv")}
                    </button>
                  </div>
                  <ReportDetailGrid
                    rows={data.detail}
                    agentLabelMap={agentLabelMap}
                    agentInstances={agentInstances}
                  />
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