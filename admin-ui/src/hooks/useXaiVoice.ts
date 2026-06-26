import { useCallback, useEffect, useRef, useState } from "react";
import { api, type VoiceSessionResponse } from "../lib/api";
import { base64PCM16ToFloat32, float32ToPCM16Base64 } from "../lib/audio";

const CHUNK_MS = 100;

export type VoiceTranscriptLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type XaiMessage = { type: string; [key: string]: unknown };

export function useXaiVoice() {
  const [connected, setConnected] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<VoiceTranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<VoiceSessionResponse | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Float32Array[]>([]);
  const playingRef = useRef(false);
  const playbackSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const configuredRef = useRef(false);
  const sessionConfigRef = useRef<VoiceSessionResponse | null>(null);
  const currentLineRef = useRef<{ role: "user" | "assistant"; content: string } | null>(null);

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
    const buffer = ctx.createBuffer(1, chunk.length, ctx.sampleRate);
    buffer.getChannelData(0).set(chunk);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
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
      if (!ctx) return;
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

  const handleServerMessage = useCallback(
    (message: XaiMessage) => {
      if (message.type === "response.output_audio.delta" && typeof message.delta === "string") {
        playAudio(message.delta);
      }
      if (message.type === "response.output_audio_transcript.delta" && typeof message.delta === "string") {
        appendTranscript("assistant", message.delta);
      }
      if (message.type === "response.done") {
        currentLineRef.current = null;
      }
      if (message.type === "input_audio_buffer.speech_started") {
        stopPlayback();
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
    [appendTranscript, playAudio, stopPlayback],
  );

  const configureSession = useCallback(
    (ws: WebSocket, sampleRate: number) => {
      const cfg = sessionConfigRef.current;
      if (!cfg) return;

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
      if (cfg.reasoning_effort) session.reasoning = { effort: cfg.reasoning_effort };

      ws.send(JSON.stringify({ type: "session.update", session }));
    },
    [],
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

  const disconnect = useCallback(() => {
    stopCapture();
    stopPlayback();
    wsRef.current?.close();
    wsRef.current = null;
    configuredRef.current = false;
    setConnected(false);
    currentLineRef.current = null;
  }, [stopCapture, stopPlayback]);

  const start = useCallback(
    async (agent: string) => {
      setError(null);
      setTranscript([]);
      currentLineRef.current = null;
      disconnect();

      const voiceSession = await api.createVoiceSession(agent);
      setSessionInfo(voiceSession);
      sessionConfigRef.current = voiceSession;

      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const sampleRate = ctx.sampleRate;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
            configureSession(ws, sampleRate);
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

        while (total >= chunkSamples && configuredRef.current && ws.readyState === WebSocket.OPEN) {
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
      processor.connect(ctx.destination);
      processorRef.current = processor;
      setCapturing(true);
    },
    [configureSession, disconnect, handleServerMessage, stopCapture],
  );

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    connected,
    capturing,
    audioLevel,
    transcript,
    error,
    sessionInfo,
    start,
    stop: disconnect,
    setError,
  };
}