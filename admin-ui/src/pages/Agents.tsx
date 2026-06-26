import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Bot,
  FileText,
  Globe,
  Mic,
  Network,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  api,
  type AgentProfile,
  type AgentProfileInput,
  type AgentsResponse,
  type VoiceLibraryEntry,
} from "../lib/api";
import clsx from "clsx";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  multi: "Multilingüe",
};

const PROVIDER_LABELS: Record<string, string> = {
  xai: "xAI / Grok",
  inference: "LiveKit Inference",
  direct: "Direct APIs",
};

const GENDER_LABELS: Record<string, string> = {
  female: "Femenina",
  male: "Masculina",
  neutral: "Neutra",
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  x_search: "X Search",
  file_search: "File Search",
  code_interpreter: "Code Interpreter",
};

function emptyDraft(): AgentProfileInput {
  return {
    name: "",
    display_name: "",
    provider: "xai",
    voice: "ara",
    locale: "es",
    voice_language: "",
    custom_instructions: "",
    tools: [],
    function_tools: [],
    mcp_servers: [],
    enabled: true,
  };
}

function filterVoices(
  library: VoiceLibraryEntry[],
  gender: string,
  ageGroup: string,
  language: string,
): VoiceLibraryEntry[] {
  return library.filter((v) => {
    if (gender && v.gender !== gender) return false;
    if (ageGroup && v.age_group !== ageGroup) return false;
    if (language && language !== "multi") {
      if (!v.languages.includes(language) && !v.languages.includes("multi")) return false;
    }
    return true;
  });
}

