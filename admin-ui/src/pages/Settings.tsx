import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { Select } from "../components/Select";
import { api, type SettingField } from "../lib/api";
import { ApiKeysPanel } from "../components/ApiKeysPanel";
import { WebhookAuditPanel } from "../components/WebhookAuditPanel";
import { WebhooksPanel } from "../components/WebhooksPanel";
import { useAuth } from "../contexts/AuthContext";

const SECTION_LABELS: Record<string, string> = {
  livekit: "LiveKit",
  xai_models: "xAI / Grok Models",
  xai_tools: "xAI Built-in Tools",
  xai_mcp: "Remote MCP",
  inference: "LiveKit Inference",
  telephony: "Telefonía SIP",
  application: "Aplicación",
  notifications: "Notificaciones",
};

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "boolean") {
    return (
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          className="h-4 w-4 rounded border-white/20 bg-surface-800 text-cyan-500"
        />
        <span className="text-sm text-slate-300">{value === "true" ? "Activado" : "Desactivado"}</span>
      </label>
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <Select
        value={value}
        onChange={onChange}
        options={field.options.map((opt) => ({ value: opt, label: opt }))}
      />
    );
  }
  if (field.type === "json") {
    return (
      <textarea
        className="input-field min-h-[120px] font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='[{"id":"deepwiki","server_url":"https://..."}]'
      />
    );
  }
  return (
    <input
      className="input-field"
      type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
      value={value}
      placeholder={field.is_secret && field.has_value ? "Dejar vacío para mantener" : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => api.saveSettings(draft),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      setDraft({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">Cargando configuración...</div>;
  }

  const getValue = (field: SettingField) =>
    draft[field.key] !== undefined ? draft[field.key] : field.value;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Configuración</h1>
          <p className="mt-1 text-sm text-slate-400">Archivo: {data.env_path}</p>
        </div>
        <button
          className="btn-primary"
          disabled={Object.keys(draft).length === 0 || save.isPending}
          onClick={() => save.mutate()}
        >
          <Save className="h-4 w-4" />
          {save.isPending ? "Guardando..." : saved ? "Guardado ✓" : "Guardar cambios"}
        </button>
      </header>

      {(user?.role === "super_admin" || user?.role === "admin") && (
        <>
          <WebhooksPanel />
          <WebhookAuditPanel />
        </>
      )}
      {user?.role === "super_admin" && <ApiKeysPanel />}

      {Object.entries(data.sections).map(([sectionId, fields]) => (
        <section key={sectionId} className="glass-card p-6">
          <div className="mb-5 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">{SECTION_LABELS[sectionId] || sectionId}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">{field.label}</label>
                <p className="mb-2 font-mono text-xs text-slate-500">{field.key}</p>
                <FieldInput
                  field={field}
                  value={getValue(field)}
                  onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}