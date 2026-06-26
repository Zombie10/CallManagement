import type { CallReportPivot } from "../../lib/api";
import clsx from "clsx";

export function PivotTable({ pivot }: { pivot: CallReportPivot }) {
  const max = Math.max(1, ...pivot.cells.flat());

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border border-white/10 bg-surface-900 px-3 py-2 text-left text-xs uppercase text-slate-500">
              {pivot.row_dimension} ↓ / {pivot.col_dimension} →
            </th>
            {pivot.col_labels.map((label, i) => (
              <th
                key={pivot.col_keys[i]}
                className="border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs font-medium text-slate-300"
              >
                {label}
              </th>
            ))}
            <th className="border border-white/10 bg-cyan-500/10 px-3 py-2 text-center text-xs text-cyan-300">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {pivot.row_labels.map((rowLabel, ri) => {
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
                    {val || "—"}
                  </td>
                ))}
                <td className="border border-white/10 bg-cyan-500/5 px-3 py-2 text-center font-semibold text-cyan-200">
                  {rowTotal}
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
                  {colTotal}
                </td>
              );
            })}
            <td className="border border-white/10 bg-cyan-500/10 px-3 py-2 text-center text-xs font-bold text-cyan-300">
              {pivot.cells.flat().reduce((a, b) => a + b, 0)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}