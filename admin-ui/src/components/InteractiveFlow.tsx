import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ExternalLink,
  GitBranch,
  HelpCircle,
  Play,
  RotateCcw,
  Server,
  Sparkles,
  Square,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { FlowBranch, FlowNodeKind, FlowSection, FlowStep } from "../lib/operationFlows";
import { stepsById } from "../lib/operationFlows";

const KIND_META: Record<
  FlowNodeKind,
  { label: string; icon: typeof Play; ring: string; bg: string; text: string }
> = {
  start: {
    label: "Inicio",
    icon: Play,
    ring: "ring-emerald-400/40",
    bg: "from-emerald-500/25 to-emerald-600/5",
    text: "text-emerald-200",
  },
  process: {
    label: "Proceso",
    icon: Workflow,
    ring: "ring-cyan-400/35",
    bg: "from-cyan-500/20 to-blue-600/5",
    text: "text-cyan-200",
  },
  decision: {
    label: "Decisión",
    icon: HelpCircle,
    ring: "ring-amber-400/40",
    bg: "from-amber-500/20 to-orange-600/5",
    text: "text-amber-100",
  },
  system: {
    label: "Sistema",
    icon: Server,
    ring: "ring-violet-400/35",
    bg: "from-violet-500/20 to-indigo-600/5",
    text: "text-violet-200",
  },
  external: {
    label: "Externo",
    icon: ExternalLink,
    ring: "ring-sky-400/35",
    bg: "from-sky-500/20 to-cyan-700/5",
    text: "text-sky-200",
  },
  end: {
    label: "Fin",
    icon: Square,
    ring: "ring-rose-400/35",
    bg: "from-rose-500/15 to-pink-900/10",
    text: "text-rose-200",
  },
};

const BRANCH_TONE: Record<NonNullable<FlowBranch["tone"]>, string> = {
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
  warn: "border-amber-400/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  danger: "border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
  neutral: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
};

function linearPath(flow: FlowSection): string[] {
  const map = stepsById(flow);
  const path: string[] = [];
  let cur: string | undefined = flow.steps[0]?.id;
  const seen = new Set<string>();
  while (cur && map.has(cur) && !seen.has(cur)) {
    path.push(cur);
    seen.add(cur);
    const node = map.get(cur);
    if (!node) break;
    if (node.branches?.length) break;
    cur = node.next;
  }
  return path;
}

type InteractiveFlowProps = {
  flow: FlowSection;
};

