import { GitBranch, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { InteractiveFlow } from "../components/InteractiveFlow";
import {
  FLOW_CATEGORIES,
  OPERATION_FLOWS,
  type FlowCategory,
} from "../lib/operationFlows";
import clsx from "clsx";

export function OperationFlows() {
  const [category, setCategory] = useState<FlowCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(OPERATION_FLOWS[0]?.id ?? "");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPERATION_FLOWS.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q) ||
        f.steps.some(
          (s) =>
            s.title.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q),
        )
      );
    });
  }, [category, query]);

  const active = useMemo(() => {
    const fromFilter = filtered.find((f) => f.id === activeId);
    if (fromFilter) return fromFilter;
    return filtered[0] ?? OPERATION_FLOWS[0];
  }, [filtered, activeId]);

  return (
    <div className="flex max-h-[calc(100dvh-7.5rem)] flex-col gap-4 sm:max-h-[calc(100dvh-6rem)]">
      <header className="shrink-0 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 p-3 ring-1 ring-cyan-400/20">
            <GitBranch className="h-6 w-6 text-cyan-300" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Flujos / Operación
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400 sm:text-base">
              Recorre la operativa de forma interactiva: elige un flujo, avanza paso a paso
              y toma decisiones (colas, handoffs, horarios, playgrounds).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              className="input-field pl-9"
              placeholder="Buscar flujo, paso o palabra clave…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FLOW_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={clsx(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition",
                    on
                      ? "bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/35"
                      : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(15rem,19rem)_1fr]">
        <aside className="glass-card flex min-h-0 flex-col overflow-hidden p-3">
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {filtered.length} flujo{filtered.length === 1 ? "" : "s"}
          </p>
          <nav className="list-scroll-panel space-y-1.5 pr-1">
            {filtered.map((flow) => {
              const selected = flow.id === active?.id;
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => setActiveId(flow.id)}
                  className={clsx(
                    "w-full rounded-2xl border px-3 py-3 text-left transition",
                    selected
                      ? "border-cyan-400/35 bg-gradient-to-br from-cyan-500/15 to-violet-500/10 shadow-glow"
                      : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <span className="block text-sm font-semibold text-slate-100">{flow.title}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-500">
                    {flow.summary}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                      {flow.category}
                    </span>
                    <span className="text-[10px] text-slate-600">{flow.steps.length} pasos</span>
                    {flow.durationHint && (
                      <span className="text-[10px] text-cyan-500/70">{flow.durationHint}</span>
                    )}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-slate-500">
                Ningún flujo coincide con la búsqueda.
              </p>
            )}
          </nav>
        </aside>

        <section className="glass-card flex min-h-0 flex-col overflow-hidden">
          {active ? (
            <>
              <div className="shrink-0 border-b border-white/5 bg-gradient-to-r from-cyan-500/5 via-transparent to-violet-500/5 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400/80">
                      Modo interactivo
                    </p>
                    <h2 className="font-display text-lg font-semibold text-slate-50 sm:text-xl">
                      {active.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-400">{active.summary}</p>
                  </div>
                  <p className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-400">
                    Haz clic en los pasos o elige ramas en las decisiones
                  </p>
                </div>
              </div>
              <div className="list-scroll-panel min-h-0 flex-1 p-3 sm:p-5">
                <InteractiveFlow key={active.id} flow={active} />
              </div>
            </>
          ) : (
            <p className="p-8 text-center text-slate-500">Selecciona un flujo.</p>
          )}
        </section>
      </div>
    </div>
  );
}
