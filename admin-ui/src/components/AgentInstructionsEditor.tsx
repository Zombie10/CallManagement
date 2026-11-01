import { FileText, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useUiLocale } from "../contexts/LocaleContext";

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
  const { t } = useUiLocale();
  const [showDefault, setShowDefault] = useState(true);
  const hasCustom = Boolean(value.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          <FileText className="h-3 w-3" /> {t("instructions.title")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setShowDefault((v) => !v)}
          >
            {showDefault ? t("instructions.hideDefault") : t("instructions.showDefault")}
          </button>
          {hasCustom && (
            <button
              type="button"
              className="btn-ghost px-2 py-1 text-xs text-amber-300"
              onClick={() => onChange("")}
            >
              <RotateCcw className="mr-1 inline h-3 w-3" />
              {t("instructions.restore")}
            </button>
          )}
        </div>
      </div>
      {showDefault && (
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-slate-400">
          {defaultInstructions || t("instructions.emptyDefault")}
        </pre>
      )}
      <textarea
        className="input-field min-h-[140px] w-full resize-y font-mono text-sm leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("instructions.placeholder")}
      />
      <p className="text-xs text-slate-500">
        {hasCustom ? t("instructions.custom") : t("instructions.usingDefault")}
      </p>
    </div>
  );
}
