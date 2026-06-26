import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Cloud,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Send,
  User,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Select } from "../components/Select";
import { ToolCallLog, type ToolCallEntry } from "../components/ToolCallLog";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";
import { useLiveKitVoice } from "../hooks/useLiveKitVoice";
import { useXaiVoice } from "../hooks/useXaiVoice";
import { AGENT_OPTIONS, agentLabel } from "../lib/agents";
import { api } from "../lib/api";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

type ChatLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  agent?: string;
};

type VoiceBackend = "livekit" | "xai";

/** Internal placeholder — agent must collect the real number from the caller. */
const PLAYGROUND_PHONE = "+15551234567";

function TextPlayground() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [toolLog, setToolLog] = useState<ToolCallEntry[]>([]);
  const [input, setInput] = useState("");
  const [initialAgent, setInitialAgent] = useState("banking_support");
  const chatScrollRef = useChatAutoScroll(lines);

  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });

  const startSession = useMutation({
    mutationFn: () =>
      api.createChatSession({
        initial_agent: initialAgent,
        phone_number: PLAYGROUND_PHONE,
      }),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setLines([
        {
          id: "welcome",
          role: "system",
          text: `Sesión texto · ${data.initial_agent} · ${data.provider} / ${data.model}`,
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
        ...data.events
          .filter((e) => e.type === "tool_call")
          .map((e, i) => ({
            id: `t-${Date.now()}-${i}`,
            role: "system" as const,
            text: `🔧 Tool: ${e.detail}`,
          })),
      ]);
      setToolLog((prev) => [
        ...prev,
        ...data.events
          .filter((e) => e.type === "tool_call")
          .map((e, i) => ({
            id: `chat-tool-${Date.now()}-${i}`,
            tool: e.tool || e.detail.split("(")[0] || "tool",
            arguments: {},
            output: e.detail,
            status: "ok" as const,
            timestamp: new Date().toISOString(),
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

  const busy = startSession.isPending || sendMessage.isPending || resetSession.isPending;

  return (
    <div className="glass-card flex h-[min(640px,calc(100vh-11rem))] min-h-[520px] flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          {!sessionId ? (
            <>
              <Select
                className="w-52"
                value={initialAgent}
                onChange={setInitialAgent}
                options={AGENT_OPTIONS}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={!status?.ready || busy}
                onClick={() => startSession.mutate()}
              >
                {startSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                Iniciar chat
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-400">Multi-agente · {status?.model}</span>
              <button
                type="button"
                className="btn-ghost ml-auto text-sm"
                disabled={busy}
                onClick={() => resetSession.mutate()}
              >
                <RefreshCw className="h-4 w-4" /> Reiniciar
              </button>
            </>
          )}
        </div>

        <div ref={chatScrollRef} className="flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4">
          {lines.map((line) => (
            <ChatBubble key={line.id} line={line} />
          ))}
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
      <aside className="min-h-0 w-full overflow-y-auto border-t border-white/5 p-4 lg:w-80 lg:border-l lg:border-t-0">
        <ToolCallLog entries={toolLog} title="Tools (texto)" />
      </aside>
    </div>
  );
}

function VoiceControls({
  initialAgent,
  setInitialAgent,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  initialAgent: string;
  setInitialAgent: (v: string) => void;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
      <Select
        className="w-52"
        value={initialAgent}
        onChange={setInitialAgent}
        options={AGENT_OPTIONS}
        disabled={connected || busy}
      />
      {!connected ? (
        <button type="button" className="btn-primary" disabled={busy} onClick={onConnect}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          Conectar
        </button>
      ) : (
        <button type="button" className="btn-ghost text-red-300" onClick={onDisconnect}>
          <MicOff className="h-4 w-4" />
          Desconectar
        </button>
      )}
    </div>
  );
}

function LiveKitVoicePanel() {
  const [initialAgent, setInitialAgent] = useState("banking_support");
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const voice = useLiveKitVoice();
  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 280))}%`;

  return (
    <div className="animate-fade-in">
      <VoiceControls
        initialAgent={initialAgent}
        setInitialAgent={setInitialAgent}
        connected={voice.connected}
        busy={voice.connecting || !status?.livekit_ready}
        onConnect={() => {
          voice.setError(null);
          voice
            .start({
              initial_agent: initialAgent,
              phone_number: PLAYGROUND_PHONE,
            })
            .catch((err) => voice.setError(String(err)));
        }}
        onDisconnect={() => voice.stop()}
      />

      {!status?.livekit_ready && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Requiere LiveKit Cloud + worker</p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-200/90">
            {(status?.livekit_issues || []).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Terminal: <code className="text-amber-50">uv run -m call_management.server dev</code>
          </p>
        </div>
      )}

      <div className="grid gap-3 border-b border-white/5 p-4 sm:grid-cols-3">
        <StatusTile
          icon={voice.connected ? Wifi : WifiOff}
          label="Sala"
          value={voice.sessionInfo?.room_name || "—"}
          active={voice.connected}
        />
        <StatusTile
          icon={Bot}
          label="Agente"
          value={voice.agentJoined ? voice.sessionInfo?.initial_agent || "activo" : "esperando…"}
          active={voice.agentJoined}
        />
        <StatusTile
          icon={Cloud}
          label="Pipeline"
          value={voice.sessionInfo?.pipeline || "livekit"}
          active={voice.connected}
        />
      </div>

      {voice.connected && (
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-sm text-cyan-200">
            {voice.agentJoined ? "Agente en línea — habla con naturalidad" : "Esperando dispatch del worker…"}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all duration-150"
              style={{ width: levelWidth }}
            />
          </div>
        </div>
      )}

      {voice.error && <p className="p-4 text-sm text-red-400">{voice.error}</p>}
    </div>
  );
}

function XaiVoicePanel() {
  const [agent, setAgent] = useState("banking_support");
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const voice = useXaiVoice();
  const chatScrollRef = useChatAutoScroll(voice.transcript);
  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 280))}%`;

  return (
    <div className="animate-fade-in flex h-[min(640px,calc(100vh-11rem))] min-h-[400px] flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <Select
            className="w-52"
            value={agent}
            onChange={setAgent}
            options={AGENT_OPTIONS}
            disabled={voice.connected}
          />
          {!voice.connected ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!status?.xai_voice_ready}
              onClick={() => {
                voice.setError(null);
                voice.start(agent, { phone_number: PLAYGROUND_PHONE }).catch((err) => voice.setError(String(err)));
              }}
            >
              <Zap className="h-4 w-4" />
              Conectar
            </button>
          ) : (
            <button type="button" className="btn-ghost text-red-300" onClick={() => voice.stop()}>
              <MicOff className="h-4 w-4" />
              Desconectar
            </button>
          )}
          {voice.sessionInfo && (
            <span className="text-xs text-slate-500">
              {agentLabel(voice.currentAgent)} · {voice.sessionInfo.voice}
            </span>
          )}
        </div>

        {!status?.xai_voice_ready && (
          <p className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
            Configura <code>XAI_API_KEY</code> — no requiere LiveKit.
          </p>
        )}

        {voice.connected && (
          <div className="border-b border-white/5 px-4 py-2">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-violet-500 transition-all duration-150"
                style={{ width: levelWidth }}
              />
            </div>
          </div>
        )}

        <div ref={chatScrollRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4">
          {!voice.transcript.length && !voice.connected && (
            <p className="text-center text-sm text-slate-500">
              Elige un agente y conecta. El agente te saludará como en una llamada real — di tu motivo y, si hace
              falta, tu teléfono en voz.
            </p>
          )}
          {voice.transcript.map((line) => (
            <ChatBubble
              key={line.id}
              line={{
                id: line.id,
                role: line.role === "system" ? "system" : line.role,
                text: line.text,
                agent: line.role === "assistant" ? voice.currentAgent : undefined,
              }}
            />
          ))}
        </div>
        {voice.error && <p className="px-4 pb-4 text-sm text-red-400">{voice.error}</p>}
      </div>
      <aside className="min-h-0 w-full overflow-y-auto border-t border-white/5 p-4 lg:w-80 lg:border-l lg:border-t-0">
        <ToolCallLog entries={voice.toolCalls} title="Tools (voz xAI)" />
      </aside>
    </div>
  );
}

function VoicePlayground() {
  const [backend, setBackend] = useState<VoiceBackend>("xai");

  return (
    <div className="glass-card overflow-hidden">
      <div className="grid gap-3 border-b border-white/5 p-4 sm:grid-cols-2">
        <button
          type="button"
          className={clsx("mode-pill", backend === "xai" ? "mode-pill-active" : "mode-pill-idle")}
          onClick={() => setBackend("xai")}
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-violet-400" />
            <span className="font-medium">xAI directo</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Solo XAI_API_KEY · transcript en vivo</p>
        </button>
        <button
          type="button"
          className={clsx("mode-pill", backend === "livekit" ? "mode-pill-active" : "mode-pill-idle")}
          onClick={() => setBackend("livekit")}
        >
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-cyan-400" />
            <span className="font-medium">LiveKit producción</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Igual que consola/SIP · CRM completo</p>
        </button>
      </div>
      {backend === "livekit" ? <LiveKitVoicePanel /> : <XaiVoicePanel />}
    </div>
  );
}

function StatusTile({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl border px-3 py-2",
        active ? "border-cyan-400/20 bg-cyan-500/5" : "border-white/5 bg-white/[0.02]",
      )}
    >
      <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-slate-200">{value}</p>
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
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm transition-all duration-300",
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
    <div className="animate-page-enter space-y-6">
      <header className="stagger-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Probar agente</h1>
        <p className="mt-1 text-slate-400">Voz xAI directa o LiveKit producción · Texto multi-agente</p>
      </header>

      {status?.requires_xai_key && (
        <div className="glass-card stagger-2 border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          Configura <code className="text-amber-100">XAI_API_KEY</code> en Configuración.
        </div>
      )}

      <div className="stagger-3 flex gap-2">
        <button
          type="button"
          className={clsx("btn-ghost", mode === "voice" && "ring-1 ring-cyan-400/30 bg-cyan-500/10 text-cyan-200")}
          onClick={() => setMode("voice")}
        >
          <Mic className="h-4 w-4" /> Voz
        </button>
        <button
          type="button"
          className={clsx("btn-ghost", mode === "text" && "ring-1 ring-cyan-400/30 bg-cyan-500/10 text-cyan-200")}
          onClick={() => setMode("text")}
        >
          <MessageSquare className="h-4 w-4" /> Texto
        </button>
      </div>

      {mode === "voice" ? <VoicePlayground /> : <TextPlayground />}
    </div>
  );
}