import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Loader2, MessageSquare, RefreshCw, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type ChatLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  agent?: string;
};

const AGENTS = ["receptionist", "support", "sales", "technical", "escalation"];

export function Playground() {
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
          text: `Sesión iniciada con agente ${data.initial_agent} · ${data.provider} / ${data.model}`,
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
          text: data.reply || "(sin respuesta de texto)",
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
      setLines([
        {
          id: "reset",
          role: "system",
          text: `Sesión reiniciada · agente ${data.initial_agent}`,
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const busy = startSession.isPending || sendMessage.isPending || resetSession.isPending;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Probar agente</h1>
        <p className="mt-1 text-slate-400">
          Chat de texto con el multi-agente (Grok) — sin LiveKit ni micrófono
        </p>
      </header>

      {status?.requires_xai_key && (
        <div className="glass-card border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
          Configura <code className="text-amber-100">XAI_API_KEY</code> en Configuración antes de chatear.
        </div>
      )}

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
              <span className="text-sm text-slate-400">
                Sesión activa · {status?.provider} / {status?.model}
              </span>
              <button
                type="button"
                className="btn-ghost ml-auto text-sm"
                disabled={busy}
                onClick={() => resetSession.mutate()}
              >
                <RefreshCw className="h-4 w-4" />
                Reiniciar
              </button>
            </>
          )}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {lines.length === 0 && (
            <p className="text-center text-sm text-slate-500">
              Pulsa &quot;Iniciar chat&quot; y escribe como si fueras un cliente llamando al contact center.
            </p>
          )}
          {lines.map((line) => (
            <div
              key={line.id}
              className={`flex gap-3 ${line.role === "user" ? "justify-end" : "justify-start"}`}
            >
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
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  line.role === "user"
                    ? "bg-cyan-600/30 text-cyan-50"
                    : line.role === "system"
                      ? "bg-white/5 text-slate-400"
                      : "bg-white/5 text-slate-100"
                }`}
              >
                {line.agent && line.role === "assistant" && (
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cyan-400/80">
                    {line.agent}
                  </p>
                )}
                {line.text}
              </div>
              {line.role === "user" && (
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                  <User className="h-4 w-4 text-slate-300" />
                </div>
              )}
            </div>
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
            placeholder={
              sessionId ? "Escribe tu mensaje..." : "Inicia una sesión para chatear"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!sessionId || busy}
          />
          <button type="submit" className="btn-primary" disabled={!sessionId || !input.trim() || busy}>
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>

      {(startSession.error || sendMessage.error) && (
        <p className="text-sm text-red-400">
          {(startSession.error || sendMessage.error)?.message}
        </p>
      )}
    </div>
  );
}