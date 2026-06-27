import { useCallback, useRef } from "react";

function isWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  return /AppleWebKit/i.test(navigator.userAgent) && !/Chrome|Chromium|Edg/i.test(navigator.userAgent);
}

function pickMimeType(): string {
  const webmTypes = ["audio/webm;codecs=opus", "audio/webm"];
  const mp4Types = ["audio/mp4", "audio/mp4;codecs=mp4a.40.2"];
  const types = isWebKit()
    ? [...mp4Types, ...webmTypes, "audio/ogg"]
    : [...webmTypes, ...mp4Types, "audio/ogg"];
  for (const type of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "audio/webm";
}

function extForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

export function useAudioRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("audio/webm");

  const start = useCallback((stream: MediaStream) => {
    if (!stream.getAudioTracks().length) return;
    chunksRef.current = [];
    const mime = pickMimeType();
    mimeTypeRef.current = mime;
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
  }, []);

  const stop = useCallback(async (): Promise<{ blob: Blob; ext: string } | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return null;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mimeTypeRef.current || "audio/webm",
        });
        const ext = extForMime(blob.type || mimeTypeRef.current);
        recorderRef.current = null;
        chunksRef.current = [];
        resolve(blob.size > 0 ? { blob, ext } : null);
      };
      recorder.stop();
    });
  }, []);

  return { start, stop };
}