import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  GitBranch,
  Mic,
  Phone,
  Search,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { InteractiveFlow } from "../components/InteractiveFlow";
import { useTenant } from "../contexts/TenantContext";
import { agentLabel } from "../lib/agents";
import {
  FLOW_CATEGORIES,
  OPERATION_FLOWS,
  TEMPLATE_PRIMARY_FLOW,
  flowForAgent,
  relatedFlowsForTemplate,
  type FlowCategory,
  type FlowSection,
} from "../lib/operationFlows";
import { api, type AgentInstanceRecord } from "../lib/api";
import clsx from "clsx";

type ViewMode = "agents" | "platform";

function agentPhones(a: AgentInstanceRecord): string[] {
  if (a.phone_numbers?.length) return a.phone_numbers.filter(Boolean);
  if (a.phone_number) return [a.phone_number];
  return [];
}

function statusStyle(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25";
  if (status === "paused") return "bg-amber-500/15 text-amber-300 ring-amber-400/25";
  return "bg-slate-500/15 text-slate-400 ring-white/10";
}

export function OperationFlows() {
  const { tenantId, tenant } = useTenant();
  const [mode, setMode] = useState<ViewMode>("agents");
  const [category, setCategory] = useState<FlowCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [platformFlowId, setPlatformFlowId] = useState(OPERATION_FLOWS[0]?.id ?? "");
  const [variantFlowId, setVariantFlowId] = useState<string | null>(null);

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: () => api.listOperationsAgents(tenantId),
    enabled: !!tenantId,
  });

  const agents = agentsData?.agents ?? [];

  useEffect(() => {
    setSelectedAgentId(null);
    setVariantFlowId(null);
  }, [tenantId]);

  useEffect(() => {
    if (!selectedAgentId && agents.length) {
      // Prefer banking_support if present, else first active, else first
      const banking = agents.find((a) => a.template_id === "banking_support");
      const active = agents.find((a) => a.status === "active");
      setSelectedAgentId((banking || active || agents[0])!.id);
    }
  }, [agents, selectedAgentId]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );

  const related = useMemo(
    () =>
      selectedAgent
        ? relatedFlowsForTemplate(selectedAgent.template_id)
        : OPERATION_FLOWS.filter((f) => f.category === "agentes"),
    [selectedAgent],
  );

  useEffect(() => {
    if (!selectedAgent) return;
    const primary =
      TEMPLATE_PRIMARY_FLOW[selectedAgent.template_id] || related[0]?.id || "dialogo";
    setVariantFlowId(primary);
  }, [selectedAgent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const agentFlow: FlowSection | null = useMemo(() => {
    if (!selectedAgent || !variantFlowId) return null;
    return flowForAgent(
      {
        id: selectedAgent.id,
        display_name: selectedAgent.display_name,
        template_id: selectedAgent.template_id,
        status: selectedAgent.status,
        voice: selectedAgent.voice,
        locale: selectedAgent.locale,
        phone_numbers: agentPhones(selectedAgent),
        schedule_status: selectedAgent.schedule_status,
        max_concurrent_calls: selectedAgent.max_concurrent_calls,
        custom_instructions: selectedAgent.custom_instructions,
        function_tools: selectedAgent.function_tools,
      },
      variantFlowId,
    );
  }, [selectedAgent, variantFlowId]);

  const platformFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPERATION_FLOWS.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q) ||
        f.steps.some(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q),
        )
      );
    });
  }, [category, query]);

  const platformActive = useMemo(() => {
    const hit = platformFiltered.find((f) => f.id === platformFlowId);
    return hit || platformFiltered[0] || OPERATION_FLOWS[0];
  }, [platformFiltered, platformFlowId]);

  const agentFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.display_name.toLowerCase().includes(q) ||
        a.template_id.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        a.voice?.toLowerCase().includes(q) ||
        agentPhones(a).some((p) => p.includes(q)),
    );
  }, [agents, query]);

  return (
    <div className="flex max-h-[calc(100dvh-7.5rem)] flex-col gap-4 sm:max-h-[calc(100dvh-6rem)]">
      <header className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 p-3 ring-1 ring-cyan-400/20">
            <GitBranch className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Flujos / Operación
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400 sm:text-base">
              Documentación de plantillas (no es el runtime en vivo de la instancia). Elige un
              agente de la empresa para ver la plantilla asociada, o explora los flujos de
              plataforma.
              {tenant?.name ? (
                <span className="text-slate-500"> · {tenant.name}</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              type="button"
              onClick={() => setMode("agents")}
              className={clsx(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none sm:px-4",
                mode === "agents"
                  ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/30"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Bot className="h-3.5 w-3.5" />
              Agentes de la empresa
            </button>
            <button
              type="button"
              onClick={() => setMode("platform")}
              className={clsx(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:flex-none sm:px-4",
                mode === "platform"
                  ? "bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/30"
                  : "text-slate-400 hover:text-slate-200",
              )}
            >
              <Workflow className="h-3.5 w-3.5" />
              Flujos de plataforma
            </button>
          </div>

          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input-field pl-9"
              placeholder={
                mode === "agents"
                  ? "Buscar agente, plantilla, DID o voz…"
                  : "Buscar flujo o paso…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          {mode === "platform" && (
            <div className="flex flex-wrap gap-1.5">
              {FLOW_CATEGORIES.map((c) => {
                const on = category === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategory(c.id)}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition",
                      on
                        ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/35"
                        : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200",
                    )}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {!tenantId ? (
        <div className="glass-card p-8 text-center text-slate-400">
          Selecciona una empresa en la barra de contexto para ver sus agentes y flujos.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(16rem,20rem)_1fr]">
          {/* Left: agents or platform flows */}
          <aside className="glass-card flex min-h-0 flex-col overflow-hidden p-3">
            {mode === "agents" ? (
              <>
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Agentes configurados
                  </p>
                  <Link
                    to="/my-agents"
                    className="text-[11px] text-cyan-400/90 hover:text-cyan-300"
                  >
                    Gestionar
                  </Link>
                </div>
                <nav className="list-scroll-panel space-y-1.5 pr-1">
                  {agentsLoading && (
                    <p className="px-2 py-6 text-center text-sm text-slate-500">Cargando…</p>
                  )}
                  {!agentsLoading && agentFiltered.length === 0 && (
                    <div className="space-y-3 px-2 py-6 text-center">
                      <p className="text-sm text-slate-500">
                        Esta empresa aún no tiene agentes configurados.
                      </p>
                      <Link to="/my-agents" className="btn-primary text-xs">
                        Ir a Mis agentes
                      </Link>
                    </div>
                  )}
                  {agentFiltered.map((agent) => {
                    const selected = agent.id === selectedAgentId;
                    const phones = agentPhones(agent);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgentId(agent.id);
                          setMode("agents");
                        }}
                        className={clsx(
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          selected
                            ? "border-cyan-400/40 bg-gradient-to-br from-cyan-500/15 to-violet-500/10 shadow-glow"
                            : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {agent.display_name}
                          </span>
                          <span
                            className={clsx(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                              statusStyle(agent.status),
                            )}
                          >
                            {agent.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {agentLabel(agent.template_id)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5">
                            <Mic className="h-2.5 w-2.5 text-cyan-400/80" />
                            {agent.voice || "—"}
                          </span>
                          {phones[0] && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5">
                              <Phone className="h-2.5 w-2.5 text-emerald-400/80" />
                              {phones[0]}
                              {phones.length > 1 ? ` +${phones.length - 1}` : ""}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </nav>
              </>
            ) : (
              <>
                <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {platformFiltered.length} flujo{platformFiltered.length === 1 ? "" : "s"}
                </p>
                <nav className="list-scroll-panel space-y-1.5 pr-1">
                  {platformFiltered.map((flow) => {
                    const selected = flow.id === platformActive?.id;
                    return (
                      <button
                        key={flow.id}
                        type="button"
                        onClick={() => setPlatformFlowId(flow.id)}
                        className={clsx(
                          "w-full rounded-2xl border px-3 py-3 text-left transition",
                          selected
                            ? "border-violet-400/35 bg-gradient-to-br from-violet-500/15 to-cyan-500/10 shadow-glow"
                            : "border-white/5 bg-white/[0.02] hover:border-white/10",
                        )}
                      >
                        <span className="block text-sm font-semibold text-slate-100">
                          {flow.title}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs text-slate-500">
                          {flow.summary}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </>
            )}
          </aside>

          {/* Right: interactive flow */}
          <section className="glass-card flex min-h-0 flex-col overflow-hidden">
            {mode === "agents" && selectedAgent && agentFlow ? (
              <>
                <div className="shrink-0 space-y-3 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 via-transparent to-violet-500/5 px-4 py-4 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/80">
                        Agente de la empresa · flujo interactivo
                      </p>
                      <h2 className="font-display text-lg font-semibold text-slate-50 sm:text-xl">
                        {selectedAgent.display_name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Plantilla <span className="text-slate-300">{agentLabel(selectedAgent.template_id)}</span>
                        {" · "}
                        Voz xAI <span className="text-slate-300">{selectedAgent.voice}</span>
                        {agentPhones(selectedAgent)[0]
                          ? ` · ${agentPhones(selectedAgent)[0]}`
                          : ""}
                      </p>
                    </div>
                    <Link
                      to="/my-agents"
                      className="btn-ghost text-xs"
                    >
                      Editar en Mis agentes
                    </Link>
                  </div>

                  {/* Variant flows for this agent template */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[10px] uppercase tracking-wide text-slate-500">
                      Flujo:
                    </span>
                    {related.map((f) => {
                      const on = variantFlowId === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setVariantFlowId(f.id)}
                          className={clsx(
                            "rounded-full px-3 py-1 text-xs font-medium transition",
                            on
                              ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/35"
                              : "bg-white/5 text-slate-400 hover:bg-white/10",
                          )}
                        >
                          {f.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="list-scroll-panel min-h-0 flex-1 p-3 sm:p-5">
                  <InteractiveFlow key={agentFlow.id} flow={agentFlow} />
                </div>
              </>
            ) : mode === "agents" && !agentsLoading && !agents.length ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <Bot className="h-10 w-10 text-slate-600" />
                <p className="text-slate-400">No hay agentes en esta empresa.</p>
                <Link to="/my-agents" className="btn-primary">
                  Configurar agentes
                </Link>
              </div>
            ) : mode === "platform" && platformActive ? (
              <>
                <div className="shrink-0 border-b border-white/5 px-4 py-4 sm:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">
                    Flujo de plataforma
                  </p>
                  <h2 className="font-display text-lg font-semibold text-slate-50 sm:text-xl">
                    {platformActive.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">{platformActive.summary}</p>
                </div>
                <div className="list-scroll-panel min-h-0 flex-1 p-3 sm:p-5">
                  <InteractiveFlow key={platformActive.id} flow={platformActive} />
                </div>
              </>
            ) : (
              <p className="p-8 text-center text-slate-500">Selecciona un agente o flujo.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
