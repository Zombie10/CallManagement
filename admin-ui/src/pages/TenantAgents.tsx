import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Clock,
  Copy,
  Info,
  Loader2,
  Mic,
  Phone,
  Plus,
  Radio,
  Save,
  Terminal,
  Trash2,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Select } from "../components/Select";
import { useTenant } from "../contexts/TenantContext";
import { AGENT_OPTIONS, agentLabel } from "../lib/agents";
import {
  api,
  type AgentInstanceInput,
  type AgentInstanceRecord,
  type ScheduleStatus,
  type TelephonyProvisionResult,
} from "../lib/api";
import { TELEPHONY_MODE_STYLES } from "../lib/telephony";
import { voiceSelectOptions } from "../lib/voices";
import clsx from "clsx";

const STATUS_OPTIONS = [
  { value: "draft", label: "Borrador", description: "En configuración" },
  { value: "active", label: "Activo", description: "Recibe llamadas" },
  { value: "paused", label: "Pausado", description: "Sin llamadas" },
];

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const SCHEDULE_BADGE: Record<ScheduleStatus, { label: string; className: string }> = {
  open: { label: "Abierto", className: "bg-emerald-500/15 text-emerald-300" },
  closed: { label: "Cerrado", className: "bg-red-500/15 text-red-300" },
  always: { label: "24/7", className: "bg-slate-500/15 text-slate-400" },
};

const CHANNEL_META: Record<string, { icon: typeof Terminal; title: string }> = {
  console_local: { icon: Terminal, title: "Consola" },
  playground_xai: { icon: Zap, title: "xAI" },
  playground_livekit: { icon: Radio, title: "LK prod." },
  pstn_livekit: { icon: Phone, title: "PSTN" },
};

