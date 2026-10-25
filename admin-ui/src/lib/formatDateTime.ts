/** Spanish day-first datetime shared by Clientes, ficha, Registros, and Análisis. */
export function formatAdminDateTime(value?: string | null): string {
  if (!value?.trim()) return "—";
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return value.trim();
  const [, year, month, day, hour, minute, second = "00"] = match;
  return `${day}/${month}/${year}, ${hour}:${minute}:${second}`;
}

/** Day mark for Dashboard and any YYYY-MM-DD value. Includes the year. No raw T. */
export function formatAdminDay(value?: string | null): string {
  if (!value?.trim()) return "—";
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value.trim();
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
