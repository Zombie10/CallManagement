import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  ParticipantKind,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteParticipant,
} from "livekit-client";
import { api, type LiveKitPlaygroundInput, type LiveKitPlaygroundResponse } from "../lib/api";
import { micReleaseDelay, microphoneErrorMessage } from "../lib/audio";

export function useLiveKitVoice() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [agentJoined, setAgentJoined] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<LiveKitPlaygroundResponse | null>(null);
  const [agentIdentity, setAgentIdentity] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);
  const analyserRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);

  const cleanupAudioElements = useCallback(() => {
    for (const el of audioElementsRef.current) {
      el.pause();
      el.srcObject = null;
      el.remove();
    }
    audioElementsRef.current = [];
  }, []);

  const stopMeter = useCallback(() => {
    if (analyserRef.current) {
      cancelAnimationFrame(analyserRef.current.raf);
      void analyserRef.current.ctx.close();
      analyserRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startMeter = useCallback((track: LocalAudioTrack) => {
    stopMeter();
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([mediaTrack]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      setAudioLevel(sum / data.length / 255);
      analyserRef.current!.raf = requestAnimationFrame(tick);
    };
    analyserRef.current = { ctx, raf: requestAnimationFrame(tick) };
  }, [stopMeter]);

  const handleAgentParticipant = useCallback((participant: RemoteParticipant) => {
    if (participant.identity === roomRef.current?.localParticipant.identity) return;
    if (participant.kind === ParticipantKind.AGENT || participant.identity.includes("agent")) {
      setAgentJoined(true);
      setAgentIdentity(participant.identity);
    }
  }, []);

  const disconnect = useCallback(
    async (options?: { releaseMic?: boolean }) => {
      stopMeter();
      cleanupAudioElements();
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        try {
          await room.localParticipant.setMicrophoneEnabled(false);
        } catch {
          /* mic may already be off */
        }
        await room.disconnect();
      }
      setConnected(false);
      setAgentJoined(false);
      setAgentIdentity(null);
      if (options?.releaseMic !== false) {
        await micReleaseDelay();
      }
    },
    [cleanupAudioElements, stopMeter],
  );

  const start = useCallback(
    async (input: LiveKitPlaygroundInput) => {
      setError(null);
      setConnecting(true);
      await disconnect({ releaseMic: false });

      try {
        const session = await api.createLiveKitPlayground(input);
        setSessionInfo(session);

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          setConnected(state === ConnectionState.Connected);
        });

        room.on(RoomEvent.ParticipantConnected, (participant) => {
          handleAgentParticipant(participant);
        });

        room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          if (participant.identity === room.localParticipant.identity) return;
          handleAgentParticipant(participant);
          const el = track.attach();
          el.autoplay = true;
          el.volume = 1;
          document.body.appendChild(el);
          void el.play().catch(() => {
            /* autoplay may need user gesture; connect button satisfies this */
          });
          audioElementsRef.current.push(el);
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setAgentJoined(false);
        });

        await room.connect(session.url, session.token);
        const mic = await room.localParticipant.setMicrophoneEnabled(true);
        const localAudio = mic?.audioTrack;
        if (localAudio) startMeter(localAudio);

        for (const participant of room.remoteParticipants.values()) {
          handleAgentParticipant(participant);
        }

        setConnected(true);
      } catch (err) {
        setError(microphoneErrorMessage(err));
        await disconnect();
      } finally {
        setConnecting(false);
      }
    },
    [disconnect, handleAgentParticipant, startMeter],
  );

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  return {
    connected,
    connecting,
    agentJoined,
    agentIdentity,
    audioLevel,
    error,
    sessionInfo,
    start,
    stop: disconnect,
    setError,
  };
}