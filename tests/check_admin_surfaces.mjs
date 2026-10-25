import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { formatAdminDateTime } = await import("../admin-ui/src/lib/formatDateTime.ts");
const { formatAgentsHandled } = await import("../admin-ui/src/lib/reportDisplay.ts");
const { formatToolResultLine } = await import("../admin-ui/src/hooks/xai/persistTranscript.ts");
const { localeLabel } = await import("../admin-ui/src/lib/localeLabels.ts");
const { SETUP_GUIDE_PATHS } = await import("../admin-ui/src/lib/setupGuide.ts");
const { routeAllowed } = await import("../admin-ui/src/lib/permissions.ts");

const root = fileURLToPath(new URL("..", import.meta.url));

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

function source(relative) {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

const when = formatAdminDateTime("2026-08-19T20:47:06");
assert(when === "19/08/2026, 20:47:06", `datetime: ${when}`);
assert(!when.includes("T"), when);
assert(!when.includes("AM") && !when.includes("PM"), when);
assert(when.startsWith("19/08/"), when);

const dateSites = [
  "../admin-ui/src/pages/Customers.tsx",
  "../admin-ui/src/pages/CustomerDetail.tsx",
  "../admin-ui/src/pages/Calls.tsx",
  "../admin-ui/src/pages/CallDetail.tsx",
  "../admin-ui/src/components/reports/ReportDetailGrid.tsx",
];
for (const file of dateSites) {
  const text = source(file);
  assert(text.includes("formatAdminDateTime"), `${file} does not call formatAdminDateTime`);
  assert(!text.includes("toLocaleString"), `${file} still uses toLocaleString`);
  assert(!text.includes(".slice(0, 19)") && !text.includes(".slice(0, 16)"), `${file} still slices ISO`);
}

const ficha = source("../admin-ui/src/pages/CustomerDetail.tsx");
assert(ficha.includes('<p className="font-mono text-cyan-200">{c.call_id}</p>'), ficha);
assert(ficha.includes("formatAdminDateTime(c.start_time)"), ficha);
assert(!ficha.includes("ml-2"), "call id is still glued to the date");

const supportUs = formatAgentsHandled(
  { agent_instance_id: "inst-soporte", transferred_to: "support", summary: "Agente final: support" },
  new Map([["inst-soporte", "Soporte US"]]),
  [{ id: "inst-soporte", label: "Soporte US", template_id: "support" }],
);
assert(supportUs === "Soporte US", supportUs);
assert(!supportUs.includes("Soporte general"), supportUs);
assert(supportUs !== "—", supportUs);

const templateOnly = formatAgentsHandled(
  { agent_instance_id: "", transferred_to: "support", summary: "" },
  new Map(),
  [{ id: "inst-soporte", label: "Soporte US", template_id: "support" }],
);
assert(templateOnly === "Soporte US", templateOnly);

const reception = formatAgentsHandled(
  { agent_instance_id: "", transferred_to: "", summary: "Agente final: receptionist" },
  new Map(),
  [{ id: "inst-recepcion", label: "Recepción US", template_id: "receptionist" }],
);
assert(reception === "Recepción US", reception);
assert(reception !== "Recepción", reception);
assert(reception !== "—", reception);

const ambiguous = formatAgentsHandled(
  { agent_instance_id: "", transferred_to: "support", summary: "" },
  new Map(),
  [
    { id: "a", label: "Soporte US", template_id: "support" },
    { id: "b", label: "Soporte GT", template_id: "support" },
  ],
);
assert(ambiguous === "Soporte general", ambiguous);

const longOutput = `${"cuenta enmascarada ".repeat(12)}****3094 ****8493`;
assert(longOutput.length > 120, String(longOutput.length));
const toolLine = formatToolResultLine("get_account_summary", longOutput);
assert(toolLine.includes(longOutput), toolLine);
assert(!toolLine.endsWith("…"), toolLine);
assert(!toolLine.includes("…"), toolLine);
const lookup = formatToolResultLine("lookup_customer", longOutput);
assert(lookup.includes("lookup_customer"), lookup);
assert(lookup.includes(longOutput), lookup);

const voice = source("../admin-ui/src/hooks/useXaiVoice.ts");
assert(voice.includes("formatToolResultLine(result.tool || name, result.output)"), voice);
assert(!voice.includes("slice(0, 120)"), voice);

assert(localeLabel("es") === "Español", localeLabel("es"));
assert(localeLabel("es") !== "English", localeLabel("es"));
const agents = source("../admin-ui/src/pages/Agents.tsx");
assert(agents.includes("localeLabel(profile.locale)"), agents);
assert(!agents.includes("LOCALE_LABELS"), agents);

assert(SETUP_GUIDE_PATHS.includes("setup") && SETUP_GUIDE_PATHS.includes("onboarding"), SETUP_GUIDE_PATHS.join(","));
assert(routeAllowed("/onboarding", ["/setup"]) === true, "onboarding not allowed with setup");
assert(routeAllowed("/setup", ["/setup"]) === true, "setup blocked");
assert(routeAllowed("/onboarding", ["/calls"]) === false, "onboarding open without setup");
const app = source("../admin-ui/src/App.tsx");
assert(
  app.includes("{SETUP_GUIDE_PATHS.map((path) => (") && app.includes('element={<SetupWizard />}'),
  "onboarding is not the setup guide",
);

const analytics = source("../admin-ui/src/pages/Analytics.tsx");
assert(analytics.includes("appliedFilters.dateFrom") && analytics.includes("appliedFilters.dateTo"), analytics);
assert(analytics.includes("agentInstances={agentInstances}"), analytics);
const comparisonAt = analytics.indexOf("Comparación agentes");
const detailTabAt = analytics.indexOf('tab === "detail"');
assert(comparisonAt !== -1 && detailTabAt !== -1 && comparisonAt < detailTabAt, "comparison is inside a tab");
const grid = source("../admin-ui/src/components/reports/ReportDetailGrid.tsx");
assert(grid.includes("formatAgentsHandled(row, agentLabelMap, agentInstances)"), grid);
assert(grid.includes("{row.from_number}"), grid);

console.log(when);
console.log(supportUs);
console.log(reception);
console.log(toolLine.slice(0, 40));
console.log(root);
