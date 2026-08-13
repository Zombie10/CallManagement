/** Flujos operativos interactivos para la página Flujos / Operación. */

export type FlowCategory = "vision" | "llamadas" | "agentes" | "pruebas" | "admin";

export type FlowNodeKind = "start" | "process" | "decision" | "system" | "end" | "external";

export type FlowBranch = {
  label: string;
  targetId: string;
  tone?: "ok" | "warn" | "danger" | "neutral";
};

export type FlowStep = {
  id: string;
  title: string;
  description?: string;
  kind: FlowNodeKind;
  actor?: string;
  /** Next step when linear; ignored if branches present. */
  next?: string;
  branches?: FlowBranch[];
  details?: string[];
  tags?: string[];
};

export type FlowSection = {
  id: string;
  title: string;
  summary: string;
  category: FlowCategory;
  durationHint?: string;
  steps: FlowStep[];
};

export const FLOW_CATEGORIES: Array<{ id: FlowCategory | "all"; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "vision", label: "Visión" },
  { id: "llamadas", label: "Llamadas" },
  { id: "agentes", label: "Agentes" },
  { id: "pruebas", label: "Pruebas" },
  { id: "admin", label: "Admin" },
];

import { OPERATION_FLOWS } from "./operationFlows.catalog";

export { OPERATION_FLOWS };

export function getFlowById(id: string): FlowSection | undefined {
  return OPERATION_FLOWS.find((f) => f.id === id);
}

export function stepsById(flow: FlowSection): Map<string, FlowStep> {
  return new Map(flow.steps.map((s) => [s.id, s]));
}

/** Primary interactive flow for each system template. */
export const TEMPLATE_PRIMARY_FLOW: Record<string, string> = {
  receptionist: "handoffs",
  banking_support: "banking",
  support: "dialogo",
  sales: "dialogo",
  technical: "dialogo",
  escalation: "handoffs",
};

/** Extra related flows suggested next to an agent. */
export const TEMPLATE_RELATED_FLOWS: Record<string, string[]> = {
  receptionist: ["handoffs", "dialogo", "cola", "pstn", "did"],
  banking_support: ["banking", "dialogo", "tools", "pstn", "fin-llamada"],
  support: ["dialogo", "handoffs", "tools", "cola", "fin-llamada"],
  sales: ["dialogo", "handoffs", "tools", "pstn"],
  technical: ["dialogo", "tools", "handoffs"],
  escalation: ["handoffs", "dialogo", "fin-llamada"],
};

export type AgentFlowContext = {
  id: string;
  display_name: string;
  template_id: string;
  status: string;
  voice?: string;
  locale?: string;
  phone_numbers?: string[];
  schedule_status?: string;
  max_concurrent_calls?: number | null;
  custom_instructions?: string;
  function_tools?: string[];
};

/**
 * Build a personalized copy of a catalog flow for a company agent instance.
 */
export function flowForAgent(
  agent: AgentFlowContext,
  baseFlowId?: string,
): FlowSection {
  const template = agent.template_id || "receptionist";
  const flowId = baseFlowId || TEMPLATE_PRIMARY_FLOW[template] || "dialogo";
  const base = getFlowById(flowId) || OPERATION_FLOWS[0]!;
  const phones =
    agent.phone_numbers?.filter(Boolean).join(", ") || "Sin DID configurado";
  const intro: FlowStep = {
    id: `agent-${agent.id}-intro`,
    title: agent.display_name,
    description: `Instancia de la empresa · plantilla ${template}`,
    kind: "start",
    actor: agent.display_name,
    next: base.steps[0]?.id,
    tags: [agent.status, agent.voice || "voz xAI", agent.locale || "locale"].filter(Boolean) as string[],
    details: [
      `Plantilla: ${template}`,
      `Voz xAI: ${agent.voice || "—"}`,
      `Idioma: ${agent.locale || "—"}`,
      `Teléfonos: ${phones}`,
      agent.max_concurrent_calls
        ? `Máx. simultáneas: ${agent.max_concurrent_calls}`
        : "Máx. simultáneas: límite de empresa",
      agent.schedule_status ? `Horario: ${agent.schedule_status}` : undefined,
    ].filter(Boolean) as string[],
  };

  const runtimeSteps: FlowStep[] = [];
  if (agent.custom_instructions?.trim()) {
    runtimeSteps.push({
      id: `agent-${agent.id}-instructions`,
      title: "Instrucciones de esta instancia",
      description: "Override configurado en Mis agentes (se combina con estilo e idioma).",
      kind: "process",
      actor: agent.display_name,
      next: base.steps[0]?.id,
      details: [agent.custom_instructions.trim().slice(0, 400)],
    });
    intro.next = runtimeSteps[0]!.id;
  }
  if (agent.function_tools?.length) {
    runtimeSteps.push({
      id: `agent-${agent.id}-tools`,
      title: "Tools de esta instancia",
      description: "Herramientas habilitadas en la instancia (runtime).",
      kind: "system",
      next: base.steps[0]?.id,
      tags: agent.function_tools,
    });
    if (runtimeSteps.length === 1) {
      intro.next = runtimeSteps[0]!.id;
    } else {
      runtimeSteps[0]!.next = runtimeSteps[1]!.id;
    }
  }

  return {
    ...base,
    id: `agent-flow-${agent.id}-${flowId}`,
    title: `${agent.display_name} · ${base.title}`,
    summary: `Documentación de plantilla para “${agent.display_name}” (${template}). ${base.summary}`,
    category: "agentes",
    durationHint: agent.status,
    steps: [intro, ...runtimeSteps, ...base.steps],
  };
}

export function relatedFlowsForTemplate(templateId: string): FlowSection[] {
  const ids = TEMPLATE_RELATED_FLOWS[templateId] || ["dialogo", "pstn", "cola"];
  return ids
    .map((id) => getFlowById(id))
    .filter((f): f is FlowSection => Boolean(f));
}

