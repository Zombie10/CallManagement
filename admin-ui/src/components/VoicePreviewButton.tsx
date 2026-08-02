import { Loader2, Pause, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { api } from "../lib/api";

type VoicePreviewButtonProps = {
  voiceId: string;
  /** BCP-47 voice language or app locale (es, es-MX, en, multi…). */
  language?: string | null;
  className?: string;
  compact?: boolean;
  label?: string;
  stopPropagation?: boolean;
};

/**
 * Play a short xAI TTS sample for the selected voice + language.
 */
export function VoicePreviewButton({
  voiceId,
  language,
  className,
  compact = false,
  label = "Probar voz",
  stopPropagation = true,
}: VoicePreviewButtonProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Stop playback when voice/language changes.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
    setError(null);
  }, [voiceId, language]);

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlaying(false);
  };

  const play = async (e?: MouseEvent) => {
    if (stopPropagation && e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (playing) {
      stop();
      return;
    }
    if (!voiceId) {
      setError("Selecciona una voz");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const blob = await api.previewVoice({
        voice_id: voiceId,
        language: language || undefined,
      });
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      audio.onerror = () => {
        setPlaying(false);
        setError("No se pudo reproducir el audio");
      };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la muestra");
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={clsx("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        onClick={play}
        disabled={loading || !voiceId}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition",
          compact
            ? "px-2 py-1 text-[11px]"
            : "px-3 py-1.5 text-xs",
          playing
            ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/35"
            : "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30 hover:bg-cyan-500/25",
          (loading || !voiceId) && "cursor-not-allowed opacity-60",
        )}
        title={language ? `Escuchar en ${language}` : "Escuchar muestra de voz"}
      >
        {loading ? (
          <Loader2 className={clsx("animate-spin", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        ) : playing ? (
          <Pause className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        ) : (
          <Volume2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        )}
        {loading ? "Generando…" : playing ? "Detener" : label}
      </button>
      {error && <p className="max-w-[16rem] text-[11px] leading-snug text-red-300/90">{error}</p>}
    </div>
  );
}
