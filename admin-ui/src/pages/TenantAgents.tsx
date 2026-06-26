import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Copy,
  Loader2,
  Mic,
  Phone,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Select } from "../components/Select";
import { useTenant } from "../contexts/TenantContext";
import { AGENT_OPTIONS, agentLabel } from "../lib/agents";
import { api, type AgentInstanceInput, type AgentInstanceRecord } from "../lib/api";
import clsx from "clsx";

const STATUS_OPTIONS = [
  { value: "draft", label: "Borrador", description: "En configuración" },
  { value: "active", label: "Activo", description: "Recibe llamadas" },
  { value: "paused", label: "Pausado", description: "Sin llamadas" },
];

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function emptyAgent(): AgentInstanceInput {
  return {
    slug: "",
    display_name: "",
    template_id: "receptionist",
    status: "draft",
    provider: "xai",
    voice: "ara",
    locale: "es",
    phone_number: "",
    custom_instructions: "",
    tools: [],
    function_tools: [],
  };
}

function AgentCard({
  agent,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  agent: AgentInstanceRecord;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const statusColor =
    agent.status === "active"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : agent.status === "paused"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-white/10 bg-white/[0.02]";

  return (
    <button
      type="button"
      onClick={onEdit}
      className={clsx(
        "glass-card group w-full p-5 text-left transition hover:ring-1 hover:ring-cyan-400/25",
        statusColor,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
            <Bot className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <p className="font-medium text-slate-100">{agent.display_name}</p>
            <p className="text-xs text-slate-500">{agentLabel(agent.template_id)} · {agent.voice}</p>
          </div>
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500">{agent.status}</span>
      </div>
      {agent.phone_number && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-cyan-200/90">
          <Phone className="h-3.5 w-3.5" />
          {agent.phone_number}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {agent.call_count_today ?? 0} llamadas hoy · {agent.locale.toUpperCase()}
      </p>
      <div className="mt-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <span className="btn-ghost px-2 py-1 text-xs" onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
          <Copy className="h-3 w-3" />
        </span>
        <span className="btn-ghost px-2 py-1 text-xs text-red-300" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

export function TenantAgents() {
  const queryClient = useQueryClient();
  const { tenant, tenantId, isSuperAdmin, setTenantId } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: api.listTenantAgents,
    enabled: !!tenantId,
  });
  const [editing, setEditing] = useState<AgentInstanceRecord | null>(null);
  const [draft, setDraft] = useState<AgentInstanceInput>(emptyAgent());
  const [isNew, setIsNew] = useState(false);
  const [schedules, setSchedules] = useState<Array<{ day_of_week: number; start_time: string; end_time: string }>>([]);

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) return api.createTenantAgent(draft);
      if (!editing) throw new Error("Sin agente");
      const saved = await api.updateTenantAgent(editing.id, draft);
      if (schedules.length) await api.saveAgentSchedules(editing.id, schedules);
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-agents"] });
      setEditing(null);
      setIsNew(false);
    },
  });

  const duplicate = useMutation({
    mutationFn: (agent: AgentInstanceRecord) =>
      api.duplicateTenantAgent(agent.id, {
        slug: `${agent.slug}-copy`,
        display_name: `${agent.display_name} (copia)`,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant-agents"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTenantAgent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant-agents"] }),
  });

  const openNew = () => {
    setIsNew(true);
    setEditing(null);
    setDraft(emptyAgent());
    setSchedules([]);
  };

  const openEdit = async (agent: AgentInstanceRecord) => {
    setIsNew(false);
    setEditing(agent);
    setDraft({
      slug: agent.slug,
      display_name: agent.display_name,
      template_id: agent.template_id,
      status: agent.status,
      phone_number: agent.phone_number || "",
      sip_trunk_id: agent.sip_trunk_id || "",
      provider: agent.provider,
      voice: agent.voice,
      locale: agent.locale,
      voice_language: agent.voice_language || "",
      custom_instructions: agent.custom_instructions || "",
      tools: agent.tools || [],
      function_tools: agent.function_tools || [],
      brand_name: agent.brand_name,
    });
    const sched = await api.getAgentSchedules(agent.id);
    setSchedules(sched.schedules.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })));
  };

  if (!tenantId) {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        {isSuperAdmin ? "Selecciona una empresa en Orquestador → Gestionar" : "Sin empresa asignada"}
      </div>
    );
  }

  if (isLoading) {
    return <div className="glass-card p-8 text-slate-400">Cargando agentes…</div>;
  }

  const showEditor = isNew || editing;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Mis agentes</h1>
          <p className="mt-1 text-slate-400">
            {tenant?.name || data?.tenant.name} — cada agente con su voz, teléfono y base de datos aislada
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nuevo agente
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.agents || []).map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onEdit={() => openEdit(agent)}
            onDuplicate={() => duplicate.mutate(agent)}
            onDelete={() => remove.mutate(agent.id)}
          />
        ))}
        <button
          type="button"
          onClick={openNew}
          className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-slate-500 transition hover:border-cyan-400/30 hover:text-cyan-300"
        >
          <Plus className="mb-2 h-8 w-8" />
          Agregar agente
        </button>
      </div>

      {showEditor && (
        <div className="glass-card fixed inset-x-4 bottom-4 top-auto z-40 max-h-[85vh] overflow-y-auto p-6 shadow-2xl md:inset-x-auto md:right-6 md:top-20 md:w-[480px]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{isNew ? "Nuevo agente" : "Editar agente"}</h2>
            <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setIsNew(false); }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <input
              className="input-field w-full"
              placeholder="Nombre visible"
              value={draft.display_name}
              onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
            />
            {isNew && (
              <input
                className="input-field w-full"
                placeholder="slug-interno"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
              />
            )}
            <Select
              className="w-full"
              value={draft.template_id}
              onChange={(v) => setDraft((d) => ({ ...d, template_id: v }))}
              options={AGENT_OPTIONS}
              disabled={!isNew}
            />
            <Select
              className="w-full"
              value={draft.status || "draft"}
              onChange={(v) => setDraft((d) => ({ ...d, status: v }))}
              options={STATUS_OPTIONS}
            />
            <div className="flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Teléfono E.164"
                value={draft.phone_number || ""}
                onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))}
              />
              <input
                className="input-field w-24"
                placeholder="Voz"
                value={draft.voice}
                onChange={(e) => setDraft((d) => ({ ...d, voice: e.target.value }))}
              />
            </div>
            <textarea
              className="input-field min-h-[100px] w-full font-mono text-xs"
              placeholder="Instrucciones personalizadas (opcional)"
              value={draft.custom_instructions || ""}
              onChange={(e) => setDraft((d) => ({ ...d, custom_instructions: e.target.value }))}
            />

            {!isNew && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Horario (opcional)</p>
                <div className="space-y-2">
                  {schedules.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <select
                        className="input-field w-20"
                        value={s.day_of_week}
                        onChange={(e) => {
                          const next = [...schedules];
                          next[i] = { ...s, day_of_week: Number(e.target.value) };
                          setSchedules(next);
                        }}
                      >
                        {DAY_LABELS.map((l, di) => (
                          <option key={di} value={di}>{l}</option>
                        ))}
                      </select>
                      <input className="input-field w-24" value={s.start_time} onChange={(e) => {
                        const next = [...schedules];
                        next[i] = { ...s, start_time: e.target.value };
                        setSchedules(next);
                      }} />
                      <span className="text-slate-500">—</span>
                      <input className="input-field w-24" value={s.end_time} onChange={(e) => {
                        const next = [...schedules];
                        next[i] = { ...s, end_time: e.target.value };
                        setSchedules(next);
                      }} />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setSchedules([...schedules, { day_of_week: 1, start_time: "09:00", end_time: "17:00" }])}
                  >
                    + Franja horaria
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn-primary w-full"
              disabled={save.isPending || !draft.display_name || (isNew && !draft.slug)}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}