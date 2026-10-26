import { DEFAULT_ADMIN_LOCALE, translate, type AdminLocale } from "./i18n";

/** Path segment → catalog key. `onboarding` uses the same label as the setup guide. */
export const ROUTE_KEYS: Record<string, string> = {
  "": "nav.dashboard",
  settings: "nav.settings",
  tenants: "nav.tenants",
  "my-agents": "nav.my_agents",
  agents: "nav.agents",
  customers: "nav.customers",
  calls: "nav.calls",
  analytics: "nav.analytics",
  appointments: "nav.appointments",
  playground: "nav.playground",
  profile: "layout.myProfile",
  users: "nav.users",
  setup: "nav.setup",
  onboarding: "nav.setup",
  operations: "nav.operations",
  supervisor: "nav.supervisor",
};

export function pathSegmentLabel(segment: string, locale: AdminLocale = DEFAULT_ADMIN_LOCALE): string {
  const key = ROUTE_KEYS[segment];
  return key ? translate(key, locale) : segment;
}
