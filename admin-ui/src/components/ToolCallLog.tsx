import { CheckCircle2, Clock, Loader2, Wrench, XCircle } from "lucide-react";
import clsx from "clsx";

export type ToolCallEntry = {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  output: string;
  status: "ok" | "error" | "pending";
  durationMs?: number;
  timestamp: string;
};

export function ToolCallLog({ entries, title = "Tools ejecutadas" }: { entries: ToolCallEntry[]; title?: string }) {
  if (!entries.length) {
    return (
      <div className="tool-log-empty">
        <Wrench className="mx-auto h-5 w-5 text-slate-600" />
        <p className="mt-2 text-xs text-slate-500">
          Las llamadas a tools aparecerán aquí en tiempo real.
        </p>
      </div>
    );
  }

  return (
    <div className="tool-log">
      <p className="tool-log-title">{title}</p>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="tool-log-item">
            <div className="flex items-start gap-2">
              {entry.status === "pending" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-400" />
              ) : entry.status === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-xs font-medium text-cyan-200">
                    {entry.tool}
                  </code>
                  {entry.durationMs != null && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Clock className="h-3 w-3" />
                      {entry.durationMs}ms
                    </span>
                  )}
                </div>
                {Object.keys(entry.arguments).length > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {JSON.stringify(entry.arguments)}
                  </p>
                )}
                {entry.output && entry.status !== "pending" && (
                  <p
                    className={clsx(
                      "mt-1.5 text-xs leading-relaxed",
                      entry.status === "error" ? "text-red-300/90" : "text-slate-300",
                    )}
                  >
                    {entry.output}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}