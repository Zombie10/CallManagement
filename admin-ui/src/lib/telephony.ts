import type { AgentTelephonySummary } from "./api";

export const TELEPHONY_MODE_STYLES: Record<
  AgentTelephonySummary["mode"],
  { label: string; className: string }
> = {
  livekit_pstn: {
    label: "PSTN real",
    className: "bg-cyan-500/15 text-cyan-200 border-cyan-400/25",
  },
  demo_did: {
    label: "DID demo",
    className: "bg-violet-500/15 text-violet-200 border-violet-400/25",
  },
  playground_only: {
    label: "Solo pruebas",
    className: "bg-slate-500/15 text-slate-300 border-white/10",
  },
};

export const CHANNEL_ICONS: Record<string, string> = {
  console_local: "💻",
  playground_xai: "⚡",
  playground_livekit: "📡",
  pstn_livekit: "📞",
};