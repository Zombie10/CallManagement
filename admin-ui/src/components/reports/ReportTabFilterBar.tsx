import type { Dispatch, SetStateAction } from "react";
import { Filter, Loader2, RefreshCw, X } from "lucide-react";
import { Select } from "../Select";
import type { CustomReportFilter } from "../../lib/api";
import { CHANNEL_FILTER_OPTIONS } from "../../lib/reportDisplay";
import type { ReportFiltersState } from "../../lib/reports";
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
  if (!options.length) return <span className="text-xs text-slate-600">Sin opciones</span>;
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
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="text-[10px] text-slate-500">Desde</span>
          <input
            type="date"
            className="input-field w-[9.5rem] text-xs"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] text-slate-500">Hasta</span>
          <input
            type="date"
            className="input-field w-[9.5rem] text-xs"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          />
        </label>
        <label className="min-w-[8rem] flex-1 space-y-1">
          <span className="text-[10px] text-slate-500">Teléfono origen</span>
          <input
            className="input-field text-xs"
            placeholder="+502…"
            value={filters.fromNumber}
            onChange={(e) => setFilters((f) => ({ ...f, fromNumber: e.target.value }))}
          />
        </label>
        {showGroupBy && dimensionOptions.length > 0 && (
          <label className="space-y-1">
            <span className="text-[10px] text-slate-500">Agrupar por</span>
            <Select
              className="w-36"
              size="sm"
              value={filters.groupBy}
              onChange={(v) => setFilters((f) => ({ ...f, groupBy: v as ReportFiltersState["groupBy"] }))}
              options={dimensionOptions}
            />
          </label>
        )}
        <button type="button" className="btn-primary text-xs" disabled={isFetching} onClick={onApply}>
          {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Aplicar
        </button>
        {active > 0 && (
          <button type="button" className="btn-ghost text-xs" onClick={clearQuick}>
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Outcomes</p>
          <PillToggle
            options={outcomeOptions}
            selected={filters.outcomes}
            onChange={(outcomes) => setFilters((f) => ({ ...f, outcomes }))}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Agentes</p>
          <PillToggle
            options={agentOptions}
            selected={filters.agentIds}
            onChange={(agentIds) => setFilters((f) => ({ ...f, agentIds }))}
            maxVisible={4}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Canales</p>
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