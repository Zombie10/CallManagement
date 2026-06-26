import type { SelectOption } from "../components/Select";

export const AGENT_OPTIONS: SelectOption[] = [
  { value: "receptionist", label: "Recepción", description: "Saludo y enrutamiento" },
  { value: "banking_support", label: "Soporte bancario BAC", description: "Cuentas, tarjetas y verificación" },
  { value: "support", label: "Soporte general", description: "Cuentas y citas" },
  { value: "sales", label: "Ventas", description: "Precios y demos" },
  { value: "technical", label: "Técnico", description: "Ingeniería y código" },
  { value: "escalation", label: "Escalación", description: "Supervisor / humano" },
];

export function agentLabel(id: string): string {
  return AGENT_OPTIONS.find((a) => a.value === id)?.label || id;
}