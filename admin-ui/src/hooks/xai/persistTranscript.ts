import { api, type VoiceSessionResponse } from "../../lib/api";

export type PersistableLine = { role: "user" | "assistant" | "system"; text: string };

export function formatVoiceTranscript(lines: PersistableLine[]): string {
  return lines
    .filter((line) => line.text.trim())
    .map((line) => {
      const label =
        line.role === "user" ? "Cliente" : line.role === "assistant" ? "Agente" : "Sistema";
      return `[${label}] ${line.text.trim()}`;
    })
    .join("\n");
}

export async function persistVoiceSession(opts: {
  session: VoiceSessionResponse;
  agent: string;
  lines: PersistableLine[];
  phone_number: string;
  customer_name?: string;
  tenant_id?: string;
  agent_instance_id?: string;
  recording?: { blob: Blob; ext: string } | null;
}): Promise<void> {
  const transcript = formatVoiceTranscript(opts.lines);
  if (!transcript) return;
  const callId = opts.session.call_id;
  if (!callId) return;
  await api.completeVoiceSession({
    call_id: callId,
    agent: opts.agent,
    phone_number: opts.phone_number,
    customer_name: opts.customer_name,
    tenant_id: opts.tenant_id,
    agent_instance_id: opts.agent_instance_id,
    start_time: opts.session.start_time,
    transcript,
  });
  if (opts.recording) {
    await api.uploadCallRecording(callId, opts.recording.blob, opts.recording.ext);
  }
}