function TelephonyChannels({ agent }: { agent: AgentInstanceRecord }) {
  const telephony = agent.telephony;
  if (!telephony) return null;
  const modeStyle = TELEPHONY_MODE_STYLES[telephony.mode];

  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
      <span
        className={clsx(
          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          modeStyle.className,
        )}
      >
        {telephony.mode_label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {telephony.channels.map((ch) => {
          const meta = CHANNEL_META[ch.id];
          const Icon = meta?.icon || Wifi;
          return (
            <span
              key={ch.id}
              title={ch.description}
              className={clsx(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px]",
                ch.available
                  ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                  : "border-white/5 bg-white/[0.02] text-slate-600",
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {meta?.title || ch.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

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
    phone_numbers: [],
    custom_instructions: "",
    tools: [],
    function_tools: [],
    max_concurrent_calls: null,
    phone_limits: {},
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
  const phones = agent.phone_numbers?.length
    ? agent.phone_numbers
    : agent.phone_number
      ? [agent.phone_number]
      : [];
  const sched = agent.schedule_status ? SCHEDULE_BADGE[agent.schedule_status] : null;

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
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs uppercase tracking-wide text-slate-500">{agent.status}</span>
          {sched && agent.status === "active" && (
            <span className={clsx("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", sched.className)}>
              <Clock className="h-3 w-3" />
              {sched.label}
            </span>
          )}
        </div>
      </div>
      {phones.length > 0 && (
        <div className="mt-3 space-y-1">
          {phones.map((num) => {
            const detail = agent.telephony?.phones.find((p) => p.phone_number === num);
            return (
              <p key={num} className="flex flex-wrap items-center gap-1.5 text-sm text-cyan-200/90">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {num}
                {detail?.is_demo && (
                  <span className="rounded bg-violet-500/15 px-1.5 text-[10px] text-violet-300">demo</span>
                )}
                {detail?.is_livekit_phone_number && detail.dispatch_assigned && (
                  <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">dispatch OK</span>
                )}
                {detail?.is_livekit_phone_number && !detail.dispatch_assigned && (
                  <span className="rounded bg-amber-500/15 px-1.5 text-[10px] text-amber-300">sin dispatch</span>
                )}
              </p>
            );
          })}
        </div>
      )}
      <TelephonyChannels agent={agent} />
      <p className="mt-2 text-xs text-slate-500">
        {agent.call_count_today ?? 0} llamadas hoy · {agent.locale.toUpperCase()}
        {agent.max_concurrent_calls != null && (
          <> · máx. {agent.max_concurrent_calls} simultáneas</>
        )}
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
  const { data: agentsCatalog } = useQuery({ queryKey: ["agents"], queryFn: api.agents });
  const voiceOptions = useMemo(
    () => voiceSelectOptions(agentsCatalog?.catalog.voice_library || []),
    [agentsCatalog?.catalog.voice_library],
  );
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: () => api.listTenantAgents(tenantId),
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  useEffect(() => {
    setEditing(null);
    setIsNew(false);
    setProvisionNotes(null);
  }, [tenantId]);
  const [editing, setEditing] = useState<AgentInstanceRecord | null>(null);
  const [draft, setDraft] = useState<AgentInstanceInput>(emptyAgent());
  const [isNew, setIsNew] = useState(false);
  const [schedules, setSchedules] = useState<Array<{ day_of_week: number; start_time: string; end_time: string }>>([]);
  const [extraPhones, setExtraPhones] = useState<string[]>([]);
  const [phoneLimits, setPhoneLimits] = useState<Record<string, string>>({});
  const [provisionNotes, setProvisionNotes] = useState<TelephonyProvisionResult[] | null>(null);

  const buildPayload = (): AgentInstanceInput => {
    const primary = (draft.phone_number || "").trim();
    const extras = extraPhones.map((p) => p.trim()).filter(Boolean);
    const all = [...new Set([primary, ...extras].filter(Boolean))];
    const limits: Record<string, number | null> = {};
    for (const num of all) {
      const raw = phoneLimits[num];
      if (raw != null && raw !== "") {
        const parsed = Number(raw);
        if (!Number.isNaN(parsed) && parsed > 0) limits[num] = parsed;
      }
    }
    return {
      ...draft,
      phone_number: all[0] || null,
      phone_numbers: all,
      phone_limits: limits,
      max_concurrent_calls: draft.max_concurrent_calls ?? null,
    };
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (isNew) return api.createTenantAgent(payload);
      if (!editing) throw new Error("Sin agente");
      const saved = await api.updateTenantAgent(editing.id, payload);
      await api.saveAgentSchedules(editing.id, schedules);
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["tenant-agents"] });
      if (saved.telephony_provision?.length) {
        setProvisionNotes(saved.telephony_provision);
      }
      if (!isNew) {
        setEditing(null);
      }
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
    setExtraPhones([]);
    setPhoneLimits({});
    setProvisionNotes(null);
  };

  const openEdit = async (agent: AgentInstanceRecord) => {
    setIsNew(false);
    setEditing(agent);
    setProvisionNotes(null);
    setDraft({
      slug: agent.slug,
      display_name: agent.display_name,
      template_id: agent.template_id,
      status: agent.status,
      phone_number: agent.phone_number || agent.phone_numbers?.[0] || "",
      phone_numbers: agent.phone_numbers || [],
      sip_trunk_id: agent.sip_trunk_id || "",
      provider: agent.provider,
      voice: agent.voice,
      locale: agent.locale,
      voice_language: agent.voice_language || "",
      custom_instructions: agent.custom_instructions || "",
      tools: agent.tools || [],
      function_tools: agent.function_tools || [],
      brand_name: agent.brand_name,
      max_concurrent_calls: agent.max_concurrent_calls ?? null,
    });
    const phones = agent.phone_numbers?.length
      ? agent.phone_numbers
      : agent.phone_number
        ? [agent.phone_number]
        : [];
    setExtraPhones(phones.slice(1));
    const limits: Record<string, string> = {};
    for (const route of agent.phone_routes || []) {
      if (route.max_concurrent_calls != null) {
        limits[route.phone_number] = String(route.max_concurrent_calls);
      }
    }
    for (const [num, cap] of Object.entries(agent.phone_limits || {})) {
      if (cap != null) limits[num] = String(cap);
    }
    setPhoneLimits(limits);
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

  const agentsForTenant =
    data?.tenant?.id === tenantId ? data.agents : undefined;
  const showLoading = !tenantId || isLoading || (isFetching && !agentsForTenant);

  if (showLoading && !agentsForTenant?.length) {
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
            {isFetching && <span className="ml-2 text-cyan-400/80">actualizando…</span>}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nuevo agente
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(agentsForTenant || []).map((agent) => (
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
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Máx. llamadas simultáneas (agente)
              </span>
              <input
                className="input-field w-full"
                type="number"
                min={1}
                placeholder="Sin límite propio (usa solo el de empresa)"
                value={draft.max_concurrent_calls ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    max_concurrent_calls: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
              />
              <p className="text-xs text-slate-500">
                Ej.: banco 8, recepción 4. Vacío = solo aplica el límite global de la empresa.
              </p>
            </label>
            <div className="rounded-xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs text-cyan-100/90">
              <p className="flex items-center gap-1.5 font-medium text-cyan-200">
                <Info className="h-3.5 w-3.5" />
                Canales de prueba vs producción
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-slate-400">
                <li>
                  <strong className="text-slate-300">Consola local</strong> — terminal, sin LiveKit Cloud
                </li>
                <li>
                  <strong className="text-slate-300">Admin · xAI directo</strong> — solo voz Grok
                </li>
                <li>
                  <strong className="text-slate-300">Admin · LiveKit producción</strong> — misma pipeline que PSTN
                </li>
                <li>
                  <strong className="text-slate-300">Teléfono PSTN</strong> — requiere DID real y worker activo
                </li>
              </ul>
              <p className="mt-2 text-slate-500">
                Si el número es un <strong className="text-slate-400">LiveKit Phone Number</strong> del proyecto,
                al guardar se crea y asigna la dispatch rule automáticamente.
              </p>
            </div>

            {provisionNotes && provisionNotes.length > 0 && (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-xs">
                <p className="font-medium text-emerald-200">Telefonía LiveKit</p>
                <ul className="mt-1 space-y-1 text-slate-300">
                  {provisionNotes.map((note) => (
                    <li key={note.phone}>
                      <span className="font-mono text-cyan-200">{note.phone}</span>: {note.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Phone className="h-3 w-3" />
                Teléfono principal (E.164)
              </span>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  placeholder="+50255551234"
                  value={draft.phone_number || ""}
                  onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))}
                />
                <input
                  className="input-field w-24"
                  type="number"
                  min={1}
                  title="Límite por número"
                  placeholder="Máx."
                  value={phoneLimits[(draft.phone_number || "").trim()] || ""}
                  onChange={(e) => {
                    const num = (draft.phone_number || "").trim();
                    if (!num) return;
                    setPhoneLimits((prev) => ({ ...prev, [num]: e.target.value }));
                  }}
                />
              </div>
            </label>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Números adicionales (DID)
              </p>
              {extraPhones.map((num, i) => (
                <div key={i} className="mb-2 flex gap-2">
                  <input
                    className="input-field flex-1"
                    placeholder="+50255559999"
                    value={num}
                    onChange={(e) => {
                      const next = [...extraPhones];
                      const old = next[i]?.trim();
                      const value = e.target.value;
                      next[i] = value;
                      setExtraPhones(next);
                      if (old && old !== value.trim()) {
                        setPhoneLimits((prev) => {
                          const copy = { ...prev };
                          if (old in copy) {
                            copy[value.trim()] = copy[old];
                            delete copy[old];
                          }
                          return copy;
                        });
                      }
                    }}
                  />
                  <input
                    className="input-field w-24"
                    type="number"
                    min={1}
                    title="Límite por número"
                    placeholder="Máx."
                    value={phoneLimits[num.trim()] || ""}
                    onChange={(e) =>
                      setPhoneLimits((prev) => ({ ...prev, [num.trim()]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn-ghost px-2 text-red-300"
                    onClick={() => setExtraPhones(extraPhones.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setExtraPhones([...extraPhones, ""])}
              >
                + Otro número
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Mic className="h-3 w-3" />
                Voz
              </span>
              <Select
                className="w-full"
                value={draft.voice || "ara"}
                onChange={(v) => setDraft((d) => ({ ...d, voice: v }))}
                options={voiceOptions}
                placeholder="Seleccionar voz…"
              />
            </label>
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