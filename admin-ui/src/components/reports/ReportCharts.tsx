import type { ReactNode } from "react";
import type { CallReportSeries, CallReportSummary } from "../../lib/api";
import { useUiLocale } from "../../contexts/LocaleContext";
import { outcomeLabel, seriesPointLabel } from "../../lib/i18n";
import { channelLabel, formatDuration, formatMetricValue } from "../../lib/reportDisplay";
import clsx from "clsx";

export function SeriesBarChart({
  series,
  metric,
  dimension,
}: {
  series: CallReportSeries[];
  metric: "count" | "sum_duration" | "avg_duration";
  dimension?: string;
}) {
  const { t, locale } = useUiLocale();
  const values = series.map((s) =>
    metric === "count" ? s.count : metric === "sum_duration" ? s.sum_duration : s.avg_duration,
  );
  const max = Math.max(1, ...values);

  if (!series.length) {
    return <p className="py-8 text-center text-sm text-slate-500">{t("analytics.noSeries")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex h-48 items-end gap-1 sm:gap-2">
        {series.map((s, i) => {
          const val = values[i];
          const mark = seriesPointLabel(s.key, s.label, dimension, locale);
          return (
            <div key={s.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-cyan-300/80 opacity-0 transition group-hover:opacity-100">
                {formatMetricValue(metric, val)}
              </span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-cyan-600/50 to-cyan-400/30 transition hover:from-cyan-500/60"
                style={{ height: `${(val / max) * 100}%`, minHeight: val ? 4 : 0 }}
                title={`${mark}: ${formatMetricValue(metric, val)}`}
              />
              <span className="max-w-full truncate text-[9px] text-slate-500 sm:text-[10px]" title={mark}>
                {mark}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SeriesDataTable({ series, dimension }: { series: CallReportSeries[]; dimension?: string }) {
  const { t, locale } = useUiLocale();
  if (!series.length) return null;

  const totals = series.reduce(
    (acc, s) => ({
      count: acc.count + s.count,
      sum_duration: acc.sum_duration + s.sum_duration,
    }),
    { count: 0, sum_duration: 0 },
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="data-table min-w-[520px]">
        <thead className="bg-white/[0.02] text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">{t("analytics.seriesPeriod")}</th>
            <th className="px-4 py-2 text-right">{t("analytics.seriesCalls")}</th>
            <th className="px-4 py-2 text-right">{t("analytics.seriesShare")}</th>
            <th className="px-4 py-2 text-right">{t("analytics.seriesSum")}</th>
            <th className="px-4 py-2 text-right">{t("analytics.seriesAvg")}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key} className="border-t border-white/5">
              <td className="px-4 py-2 font-medium text-slate-200">{seriesPointLabel(s.key, s.label, dimension, locale)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{s.count}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-400">
                {totals.count ? Math.round((s.count / totals.count) * 100) : 0}%
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{formatDuration(s.sum_duration)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatDuration(s.avg_duration)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OutcomeDonut({
  series,
}: {
  series: CallReportSeries[];
}) {
  const { t, locale } = useUiLocale();
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
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {series.map((s, i) => (
          <li key={s.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[i % colors.length] }}
            />
            <span className="text-slate-300">{outcomeLabel(s.key, locale)}</span>
            <span className="tabular-nums text-slate-500">
              {s.count} ({Math.round((s.count / total) * 100)}%)
            </span>
            <span className="text-xs text-slate-600">
              {t("analytics.donutAvg", {
                avg: formatDuration(s.avg_duration),
                sum: formatDuration(s.sum_duration),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: CallReportSummary }) {
  const { t } = useUiLocale();
  const handoffRate =
    summary.total_calls && summary.handoffs != null
      ? Math.round((summary.handoffs / summary.total_calls) * 100)
      : 0;

  const tiles = [
    { id: "calls", label: t("analytics.tileCalls"), value: summary.total_calls, hint: t("analytics.tileCallsHint") },
    { id: "callers", label: t("analytics.tileCallers"), value: summary.unique_callers, hint: t("analytics.tileCallersHint") },
    { id: "avg", label: t("analytics.tileAvg"), value: formatDuration(summary.avg_duration_seconds), hint: t("analytics.tileAvgHint") },
    {
      id: "total",
      label: t("analytics.tileTotal"),
      value: formatDuration(summary.total_duration_seconds),
      hint: t("analytics.tileTotalHint", { minutes: Math.round(summary.total_duration_seconds / 60) }),
    },
    {
      id: "handoffs",
      label: t("analytics.tileHandoffs"),
      value: summary.handoffs ?? 0,
      hint: summary.total_calls
        ? t("analytics.tileHandoffRate", { rate: handoffRate })
        : t("analytics.tileHandoffEmpty"),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{tile.label}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-cyan-200">{tile.value}</p>
          <p className="mt-0.5 text-[10px] text-slate-600">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function SummaryBreakdown({
  summary,
  outcomeBreakdown,
}: {
  summary: CallReportSummary;
  outcomeBreakdown: CallReportSeries[];
}) {
  const { t, locale } = useUiLocale();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {summary.channels && summary.channels.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">{t("analytics.byChannel")}</p>
          <ul className="space-y-2">
            {summary.channels.map((ch) => {
              const named = channelLabel(ch.key, locale);
              const label = named !== ch.key ? named : ch.label || named;
              return (
              <li key={ch.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">{label}</span>
                <span className="tabular-nums text-slate-400">
                  {ch.count}
                  {summary.total_calls ? ` (${Math.round((ch.count / summary.total_calls) * 100)}%)` : ""}
                </span>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {outcomeBreakdown.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">{t("analytics.topOutcomes")}</p>
          <ul className="space-y-2">
            {outcomeBreakdown.slice(0, 6).map((o) => (
              <li key={o.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-300">{outcomeLabel(o.key, locale)}</span>
                <span className="text-xs tabular-nums text-slate-400">
                  {t("analytics.outcomeAvg", { count: o.count, duration: formatDuration(o.avg_duration) })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
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