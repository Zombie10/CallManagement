import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useUiLocale } from "../contexts/LocaleContext";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";

const SCOPE_IDS = ["calls.read", "customers.read", "appointments.read", "appointments.write"];

export function ApiKeysPanel() {
  const { t } = useUiLocale();
  const { tenantId } = useTenant();
  const qc = useQueryClient();
  const defaultName = t("api.defaultName");
  const appliedDefault = useRef(defaultName);
  const [name, setName] = useState(defaultName);
  const [scopes, setScopes] = useState(["calls.read", "customers.read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => {
    setName((current) => (current === appliedDefault.current ? defaultName : current));
    appliedDefault.current = defaultName;
  }, [defaultName]);

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
        <h2 className="font-display text-lg font-semibold">{t("api.title")}</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        {t("api.keysFor")} <code className="text-slate-300">/api/public/v1/*</code> {t("api.withHeader")}{" "}
        <code className="text-slate-300">X-Api-Key</code>.
      </p>

      {createdKey && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-200">{t("api.copyNow")}</p>
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
          placeholder={t("api.namePlaceholder")}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={create.isPending || !name.trim()}
          onClick={() => create.mutate()}
        >
          <Plus className="h-4 w-4" />
          {t("api.create")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {SCOPE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              setScopes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            className={`rounded-lg px-2 py-1 text-xs ${
              scopes.includes(id) ? "bg-cyan-500/20 text-cyan-200" : "bg-white/5 text-slate-500"
            }`}
          >
            {t(`api.scope.${id}`)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t("webhooks.loading")}</p>
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