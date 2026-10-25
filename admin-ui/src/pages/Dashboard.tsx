import { useQuery } from "@tanstack/react-query";
import { Activity, Crown, Phone, Radio, Users, Calendar, Clock, Headphones } from "lucide-react";
import { Link } from "react-router-dom";
import { useUiLocale } from "../contexts/LocaleContext";
import { useTenant } from "../contexts/TenantContext";
import { api } from "../lib/api";
import { formatAdminDay } from "../lib/formatDateTime";
import { formatDuration } from "../lib/reportDisplay";
import { AgentFleetStatus } from "../components/AgentFleetStatus";
import { StatCard } from "../components/StatCard";
import clsx from "clsx";

function CallsByDayChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const { t } = useUiLocale();
  const max = Math.max(1, ...data.map((d) => d.count));
  if (!data.length) {
    return <p className="text-sm text-slate-500">{t("dashboard.noCalls")}</p>;
  }
  return (
    <div className="flex h-32 items-end gap-1">
      {data.map((d) => {
        const dayLabel = formatAdminDay(d.day);
        return (
          <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-gradient-to-t from-cyan-600/60 to-cyan-400/40 transition group-hover:from-cyan-500/70"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 0 }}
              title={`${dayLabel}: ${d.count}`}
            />
            <span className="hidden whitespace-nowrap text-[10px] text-slate-500 sm:block">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Dashboard() {
  const { tenantId } = useTenant();
  const { t } = useUiLocale();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", tenantId],
    queryFn: () => api.dashboard(tenantId),
    enabled: !!tenantId,
  });

  if (!tenantId || isLoading || !data || data.tenant.id !== tenantId) {
    return <div className="glass-card p-8 text-slate-400">{t("dashboard.loading")}</div>;
  }

  const { stats, runtime, worker, analytics, tenant, recordings, actionable } = data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("dashboard.title")}</h1>
          <p className="mt-1 text-slate-400">
            {tenant.name} · {t("dashboard.overview")}
          </p>
        </div>
        {tenant.logo_url && (
          <img src={tenant.logo_url} alt="" className="h-10 rounded-lg object-contain" />
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t("dashboard.customers")} value={stats.customers} icon={Users} />
        <StatCard
          title={t("dashboard.calls")}
          value={stats.calls}
          subtitle={t("dashboard.fullHistory")}
          icon={Phone}
          accent="from-violet-500/20 to-purple-600/10"
        />
        <StatCard title={t("dashboard.appointments")} value={stats.appointments} icon={Calendar} accent="from-emerald-500/20 to-green-600/10" />
        <StatCard title={t("dashboard.vip")} value={stats.vip_customers} icon={Crown} accent="from-amber-500/20 to-orange-600/10" />
      </div>

      <AgentFleetStatus tenantId={tenantId} variant="epic" />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{t("dashboard.callsByDay")}</h2>
            <p className="text-xs text-slate-500">{t("dashboard.fullHistory")}</p>
          </div>
          <CallsByDayChart data={analytics.calls_by_day} />
          <p className="mt-3 text-xs text-slate-500">
            {t("dashboard.avgDuration")}: {formatDuration(analytics.avg_duration_seconds)} · {t("dashboard.activeNow")}: {worker.active_calls_tenant}
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Radio className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">{t("dashboard.worker")}</h2>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("dashboard.livekit")}</dt>
              <dd className={clsx(worker.livekit_ready ? "text-emerald-300" : "text-red-300")}>
                {worker.livekit_ready ? t("dashboard.livekitReady") : t("dashboard.livekitMissing")}
              </dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("dashboard.workerState")}</dt>
              <dd>{worker.requires_worker ? t("dashboard.workerRequired") : t("dashboard.workerOk")}</dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("dashboard.activeCalls")}</dt>
              <dd className="font-medium text-cyan-300">
                {worker.active_calls_tenant} / {worker.active_calls_cap}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">{t("dashboard.todayCompany")}</dt>
              <dd>{tenant.metrics?.calls_today ?? 0} / {tenant.metrics?.max_calls_per_day ?? "—"}</dd>
            </div>
          </dl>
          {worker.livekit_issues.length > 0 && (
            <ul className="mt-3 list-inside list-disc text-xs text-amber-200">
              {worker.livekit_issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">{t("dashboard.runtime")}</h2>
          </div>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("dashboard.provider")}</dt>
              <dd className="font-medium text-cyan-300">{runtime.provider}</dd>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-2">
              <dt className="text-slate-400">{t("dashboard.grokRealtime")}</dt>
              <dd>{runtime.grok_realtime ? t("dashboard.active") : t("dashboard.off")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">{t("dashboard.remoteMcp")}</dt>
              <dd>
                {runtime.remote_mcp
                  ? t("dashboard.remoteMcpOn", { count: runtime.mcp_servers })
                  : t("dashboard.off")}
              </dd>
            </div>
          </dl>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-cyan-400" />
            <h2 className="font-display text-lg font-semibold">{t("dashboard.outcomes")}</h2>
          </div>
          <div className="space-y-2">
            {Object.entries(analytics.outcomes).map(([outcome, count]) => (
              <div key={outcome} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="capitalize text-slate-300">{outcome.replaceAll("_", " ")}</span>
                <span className="font-semibold text-cyan-300">{count}</span>
              </div>
            ))}
            {Object.keys(analytics.outcomes).length === 0 && (
              <p className="text-sm text-slate-500">{t("dashboard.noOutcomes")}</p>
            )}
          </div>
        </div>

        {recordings && (
          <div className="glass-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Headphones className="h-5 w-5 text-emerald-400" />
              <h2 className="font-display text-lg font-semibold">{t("dashboard.sipRecording")}</h2>
            </div>
            <p className="text-sm text-slate-300">
              {recordings.egress_configured ? t("dashboard.egressOn") : t("dashboard.egressOff")}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t("dashboard.activeRecordings")}: {recordings.active_recordings}
            </p>
          </div>
        )}
      </div>

      {actionable && (
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{t("dashboard.actionable")}</h2>
            <Link to="/analytics" className="text-xs text-cyan-300 hover:text-cyan-200">
              {t("dashboard.viewAnalytics")} →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-slate-500">{t("dashboard.sla", { seconds: actionable.sla_seconds })}</p>
              <p className="text-xl font-semibold text-emerald-300">{actionable.sla_compliance_pct}%</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-slate-500">{t("dashboard.handoffs")}</p>
              <p className="text-xl font-semibold">{actionable.handoffs}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-slate-500">{t("dashboard.escalations")}</p>
              <p className="text-xl font-semibold text-amber-200">{actionable.escalations}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-xs text-slate-500">{t("dashboard.sentiment")}</p>
              <p className="text-xl font-semibold capitalize">{actionable.sentiment_label}</p>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-slate-500">
        <Link to="/supervisor" className="text-cyan-300 hover:text-cyan-200">
          {t("dashboard.openSupervisor")}
        </Link>
      </p>
    </div>
  );
}