import { GitBranch, ListTree } from "lucide-react";
import { useMemo, useState } from "react";
import { MermaidDiagram } from "../components/MermaidDiagram";
import { OPERATION_FLOWS } from "../lib/operationFlows";
import clsx from "clsx";

export function OperationFlows() {
  const [activeId, setActiveId] = useState(OPERATION_FLOWS[0]?.id ?? "");
  const active = useMemo(
    () => OPERATION_FLOWS.find((f) => f.id === activeId) ?? OPERATION_FLOWS[0],
    [activeId],
  );

  return (
    <div className="flex max-h-[calc(100dvh-7.5rem)] flex-col gap-4 sm:max-h-[calc(100dvh-6rem)]">
      <header className="shrink-0">
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-2xl bg-cyan-500/10 p-3">
            <GitBranch className="h-6 w-6 text-cyan-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Flujos / Operación
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400 sm:text-base">
              Cómo opera la plataforma multi-empresa y cómo los agentes de voz (xAI Grok)
              atienden llamadas, handoffs, colas y playgrounds.
            </p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(14rem,18rem)_1fr]">
        {/* Índice */}
        <aside className="glass-card flex min-h-0 flex-col overflow-hidden p-3 sm:p-4">
          <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <ListTree className="h-3.5 w-3.5" />
            Flujogramas
          </p>
          <nav className="list-scroll-panel space-y-0.5 pr-1">
            {OPERATION_FLOWS.map((flow, i) => {
              const selected = flow.id === active?.id;
              return (
                <button
                  key={flow.id}
                  type="button"
                  onClick={() => setActiveId(flow.id)}
                  className={clsx(
                    "w-full rounded-xl px-3 py-2.5 text-left text-sm transition",
                    selected
                      ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-400/30"
                      : "text-slate-300 hover:bg-white/5",
                  )}
                >
                  <span className="block font-medium leading-snug">
                    <span className="mr-1.5 text-xs text-slate-500">{i + 1}.</span>
                    {flow.title.replace(/^\d+\.\s*/, "")}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Diagrama activo */}
        <section className="glass-card flex min-h-0 flex-col overflow-hidden">
          {active && (
            <>
              <div className="shrink-0 border-b border-white/5 px-4 py-4 sm:px-6">
                <h2 className="font-display text-lg font-semibold text-slate-100 sm:text-xl">
                  {active.title}
                </h2>
                <p className="mt-1 text-sm text-slate-400">{active.summary}</p>
                {active.notes && active.notes.length > 0 && (
                  <ul className="mt-3 list-inside list-disc space-y-0.5 text-xs text-slate-500">
                    {active.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="list-scroll-panel min-h-0 flex-1 p-3 sm:p-5">
                <MermaidDiagram key={active.id} chart={active.mermaid} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
