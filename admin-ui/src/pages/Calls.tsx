import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FileText,
  Filter,
  Headphones,
  Phone,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, type CallRecord } from "../lib/api";
import { canListenRecordings } from "../lib/permissions";

const CHANNEL_LABELS: Record<string, string> = {
  sip: "Teléfono",
  chat: "Chat",
  voice_xai: "Voz xAI",
  voice_livekit: "Voz LiveKit",
};

function channelLabel(channel?: string) {
  if (!channel) return "Teléfono";
  return CHANNEL_LABELS[channel] || channel;
}

function CallRow({ call, canPlay }: { call: CallRecord; canPlay: boolean }) {
  const hasTranscript = !!call.transcript?.trim();
  const hasRecording = !!call.recording_url;

  return (
    <Link
      to={`/calls/${encodeURIComponent(call.call_id)}`}
      className="glass-card block p-4 transition-colors hover:border-cyan-400/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-mono text-sm text-cyan-300">{call.call_id}</p>
            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
              {channelLabel(call.channel)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            <Phone className="mr-1 inline h-3.5 w-3.5" />
            {call.from_number}
          </p>
          {call.start_time && (
            <p className="mt-0.5 text-xs text-slate-500">{new Date(call.start_time).toLocaleString()}</p>
          )}
          {call.summary && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-400">{call.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-slate-500">
            {hasTranscript && (
              <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-cyan-300/90">
                <FileText className="h-3 w-3" /> Transcript
              </span>
            )}
            {hasRecording && canPlay && (
              <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-emerald-300/90">
                <Headphones className="h-3 w-3" /> Audio
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="rounded-lg bg-white/5 px-2 py-1 text-xs capitalize text-slate-300">
            {call.outcome?.replaceAll("_", " ") || "—"}
          </span>
          {call.duration_seconds != null && (
            <span className="text-xs text-slate-500">{call.duration_seconds}s</span>
          )}
          <ChevronRight className="mt-1 h-4 w-4 text-slate-500" />
        </div>
      </div>
    </Link>
  );
}

export function Calls() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<string>("all");
  const canPlay = canListenRecordings(user?.effective_modules);

  const { data, isLoading } = useQuery({ queryKey: ["calls"], queryFn: () => api.calls(100) });

  const filtered = useMemo(() => {
    const items = data?.items || [];
    const q = search.trim().toLowerCase();
    return items.filter((call) => {
      if (channel !== "all" && (call.channel || "sip") !== channel) return false;
      if (!q) return true;
      return (
        call.call_id.toLowerCase().includes(q) ||
        call.from_number.toLowerCase().includes(q) ||
        (call.summary || "").toLowerCase().includes(q) ||
        (call.transcript || "").toLowerCase().includes(q)
      );
    });
  }, [channel, data?.items, search]);

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando registros…</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-semibold sm:text-3xl">Registros de interacciones</h1>
        <p className="mt-1 text-sm text-slate-400 sm:text-base">
          {data.total} registros · Transcripts, resúmenes
          {canPlay ? " y grabaciones de audio" : ""}
        </p>
      </header>

      <div className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input-field pl-9"
            placeholder="Buscar por teléfono, ID o texto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <Filter className="h-4 w-4" />
          <select
            className="input-field w-full sm:w-44"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="all">Todos los canales</option>
            <option value="sip">Teléfono</option>
            <option value="chat">Chat</option>
            <option value="voice_xai">Voz xAI</option>
            <option value="voice_livekit">Voz LiveKit</option>
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {filtered.map((call) => (
          <CallRow key={call.call_id} call={call} canPlay={canPlay} />
        ))}
        {filtered.length === 0 && (
          <div className="glass-card py-12 text-center text-slate-500">Sin registros que coincidan</div>
        )}
      </div>
    </div>
  );
}