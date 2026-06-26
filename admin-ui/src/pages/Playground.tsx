import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  RefreshCw,
  Send,
  User,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useXaiVoice } from "../hooks/useXaiVoice";
import { api } from "../lib/api";
import clsx from "clsx";

type ChatLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  agent?: string;
};

const AGENTS = ["receptionist", "support", "sales", "technical", "escalation"];

function TextPlayground() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [input, setInput] = useState("");
  const [initialAgent, setInitialAgent] = useState("receptionist");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });

  const startSession = useMutation({
    mutationFn: () => api.createChatSession({ initial_agent: initialAgent }),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setLines([
        {
          id: "welcome",
          role: "system",
          text: `Sesión texto · ${data.initial_agent} · ${data.provider} / ${data.model} (handoffs multi-agente)`,
        },
      ]);
    },
  });

  const sendMessage = useMutation({
    mutationFn: (message: string) => api.sendChatMessage(sessionId!, message),
    onSuccess: (data, message) => {
      setLines((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", text: message },
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: data.reply || "(sin respuesta)",
          agent: data.agent,
        },
        ...data.events
          .filter((e) => e.type === "handoff")
          .map((e, i) => ({
            id: `h-${Date.now()}-${i}`,
            role: "system" as const,
            text: `Transferencia → ${e.detail}`,
          })),
      ]);
      setInput("");
    },
  });

  const resetSession = useMutation({
    mutationFn: () => api.resetChatSession(sessionId!),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setLines([{ id: "reset", role: "system", text: `Reiniciado · ${data.initial_agent}` }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const busy = startSession.isPending || sendMessage.isPending || resetSession.isPending;

  return (
    <div className="glass-card flex min-h-[480px] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
        {!sessionId ? (
          <>
            <select
              className="input-field w-auto"
              value={initialAgent}
              onChange={(e) => setInitialAgent(e.target.value)}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary"
              disabled={!status?.ready || busy}
              onClick={() => startSession.mutate()}
            >
              {startSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
              Iniciar chat
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-slate-400">Multi-agente · {status?.model}</span>
            <button type="button" className="btn-ghost ml-auto text-sm" disabled={busy} onClick={() => resetSession.mutate()}>
              <RefreshCw className="h-4 w-4" /> Reiniciar
            </button>
          </>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {lines.map((line) => (
          <ChatBubble key={line.id} line={line} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t border-white/5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!sessionId || !input.trim() || busy) return;
          sendMessage.mutate(input.trim());
        }}
      >
        <input
          className="input-field flex-1"
          placeholder={sessionId ? "Escribe tu mensaje..." : "Inicia una sesión"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!sessionId || busy}
        />
        <button type="submit" className="btn-primary" disabled={!sessionId || !input.trim() || busy}>
          {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      {(startSession.error || sendMessage.error) && (
        <p className="px-4 pb-4 text-sm text-red-400">{(startSession.error || sendMessage.error)?.message}</p>
      )}
    </div>
  );
}

function VoicePlayground() {
  const [agent, setAgent] = useState("receptionist");
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const voice = useXaiVoice();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voice.transcript]);

  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 400))}%`;

  return (
    <div className="glass-card flex min-h-[480px] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
        <select
          className="input-field w-auto"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          disabled={voice.connected}
        >
          {AGENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {!voice.connected ? (
          <button
            type="button"
            className="btn-primary"
            disabled={!status?.voice_ready}
            onClick={() => {
              voice.setError(null);
              voice.start(agent).catch((err) => voice.setError(String(err)));
            }}
          >
            <Mic className="h-4 w-4" />
            Hablar con micrófono
          </button>
        ) : (
          <button type="button" className="btn-ghost text-red-300" onClick={() => voice.stop()}>
            <MicOff className="h-4 w-4" />
            Detener
          </button>
        )}

        {voice.sessionInfo && (
          <span className="text-xs text-slate-500">
            {voice.sessionInfo.model} · voz {voice.sessionInfo.voice}
            {voice.sessionInfo.language_hint ? ` · ${voice.sessionInfo.language_hint}` : ""}
          </span>
        )}
      </div>

      {voice.connected && (
        <div className="border-b border-white/5 px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-cyan-300">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            Escuchando… habla naturalmente (VAD del servidor xAI)
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: levelWidth }} />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!voice.transcript.length && (
          <p className="text-center text-sm text-slate-500">
            Conexión directa a xAI Voice Agent API — sin LiveKit. Incluye tools configurados por agente.
          </p>
        )}
        {voice.transcript.map((line) => (
          <ChatBubble
            key={line.id}
            line={{
              id: line.id,
              role: line.role,
              text: line.text,
              agent: line.role === "assistant" ? voice.sessionInfo?.agent : undefined,
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {voice.error && <p className="px-4 pb-4 text-sm text-red-400">{voice.error}</p>}
    </div>
  );
}

function ChatBubble({ line }: { line: ChatLine }) {
  return (
    <div className={`flex gap-3 ${line.role === "user" ? "justify-end" : "justify-start"}`}>
      {line.role !== "user" && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10">
          {line.role === "assistant" ? (
            <Bot className="h-4 w-4 text-cyan-400" />
          ) : (
            <MessageSquare className="h-4 w-4 text-slate-400" />
          )}
        </div>
      )}
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          line.role === "user" && "bg-cyan-600/30 text-cyan-50",
          line.role === "system" && "bg-white/5 text-slate-400",
          line.role === "assistant" && "bg-white/5 text-slate-100",
        )}
      >
        {line.agent && line.role === "assistant" && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cyan-400/80">{line.agent}</p>
        )}
        {line.text}
      </div>
      {line.role === "user" && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
          <User className="h-4 w-4 text-slate-300" />
        </div>
      )}
    </div>
  );
}

export function Playground() {
  const [mode, setMode] = useState<"text" | "voice">("voice");
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Probar agente</h1>
        <p className="mt-1 text-slate-400">
          Voz nativa xAI ({status?.voice_model || "grok-voice-latest"}) o texto multi-agente con handoffs
        </p>
      </header>

      {status?.requires_xai_key && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          Configura <code className="text-amber-100">XAI_API_KEY</code> en Configuración.
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className={clsx("btn-ghost", mode === "voice" && "ring-1 ring-cyan-400/30 bg-cyan-500/10 text-cyan-200")}
          onClick={() => setMode("voice")}
        >
          <Mic className="h-4 w-4" /> Voz (micrófono)
        </button>
        <button
          type="button"
          className={clsx("btn-ghost", mode === "text" && "ring-1 ring-cyan-400/30 bg-cyan-500/10 text-cyan-200")}
          onClick={() => setMode("text")}
        >
          <MessageSquare className="h-4 w-4" /> Texto (multi-agente)
        </button>
      </div>

      {mode === "voice" ? <VoicePlayground /> : <TextPlayground />}
    </div>
  );
}