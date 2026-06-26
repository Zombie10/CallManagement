import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bot,
  Cloud,
  CreditCard,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  Radio,
  RefreshCw,
  Send,
  User,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Select } from "../components/Select";
import { ToolCallLog, type ToolCallEntry } from "../components/ToolCallLog";
import { useLiveKitVoice } from "../hooks/useLiveKitVoice";
import { useXaiVoice } from "../hooks/useXaiVoice";
import { AGENT_OPTIONS, agentLabel } from "../lib/agents";
import { api, type DemoCustomer } from "../lib/api";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

type ChatLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  agent?: string;
};

type VoiceBackend = "livekit" | "xai";

function DemoCustomerPicker({
  onSelect,
  disabled,
}: {
  onSelect: (customer: DemoCustomer) => void;
  disabled?: boolean;
}) {
  const { data } = useQuery({ queryKey: ["demo-customers"], queryFn: api.demoCustomers });
  const [picked, setPicked] = useState("");

  const options = (data?.customers || []).map((c) => ({
    value: c.phone_number,
    label: c.name,
    description: `${c.phone_number} · ${c.account_masked} · ${c.debit_card_masked}`,
  }));

  if (!options.length) return null;

  return (
    <Select
      className="w-full sm:w-72"
      value={picked}
      onChange={(phone) => {
        setPicked(phone);
        const customer = data?.customers.find((c) => c.phone_number === phone);
        if (customer) onSelect(customer);
      }}
      options={[{ value: "", label: "Cliente demo BAC…", description: "Reynaldo / Francisco" }, ...options]}
      disabled={disabled}
      size="sm"
    />
  );
}

function DemoCustomerCard({ customer }: { customer: DemoCustomer }) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
      <p className="font-medium text-cyan-100">
        <CreditCard className="mr-1 inline h-3.5 w-3.5" />
        {customer.name} · {customer.institution}
      </p>
      <p className="mt-1 text-slate-400">
        Cuenta {customer.account_type} {customer.account_masked} · Débito {customer.debit_card_masked} (
        {customer.debit_card_exp})
      </p>
      {customer.credit_card_masked && (
        <p className="text-slate-500">Crédito {customer.credit_card_masked}</p>
      )}
      <p className="mt-1 text-slate-500">{customer.hint}</p>
    </div>
  );
}

