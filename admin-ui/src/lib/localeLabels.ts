const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  multi: "Multilingüe",
};

export function localeLabel(locale?: string | null): string {
  if (!locale) return "—";
  return LOCALE_LABELS[locale] || locale;
}
