import type { ReactNode } from "react";
import type { CallReportSeries } from "../../lib/api";
import clsx from "clsx";

export function SeriesBarChart({
  series,
  metric,
}: {
  series: CallReportSeries[];
  metric: "count" | "sum_duration" | "avg_duration";
}) {
  const values = series.map((s) =>
    metric === "count" ? s.count : metric === "sum_duration" ? s.sum_duration : s.avg_duration,
  );
  const max = Math.max(1, ...values);

  if (!series.length) {
    return <p className="py-8 text-center text-sm text-slate-500">Sin datos para el rango seleccionado</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex h-48 items-end gap-1 sm:gap-2">
        {series.map((s, i) => {
          const val = values[i];
          return (
            <div key={s.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-cyan-300/80 opacity-0 transition group-hover:opacity-100">
                {val}
              </span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-cyan-600/50 to-cyan-400/30 transition hover:from-cyan-500/60"
                style={{ height: `${(val / max) * 100}%`, minHeight: val ? 4 : 0 }}
                title={`${s.label}: ${val}`}
              />
              <span className="max-w-full truncate text-[9px] text-slate-500 sm:text-[10px]" title={s.label}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OutcomeDonut({
  series,
}: {
  series: CallReportSeries[];
}) {
  const total = series.reduce((a, s) => a + s.count, 0);
  if (!total) return null;

  let offset = 0;
  const colors = ["#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#94a3b8"];

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
        {series.map((s, i) => {
          const pct = (s.count / total) * 100;
          const dash = `${pct} ${100 - pct}`;
          const el = (
            <circle
              key={s.key}
              cx="18"
              cy="18"
              r="15.9"
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="3.2"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              className="transition-opacity hover:opacity-80"
            />
          );
          offset += pct;
          return el;
        })}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors[i % colors.length] }}
            />
            <span className="capitalize text-slate-300">{s.label}</span>
            <span className="tabular-nums text-slate-500">
              {s.count} ({Math.round((s.count / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryTiles({
  summary,
}: {
  summary: {
    total_calls: number;
    avg_duration_seconds: number;
    total_duration_seconds: number;
    unique_callers: number;
  };
}) {
  const tiles = [
    { label: "Llamadas", value: summary.total_calls },
    { label: "Llamantes únicos", value: summary.unique_callers },
    { label: "Duración prom.", value: `${summary.avg_duration_seconds}s` },
    { label: "Duración total", value: `${Math.round(summary.total_duration_seconds / 60)} min` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{t.label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-cyan-200">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-lg px-4 py-2 text-sm transition",
        active
          ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/30"
          : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
      )}
    >
      {children}
    </button>
  );
}