import type { SelectOption } from "../components/Select";
import type { AgentProfile } from "./api";

const FALLBACK_LABELS: Record<string, string> = {
  receptionist: "Recepción",
  banking_support: "Soporte bancario BAC",
  support: "Soporte general",
  sales: "Ventas",
  technical: "Técnico",
  escalation: "Escalación",
};

/** Fallback labels when the catalog has not loaded yet. Prefer templateOptionsFromProfiles. */
export const AGENT_OPTIONS: SelectOption[] = Object.entries(FALLBACK_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function agentLabel(id: string, profiles?: AgentProfile[]): string {
  const fromCatalog = profiles?.find((p) => p.name === id);
  if (fromCatalog?.display_name) return fromCatalog.display_name;
  return FALLBACK_LABELS[id] || id;
}

export function templateOptionsFromProfiles(profiles?: AgentProfile[]): SelectOption[] {
  if (profiles?.length) {
    return profiles.map((p) => ({
      value: p.name,
      label: p.display_name || FALLBACK_LABELS[p.name] || p.name,
      description: p.enabled === false ? "Deshabilitado" : undefined,
    }));
  }
  return AGENT_OPTIONS;
}