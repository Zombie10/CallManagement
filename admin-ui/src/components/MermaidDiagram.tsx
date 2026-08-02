import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";

type MermaidApi = typeof import("mermaid").default;

let mermaidReady = false;
let mermaidApi: MermaidApi | null = null;

async function ensureMermaid(): Promise<MermaidApi> {
  if (mermaidApi && mermaidReady) return mermaidApi;
  const mod = await import("mermaid");
  mermaidApi = mod.default;
  if (!mermaidReady) {
    mermaidApi.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "dark",
      themeVariables: {
        darkMode: true,
        background: "#0b1220",
        primaryColor: "#164e63",
        primaryTextColor: "#e2e8f0",
        primaryBorderColor: "#22d3ee",
        lineColor: "#64748b",
        secondaryColor: "#1e1b4b",
        tertiaryColor: "#0f172a",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "14px",
      },
      flowchart: { curve: "basis", padding: 12, htmlLabels: true },
      sequence: { actorMargin: 24, messageMargin: 32 },
    });
    mermaidReady = true;
  }
  return mermaidApi;
}

type MermaidDiagramProps = {
  chart: string;
  className?: string;
};

export function MermaidDiagram({ chart, className }: MermaidDiagramProps) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);

    const render = async () => {
      if (!hostRef.current) return;
      try {
        const mermaid = await ensureMermaid();
        if (cancelled || !hostRef.current) return;
        const id = `mmd-${reactId}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg } = await mermaid.render(id, chart.trim());
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = svg;
        const svgEl = hostRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.setAttribute("width", "100%");
          svgEl.removeAttribute("height");
          svgEl.style.maxWidth = "100%";
          svgEl.style.height = "auto";
        }
        setBusy(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "No se pudo dibujar el diagrama");
        setBusy(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <div
      className={clsx(
        "mermaid-host overflow-x-auto rounded-xl border border-white/10 bg-[#0b1220] p-3 sm:p-4",
        className,
      )}
    >
      {busy && !error && (
        <p className="py-8 text-center text-sm text-slate-500">Dibujando flujo…</p>
      )}
      {error && (
        <p className="py-4 text-center text-sm text-red-300">
          Error en diagrama: {error}
        </p>
      )}
      <div ref={hostRef} className={clsx(busy && "min-h-[4rem] opacity-0")} />
    </div>
  );
}
