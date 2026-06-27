/** PCM16 helpers for browser microphone capture and playback. */

const MIC_RELEASE_MS = 200;

export function micReleaseDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MIC_RELEASE_MS));
}

/** User-facing message when getUserMedia / LiveKit mic fails (Safari AVAudioSession, etc.). */
export function microphoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  if (
    name === "NotAllowedError" ||
    raw.includes("AVAudioSession") ||
    raw.includes("CaptureDevice") ||
    raw.includes("Permission denied")
  ) {
    return (
      "No se pudo usar el micrófono. Pulsa Desconectar, espera un momento y vuelve a Conectar. " +
      "Si persiste: cierra otras pestañas/apps de voz (Zoom, Meet), revisa permisos del micrófono " +
      "en el navegador y recarga la página. No está relacionado con otra persona usando el mismo agente."
    );
  }
  if (name === "NotFoundError" || raw.includes("device not found")) {
    return "No hay micrófono disponible. Conecta un micrófono o permite el dispositivo integrado.";
  }
  return raw || "Error al acceder al micrófono";
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