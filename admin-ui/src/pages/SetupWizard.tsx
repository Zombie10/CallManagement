import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Loader2, Phone, Radio, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";
import clsx from "clsx";

const STEPS = [
  { id: 1, title: "Worker activo", icon: Radio },
  { id: 2, title: "Agente con teléfono", icon: Phone },
  { id: 3, title: "Probar llamada", icon: Settings2 },
];

export function SetupWizard() {
  const queryClient = useQueryClient();
  const { tenant, tenantId } = useTenant();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard,
    enabled: !!tenantId,
  });
  const { data: agentsData } = useQuery({
    queryKey: ["tenant-agents", tenantId],
    queryFn: api.listTenantAgents,
    enabled: !!tenantId,
  });

  const savePhone = useMutation({
    mutationFn: async () => {
      const agents = agentsData?.agents || [];
      const target = agents.find((a) => a.status === "active") || agents[0];
      if (!target) throw new Error("Crea un agente primero en Mis agentes");
      const numbers = [...(target.phone_numbers || []), phone].filter(Boolean);
      const unique = [...new Set(numbers)];
      return api.updateTenantAgent(target.id, {
        ...target,
        slug: target.slug,
        display_name: target.display_name,
        template_id: target.template_id,
        phone_number: unique[0] || phone,
        phone_numbers: unique,
        status: "active",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-agents"] });
      setStep(3);
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
          {tenant?.name} · Configura SIP + worker para recibir llamadas desde un celular
        </p>
      </header>

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
            {(s.id === 1 && workerOk) || (s.id === 2 && hasPhone) ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : null}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">1. Verificar worker LiveKit</h2>
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
            En el VPS: <code className="text-slate-300">systemctl status callmanagement-worker</code>
          </p>
          <button type="button" className="btn-primary" disabled={!workerOk} onClick={() => setStep(2)}>
            Continuar <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">2. Asignar número DID al agente</h2>
          <p className="text-sm text-slate-400">
            Ingresa el número E.164 que recibirá las llamadas SIP (ej. +50255551234).
          </p>
          <input
            className="input-field w-full max-w-sm"
            placeholder="+50255551234"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {activeAgent && (
            <p className="text-xs text-slate-500">
              Se asignará al agente activo: <strong>{activeAgent.display_name}</strong>
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
            disabled={!phone.startsWith("+") || savePhone.isPending || !agentsData?.agents.length}
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

      {step === 3 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">3. Probar la llamada</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
            <li>Confirma que el SIP trunk de LiveKit apunta al DID configurado.</li>
            <li>Marca desde tu celular al número asignado.</li>
            <li>Revisa el historial en Llamadas y el dashboard en tiempo real.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link to="/playground" className="btn-primary">
              Probar en playground
            </Link>
            <Link to="/calls" className="btn-ghost">
              Ver llamadas
            </Link>
            <Link to="/settings" className="btn-ghost">
              Configuración SIP
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}