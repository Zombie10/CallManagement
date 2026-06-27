import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

const SCOPE_OPTIONS = [
  { id: "calls.read", label: "Leer llamadas" },
  { id: "customers.read", label: "Leer clientes" },
  { id: "appointments.read", label: "Leer citas" },
  { id: "appointments.write", label: "Crear citas" },
];

export function ApiKeysPanel() {
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("Integración");
  const [scopes, setScopes] = useState(["calls.read", "customers.read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["api-keys", tenantId],
    queryFn: api.listApiKeys,
    enabled: !!tenantId,
  });

  const create = useMutation({
    mutationFn: () => api.createApiKey({ name, scopes }),
    onSuccess: (res) => {
      setCreatedKey(res.api_key);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  if (!tenantId) return null;

  return (
    <section className="glass-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Key className="h-5 w-5 text-cyan-400" />
        <h2 className="font-display text-lg font-semibold">API pública</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Claves para <code className="text-slate-300">/api/public/v1/*</code> con header{" "}
        <code className="text-slate-300">X-Api-Key</code>.
      </p>

      {createdKey && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-200">Copia esta clave ahora — no se volverá a mostrar:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all font-mono text-xs text-slate-200">{createdKey}</code>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => navigator.clipboard.writeText(createdKey)}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input-field min-w-[180px] flex-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la clave"
        />
        <button
          type="button"
          className="btn-primary"
          disabled={create.isPending || !name.trim()}
          onClick={() => create.mutate()}
        >
          <Plus className="h-4 w-4" />
          Crear clave
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SCOPE_OPTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              setScopes((prev) =>
                prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
              )
            }
            className={`rounded-lg px-2 py-1 text-xs ${
              scopes.includes(s.id) ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-500"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <ul className="space-y-2">
          {data?.api_keys.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-xs text-slate-500">{k.key_prefix}…</p>
                <p className="text-xs text-slate-600">{k.scopes.join(", ")}</p>
              </div>
              <button type="button" className="btn-ghost text-red-300" onClick={() => revoke.mutate(k.id)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}