import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolCallEntry } from "../components/ToolCallLog";
import { api, type VoiceSessionConfig, type VoiceSessionResponse } from "../lib/api";
import {
  base64PCM16ToFloat32,
  float32ToPCM16Base64,
  micReleaseDelay,
  microphoneErrorMessage,
} from "../lib/audio";

const CHUNK_MS = 100;
/** xAI Voice API default; input/output must use the same rate for playback. */
const XAI_AUDIO_RATE = 24000;

const HANDOFF_TARGETS: Record<string, string> = {
  transfer_to_support: "support",
  transfer_to_sales: "sales",
  transfer_to_technical: "technical",
  transfer_to_scheduling: "support",
  transfer_to_escalation: "escalation",
  transfer_to_receptionist: "receptionist",
  transfer_to_banking_support: "banking_support",
  to_banking_support: "banking_support",
  to_support: "support",
  to_sales: "sales",
  to_technical: "technical",
  to_scheduling: "support",
  to_escalation: "escalation",
  to_receptionist: "receptionist",
};

export type VoiceTranscriptLine = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

type XaiMessage = { type: string; [key: string]: unknown };

type SessionLike = VoiceSessionResponse | VoiceSessionConfig;

export function useXaiVoice() {
  const [connected, setConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<VoiceTranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<VoiceSessionResponse | null>(null);
  const [currentAgent, setCurrentAgent] = useState<string>("receptionist");
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const playingRef = useRef(false);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playbackGainRef = useRef<GainNode | null>(null);
  const configuredRef = useRef(false);
  const assistantSpeakingRef = useRef(false);
  const lastAudioDeltaAtRef = useRef(0);
  const sessionConfigRef = useRef<SessionLike | null>(null);
  const currentLineRef = useRef<{ role: "user" | "assistant"; content: string } | null>(null);
  const sampleRateRef = useRef(XAI_AUDIO_RATE);
  const callContextRef = useRef<{ phone_number: string; customer_name?: string; tenant_id?: string }>({
    phone_number: "+15551234567",
  });

  const appendSystem = useCallback((text: string) => {
    setTranscript((prev) => [...prev, { id: `sys-${Date.now()}`, role: "system", text }]);
  }, []);

  const stopPlayback = useCallback(() => {
    if (playbackSourceRef.current) {
      try {
        playbackSourceRef.current.stop();
        playbackSourceRef.current.disconnect();
      } catch {
        /* already stopped */
      }
      playbackSourceRef.current = null;
    }
    playbackQueueRef.current = [];
    playingRef.current = false;
  }, []);

  const playNext = useCallback((ctx: AudioContext) => {
    if (!playbackQueueRef.current.length) {
      playingRef.current = false;
      playbackSourceRef.current = null;
      return;
    }
    const chunk = playbackQueueRef.current.shift()!;
    const buffer = ctx.createBuffer(1, chunk.length, sampleRateRef.current);
    buffer.getChannelData(0).set(chunk);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const dest = playbackGainRef.current ?? ctx.destination;
    source.connect(dest);
    playbackSourceRef.current = source;
    source.onended = () => {
      if (playbackSourceRef.current === source) playbackSourceRef.current = null;
      playNext(ctx);
    };
    source.start();
    playingRef.current = true;
  }, []);

  const playAudio = useCallback(
    (base64: string) => {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state === "closed") return;
      if (ctx.state === "suspended") void ctx.resume();
      assistantSpeakingRef.current = true;
      lastAudioDeltaAtRef.current = Date.now();
      playbackQueueRef.current.push(base64PCM16ToFloat32(base64));
      if (!playingRef.current) playNext(ctx);
    },
    [playNext],
  );

  const appendTranscript = useCallback((role: "user" | "assistant", delta: string) => {
    if (currentLineRef.current?.role === role) {
      currentLineRef.current.content += delta;
      setTranscript((prev) => {
        const next = [...prev];
        if (next.length) next[next.length - 1] = { ...next[next.length - 1], text: currentLineRef.current!.content };
        return next;
      });
      return;
    }
    currentLineRef.current = { role, content: delta };
    setTranscript((prev) => [
      ...prev,
      { id: `${role}-${Date.now()}`, role, text: delta },
    ]);
  }, []);

  const sendSessionUpdate = useCallback((ws: WebSocket, cfg: SessionLike, sampleRate: number) => {
    const session: Record<string, unknown> = {
      instructions: cfg.instructions,
      voice: cfg.voice,
      turn_detection: cfg.turn_detection,
      audio: {
        input: {
          format: { type: "audio/pcm", rate: sampleRate },
          ...(cfg.language_hint
            ? { transcription: { language_hint: cfg.language_hint } }
            : {}),
        },
        output: { format: { type: "audio/pcm", rate: sampleRate } },
      },
    };
    if (cfg.tools?.length) session.tools = cfg.tools;
    if ("reasoning_effort" in cfg && cfg.reasoning_effort) {
      session.reasoning = { effort: cfg.reasoning_effort };
    }
    ws.send(JSON.stringify({ type: "session.update", session }));
  }, []);

  const applyAgentConfig = useCallback(
    async (targetAgent: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const cfg = await api.voiceConfig(targetAgent);
      sessionConfigRef.current = cfg;
      setCurrentAgent(targetAgent);
      setSessionInfo((prev) =>
        prev
          ? { ...prev, agent: targetAgent, voice: cfg.voice, instructions: cfg.instructions, tools: cfg.tools, language_hint: cfg.language_hint }
          : prev,
      );
      sendSessionUpdate(ws, cfg, sampleRateRef.current);
    },
    [sendSessionUpdate],
  );

  const handleFunctionCall = useCallback(
    async (message: XaiMessage) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const callId = message.call_id as string | undefined;
      const name = message.name as string | undefined;
      if (!callId || !name) return;

      let args: Record<string, unknown> = {};
      const rawArgs = message.arguments;
      if (typeof rawArgs === "string" && rawArgs.trim()) {
        try {
          args = JSON.parse(rawArgs) as Record<string, unknown>;
        } catch {
          args = {};
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        args = rawArgs as Record<string, unknown>;
      }

      const ctx = callContextRef.current;
      const pendingId = `tool-${Date.now()}`;
      setToolCalls((prev) => [
        ...prev,
        {
          id: pendingId,
          tool: name,
          arguments: args,
          output: "",
          status: "pending",
          timestamp: new Date().toISOString(),
        },
      ]);

      let output: string;
      let handoffAgent: string | undefined;

      try {
        const result = await api.executeVoiceTool({
          function_name: name,
          arguments: args,
          phone_number: ctx.phone_number,
          customer_name: ctx.customer_name,
          tenant_id: ctx.tenant_id,
        });
        output = result.output;
        handoffAgent = result.handoff_agent;
        setToolCalls((prev) =>
          prev.map((entry) =>
            entry.id === pendingId
              ? {
                  ...entry,
                  tool: result.tool || name,
                  arguments: result.arguments || args,
                  output: result.output,
                  status: result.status === "error" ? "error" : "ok",
                  durationMs: result.duration_ms,
                }
              : entry,
          ),
        );
        const confirmedPhone = (args.phone_number ?? args.phone) as string | undefined;
        if (
          result.status !== "error" &&
          (name === "lookup_customer" || result.tool === "lookup_customer") &&
          typeof confirmedPhone === "string" &&
          confirmedPhone.trim()
        ) {
          callContextRef.current.phone_number = confirmedPhone.trim();
        }
        appendSystem(`🔧 ${result.tool || name} → ${result.output.slice(0, 120)}${result.output.length > 120 ? "…" : ""}`);
        if (result.event?.type === "handoff" && result.event.detail) {
          appendSystem(`Transferencia de voz → ${result.event.detail}`);
        } else if (result.event) {
          appendSystem(`${result.event.type}: ${result.event.detail}`);
        }
      } catch (err) {
        const fallback = HANDOFF_TARGETS[name];
        if (fallback) {
          handoffAgent = fallback;
          output = `Transferred to ${fallback} agent. Continue the conversation as that specialist.`;
          appendSystem(`Transferencia de voz → ${fallback}`);
        } else {
          output = err instanceof Error ? err.message : `Function ${name} failed`;
        }
        setToolCalls((prev) =>
          prev.map((entry) =>
            entry.id === pendingId
              ? { ...entry, output, status: "error" as const }
              : entry,
          ),
        );
      }

      if (handoffAgent) {
        await applyAgentConfig(handoffAgent);
      }

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output,
          },
        }),
      );
      ws.send(JSON.stringify({ type: "response.create" }));
    },
    [applyAgentConfig, appendSystem],
  );

  const handleServerMessage = useCallback(
    (message: XaiMessage) => {
      if (message.type === "response.output_audio.delta" && typeof message.delta === "string") {
        playAudio(message.delta);
      }
      if (message.type === "response.output_audio.done") {
        window.setTimeout(() => {
          if (Date.now() - lastAudioDeltaAtRef.current > 400) {
            assistantSpeakingRef.current = false;
          }
        }, 450);
      }
      if (message.type === "response.output_audio_transcript.delta" && typeof message.delta === "string") {
        appendTranscript("assistant", message.delta);
      }
      if (message.type === "response.done") {
        currentLineRef.current = null;
        assistantSpeakingRef.current = false;
      }
      if (message.type === "response.function_call_arguments.done") {
        void handleFunctionCall(message);
      }
      if (
        message.type === "response.mcp_call.in_progress" ||
        message.type === "response.mcp_call.completed" ||
        message.type === "response.mcp_call.failed"
      ) {
        const label =
          message.type === "response.mcp_call.in_progress"
            ? "MCP en curso"
            : message.type === "response.mcp_call.completed"
              ? "MCP completado"
              : "MCP falló";
        const detail =
          (message.server_label as string) ||
          (message.tool_name as string) ||
          (message.error as string) ||
          "";
        if (detail) appendSystem(`${label}: ${detail}`);
      }
      if (message.type === "response.output_item.added" && message.item) {
        const item = message.item as { type?: string; name?: string };
        if (item.type === "web_search_call" || item.type === "x_search_call") {
          appendSystem(`Búsqueda: ${item.type.replace("_call", "")}`);
        }
        if (item.type === "code_interpreter_call") {
          appendSystem("Code interpreter ejecutando…");
        }
      }
      if (message.type === "input_audio_buffer.speech_started") {
        const recentlyAssistantAudio = Date.now() - lastAudioDeltaAtRef.current < 700;
        if (!recentlyAssistantAudio && !assistantSpeakingRef.current) {
          stopPlayback();
        }
        currentLineRef.current = { role: "user", content: "" };
        setTranscript((prev) => {
          if (prev.length && prev[prev.length - 1].role === "user") return prev;
          return [...prev, { id: `user-${Date.now()}`, role: "user", text: "..." }];
        });
      }
      if (message.type === "conversation.item.added" && message.item) {
        const item = message.item as { role?: string; content?: Array<{ type?: string; transcript?: string }> };
        if (item.role === "user" && item.content) {
          for (const part of item.content) {
            if (part.type === "input_audio" && part.transcript) {
              setTranscript((prev) => {
                if (prev.length && prev[prev.length - 1].role === "user") {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  const base = last.text === "..." ? "" : `${last.text} `;
                  next[next.length - 1] = { ...last, text: base + part.transcript };
                  return next;
                }
                return [...prev, { id: `user-${Date.now()}`, role: "user", text: part.transcript! }];
              });
              break;
            }
          }
        }
      }
    },
    [appendTranscript, handleFunctionCall, playAudio, stopPlayback],
  );

  const stopCapture = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;
    setCapturing(false);
    setAudioLevel(0);
  }, []);

  const disconnect = useCallback(async () => {
    stopCapture();
    stopPlayback();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    configuredRef.current = false;
    assistantSpeakingRef.current = false;
    playbackGainRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* already closing */
      }
    }
    setConnected(false);
    currentLineRef.current = null;
    await micReleaseDelay();
  }, [stopCapture, stopPlayback]);

  const start = useCallback(
    async (
      agent: string,
      context?: { phone_number?: string; customer_name?: string; tenant_id?: string; agent_instance_id?: string },
    ) => {
      setError(null);
      setTranscript([]);
      setToolCalls([]);
      setCurrentAgent(agent);
      currentLineRef.current = null;
      callContextRef.current = {
        phone_number: context?.phone_number || "+15551234567",
        customer_name: context?.customer_name,
        tenant_id: context?.tenant_id,
      };
      await disconnect();

      const voiceSession = await api.createVoiceSession(agent, {
        phone_number: callContextRef.current.phone_number,
        customer_name: callContextRef.current.customer_name,
        tenant_id: context?.tenant_id,
        agent_instance_id: context?.agent_instance_id,
      });
      setSessionInfo(voiceSession);
      sessionConfigRef.current = voiceSession;

      const ctx = new AudioContext({ sampleRate: XAI_AUDIO_RATE });
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const sampleRate = ctx.sampleRate;
      sampleRateRef.current = sampleRate;

      const playbackGain = ctx.createGain();
      playbackGain.gain.value = 1;
      playbackGain.connect(ctx.destination);
      playbackGainRef.current = playbackGain;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        throw new Error(microphoneErrorMessage(err));
      }
      mediaRef.current = stream;

      const url = `${voiceSession.ws_url}?model=${encodeURIComponent(voiceSession.model)}`;
      const token = voiceSession.client_secret.value;
      const ws = new WebSocket(url, [`xai-client-secret.${token}`]);

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error("No se pudo conectar al Voice Agent de xAI"));
        ws.onclose = (ev) => {
          if (!configuredRef.current) reject(new Error(`WebSocket cerrado (${ev.code})`));
        };
      });

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as XaiMessage;
          if (
            (message.type === "conversation.created" || message.type === "session.created") &&
            !configuredRef.current
          ) {
            sendSessionUpdate(ws, voiceSession, sampleRate);
          }
          if (message.type === "session.updated" && !configuredRef.current) {
            configuredRef.current = true;
            setConnected(true);
          }
          handleServerMessage(message);
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        configuredRef.current = false;
        stopCapture();
      };

      wsRef.current = ws;

      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      let buffers: Float32Array[] = [];
      let total = 0;
      const chunkSamples = (sampleRate * CHUNK_MS) / 1000;

      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        setAudioLevel(Math.sqrt(sum / input.length));

        buffers.push(new Float32Array(input));
        total += input.length;

        while (
          total >= chunkSamples &&
          configuredRef.current &&
          ws.readyState === WebSocket.OPEN &&
          !assistantSpeakingRef.current
        ) {
          const chunk = new Float32Array(chunkSamples);
          let offset = 0;
          while (offset < chunkSamples && buffers.length) {
            const buf = buffers[0];
            const need = chunkSamples - offset;
            if (buf.length <= need) {
              chunk.set(buf, offset);
              offset += buf.length;
              total -= buf.length;
              buffers.shift();
            } else {
              chunk.set(buf.subarray(0, need), offset);
              buffers[0] = buf.subarray(need);
              offset += need;
              total -= need;
            }
          }
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: float32ToPCM16Base64(chunk),
            }),
          );
        }
      };

      source.connect(processor);
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);
      processorRef.current = processor;
      setCapturing(true);
    },
    [disconnect, handleServerMessage, sendSessionUpdate, stopCapture],
  );

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return {
    connected,
    capturing,
    audioLevel,
    transcript,
    error,
    sessionInfo,
    currentAgent,
    toolCalls,
    start,
    stop: disconnect,
    setError,
  };
}