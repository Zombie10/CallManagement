import type { SelectOption } from "../components/Select";
import type { VoiceLibraryEntry } from "./api";

export function voiceSelectOptions(library: VoiceLibraryEntry[]): SelectOption[] {
  return library.map((v) => ({
    value: v.id,
    label: v.name,
    description: `${v.tone} · ${v.description}`,
  }));
}