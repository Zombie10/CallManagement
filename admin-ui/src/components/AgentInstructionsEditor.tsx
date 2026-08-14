import { FileText, RotateCcw } from "lucide-react";
import { useState } from "react";

type AgentInstructionsEditorProps = {
  value: string;
  defaultInstructions: string;
  onChange: (customInstructions: string) => void;
};

export function AgentInstructionsEditor({
  value,
  defaultInstructions,
  onChange,
}: AgentInstructionsEditorProps) {
  const [showDefault, setShowDefault] = useState(true);
  const hasCustom = Boolean(value.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <FileText className="h-3 w-3" /> Instrucciones del agente
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setShowDefault((v) => !v)}
          >
            {showDefault ? "Ocultar default" : "Ver default"}
          </button>
          {hasCustom && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-amber-300"
              onClick={() => onChange("")}
            >
              <RotateCcw className="mr-1 inline h-3 w-3" />
              Restaurar default
            </button>
          )}
        </div>
      </div>
      {showDefault && (
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-slate-400">
          {defaultInstructions || "Sin instrucciones por defecto."}
        </pre>
      )}
      <textarea
        className="input-field min-h-[140px] w-full resize-y font-mono text-sm leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Vacío = usar las instrucciones por defecto de la plantilla."
      />
      <p className="text-xs text-slate-500">
        {hasCustom
          ? "Usando instrucciones personalizadas (se combinan con estilo de llamada e idioma)."
          : "Usando las instrucciones por defecto de la plantilla."}
      </p>
    </div>
  );
}
