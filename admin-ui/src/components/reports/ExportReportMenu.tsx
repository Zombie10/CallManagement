import { ChevronDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCallsCsv, downloadReportXlsx } from "../../lib/exportReport";
import type { ReportFiltersState } from "../../lib/reports";
import clsx from "clsx";

type Props = {
  filters: ReportFiltersState;
  tenantId: string;
  className?: string;
};

type MenuPos = { top: number; left: number; width: number };

export function ExportReportMenu({ filters, tenantId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"xlsx" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 288;
    const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
    setMenuPos({ top: rect.bottom + 8, left, width: menuWidth });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, updatePosition]);

  const run = async (kind: "xlsx" | "csv") => {
    setLoading(kind);
    setError(null);
    try {
      if (kind === "xlsx") await downloadReportXlsx(filters, tenantId);
      else await downloadCallsCsv(filters, tenantId);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const menu = open && menuPos
    ? createPortal(
        <>
          <button
            type="button"
            className="fixed inset-0 z-[280] cursor-default bg-black/50"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[290] rounded-xl border border-white/15 bg-surface-900 p-2 shadow-glow-lg"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            role="menu"
          >
            <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Usa los filtros actuales
            </p>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-surface-800"
              disabled={!!loading}
              onClick={() => run("xlsx")}
            >
              <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                <span className="block text-sm font-medium text-slate-100">Reporte Excel</span>
                <span className="text-xs text-slate-400">
                  Resumen, outcomes, series, pivot y hasta 500 llamadas
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-surface-800"
              disabled={!!loading}
              onClick={() => run("csv")}
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <span>
                <span className="block text-sm font-medium text-slate-100">CSV de llamadas</span>
                <span className="text-xs text-slate-400">
                  Columnas en español, UTF-8, hasta 5 000 filas
                </span>
              </span>
            </button>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <div className={clsx("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        className="btn-ghost gap-1.5 text-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Exportar
        <ChevronDown className={clsx("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {menu}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}