function AgentEditor({
  draft,
  catalog,
  mcpServerIds,
  defaultInstructions,
  isProtected,
  isNew,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  draft: AgentProfileInput;
  catalog: AgentsResponse["catalog"];
  mcpServerIds: string[];
  defaultInstructions: string;
  isProtected: boolean;
  isNew: boolean;
  onChange: (d: AgentProfileInput) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const [genderFilter, setGenderFilter] = useState("");
  const [ageFilter, setAgeFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [showDefaultInstructions, setShowDefaultInstructions] = useState(false);

  const filteredVoices = useMemo(
    () => filterVoices(catalog.voice_library || [], genderFilter, ageFilter, langFilter),
    [catalog.voice_library, genderFilter, ageFilter, langFilter],
  );

  const toggleTool = (tool: string) => {
    const tools = draft.tools || [];
    onChange({
      ...draft,
      tools: tools.includes(tool) ? tools.filter((t) => t !== tool) : [...tools, tool],
    });
  };

  const toggleFunctionTool = (tool: string) => {
    const fnTools = draft.function_tools || [];
    onChange({
      ...draft,
      function_tools: fnTools.includes(tool) ? fnTools.filter((t) => t !== tool) : [...fnTools, tool],
    });
  };

  const toggleMcp = (id: string) => {
    const servers = draft.mcp_servers || [];
    onChange({
      ...draft,
      mcp_servers: servers.includes(id) ? servers.filter((s) => s !== id) : [...servers, id],
    });
  };

  const voiceLanguage = draft.voice_language || "";
  const hasCustomInstructions = Boolean(draft.custom_instructions?.trim());

  return (
    <div className="glass-card space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2">
            <Bot className="h-5 w-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">
              {isNew ? "Nuevo agente" : draft.display_name || draft.name}
            </h2>
            {!isNew && <p className="text-sm text-slate-400">{draft.name}</p>}
          </div>
        </div>
        <button type="button" onClick={onCancel} className="btn-ghost px-2 py-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {isNew && (
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">ID</span>
            <input
              className="input-field"
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value.toLowerCase() })}
              placeholder="ej. billing"
            />
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Nombre</span>
          <input
            className="input-field"
            value={draft.display_name || ""}
            onChange={(e) => onChange({ ...draft, display_name: e.target.value })}
            placeholder="Nombre visible"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            <Mic className="mr-1 inline h-3 w-3" />
            Proveedor
          </span>
          <select
            className="input-field"
            value={draft.provider}
            onChange={(e) => onChange({ ...draft, provider: e.target.value })}
          >
            {catalog.available_providers.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p] || p}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            <Globe className="mr-1 inline h-3 w-3" />
            Idioma (texto / LLM)
          </span>
          <select
            className="input-field"
            value={draft.locale}
            onChange={(e) => onChange({ ...draft, locale: e.target.value })}
          >
            {catalog.available_locales.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l] || l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-3 self-end">
          <input
            type="checkbox"
            checked={draft.enabled !== false}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-white/20 bg-surface-800 text-cyan-500"
          />
          <span className="text-sm text-slate-300">Agente activo</span>
        </label>
      </div>

      {draft.provider === "xai" && (
        <div className="space-y-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Mic className="h-3 w-3" /> Voice Library — Built-in xAI
            </p>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Idioma voz (ASR)
              <select
                className="input-field w-auto py-1 text-xs"
                value={voiceLanguage}
                onChange={(e) => onChange({ ...draft, voice_language: e.target.value })}
              >
                <option value="">Heredar de locale</option>
                {(catalog.voice_language_options || []).map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              className="input-field w-auto py-1.5 text-xs"
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
            >
              <option value="">Género: todos</option>
              {(catalog.gender_options || []).map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g] || g}
                </option>
              ))}
            </select>
            <select
              className="input-field w-auto py-1.5 text-xs"
              value={ageFilter}
              onChange={(e) => setAgeFilter(e.target.value)}
            >
              <option value="">Edad: todas</option>
              {(catalog.age_group_options || []).map((a) => (
                <option key={a} value={a}>
                  {a === "adult" ? "Adulto" : a}
                </option>
              ))}
            </select>
            <select
              className="input-field w-auto py-1.5 text-xs"
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
            >
              <option value="">Idioma voz: todos</option>
              {(catalog.voice_language_options || []).map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filteredVoices.map((v) => {
              const selected = draft.voice === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onChange({ ...draft, voice: v.id })}
                  className={clsx(
                    "rounded-xl border p-3 text-left transition",
                    selected
                      ? "border-cyan-400/40 bg-cyan-500/10 ring-1 ring-cyan-400/30"
                      : "border-white/5 bg-white/[0.02] hover:border-white/10",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">{v.name}</span>
                    <span className="text-xs text-slate-500">{GENDER_LABELS[v.gender] || v.gender}</span>
                  </div>
                  <p className="mt-1 text-xs text-cyan-300/80">{v.tone}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{v.description}</p>
                </button>
              );
            })}
            {!filteredVoices.length && (
              <p className="col-span-full text-sm text-slate-500">Ninguna voz coincide con los filtros.</p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <FileText className="h-3 w-3" /> Instrucciones del agente
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs"
              onClick={() => setShowDefaultInstructions((v) => !v)}
            >
              {showDefaultInstructions ? "Ocultar default" : "Ver default xAI"}
            </button>
            {hasCustomInstructions && (
              <button
                type="button"
                className="btn-ghost px-2 py-1 text-xs text-amber-300"
                onClick={() => onChange({ ...draft, custom_instructions: "" })}
              >
                <RotateCcw className="mr-1 inline h-3 w-3" />
                Restaurar default
              </button>
            )}
          </div>
        </div>
        {showDefaultInstructions && (
          <pre className="max-h-40 overflow-y-auto rounded-lg bg-black/30 p-3 text-xs text-slate-400 whitespace-pre-wrap">
            {defaultInstructions}
          </pre>
        )}
        <textarea
          className="input-field min-h-[160px] resize-y font-mono text-sm"
          value={draft.custom_instructions || ""}
          onChange={(e) => onChange({ ...draft, custom_instructions: e.target.value })}
          placeholder="Vacío = usar instrucciones generadas por xAI/LiveKit. Puedes agregar o reemplazar el comportamiento del agente."
        />
        <p className="text-xs text-slate-500">
          {hasCustomInstructions
            ? "Usando instrucciones personalizadas (se añaden reglas de idioma y routing automáticamente)."
            : "Usando instrucciones por defecto del sistema."}
        </p>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <ArrowRightLeft className="h-3 w-3" /> Function Tools — Handoffs & CRM
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Transferencias entre agentes y acciones CRM. Requeridos para redireccionar en texto y voz.
        </p>
        <div className="flex flex-wrap gap-2">
          {(catalog.function_tool_catalog || []).map((tool) => {
            const active = (draft.function_tools || []).includes(tool.id);
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => toggleFunctionTool(tool.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {tool.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Wrench className="h-3 w-3" /> xAI Built-in Tools
        </p>
        <div className="flex flex-wrap gap-2">
          {catalog.available_tools.map((tool) => {
            const active = (draft.tools || []).includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() => toggleTool(tool)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {TOOL_LABELS[tool] || tool}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Network className="h-3 w-3" /> Remote MCP Servers
        </p>
        {mcpServerIds.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay servidores MCP configurados. Añádelos en Configuración → Remote MCP.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mcpServerIds.map((id) => {
              const active = (draft.mcp_servers || []).includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleMcp(id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-violet-500/20 text-violet-200 ring-1 ring-violet-400/30"
                      : "bg-white/5 text-slate-400 hover:bg-white/10"
                  }`}
                >
                  {id}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/5 pt-4">
        <button type="button" onClick={onSave} disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        {!isNew && !isProtected && onDelete && (
          <button type="button" onClick={onDelete} className="btn-ghost ml-auto text-red-400 hover:text-red-300">
            <Trash2 className="h-4 w-4" />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

export function Agents() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agents"], queryFn: api.agents });
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<AgentProfileInput>(emptyDraft());

  const saveMutation = useMutation({
    mutationFn: ({ name, payload }: { name: string; payload: AgentProfileInput }) =>
      api.saveAgent(name, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setEditing(null);
      setCreating(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: AgentProfileInput) => api.createAgent(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setCreating(false);
      setDraft(emptyDraft());
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteAgent(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setEditing(null);
    },
  });

  const startEdit = (profile: AgentProfile) => {
    setCreating(false);
    setEditing(profile.name);
    setDraft({
      name: profile.name,
      display_name: profile.display_name,
      provider: profile.provider,
      voice: profile.voice,
      locale: profile.locale,
      voice_language: profile.voice_language || "",
      custom_instructions: profile.custom_instructions || "",
      tools: profile.tools,
      function_tools: profile.function_tools || [],
      mcp_servers: profile.mcp_servers,
      enabled: profile.enabled,
    });
  };

  const startCreate = () => {
    setEditing(null);
    setCreating(true);
    setDraft(emptyDraft());
  };

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando agentes...</div>;
  }

  const { catalog, mcp_server_ids: mcpServerIds } = data;

  if (creating || editing) {
    const isNew = creating;
    const name = isNew ? draft.name : editing!;
    const profile = data.profiles.find((p) => p.name === name);
    const defaultInstructions = profile?.default_instructions || "";

    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold">Agentes & Tools</h1>
          <p className="mt-1 text-slate-400">
            Voz xAI, instrucciones, handoffs, tools y MCP por agente
          </p>
        </header>
        <AgentEditor
          draft={draft}
          catalog={catalog}
          mcpServerIds={mcpServerIds}
          defaultInstructions={defaultInstructions}
          isProtected={catalog.protected_agents.includes(name)}
          isNew={isNew}
          onChange={setDraft}
          onSave={() => {
            if (isNew) {
              createMutation.mutate(draft);
            } else {
              saveMutation.mutate({ name, payload: draft });
            }
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDelete={
            !isNew && !catalog.protected_agents.includes(name)
              ? () => {
                  if (confirm(`¿Eliminar agente "${name}"?`)) {
                    deleteMutation.mutate(name);
                  }
                }
              : undefined
          }
          saving={saveMutation.isPending || createMutation.isPending}
        />
      </div>
    );
  }

  const fnLabelById = Object.fromEntries(
    (catalog.function_tool_catalog || []).map((t) => [t.id, t.label]),
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Agentes & Tools</h1>
          <p className="mt-1 text-slate-400">
            Perfiles de voz, instrucciones, handoffs, xAI tools y MCP
          </p>
        </div>
        <button type="button" onClick={startCreate} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nuevo agente
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((profile) => {
          const voiceEntry = (catalog.voice_library || []).find((v) => v.id === profile.voice);
          return (
            <button
              key={profile.name}
              type="button"
              onClick={() => startEdit(profile)}
              className="glass-card group p-6 text-left transition hover:ring-1 hover:ring-cyan-400/20"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-xl bg-cyan-500/10 p-2">
                  <Bot className="h-5 w-5 text-cyan-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-semibold">
                    {profile.display_name || profile.name}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {PROVIDER_LABELS[profile.provider] || profile.provider}
                    {profile.provider === "xai" &&
                      ` · ${voiceEntry?.name || profile.voice}`}
                    {" · "}
                    {LOCALE_LABELS[profile.locale] || profile.locale}
                    {profile.has_custom_instructions && " · instrucciones custom"}
                  </p>
                </div>
                {!profile.enabled && (
                  <span className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300">Off</span>
                )}
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                    <ArrowRightLeft className="h-3 w-3" /> Handoffs
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.function_tools || [])
                      .filter((t) => t.startsWith("to_"))
                      .map((t) => (
                        <span key={t} className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                          {fnLabelById[t] || t}
                        </span>
                      ))}
                    {!(profile.function_tools || []).some((t) => t.startsWith("to_")) && (
                      <span className="text-slate-500">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                    <Wrench className="h-3 w-3" /> xAI Tools
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.tools.map((t) => (
                      <span key={t} className="rounded-lg bg-white/5 px-2 py-1 text-xs text-cyan-200">
                        {TOOL_LABELS[t] || t}
                      </span>
                    ))}
                    {!profile.tools.length && <span className="text-slate-500">—</span>}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-xs text-cyan-400/0 transition group-hover:text-cyan-400/80">
                Clic para editar →
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}