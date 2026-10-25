import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, ExternalLink, Loader2, Phone, Radio, Route, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useUiLocale } from "../contexts/LocaleContext";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";
import clsx from "clsx";

const STEPS = [
  { id: 1, icon: Radio },
  { id: 2, icon: Route },
  { id: 3, icon: Phone },
  { id: 4, icon: Settings2 },
];

function phoneDigits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function chooseDidAgent<T extends { phone_number?: string | null; phone_numbers?: string[] | null }>(
  agents: T[],
  phone: string,
): T | undefined {
  const target = phoneDigits(phone);
  if (!target) return undefined;
  return agents.find((agent) => {
    const numbers = [agent.phone_number, ...(agent.phone_numbers || [])].filter(Boolean) as string[];
    return numbers.some((number) => phoneDigits(number) === target);
  });
}

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
  const { t } = useUiLocale();
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
      const owner = chooseDidAgent(agents, phone);
      const target = owner || agents.find((a) => a.status === "active") || agents[0];
      if (!target) throw new Error(t("setup.needAgent"));
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
  const agents = agentsData?.agents || [];
  const didOwner = chooseDidAgent(agents, phone);
  const activeAgent = didOwner || agents.find((a) => a.status === "active");

  if (!tenantId) {
    return (
      <div className="glass-card p-8 text-center text-slate-400">
        {t("setup.needTenant")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("setup.title")}</h1>
        <p className="mt-1 text-slate-400">
          {tenant?.name} · {t("setup.subtitle")}
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
            {t(`setup.step.${s.id}`)}
            {(s.id === 1 && workerOk) || (s.id === 3 && hasPhone) ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : null}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">{t("setup.step1Title")}</h2>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("setup.livekitReady")}</dt>
              <dd className={dashboard?.worker.livekit_ready ? "text-emerald-300" : "text-red-300"}>
                {dashboard?.worker.livekit_ready ? t("setup.yes") : t("setup.no")}
              </dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("setup.workerRequired")}</dt>
              <dd>{dashboard?.worker.requires_worker ? t("setup.workerRequiredYes") : t("setup.no")}</dd>
            </div>
            {dashboard?.worker.livekit_issues?.length ? (
              <ul className="list-inside list-disc text-amber-200">
                {dashboard.worker.livekit_issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </dl>
          <p className="text-sm text-slate-400">{t("setup.livekitKeys")}</p>
          <p className="text-xs text-slate-500">{t("setup.workerStatus")}</p>
          <button type="button" className="btn-primary" disabled={!workerOk} onClick={() => setStep(2)}>
            {t("setup.continue")} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">{t("setup.step2Title")}</h2>
          <p className="text-sm text-slate-400">{t("setup.step2Body")}</p>
          <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-cyan-100">
            uv run python scripts/setup_livekit_inbound.py --phone +15109379101
          </pre>
          <p className="text-sm text-slate-400">
            {t("setup.step2Alt")}{" "}
            <a
              href="https://cloud.livekit.io"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-cyan-300 hover:underline"
            >
              LiveKit Cloud <ExternalLink className="h-3 w-3" />
            </a>{" "}
            {t("setup.step2Json")}
          </p>
          <pre className="max-h-48 overflow-auto rounded-xl bg-black/40 p-4 text-xs text-slate-300">
            {DISPATCH_JSON}
          </pre>
          <p className="text-xs text-slate-500">
            {t("setup.step2Hint")}
          </p>
          <button type="button" className="btn-primary" onClick={() => setStep(3)}>
            {t("setup.step2Next")} <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">{t("setup.step3Title")}</h2>
          <p className="text-sm text-slate-400">{t("setup.step3Body")}</p>
          <input
            className="input-field w-full max-w-sm font-mono"
            placeholder="+15109379101"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {activeAgent && (
            <p className="text-xs text-slate-500">
              {t("setup.step3Assign")} <strong>{activeAgent.display_name}</strong>
              {didOwner ? t("setup.step3HasNumber") : "."}
            </p>
          )}
          {!agentsData?.agents.length && (
            <p className="text-sm text-amber-200">
              {t("setup.step3Create")}{" "}
              <Link to="/my-agents" className="text-cyan-300 underline">
                {t("nav.my_agents")}
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
            {t("setup.step3Save")}
          </button>
          {savePhone.error && (
            <p className="text-sm text-red-300">{(savePhone.error as Error).message}</p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="glass-card space-y-4 p-6">
          <h2 className="font-display text-lg font-semibold">{t("setup.step4Title")}</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm text-slate-300">
            <li>
              {t("setup.step4Dial")} <strong className="font-mono text-cyan-200">+1 510 937 9101</strong> {t("setup.step4Or")}
            </li>
            <li>{t("setup.step4Answer")}</li>
            <li>
              {t("setup.step4Review")} <Link to="/supervisor" className="text-cyan-300 underline">{t("nav.supervisor")}</Link>{" "}
              {t("setup.step4And")}{" "}
              <Link to="/calls" className="text-cyan-300 underline">{t("nav.calls")}</Link> {t("setup.step4Hangup")}
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link to="/supervisor" className="btn-primary">
              {t("setup.openSupervisor")}
            </Link>
            <Link to="/playground" className="btn-ghost">
              {t("setup.playground")}
            </Link>
            <Link to="/settings" className="btn-ghost">
              {t("setup.settingsLink")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}