export function InteractiveFlow({ flow }: InteractiveFlowProps) {
  const map = useMemo(() => stepsById(flow), [flow]);
  const startId = flow.steps[0]?.id ?? "";
  const [activeId, setActiveId] = useState(startId);
  const [trail, setTrail] = useState<string[]>(startId ? [startId] : []);
  const [visited, setVisited] = useState<Set<string>>(() => new Set(startId ? [startId] : []));

  useEffect(() => {
    const id = flow.steps[0]?.id ?? "";
    setActiveId(id);
    setTrail(id ? [id] : []);
    setVisited(new Set(id ? [id] : []));
  }, [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeStep: FlowStep | undefined = map.get(activeId);

  const goTo = (id: string) => {
    if (!map.has(id)) return;
    setActiveId(id);
    setTrail((prev) => {
      const idx = prev.indexOf(id);
      if (idx >= 0) return prev.slice(0, idx + 1);
      return [...prev, id];
    });
    setVisited((prev) => new Set(prev).add(id));
  };

  const restart = () => {
    const id = flow.steps[0]?.id ?? "";
    setActiveId(id);
    setTrail(id ? [id] : []);
    setVisited(new Set(id ? [id] : []));
  };

  const goBack = () => {
    if (trail.length < 2) return;
    const nextTrail = trail.slice(0, -1);
    setTrail(nextTrail);
    setActiveId(nextTrail[nextTrail.length - 1]!);
  };

  const continueLinear = () => {
    if (activeStep?.next) goTo(activeStep.next);
  };

  const railSteps = flow.steps;
  const progress = Math.round((visited.size / Math.max(flow.steps.length, 1)) * 100);

  if (!activeStep) {
    return <p className="p-6 text-sm text-slate-500">Flujo vacío.</p>;
  }

  const step = activeStep;
  const meta = KIND_META[step.kind];
  const Icon = meta.icon;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* Vertical journey rail */}
      <div className="shrink-0 lg:w-56">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Recorrido
          </p>
          <span className="text-[11px] text-cyan-300/80">{progress}%</span>
        </div>
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="max-h-[40vh] space-y-0 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-16rem)]">
          {railSteps.map((s, i) => {
            const isActive = s.id === activeId;
            const isVisited = visited.has(s.id);
            const km = KIND_META[s.kind];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(s.id)}
                className={clsx(
                  "group relative flex w-full gap-3 rounded-xl px-2 py-2.5 text-left transition",
                  isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                )}
              >
                <div className="flex flex-col items-center">
                  <span
                    className={clsx(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-1 transition",
                      isActive
                        ? "bg-cyan-500 text-white ring-cyan-300/50 shadow-glow"
                        : isVisited
                          ? "bg-cyan-500/20 text-cyan-200 ring-cyan-400/25"
                          : "bg-white/5 text-slate-500 ring-white/10",
                    )}
                  >
                    {i + 1}
                  </span>
                  {i < railSteps.length - 1 && (
                    <span
                      className={clsx(
                        "mt-1 w-px flex-1 min-h-[12px]",
                        isVisited ? "bg-cyan-400/30" : "bg-white/10",
                      )}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p
                    className={clsx(
                      "truncate text-sm font-medium",
                      isActive ? "text-slate-50" : isVisited ? "text-slate-300" : "text-slate-500",
                    )}
                  >
                    {s.title}
                  </p>
                  <p className={clsx("text-[10px] uppercase tracking-wide", km.text, "opacity-70")}>
                    {km.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active step stage */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={clsx(
            "relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 sm:p-7",
            meta.bg,
            "ring-1",
            meta.ring,
          )}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={clsx(
                  "flex h-12 w-12 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10",
                  meta.text,
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className={clsx("text-[11px] font-semibold uppercase tracking-wider", meta.text)}>
                  {meta.label}
                  {step.actor ? ` · ${step.actor}` : ""}
                </p>
                <h3 className="mt-0.5 font-display text-xl font-semibold text-white sm:text-2xl">
                  {step.title}
                </h3>
                {step.description && (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={goBack} disabled={trail.length < 2}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Atrás
              </button>
              <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={restart}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reiniciar
              </button>
            </div>
          </div>

          {step.tags && step.tags.length > 0 && (
            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {step.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 bg-black/20 px-2.5 py-0.5 text-[11px] text-slate-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {step.details && step.details.length > 0 && (
            <ul className="relative mt-4 space-y-1.5 rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-slate-300">
              {step.details.map((d) => (
                <li key={d} className="flex gap-2">
                  <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400/80" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Choices / continue */}
        <div className="mt-4 space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            {step.branches?.length ? "Elige el camino" : "Continuar"}
          </p>

          {step.branches && step.branches.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {step.branches.map((b) => {
                const tone = b.tone || "neutral";
                const target = map.get(b.targetId);
                return (
                  <button
                    key={`${b.label}-${b.targetId}`}
                    type="button"
                    onClick={() => goTo(b.targetId)}
                    className={clsx(
                      "group rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]",
                      BRANCH_TONE[tone],
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{b.label}</span>
                      <ChevronRight className="h-4 w-4 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </span>
                    {target && (
                      <span className="mt-1 block text-xs opacity-70">→ {target.title}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : step.next ? (
            <button
              type="button"
              onClick={continueLinear}
              className="btn-primary w-full sm:w-auto"
            >
              Siguiente paso
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-slate-400">Fin de este recorrido.</p>
              <button type="button" className="btn-primary" onClick={restart}>
                <RotateCcw className="h-4 w-4" />
                Ver de nuevo
              </button>
            </div>
          )}
        </div>

        {/* Breadcrumb trail of choices */}
        {trail.length > 1 && (
          <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Tu camino
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {trail.map((id, i) => {
                const s = map.get(id);
                if (!s) return null;
                return (
                  <span key={`${id}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
                    <button
                      type="button"
                      onClick={() => goTo(id)}
                      className={clsx(
                        "rounded-lg px-2 py-1 text-xs transition",
                        id === activeId
                          ? "bg-cyan-500/20 text-cyan-100"
                          : "bg-white/5 text-slate-400 hover:text-slate-200",
                      )}
                    >
                      {s.title}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Mini linear hint for non-decision flows */}
        {!step.branches?.length && linearPath(flow).length > 1 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-600">
            <GitBranch className="h-3 w-3" />
            Tip: también puedes saltar a cualquier paso del recorrido de la izquierda.
          </p>
        )}
      </div>
    </div>
  );
}
