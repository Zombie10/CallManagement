import type { Dispatch, SetStateAction } from "react";
import { Filter, Loader2, RefreshCw, X } from "lucide-react";
import { DateField } from "../DateField";
import { Select } from "../Select";
import type { CustomReportFilter } from "../../lib/api";
import { CHANNEL_FILTER_OPTIONS } from "../../lib/reportDisplay";
import type { ReportFiltersState } from "../../lib/reports";
import { useUiLocale } from "../../contexts/LocaleContext";
import clsx from "clsx";

type Option = { value: string; label: string };

type Props = {
  filters: ReportFiltersState;
  setFilters: Dispatch<SetStateAction<ReportFiltersState>>;
  onApply: () => void;
  isFetching: boolean;
  outcomeOptions: Option[];
  agentOptions: Option[];
  showGroupBy?: boolean;
  dimensionOptions?: Option[];
  resultLabel?: string;
};

function countActive(f: ReportFiltersState): number {
  let n = 0;
  if (f.outcomes.length) n++;
  if (f.agentIds.length) n++;
  if (f.channels.length) n++;
  if (f.fromNumber.trim()) n++;
  if (f.minDuration || f.maxDuration) n++;
  if (f.customFilters.some((c) => c.field && c.value !== "" && c.value !== null)) n++;
  return n;
}

function PillToggle({
  options,
  selected,
  onChange,
  maxVisible = 6,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  maxVisible?: number;
}) {
  const visible = options.slice(0, maxVisible);
  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };
  const { t } = useUiLocale();
  if (!options.length) return <span className="text-xs text-slate-600">{t("analytics.noOptions")}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => toggle(o.value)}
          className={clsx(
            "rounded-md px-2 py-1 text-[11px] transition",
            selected.includes(o.value)
              ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30"
              : "bg-white/5 text-slate-400 hover:bg-white/10",
          )}
        >
          {o.label}
        </button>
      ))}
      {options.length > maxVisible && (
        <span className="self-center text-[10px] text-slate-600">+{options.length - maxVisible}</span>
      )}
    </div>
  );
}

export function ReportTabFilterBar({
  filters,
  setFilters,
  onApply,
  isFetching,
  outcomeOptions,
  agentOptions,
  showGroupBy,
  dimensionOptions = [],
  resultLabel,
}: Props) {
  const { t } = useUiLocale();
  const active = countActive(filters);

  const clearQuick = () => {
    setFilters((f) => ({
      ...f,
      outcomes: [],
      agentIds: [],
      channels: [],
      fromNumber: "",
      minDuration: "",
      maxDuration: "",
      customFilters: [] as CustomReportFilter[],
    }));
  };

  return (
    <div className="glass-card space-y-3 p-3 sm:p-4">
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
        <DateField
          className="min-w-0 w-full"
          label={t("analytics.from")}
          value={filters.dateFrom}
          onChange={(dateFrom) => setFilters((f) => ({ ...f, dateFrom }))}
        />
        <DateField
          className="min-w-0 w-full"
          label={t("analytics.to")}
          value={filters.dateTo}
          onChange={(dateTo) => setFilters((f) => ({ ...f, dateTo }))}
        />
        <label className="min-w-0 space-y-1">
          <span className="text-[10px] text-slate-500">{t("analytics.fromContains")}</span>
          <input
            className="input-field min-w-0 text-xs"
            placeholder="+502…"
            value={filters.fromNumber}
            onChange={(e) => setFilters((f) => ({ ...f, fromNumber: e.target.value }))}
          />
        </label>
        {showGroupBy && dimensionOptions.length > 0 && (
          <label className="min-w-0 space-y-1">
            <span className="text-[10px] text-slate-500">{t("report.groupBy")}</span>
            <Select
              className="w-full min-w-0"
              size="sm"
              value={filters.groupBy}
              onChange={(v) => setFilters((f) => ({ ...f, groupBy: v as ReportFiltersState["groupBy"] }))}
              options={dimensionOptions}
            />
          </label>
        )}
        <button type="button" className="btn-primary text-xs" disabled={isFetching} onClick={onApply}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("report.apply")}
        </button>
        {active > 0 && (
          <button type="button" className="btn-ghost text-xs" onClick={clearQuick}>
            <X className="h-3.5 w-3.5" />
            {t("filters.clear")}
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("report.outcomes")}</p>
          <PillToggle
            options={outcomeOptions}
            selected={filters.outcomes}
            onChange={(outcomes) => setFilters((f) => ({ ...f, outcomes }))}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("analytics.agents")}</p>
          <PillToggle
            options={agentOptions}
            selected={filters.agentIds}
            onChange={(agentIds) => setFilters((f) => ({ ...f, agentIds }))}
            maxVisible={4}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{t("analytics.channels")}</p>
          <PillToggle
            options={CHANNEL_FILTER_OPTIONS}
            selected={filters.channels}
            onChange={(channels) => setFilters((f) => ({ ...f, channels }))}
          />
        </div>
      </div>

      {(resultLabel || active > 0) && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Filter className="h-3 w-3" />
          {resultLabel}
          {active > 0 && <span className="text-slate-600">· {active} filtro(s) activo(s)</span>}
        </p>
      )}
    </div>
  );
}