import { ExternalLink, FileText, Headphones, StickyNote, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { TableScroll } from "../TableScroll";
import { useUiLocale } from "../../contexts/LocaleContext";
import type { CallReportDetailRow } from "../../lib/api";
import { formatAdminDateTime } from "../../lib/formatDateTime";
import {
  channelLabel,
  formatAgentsHandled,
  formatDuration,
  type AgentInstanceRef,
} from "../../lib/reportDisplay";

type Props = {
  rows: CallReportDetailRow[];
  agentLabelMap: Map<string, string>;
  agentInstances?: AgentInstanceRef[];
};

function hasNoteContent(row: CallReportDetailRow): boolean {
  return !!(row.summary?.trim() || row.agent_notes?.trim());
}

function DetailBadges({ row }: { row: CallReportDetailRow }) {
  const { t } = useUiLocale();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.has_transcript && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-cyan-300/90">
          <FileText className="h-3 w-3" /> {t("detail.transcript")}
        </span>
      )}
      {row.has_recording && (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-emerald-300/90">
          <Headphones className="h-3 w-3" /> {t("detail.audio")}
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
  agentInstances,
  onClose,
}: {
  row: CallReportDetailRow;
  agentLabelMap: Map<string, string>;
  agentInstances: AgentInstanceRef[];
  onClose: () => void;
}) {
  const { t } = useUiLocale();
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
              {t("detail.noteTitle")}
            </h3>
            <p className="mt-1 font-mono text-xs text-cyan-200/90">{row.from_number}</p>
            <p className="text-xs text-slate-500">
              {formatAdminDateTime(row.start_time)}
              {" · "}
              {formatAgentsHandled(row, agentLabelMap, agentInstances)}
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 px-2" onClick={onClose} aria-label={t("detail.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          {row.summary?.trim() ? (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{t("detail.summary")}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{row.summary.trim()}</p>
            </section>
          ) : (
            <p className="text-sm text-slate-500">{t("detail.noSummary")}</p>
          )}

          {row.agent_notes?.trim() && (
            <section>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{t("detail.agentNotes")}</p>
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
            {t("detail.openRecord")}
          </Link>
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>
            {t("detail.close")}
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
  const { t } = useUiLocale();
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
        {t("detail.viewNote")}
      </button>
      <DetailBadges row={row} />
    </div>
  );
}

function DetailCard({
  row,
  agentLabelMap,
  agentInstances,
  onOpenNote,
}: {
  row: CallReportDetailRow;
  agentLabelMap: Map<string, string>;
  agentInstances: AgentInstanceRef[];
  onOpenNote: (row: CallReportDetailRow) => void;
}) {
  const { t, locale } = useUiLocale();
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/calls/${encodeURIComponent(row.call_id)}`}
            className="group text-sm font-medium text-slate-100 hover:text-cyan-200"
          >
            {formatAdminDateTime(row.start_time)}
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
          <dt className="text-slate-500">{t("detail.channel")}</dt>
          <dd className="text-slate-300">{channelLabel(row.channel, locale)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t("detail.agents")}</dt>
          <dd className="text-slate-300">{formatAgentsHandled(row, agentLabelMap, agentInstances)}</dd>
        </div>
      </dl>

      <div className="mt-3">
        <NoteAction row={row} onOpen={onOpenNote} />
      </div>
    </article>
  );
}

export function ReportDetailGrid({ rows, agentLabelMap, agentInstances = [] }: Props) {
  const { t, locale } = useUiLocale();
  const [noteRow, setNoteRow] = useState<CallReportDetailRow | null>(null);
  const openNote = useCallback((row: CallReportDetailRow) => setNoteRow(row), []);
  const closeNote = useCallback(() => setNoteRow(null), []);

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-sm text-slate-500">{t("detail.noRows")}</p>;
  }

  return (
    <>
      <div className="space-y-3 p-4 lg:hidden">
        {rows.map((row) => (
          <DetailCard
            key={row.call_id}
            row={row}
            agentLabelMap={agentLabelMap}
            agentInstances={agentInstances}
            onOpenNote={openNote}
          />
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
                <th className="px-3 py-2.5">{t("detail.date")}</th>
                <th className="px-3 py-2.5">{t("detail.origin")}</th>
                <th className="px-3 py-2.5">{t("detail.channel")}</th>
                <th className="px-3 py-2.5">{t("detail.outcome")}</th>
                <th className="px-3 py-2.5">{t("detail.duration")}</th>
                <th className="px-3 py-2.5">{t("detail.agents")}</th>
                <th className="px-3 py-2.5">{t("detail.extras")}</th>
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
                        {formatAdminDateTime(row.start_time)}
                      </span>
                      <span className="mt-0.5 block max-w-[7.5rem] truncate font-mono text-[10px] text-slate-600 group-hover:text-cyan-300/80">
                        {row.call_id}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-cyan-200/90">{row.from_number}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">{channelLabel(row.channel, locale)}</td>
                  <td className="px-3 py-3 text-xs capitalize">{row.outcome?.replaceAll("_", " ") || "—"}</td>
                  <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">
                    {formatDuration(row.duration_seconds)}
                  </td>
                  <td className="col-wrap px-3 py-3 text-xs text-slate-300">
                    {formatAgentsHandled(row, agentLabelMap, agentInstances)}
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

      {noteRow && (
        <NotePopup
          row={noteRow}
          agentLabelMap={agentLabelMap}
          agentInstances={agentInstances}
          onClose={closeNote}
        />
      )}
    </>
  );
}