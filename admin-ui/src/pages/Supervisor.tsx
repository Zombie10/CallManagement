import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Headphones, Phone, Radio, Users } from "lucide-react";
import { api } from "../lib/api";
import { useUiLocale } from "../contexts/LocaleContext";
import clsx from "clsx";

export function Supervisor() {
  const { t } = useUiLocale();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["supervisor"],
    queryFn: api.supervisor,
    refetchInterval: 5000,
  });

  if (isLoading || !data) {
    return <div className="glass-card p-8 text-slate-400">{t("supervisor.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("supervisor.title")}</h1>
          <p className="mt-1 text-slate-400">{t("supervisor.subtitle")}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => refetch()} disabled={isFetching}>
          <Radio className={clsx("h-4 w-4", isFetching && "animate-pulse")} />
          {t("common.refresh")}
        </button>
      </header>

      {data.tenant_limit && (
        <div className="glass-card p-4 text-sm text-slate-400">
          {t("supervisor.companyLimit", {
            active: data.tenant_limit.active,
            cap: data.tenant_limit.cap,
          })}
          {data.tenant_limit.at_capacity && (
            <span className="ml-2 text-amber-300">· {t("supervisor.atCapacity")}</span>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("supervisor.active")}</p>
          <p className="font-display text-2xl font-semibold text-cyan-200">{data.active_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("supervisor.queued")}</p>
          <p className="font-display text-2xl font-semibold text-amber-200">{data.queued_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("supervisor.recording")}</p>
          <p className="font-display text-2xl font-semibold text-emerald-200">{data.recording_calls}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-slate-500">{t("supervisor.callsToday")}</p>
          <p className="font-display text-2xl font-semibold">{data.tenant_metrics?.calls_today ?? 0}</p>
        </div>
      </div>

      {data.alerts?.length > 0 && (
        <section className="glass-card space-y-2 p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            {t("supervisor.alerts")}
          </h2>
          {data.alerts.map((a, i) => (
            <p
              key={i}
              className={clsx(
                "rounded-lg px-3 py-2 text-sm",
                a.level === "warning" ? "bg-amber-500/10 text-amber-200" : "bg-cyan-500/10 text-cyan-200",
              )}
            >
              {a.message}
            </p>
          ))}
        </section>
      )}

      <section className="glass-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Phone className="h-5 w-5 text-cyan-400" />
          {t("supervisor.liveCalls")}
        </h2>
        {data.calls?.length ? (
          <div className="space-y-2">
            {data.calls.map((c) => (
              <div
                key={c.call_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-mono text-cyan-200">{c.from_number}</p>
                  <p className="text-xs text-slate-500">
                    {c.channel} · {c.started_at?.slice(0, 19)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.queued && (
                    <span className="rounded-lg bg-amber-500/15 px-2 py-1 text-xs text-amber-200">{t("supervisor.queue")}</span>
                  )}
                  {c.recording && (
                    <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-xs text-emerald-200">
                      <Headphones className="inline h-3 w-3" /> REC
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("supervisor.noCalls")}</p>
        )}
      </section>

      <section className="glass-card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="h-5 w-5 text-violet-400" />
          {t("supervisor.agents")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {data.agents?.map((a) => (
            <div key={a.id} className="rounded-xl bg-white/5 px-4 py-3 text-sm">
              <p className="font-medium text-slate-200">{a.display_name}</p>
              <p className="text-xs text-slate-500">
                {a.status} · {t("supervisor.callsTodayCount", { count: a.call_count_today })}
                {a.max_concurrent_calls != null && (
                  <> · {t("supervisor.activeOf", { active: a.active_calls ?? 0, max: a.max_concurrent_calls })}</>
                )}
                {a.at_capacity && <span className="text-amber-300"> · {t("supervisor.full")}</span>}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {t("supervisor.sip", {
            state: data.recordings?.egress_configured ? t("supervisor.sipOn") : t("supervisor.sipOff"),
          })}
        </p>
      </section>
    </div>
  );
}