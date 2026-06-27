import { AlertTriangle, Headphones, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

type Props = {
  callId: string;
  recordingUrl: string;
};

function canPlayMime(mime: string): boolean {
  const audio = document.createElement("audio");
  if (mime && audio.canPlayType(mime) !== "") return true;
  if (mime.includes("webm")) {
    return audio.canPlayType("audio/webm; codecs=opus") !== "" || audio.canPlayType("audio/webm") !== "";
  }
  if (mime.includes("mp4") || mime.includes("m4a")) {
    return audio.canPlayType("audio/mp4") !== "";
  }
  return false;
}

export function CallRecordingPlayer({ callId, recordingUrl }: Props) {
  const { tenantId } = useTenant();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setUnsupported(false);
      setPlaybackError(null);
      setBlobUrl(null);

      try {
        const blob = await api.fetchRecordingBlob(callId, recordingUrl, tenantId);
        if (cancelled) return;
        const mime = blob.type || "audio/webm";
        objectUrl = URL.createObjectURL(blob);
        setMimeType(mime);
        setBlobUrl(objectUrl);
        setUnsupported(!canPlayMime(mime));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [callId, recordingUrl, tenantId]);

  const downloadUrl = blobUrl || (recordingUrl.startsWith("http") ? recordingUrl : api.recordingStreamUrl(callId, tenantId));

  return (
    <section className="glass-card p-5 sm:p-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Headphones className="h-4 w-4 text-cyan-400" />
        Grabación de audio
      </h2>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando grabación…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>No se pudo cargar la grabación: {error}</span>
        </div>
      )}

      {unsupported && !loading && !error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Tu navegador no reproduce este formato ({mimeType || "WebM"}). Descarga el archivo y ábrelo con Chrome
            o VLC.
          </span>
        </div>
      )}

      {blobUrl && !error && (
        <audio
          ref={audioRef}
          controls
          className="w-full"
          src={blobUrl}
          preload="auto"
          onError={() => setPlaybackError("El navegador no pudo decodificar el audio.")}
          onPlay={() => setPlaybackError(null)}
        >
          Tu navegador no reproduce audio.
        </audio>
      )}

      {playbackError && (
        <p className="mt-2 text-xs text-amber-300">{playbackError}</p>
      )}

      {!loading && downloadUrl && (
        <a
          href={downloadUrl}
          download={`${callId}${mimeType.includes("mp4") ? ".m4a" : ".webm"}`}
          className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200"
        >
          Descargar grabación
        </a>
      )}
    </section>
  );
}