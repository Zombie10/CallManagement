import { DEFAULT_ADMIN_LOCALE, translate, type AdminLocale } from "./i18n";

/** PCM16 helpers for browser microphone capture and playback. */

const MIC_RELEASE_MS = 400;
const MIC_RELEASE_SAFARI_MS = 700;

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
}

function isSafariLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|CriOS|FxiOS/i.test(ua);
}

export function micReleaseDelay(): Promise<void> {
  const ms = isIOS() || isSafariLike() ? MIC_RELEASE_SAFARI_MS : MIC_RELEASE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function microphoneConstraints(): MediaStreamConstraints {
  if (isIOS()) {
    return { audio: true };
  }
  return {
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

/**
 * getUserMedia — on iOS must run immediately after the user tap (no awaits before this).
 * Retries only when not preserving user activation (e.g. explicit reconnect after delay).
 */
export async function requestMicrophone(options?: {
  maxAttempts?: number;
  preserveUserActivation?: boolean;
  locale?: AdminLocale;
}): Promise<MediaStream> {
  const maxAttempts = options?.preserveUserActivation ? 1 : (options?.maxAttempts ?? 3);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await navigator.mediaDevices.getUserMedia(microphoneConstraints());
    } catch (err) {
      lastErr = err;
      const retryable =
        !options?.preserveUserActivation &&
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.message.includes("AVAudioSession"));
      if (!retryable || attempt === maxAttempts) break;
      await micReleaseDelay();
    }
  }
  throw new Error(microphoneErrorMessage(lastErr, options?.locale));
}

/** User-facing message when getUserMedia / LiveKit mic fails (Safari AVAudioSession, etc.). */
export function microphoneErrorMessage(
  err: unknown,
  locale: AdminLocale = DEFAULT_ADMIN_LOCALE,
): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  if (
    name === "NotAllowedError" ||
    raw.includes("AVAudioSession") ||
    raw.includes("CaptureDevice") ||
    raw.includes("Permission denied")
  ) {
    const iosHint = isIOS() ? translate("voice.micIos", locale) : "";
    return translate("voice.micDenied", locale) + iosHint + translate("voice.micPersist", locale);
  }
  if (name === "NotFoundError" || raw.includes("device not found")) {
    return translate("voice.micMissing", locale);
  }
  return raw || translate("voice.micGeneric", locale);
}

export function float32ToPCM16Base64(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64PCM16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}