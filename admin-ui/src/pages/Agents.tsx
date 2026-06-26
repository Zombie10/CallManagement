import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Globe, Mic, Network, Plus, Save, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import { api, type AgentProfile, type AgentProfileInput, type AgentsResponse } from "../lib/api";

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

const VOICE_LABELS: Record<string, string> = {
  eve: "Eve (energética)",
  ara: "Ara (cálida)",
  rex: "Rex (profesional)",
  sal: "Sal (versátil)",
  leo: "Leo (autoritaria)",
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
    voice: "Ara",
    locale: "es",
    tools: [],
    mcp_servers: [],
    enabled: true,
  };
}

function AgentEditor({
  draft,
  catalog,
  mcpServerIds,
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
  isProtected: boolean;
  isNew: boolean;
  onChange: (d: AgentProfileInput) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const toggleTool = (tool: string) => {
    const tools = draft.tools || [];
    onChange({
      ...draft,
      tools: tools.includes(tool) ? tools.filter((t) => t !== tool) : [...tools, tool],
    });
  };

  const toggleMcp = (id: string) => {
    const servers = draft.mcp_servers || [];
    onChange({
      ...draft,
      mcp_servers: servers.includes(id) ? servers.filter((s) => s !== id) : [...servers, id],
    });
  };

  return (
    <div className="glass-card space-y-5 p-6">
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
        {draft.provider === "xai" && (
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Voz xAI
            </span>
            <select
              className="input-field"
              value={draft.voice}
              onChange={(e) => onChange({ ...draft, voice: e.target.value })}
            >
              {catalog.available_xai_voices.map((v) => (
                <option key={v} value={v}>
                  {VOICE_LABELS[v] || v}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            <Globe className="mr-1 inline h-3 w-3" />
            Idioma
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
    setDraft({ ...profile });
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
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-3xl font-semibold">Agentes & Tools</h1>
          <p className="mt-1 text-slate-400">
            Configura proveedor xAI, voz, idioma, tools y MCP por agente
          </p>
        </header>
        <AgentEditor
          draft={draft}
          catalog={catalog}
          mcpServerIds={mcpServerIds}
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Agentes & Tools</h1>
          <p className="mt-1 text-slate-400">
            Perfiles de voz, xAI tools y Remote MCP por agente
          </p>
        </div>
        <button type="button" onClick={startCreate} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nuevo agente
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {data.profiles.map((profile) => (
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
                  {profile.provider === "xai" && ` · ${profile.voice}`}
                  {" · "}
                  {LOCALE_LABELS[profile.locale] || profile.locale}
                </p>
              </div>
              {!profile.enabled && (
                <span className="rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300">Off</span>
              )}
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                  <Wrench className="h-3 w-3" /> Tools
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
              <div>
                <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500">
                  <Network className="h-3 w-3" /> MCP
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.mcp_servers.map((t) => (
                    <span key={t} className="rounded-lg bg-violet-500/10 px-2 py-1 text-xs text-violet-200">
                      {t}
                    </span>
                  ))}
                  {!profile.mcp_servers.length && <span className="text-slate-500">—</span>}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-cyan-400/0 transition group-hover:text-cyan-400/80">
              Clic para editar →
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}