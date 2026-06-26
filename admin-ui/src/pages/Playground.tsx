import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Headphones,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  RefreshCw,
  Send,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLiveKitVoice } from "../hooks/useLiveKitVoice";
import { api } from "../lib/api";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

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
  const [phone, setPhone] = useState("+15551234567");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });

  const startSession = useMutation({
    mutationFn: () =>
      api.createChatSession({
        initial_agent: initialAgent,
        phone_number: phone,
      }),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setLines([
        {
          id: "welcome",
          role: "system",
          text: `Sesión texto · ${data.initial_agent} · ${data.provider} / ${data.model} · handoffs LiveKit`,
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
    <div className="glass-card flex min-h-[520px] flex-col">
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
            <input
              className="input-field w-44"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono CRM"
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
  const [initialAgent, setInitialAgent] = useState("receptionist");
  const [phone, setPhone] = useState("+15551234567");
  const [customerName, setCustomerName] = useState("");
  const [vip, setVip] = useState(false);

  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const voice = useLiveKitVoice();

  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 280))}%`;
  const busy = voice.connecting;

  return (
    <div className="glass-card flex min-h-[520px] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
        <select
          className="input-field w-auto"
          value={initialAgent}
          onChange={(e) => setInitialAgent(e.target.value)}
          disabled={voice.connected || busy}
        >
          {AGENTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          className="input-field w-40"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+15551234567"
          disabled={voice.connected || busy}
        />
        <input
          className="input-field w-36"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Nombre cliente"
          disabled={voice.connected || busy}
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={vip}
            onChange={(e) => setVip(e.target.checked)}
            disabled={voice.connected || busy}
            className="h-4 w-4 rounded border-white/20"
          />
          VIP
        </label>

        {!voice.connected ? (
          <button
            type="button"
            className="btn-primary"
            disabled={!status?.livekit_ready || busy}
            onClick={() => {
              voice.setError(null);
              voice
                .start({
                  initial_agent: initialAgent,
                  phone_number: phone,
                  customer_name: customerName || undefined,
                  vip,
                })
                .catch((err) => voice.setError(String(err)));
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            Conectar voz
          </button>
        ) : (
          <button type="button" className="btn-ghost text-red-300" onClick={() => voice.stop()}>
            <MicOff className="h-4 w-4" />
            Desconectar
          </button>
        )}
      </div>

      {!status?.livekit_ready && (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Requiere pipeline de producción</p>
          <ul className="mt-1 list-inside list-disc text-amber-200/90">
            {(status?.livekit_issues || ["Configura LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET y XAI_API_KEY"]).map(
              (issue) => (
                <li key={issue}>{issue}</li>
              ),
            )}
          </ul>
          <p className="mt-2 text-xs text-amber-200/80">
            En otra terminal:{" "}
            <code className="text-amber-50">uv run -m call_management.server dev</code>
          </p>
        </div>
      )}

      <div className="grid gap-4 border-b border-white/5 p-4 sm:grid-cols-3">
        <StatusTile
          icon={voice.connected ? Wifi : WifiOff}
          label="Sala LiveKit"
          value={voice.connected ? voice.sessionInfo?.room_name || "conectado" : "desconectado"}
          active={voice.connected}
        />
        <StatusTile
          icon={Bot}
          label="Agente"
          value={
            voice.agentJoined
              ? voice.agentIdentity || voice.sessionInfo?.initial_agent || "activo"
              : voice.connected
                ? "esperando dispatch…"
                : "—"
          }
          active={voice.agentJoined}
        />
        <StatusTile
          icon={Headphones}
          label="Pipeline"
          value={
            voice.sessionInfo
              ? `${voice.sessionInfo.pipeline} · ${voice.sessionInfo.model}`
              : status?.voice_model || "grok-voice-latest"
          }
          active={Boolean(voice.sessionInfo)}
        />
      </div>

      {voice.connected && (
        <div className="border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-cyan-200">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
            {voice.agentJoined
              ? `Hablando con ${voice.sessionInfo?.initial_agent} — mismo worker que consola/producción`
              : "Conectado a la sala — esperando que el worker acepte el dispatch…"}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: levelWidth }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            <Phone className="mr-1 inline h-3 w-3" />
            CRM: {phone}
            {customerName ? ` · ${customerName}` : ""}
            {vip ? " · VIP" : ""}
          </p>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        {!voice.connected && !busy && (
          <>
            <div className="rounded-2xl bg-cyan-500/10 p-4">
              <Mic className="h-8 w-8 text-cyan-400" />
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Voz por <strong className="text-slate-200">LiveKit + xAI Grok</strong> — handoffs, CRM, tools y MCP
              igual que la consola y las llamadas SIP. No es el WebSocket directo de xAI.
            </p>
          </>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creando sala y despachando agente…
          </p>
        )}
        {voice.connected && voice.agentJoined && (
          <p className="text-sm text-slate-300">El agente te escucha. Habla con naturalidad.</p>
        )}
      </div>

      {voice.error && <p className="px-4 pb-4 text-sm text-red-400">{voice.error}</p>}
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
          Voz LiveKit + Grok ({status?.voice_model || "grok-voice-latest"}) o texto multi-agente
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
          <Mic className="h-4 w-4" /> Voz (LiveKit)
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