import type { CallReportPivot } from "../../lib/api";
import { dimensionLabel, formatMetricValue } from "../../lib/reportDisplay";
import clsx from "clsx";

type Props = {
  pivot: CallReportPivot;
  agentLabels?: Map<string, string>;
  showPercentages?: boolean;
};

function labelForKey(key: string, dimension: string, agentLabels?: Map<string, string>): string {
  if (dimension === "agent" && agentLabels?.has(key)) {
    return agentLabels.get(key)!;
  }
  if (dimension === "agent" && key === "unassigned") return "Sin asignar";
  return key;
}

export function PivotTable({ pivot, agentLabels, showPercentages = true }: Props) {
  const max = Math.max(1, ...pivot.cells.flat());
  const grandTotal = pivot.cells.flat().reduce((a, b) => a + b, 0);

  const rowLabels = pivot.row_keys.map((key, i) => {
    const mapped = labelForKey(key, pivot.row_dimension, agentLabels);
    return mapped !== key ? mapped : pivot.row_labels[i];
  });
  const colLabels = pivot.col_keys.map((key, i) => {
    const mapped = labelForKey(key, pivot.col_dimension, agentLabels);
    return mapped !== key ? mapped : pivot.col_labels[i];
  });

  const formatCell = (val: number, rowTotal: number) => {
    if (!val) return "—";
    const base = formatMetricValue(
      pivot.metric as "count" | "sum_duration" | "avg_duration",
      val,
    );
    if (!showPercentages || pivot.metric !== "count" || !rowTotal) return base;
    const pct = Math.round((val / rowTotal) * 100);
    return (
      <span>
        {base}
        <span className="ml-1 text-[10px] text-slate-500">({pct}%)</span>
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border border-white/10 bg-surface-900 px-3 py-2 text-left text-xs uppercase text-slate-500">
              {dimensionLabel(pivot.row_dimension)} ↓ / {dimensionLabel(pivot.col_dimension)} →
            </th>
            {colLabels.map((label, i) => (
              <th
                key={pivot.col_keys[i]}
                className="border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs font-medium text-slate-300"
              >
                {label}
              </th>
            ))}
            <th className="border border-white/10 bg-cyan-500/10 px-3 py-2 text-center text-xs text-cyan-300">
              Total fila
            </th>
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rowLabel, ri) => {
            const rowTotal = pivot.cells[ri].reduce((a, b) => a + b, 0);
            return (
              <tr key={pivot.row_keys[ri]}>
                <td className="sticky left-0 border border-white/10 bg-surface-900 px-3 py-2 font-medium text-slate-200">
                  {rowLabel}
                </td>
                {pivot.cells[ri].map((val, ci) => (
                  <td
                    key={`${ri}-${ci}`}
                    className={clsx(
                      "border border-white/10 px-3 py-2 text-center tabular-nums",
                      val > 0 && "text-slate-100",
                    )}
                    style={{
                      backgroundColor:
                        val > 0
                          ? `rgba(6, 182, 212, ${0.08 + (val / max) * 0.35})`
                          : undefined,
                    }}
                  >
                    {formatCell(val, rowTotal)}
                  </td>
                ))}
                <td className="border border-white/10 bg-cyan-500/5 px-3 py-2 text-center font-semibold text-cyan-200">
                  {formatMetricValue(
                    pivot.metric as "count" | "sum_duration" | "avg_duration",
                    rowTotal,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="sticky left-0 border border-white/10 bg-surface-900 px-3 py-2 text-xs font-medium text-slate-400">
              Total columna
            </td>
            {pivot.col_keys.map((_, ci) => {
              const colTotal = pivot.cells.reduce((s, row) => s + row[ci], 0);
              return (
                <td
                  key={ci}
                  className="border border-white/10 bg-white/[0.02] px-3 py-2 text-center text-xs font-medium text-slate-400"
                >
                  {formatMetricValue(
                    pivot.metric as "count" | "sum_duration" | "avg_duration",
                    colTotal,
                  )}
                </td>
              );
            })}
            <td className="border border-white/10 bg-cyan-500/10 px-3 py-2 text-center text-xs font-bold text-cyan-300">
              {formatMetricValue(
                pivot.metric as "count" | "sum_duration" | "avg_duration",
                grandTotal,
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}