function TextPlayground() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [toolLog, setToolLog] = useState<ToolCallEntry[]>([]);
  const [input, setInput] = useState("");
  const [initialAgent, setInitialAgent] = useState("banking_support");
  const [phone, setPhone] = useState("+15103750043");
  const [customerName, setCustomerName] = useState("Reynaldo Garcia");
  const [demoCard, setDemoCard] = useState<DemoCustomer | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const { data: demos } = useQuery({ queryKey: ["demo-customers"], queryFn: api.demoCustomers });

  useEffect(() => {
    if (!demoCard && demos?.customers?.length) {
      const match = demos.customers.find((c) => c.phone_number === phone);
      if (match) setDemoCard(match);
    }
  }, [demos, phone, demoCard]);

  const startSession = useMutation({
    mutationFn: () =>
      api.createChatSession({
        initial_agent: initialAgent,
        phone_number: phone,
        customer_name: customerName || undefined,
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const busy = startSession.isPending || sendMessage.isPending || resetSession.isPending;

  return (
    <div className="glass-card flex min-h-[520px] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
        {!sessionId ? (
          <>
            <Select
              className="w-52"
              value={initialAgent}
              onChange={setInitialAgent}
              options={AGENT_OPTIONS}
            />
            <DemoCustomerPicker
              disabled={!!sessionId}
              onSelect={(c) => {
                setPhone(c.phone_number);
                setCustomerName(c.name);
                setDemoCard(c);
                setInitialAgent("banking_support");
              }}
            />
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
      <aside className="w-full border-t border-white/5 p-4 lg:w-80 lg:border-l lg:border-t-0">
        {demoCard && <DemoCustomerCard customer={demoCard} />}
        <div className={demoCard ? "mt-3" : ""}>
          <ToolCallLog entries={toolLog} title="Tools (texto)" />
        </div>
      </aside>
    </div>
  );
}

function VoiceControls({
  initialAgent,
  setInitialAgent,
  phone,
  setPhone,
  customerName,
  setCustomerName,
  demoCard,
  onDemoSelect,
  vip,
  setVip,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  initialAgent: string;
  setInitialAgent: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  demoCard?: DemoCustomer | null;
  onDemoSelect?: (c: DemoCustomer) => void;
  vip: boolean;
  setVip: (v: boolean) => void;
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
      {onDemoSelect && (
        <DemoCustomerPicker disabled={connected || busy} onSelect={onDemoSelect} />
      )}
      <input
        className="input-field w-36"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+15551234567"
        disabled={connected || busy}
      />
      <input
        className="input-field w-32"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
        placeholder="Nombre"
        disabled={connected || busy}
      />
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={vip}
          onChange={(e) => setVip(e.target.checked)}
          disabled={connected || busy}
          className="h-4 w-4 rounded border-white/20"
        />
        VIP
      </label>
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
  const [phone, setPhone] = useState("+15103750043");
  const [customerName, setCustomerName] = useState("Reynaldo Garcia");
  const [demoCard, setDemoCard] = useState<DemoCustomer | null>(null);
  const [vip, setVip] = useState(true);
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const voice = useLiveKitVoice();
  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 280))}%`;

  return (
    <div className="animate-fade-in">
      <VoiceControls
        initialAgent={initialAgent}
        setInitialAgent={setInitialAgent}
        phone={phone}
        setPhone={setPhone}
        customerName={customerName}
        setCustomerName={setCustomerName}
        demoCard={demoCard}
        onDemoSelect={(c) => {
          setPhone(c.phone_number);
          setCustomerName(c.name);
          setDemoCard(c);
          setVip(c.vip);
          setInitialAgent("banking_support");
        }}
        vip={vip}
        setVip={setVip}
        connected={voice.connected}
        busy={voice.connecting || !status?.livekit_ready}
        onConnect={() => {
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
        <StatusTile icon={voice.connected ? Wifi : WifiOff} label="Sala" value={voice.sessionInfo?.room_name || "—"} active={voice.connected} />
        <StatusTile icon={Bot} label="Agente" value={voice.agentJoined ? voice.sessionInfo?.initial_agent || "activo" : "esperando…"} active={voice.agentJoined} />
        <StatusTile icon={Cloud} label="Pipeline" value={voice.sessionInfo?.pipeline || "livekit"} active={voice.connected} />
      </div>

      {voice.connected && (
        <div className="border-b border-white/5 px-4 py-3">
          <p className="text-sm text-cyan-200">
            {voice.agentJoined ? "Agente en línea — habla con naturalidad" : "Esperando dispatch del worker…"}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-500 transition-all duration-150" style={{ width: levelWidth }} />
          </div>
        </div>
      )}

      {voice.error && <p className="p-4 text-sm text-red-400">{voice.error}</p>}
    </div>
  );
}

function XaiVoicePanel() {
  const [agent, setAgent] = useState("banking_support");
  const [phone, setPhone] = useState("+15103750043");
  const [customerName, setCustomerName] = useState("Reynaldo Garcia");
  const [demoCard, setDemoCard] = useState<DemoCustomer | null>(null);
  const { data: status } = useQuery({ queryKey: ["chat-status"], queryFn: api.chatStatus });
  const { data: demos } = useQuery({ queryKey: ["demo-customers"], queryFn: api.demoCustomers });
  const voice = useXaiVoice();
  const bottomRef = useRef<HTMLDivElement>(null);
  const levelWidth = `${Math.min(100, Math.round(voice.audioLevel * 280))}%`;

  useEffect(() => {
    if (!demoCard && demos?.customers?.length) {
      const match = demos.customers.find((c) => c.phone_number === phone);
      if (match) setDemoCard(match);
    }
  }, [demos, phone, demoCard]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [voice.transcript, voice.toolCalls]);

  return (
    <div className="animate-fade-in flex min-h-[400px] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
        <Select
          className="w-52"
          value={agent}
          onChange={setAgent}
          options={AGENT_OPTIONS}
          disabled={voice.connected}
        />
        <DemoCustomerPicker
          disabled={voice.connected}
          onSelect={(c) => {
            setPhone(c.phone_number);
            setCustomerName(c.name);
            setDemoCard(c);
            setAgent("banking_support");
          }}
        />
        <input
          className="input-field w-auto min-w-[140px]"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Teléfono"
          disabled={voice.connected}
        />
        <input
          className="input-field w-auto min-w-[120px]"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Nombre (opcional)"
          disabled={voice.connected}
        />
        {!voice.connected ? (
          <button
            type="button"
            className="btn-primary"
            disabled={!status?.xai_voice_ready}
            onClick={() => {
              voice.setError(null);
              voice
                .start(agent, {
                  phone_number: phone,
                  customer_name: customerName || undefined,
                })
                .catch((err) => voice.setError(String(err)));
            }}
          >
            <Zap className="h-4 w-4" />
            Conectar xAI directo
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
      {demoCard && (
        <div className="border-b border-white/5 px-4 py-3">
          <DemoCustomerCard customer={demoCard} />
        </div>
      )}

      {!status?.xai_voice_ready && (
        <p className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
          Configura <code>XAI_API_KEY</code> — no requiere LiveKit.
        </p>
      )}

      {voice.connected && (
        <div className="border-b border-white/5 px-4 py-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-violet-500 transition-all duration-150" style={{ width: levelWidth }} />
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!voice.transcript.length && !voice.connected && (
          <p className="text-center text-sm text-slate-500">
            WebSocket directo a xAI — CRM, MCP y function tools vía API del servidor.
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
        <div ref={bottomRef} />
      </div>
      {voice.error && <p className="px-4 pb-4 text-sm text-red-400">{voice.error}</p>}
      </div>
      <aside className="w-full border-t border-white/5 p-4 lg:w-80 lg:border-l lg:border-t-0">
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
    <div className={clsx("rounded-xl border px-3 py-2", active ? "border-cyan-400/20 bg-cyan-500/5" : "border-white/5 bg-white/[0.02]")}>
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
          {line.role === "assistant" ? <Bot className="h-4 w-4 text-cyan-400" /> : <MessageSquare className="h-4 w-4 text-slate-400" />}
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
        <p className="mt-1 text-slate-400">
          Voz xAI directa o LiveKit producción · Texto multi-agente
        </p>
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