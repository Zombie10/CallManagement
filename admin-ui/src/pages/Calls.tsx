import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Phone, Play } from "lucide-react";
import { useState } from "react";
import { api, type CallRecord } from "../lib/api";
function CallCard({ call }: { call: CallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(call.transcript || call.recording_url || call.agent_notes);

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        disabled={!hasDetails}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-cyan-300">{call.call_id}</p>
            <p className="mt-1 text-sm text-slate-300">
              <Phone className="mr-1 inline h-3.5 w-3.5" />
              {call.from_number}
              {call.to_number && <span className="text-slate-500"> → {call.to_number}</span>}
            </p>
            {call.start_time && (
              <p className="mt-0.5 text-xs text-slate-500">{new Date(call.start_time).toLocaleString()}</p>
            )}
          </div>
          <div className="flex items-start gap-2 text-right text-sm">
            <div>
              <span className="rounded-lg bg-white/5 px-2 py-1 capitalize text-slate-300">
                {call.outcome?.replaceAll("_", " ") || "unknown"}
              </span>
              {call.duration_seconds != null && (
                <p className="mt-1 text-xs text-slate-500">{call.duration_seconds}s</p>
              )}
            </div>
            {hasDetails && (
              expanded ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )
            )}
          </div>
        </div>
        {call.summary && (
          <p className="mt-3 line-clamp-2 text-sm text-slate-400">{call.summary}</p>
        )}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-white/5 px-4 pb-4 pt-3">
          {call.recording_url && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-slate-500">
                <Play className="h-3 w-3" /> Grabación
              </p>
              <audio controls className="w-full max-w-md" src={call.recording_url}>
                <a href={call.recording_url} className="text-cyan-300 underline" target="_blank" rel="noreferrer">
                  Descargar grabación
                </a>
              </audio>
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium uppercase text-slate-500">
                <FileText className="h-3 w-3" /> Transcript
              </p>
              <pre className="max-h-48 overflow-y-auto rounded-lg bg-black/30 p-3 font-mono text-xs text-slate-300 whitespace-pre-wrap">
                {call.transcript}
              </pre>
            </div>
          )}
          {call.agent_notes && (
            <p className="text-xs text-slate-500">
              <span className="font-medium">Notas:</span> {call.agent_notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function Calls() {
  const { data, isLoading } = useQuery({ queryKey: ["calls"], queryFn: () => api.calls() });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando llamadas...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Historial de llamadas</h1>
        <p className="mt-1 text-slate-400">
          {data.total} registros · Expande para ver transcript y grabación
        </p>
      </header>

      <div className="space-y-3">
        {data.items.map((call) => (
          <CallCard key={call.call_id} call={call} />
        ))}
        {data.items.length === 0 && (
          <div className="glass-card py-12 text-center text-slate-500">Sin llamadas registradas</div>
        )}
      </div>
    </div>
  );
}