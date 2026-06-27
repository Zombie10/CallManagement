import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Loader2, Phone, Radio, Route, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";
import clsx from "clsx";

const STEPS = [
  { id: 1, title: "Worker LiveKit", icon: Radio },
  { id: 2, title: "Dispatch rule", icon: Route },
  { id: 3, title: "DID en agente", icon: Phone },
  { id: 4, title: "Probar llamada", icon: Settings2 },
];

const DISPATCH_JSON = `{
  "name": "Call Management inbound",
  "rule": { "dispatchRuleIndividual": { "roomPrefix": "call-" } },
  "inboundNumbers": ["+15109379101"],
  "roomConfig": {
    "agents": [{ "agentName": "call-management" }]
  }
}`;

export function SetupWizard() {
  const queryClient = useQueryClient();
  const { tenant, tenantId } = useTenant();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("+15109379101");

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", tenantId],
    queryFn: () => api.dashboard(tenantId),
    enabled: !!tenantId,
  });
  const { data: agentsData } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: () => api.listTenantAgents(tenantId),
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const savePhone = useMutation({
    mutationFn: async () => {
      const agents = agentsData?.agents || [];
      const target = agents.find((a) => a.status === "active") || agents[0];
      if (!target) throw new Error("Crea un agente primero en Mis agentes");
      const normalized = phone.trim();
      const numbers = [...new Set([normalized, ...(target.phone_numbers || [])].filter(Boolean))];
      return api.updateTenantAgent(target.id, {
        ...target,
        slug: target.slug,
        display_name: target.display_name,
        template_id: target.template_id,
        phone_number: numbers[0] || normalized,
        phone_numbers: numbers,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-agents"] });
      setStep(4);
    },
  });

  const workerOk = dashboard?.worker.livekit_ready && !dashboard?.worker.requires_worker;
  const hasPhone = (agentsData?.agents || []).some(
    (a) => a.phone_number || (a.phone_numbers && a.phone_numbers.length > 0),
  );
  const activeAgent = (agentsData?.agents || []).find((a) => a.status === "active");

  if (!tenantId) {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        Selecciona una empresa para comenzar la guía de configuración.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Guía — Primera llamada real</h1>
        <p className="mt-1 text-slate-400">
          {tenant?.name} · LiveKit + dispatch rule + DID en el agente
        </p>
      </header>

      <div className="glass-card border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-slate-300">
        <p>
          <strong className="text-cyan-200">Proyecto LiveKit:</strong> call management ·{" "}
          <code className="text-xs">p_39db3sg0f79</code>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Worker URL: <code>wss://call-management-6g9fmqf0.livekit.cloud</code> · SIP (trunks externos):{" "}
          <code>sip:39db3sg0f79.sip.livekit.cloud</code>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={clsx(
              "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition",
              step === s.id
                ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200"
                : "border-white/10 text-slate-400 hover:border-white/20",
            )}
          >
            <s.icon className="h-4 w-4" />
            {s.title}
            {(s.id === 1 && workerOk) || (s.id === 3 && hasPhone) ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : null}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">1. Worker LiveKit</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">LiveKit listo</dt>
              <dd className={dashboard?.worker.livekit_ready ? "text-emerald-300" : "text-red-300"}>
                {dashboard?.worker.livekit_ready ? "Sí" : "No"}
              </dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">Worker requerido</dt>
              <dd>{dashboard?.worker.requires_worker ? "Sí — inicia callmanagement-worker" : "No"}</dd>
            </div>
            {dashboard?.worker.livekit_issues?.length ? (
              <ul className="list-inside list-disc text-amber-200">
                {dashboard.worker.livekit_issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </dl>
          <p className="text-sm text-slate-400">
            En el VPS: <code className="text-slate-300">LIVEKIT_URL</code>,{" "}
            <code className="text-slate-300">LIVEKIT_API_KEY</code>,{" "}
            <code className="text-slate-300">LIVEKIT_API_SECRET</code> desde{" "}
            <a
              href="https://cloud.livekit.io"
              target="_blank"
              rel="noreferrer"
              className="text-cyan-300 hover:underline"
            >
              cloud.livekit.io
            </a>{" "}
            → Settings → Keys.
          </p>
          <p className="text-xs text-slate-500">
            <code className="text-slate-400">systemctl status callmanagement-worker</code> · debe registrar{" "}
            <code>call-management</code>
          </p>
          <button type="button" className="btn-primary" disabled={!workerOk} onClick={() => setStep(2)}>
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">2. Dispatch rule (obligatoria)</h2>
          <p className="text-sm text-slate-400">
            Sin esta regla, LiveKit recibe la llamada pero no despacha el agente de voz. Crea la regla en
            LiveKit Cloud o ejecuta en el servidor:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-cyan-100">
            uv run python scripts/setup_livekit_inbound.py --phone +15109379101
          </pre>
          <p className="text-sm text-slate-400">
            O en{" "}
            <a
              href="https://cloud.livekit.io"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
            >
              LiveKit Cloud <ExternalLink className="h-3 w-3" />
            </a>{" "}
            → Telephony → Dispatch rules → JSON:
          </p>
          <pre className="max-h-48 overflow-auto rounded-xl bg-black/40 p-4 text-xs text-slate-300">
            {DISPATCH_JSON}
          </pre>
          <p className="text-xs text-slate-500">
            Con LiveKit Phone Numbers, asigna la regla al DID en Telephony → Phone numbers.
          </p>
          <button type="button" className="btn-primary" onClick={() => setStep(3)}>
            Regla creada — continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">3. DID en el agente</h2>
          <p className="text-sm text-slate-400">
            Número E.164 exacto que marca el caller (debe coincidir con LiveKit y la dispatch rule).
          </p>
          <input
            className="input-field w-full max-w-sm font-mono"
            placeholder="+15109379101"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {activeAgent && (
            <p className="text-xs text-slate-500">
              Se asignará al agente: <strong>{activeAgent.display_name}</strong>
            </p>
          )}
          {!agentsData?.agents.length && (
            <p className="text-sm text-amber-200">
              Primero crea un agente en{" "}
              <Link to="/my-agents" className="text-cyan-300 underline">
                Mis agentes
              </Link>
            </p>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={!phone.trim().startsWith("+") || savePhone.isPending || !agentsData?.agents.length}
            onClick={() => savePhone.mutate()}
          >
            {savePhone.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar número
          </button>
          {savePhone.error && (
            <p className="text-sm text-red-300">{(savePhone.error as Error).message}</p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">4. Probar la llamada</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
            <li>
              Marca <strong className="font-mono text-cyan-200">+1 510 937 9101</strong> (o tu DID en E.164).
            </li>
            <li>El agente de voz debe responder en unos segundos.</li>
            <li>Revisa <Link to="/supervisor" className="text-cyan-300 underline">Supervisor</Link> y{" "}
              <Link to="/calls" className="text-cyan-300 underline">Llamadas</Link> al colgar.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link to="/supervisor" className="btn-primary">
              Abrir Supervisor
            </Link>
            <Link to="/playground" className="btn-ghost">
              Playground (sin teléfono)
            </Link>
            <Link to="/settings" className="btn-ghost">
              Configuración LiveKit
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}