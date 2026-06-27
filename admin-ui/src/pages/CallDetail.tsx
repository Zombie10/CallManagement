import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, FileText, Phone, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { CallRecordingPlayer } from "../components/CallRecordingPlayer";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { canListenRecordings } from "../lib/permissions";

const CHANNEL_LABELS: Record<string, string> = {
  sip: "Llamada telefónica",
  chat: "Chat",
  voice_xai: "Voz xAI",
  voice_livekit: "Voz LiveKit",
};

export function CallDetail() {
  const { user } = useAuth();
  const canPlay = canListenRecordings(user?.effective_modules);
  const { callId = "" } = useParams();
  const { data: call, isLoading, error } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => api.getCall(callId),
    enabled: !!callId,
  });

  if (isLoading) {
    return <div className="glass-card p-8 text-slate-400">Cargando registro…</div>;
  }

  if (error || !call) {
    return (
      <div className="space-y-4">
        <Link to="/calls" className="btn-ghost inline-flex w-fit">
          <ArrowLeft className="h-4 w-4" /> Volver a registros
        </Link>
        <div className="glass-card p-8 text-red-300">No se encontró el registro.</div>
      </div>
    );
  }

  const showRecording = canPlay && !!call.recording_url;
  const channelLabel = CHANNEL_LABELS[call.channel || "sip"] || call.channel;

  return (
    <div className="animate-page-enter space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/calls" className="btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Registros
        </Link>
        <span className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
          {channelLabel}
        </span>
      </div>

      <header className="glass-card space-y-4 p-5 sm:p-6">
        <div>
          <h1 className="font-display text-xl font-semibold sm:text-2xl">{call.call_id}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {call.from_number}
              {call.to_number ? ` → ${call.to_number}` : ""}
            </span>
            {call.start_time && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {new Date(call.start_time).toLocaleString()}
              </span>
            )}
            {call.duration_seconds != null && <span>{call.duration_seconds}s</span>}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-lg bg-white/5 px-3 py-1 text-sm capitalize text-slate-200">
            {call.outcome?.replaceAll("_", " ") || "sin resultado"}
          </span>
          {call.transferred_to && (
            <span className="rounded-lg bg-violet-500/10 px-3 py-1 text-sm text-violet-200">
              Transferido a: {call.transferred_to}
            </span>
          )}
          {call.outcome === "escalated" && (
            <span className="rounded-lg bg-amber-500/15 px-3 py-1 text-sm text-amber-200">
              Escalación a humano
            </span>
          )}
        </div>

        {call.summary && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Resumen</p>
            <p className="text-sm leading-relaxed text-slate-300">{call.summary}</p>
          </div>
        )}
      </header>

      {showRecording && (
        <CallRecordingPlayer callId={call.call_id} recordingUrl={call.recording_url!} />
      )}

      {call.transcript && (
        <section className="glass-card p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <FileText className="h-4 w-4 text-cyan-400" />
            Transcript completo
          </h2>
          <pre className="max-h-[min(60vh,520px)] overflow-y-auto rounded-xl bg-black/30 p-4 font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
            {call.transcript}
          </pre>
        </section>
      )}

      {call.agent_notes && (
        <section className="glass-card p-5 sm:p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <User className="h-4 w-4 text-cyan-400" />
            Notas del agente
          </h2>
          <pre className="overflow-x-auto rounded-xl bg-black/20 p-4 text-xs text-slate-400 whitespace-pre-wrap">
            {call.agent_notes}
          </pre>
        </section>
      )}
    </div>
  );
}