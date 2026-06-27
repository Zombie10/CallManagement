import { ExternalLink, FileText, Headphones, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { TableScroll } from "../TableScroll";
import type { CallReportDetailRow } from "../../lib/api";
import {
  channelLabel,
  formatAgentsHandled,
  formatDuration,
} from "../../lib/reportDisplay";

type Props = {
  rows: CallReportDetailRow[];
  agentLabelMap: Map<string, string>;
};

function hasNoteContent(row: CallReportDetailRow): boolean {
  return !!(row.summary?.trim() || row.agent_notes?.trim());
}

function DetailBadges({ row }: { row: CallReportDetailRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.has_transcript && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-cyan-300/90">
          <FileText className="h-3 w-3" /> Transcript
        </span>
      )}
      {row.has_recording && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-emerald-300/90">
          <Headphones className="h-3 w-3" /> Audio
        </span>
      )}
      {row.to_number && (
        <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-slate-500">→ {row.to_number}</span>
      )}
    </div>
  );
}

function NotePopup({
  row,
  agentLabelMap,
  onClose,
}: {
  row: CallReportDetailRow;
  agentLabelMap: Map<string, string>;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-popup-title"
      onClick={onClose}
    >
      <div
        className="glass-card flex max-h-[min(90vh,720px)] w-full max-w-xl flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-white/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="note-popup-title" className="font-display text-lg font-semibold text-slate-100">
              Resumen de llamada
            </h3>
            <p className="mt-1 font-mono text-xs text-cyan-200/90">{row.from_number}</p>
            <p className="text-xs text-slate-500">
              {row.start_time ? new Date(row.start_time).toLocaleString() : "—"}
              {" · "}
              {formatAgentsHandled(row, agentLabelMap)}
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 px-2" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {row.summary?.trim() ? (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Resumen</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{row.summary.trim()}</p>
            </section>
          ) : (
            <p className="text-sm text-slate-500">Sin resumen generado para esta llamada.</p>
          )}

          {row.agent_notes?.trim() && (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Notas del agente</p>
              <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] p-3 text-sm leading-relaxed text-slate-400">
                {row.agent_notes.trim()}
              </p>
            </section>
          )}

          <DetailBadges row={row} />
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-white/10 p-5 sm:p-6">
          <Link
            to={`/calls/${encodeURIComponent(row.call_id)}`}
            className="btn-primary text-xs"
            onClick={onClose}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver registro completo
          </Link>
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NoteAction({
  row,
  onOpen,
}: {
  row: CallReportDetailRow;
  onOpen: (row: CallReportDetailRow) => void;
}) {
  if (!hasNoteContent(row)) {
    return <DetailBadges row={row} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] text-amber-200 ring-1 ring-amber-400/20 transition hover:bg-amber-500/25"
        onClick={() => onOpen(row)}
      >
        <StickyNote className="h-3.5 w-3.5" />
        Ver nota
      </button>
      <DetailBadges row={row} />
    </div>
  );
}

function DetailCard({
  row,
  agentLabelMap,
  onOpenNote,
}: {
  row: CallReportDetailRow;
  agentLabelMap: Map<string, string>;
  onOpenNote: (row: CallReportDetailRow) => void;
}) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/calls/${encodeURIComponent(row.call_id)}`}
            className="group text-sm font-medium text-slate-100 hover:text-cyan-200"
          >
            {row.start_time ? new Date(row.start_time).toLocaleString() : "—"}
            <ExternalLink className="ml-1 inline h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
          </Link>
          <p className="mt-0.5 font-mono text-xs text-cyan-200/90">{row.from_number}</p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p className="capitalize">{row.outcome?.replaceAll("_", " ") || "—"}</p>
          <p className="mt-0.5 tabular-nums">{formatDuration(row.duration_seconds)}</p>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Canal</dt>
          <dd className="text-slate-300">{channelLabel(row.channel)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Agente(s)</dt>
          <dd className="text-slate-300">{formatAgentsHandled(row, agentLabelMap)}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <NoteAction row={row} onOpen={onOpenNote} />
      </div>
    </article>
  );
}

export function ReportDetailGrid({ rows, agentLabelMap }: Props) {
  const [noteRow, setNoteRow] = useState<CallReportDetailRow | null>(null);
  const openNote = useCallback((row: CallReportDetailRow) => setNoteRow(row), []);
  const closeNote = useCallback(() => setNoteRow(null), []);

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">Sin registros en el período</p>;
  }

  return (
    <>
      <div className="space-y-3 p-4 lg:hidden">
        {rows.map((row) => (
          <DetailCard key={row.call_id} row={row} agentLabelMap={agentLabelMap} onOpenNote={openNote} />
        ))}
      </div>

      <div className="hidden min-w-0 lg:block">
        <TableScroll className="px-1 pb-2">
          <table className="data-table data-table-detail w-full text-left text-sm">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "27%" }} />
            </colgroup>
            <thead className="bg-white/[0.02] text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Origen</th>
                <th className="px-3 py-2.5">Canal</th>
                <th className="px-3 py-2.5">Outcome</th>
                <th className="px-3 py-2.5">Duración</th>
                <th className="px-3 py-2.5">Agente(s)</th>
                <th className="px-3 py-2.5">Extras</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.call_id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-3 text-xs text-slate-400">
                    <Link
                      to={`/calls/${encodeURIComponent(row.call_id)}`}
                      className="group block hover:text-cyan-200"
                    >
                      <span className="whitespace-nowrap">
                        {row.start_time ? new Date(row.start_time).toLocaleString() : "—"}
                      </span>
                      <span className="mt-0.5 block max-w-[7.5rem] truncate font-mono text-[10px] text-slate-600 group-hover:text-cyan-300/80">
                        {row.call_id}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-200/90">{row.from_number}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">{channelLabel(row.channel)}</td>
                  <td className="px-3 py-3 text-xs capitalize">{row.outcome?.replaceAll("_", " ") || "—"}</td>
                  <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">
                    {formatDuration(row.duration_seconds)}
                  </td>
                  <td className="col-wrap px-3 py-3 text-xs text-slate-300">
                    {formatAgentsHandled(row, agentLabelMap)}
                  </td>
                  <td className="px-3 py-3">
                    <NoteAction row={row} onOpen={openNote} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      {noteRow && <NotePopup row={noteRow} agentLabelMap={agentLabelMap} onClose={closeNote} />}
    </>
  );
}