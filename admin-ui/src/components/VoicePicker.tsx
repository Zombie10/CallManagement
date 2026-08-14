import { Mic } from "lucide-react";
import { Select } from "./Select";
import { VoicePreviewButton } from "./VoicePreviewButton";
import type { VoiceLanguageOption, VoiceLibraryEntry } from "../lib/api";
import { voiceSelectOptions } from "../lib/voices";

type VoicePickerProps = {
  voiceId: string;
  language: string;
  localeFallback?: string;
  languageOptions?: VoiceLanguageOption[];
  library?: VoiceLibraryEntry[];
  onVoiceChange: (voiceId: string) => void;
  onLanguageChange: (language: string) => void;
};

export function VoicePicker({
  voiceId,
  language,
  localeFallback = "es",
  languageOptions = [],
  library = [],
  onVoiceChange,
  onLanguageChange,
}: VoicePickerProps) {
  const previewLanguage = language || localeFallback;
  return (
    <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/[0.04] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
            <Mic className="h-4 w-4 text-cyan-400" />
            Voz xAI del agente
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Voces oficiales de xAI · muestra TTS en el idioma configurado
          </p>
        </div>
        <VoicePreviewButton voiceId={voiceId || "carina"} language={previewLanguage} label="Probar voz" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Voz xAI</span>
          <Select
            className="w-full"
            value={voiceId || "carina"}
            onChange={onVoiceChange}
            options={voiceSelectOptions(library)}
            placeholder="Seleccionar voz…"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Idioma de muestra / ASR
          </span>
          <Select
            className="w-full"
            value={language}
            onChange={onLanguageChange}
            options={[
              { value: "", label: `Heredar locale (${localeFallback})` },
              ...languageOptions.map((opt) => ({ value: opt.code, label: opt.label })),
            ]}
          />
        </label>
      </div>
    </div>
  );
}
