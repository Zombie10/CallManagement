import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { formatAdminDateTime, formatAdminDay } = await import("../admin-ui/src/lib/formatDateTime.ts");
const { formatAgentsHandled, formatDuration, formatMetricValue } = await import("../admin-ui/src/lib/reportDisplay.ts");
const {
  CATALOG,
  DEFAULT_ADMIN_LOCALE,
  calendarWeekdayInitial,
  initialAdminLocale,
  monthName,
  outcomeLabel,
  presentSettingLabel,
  providerLabel,
  sentimentLabel,
  seriesPointLabel,
  settingOptionLabel,
  toolLabel,
  mcpCallLabel,
  translate,
  voiceCodeInterpreterLine,
  voiceConnectError,
  voiceSearchLine,
  voiceSocketClosed,
  voiceTranscriptSaveError,
  weekdayLabel,
} = await import("../admin-ui/src/lib/i18n.ts");
const { microphoneErrorMessage } = await import("../admin-ui/src/lib/audio.ts");
const { pathSegmentLabel } = await import("../admin-ui/src/lib/breadcrumbs.ts");
const { deriveAgentLiveState, statusLabel } = await import("../admin-ui/src/lib/agentStatus.ts");
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
const comparisonAt = analytics.indexOf("analytics.agentComparison");
const detailTabAt = analytics.indexOf('tab === "detail"');
assert(comparisonAt !== -1 && detailTabAt !== -1 && comparisonAt < detailTabAt, "comparison is inside a tab");
assert(analytics.includes("a.label"), analytics);
assert(!analytics.includes("Sin asignar"), analytics);
assert(analytics.includes("formatDuration(a.avg_duration_seconds)"), analytics);
const grid = source("../admin-ui/src/components/reports/ReportDetailGrid.tsx");
assert(grid.includes("formatAgentsHandled(row, agentLabelMap, agentInstances)"), grid);
assert(grid.includes("{row.from_number}"), grid);

const duration = formatDuration(91);
assert(duration === "1m 31s", duration);
assert(formatMetricValue("avg_duration", 91) === "1m 31s", formatMetricValue("avg_duration", 91));
assert(formatMetricValue("sum_duration", 91) === "1m 31s", formatMetricValue("sum_duration", 91));
assert(formatMetricValue("count", 91) === "91");
const callsPage = source("../admin-ui/src/pages/Calls.tsx");
assert(callsPage.includes("formatDuration(call.duration_seconds)"), callsPage);
assert(!callsPage.includes("{call.duration_seconds}s"), callsPage);
assert(grid.includes("formatDuration(row.duration_seconds)"), grid);
const callDetail = source("../admin-ui/src/pages/CallDetail.tsx");
assert(callDetail.includes("formatDuration(call.duration_seconds)"), callDetail);
assert(!callDetail.includes("{call.duration_seconds}s"), callDetail);

const dayMark = formatAdminDay("2026-08-19");
assert(dayMark === "19/08/2026", dayMark);
assert(!dayMark.includes("T"), dayMark);
const dashboard = source("../admin-ui/src/pages/Dashboard.tsx");
assert(dashboard.includes("formatAdminDay("), dashboard);
assert(!dashboard.includes(".slice(5)"), dashboard);
assert((dashboard.match(/dashboard\.fullHistory/g) || []).length >= 2, dashboard);
assert(!dashboard.includes("DateField") && !dashboard.includes('type="date"'), dashboard);
assert(translate("dashboard.fullHistory", "es").toLowerCase().includes("históric"), translate("dashboard.fullHistory", "es"));
assert(translate("dashboard.calls", "es") !== translate("dashboard.calls", "en"));
assert(translate("dashboard.callsByDay", "es") !== translate("dashboard.callsByDay", "en"));
assert(dashboard.includes("formatDuration(analytics.avg_duration_seconds)"), dashboard);
assert(dashboard.includes('t("dashboard.avgDuration")'), dashboard);
assert(!dashboard.includes("{analytics.avg_duration_seconds}s"), dashboard);
assert(!dashboard.includes("Duración promedio:"), dashboard);

const envStore = source("../src/call_management/admin/env_store.py");
const catalogKeys = [...envStore.matchAll(/"key": "([A-Z0-9_]+)"/g)].map((match) => match[1]);
assert(catalogKeys.includes("LIVEKIT_URL") && catalogKeys.includes("XAI_API_KEY") && catalogKeys.includes("SLACK_WEBHOOK_URL"), catalogKeys.join(","));
const visiblePages = [
  "../admin-ui/src/pages/Settings.tsx",
  "../admin-ui/src/pages/SetupWizard.tsx",
  "../admin-ui/src/pages/Playground.tsx",
  "../admin-ui/src/pages/Login.tsx",
  "../admin-ui/src/pages/Dashboard.tsx",
];
for (const file of visiblePages) {
  const text = source(file);
  for (const key of catalogKeys) {
    assert(!text.includes(key), `${file} shows ${key}`);
  }
  assert(!text.includes("systemctl"), `${file} shows systemctl`);
}
const settingsPage = source("../admin-ui/src/pages/Settings.tsx");
assert(!settingsPage.includes("{field.key}</p>") && !settingsPage.includes(">{field.key}<"), settingsPage);
assert(settingsPage.includes("[field.key]"), settingsPage);
assert(settingsPage.includes("presentSettingLabel(field.key, field.label, locale)"), settingsPage);
for (const locale of ["es", "en"]) {
  for (const [catalogKey, value] of Object.entries(CATALOG[locale])) {
    for (const key of catalogKeys) {
      assert(!value.includes(key), `${locale} ${catalogKey} contains an environment key`);
    }
    assert(!value.toLowerCase().includes("systemctl"), catalogKey);
    assert(!value.includes("localhost") && !value.includes("wss://") && !value.includes(".env"), catalogKey);
  }
}

const esKeys = Object.keys(CATALOG.es);
const enKeys = Object.keys(CATALOG.en);
assert(esKeys.every((key) => key in CATALOG.en), esKeys.filter((key) => !(key in CATALOG.en)).join(","));
assert(enKeys.every((key) => key in CATALOG.es), enKeys.filter((key) => !(key in CATALOG.es)).join(","));
assert(DEFAULT_ADMIN_LOCALE === "es", DEFAULT_ADMIN_LOCALE);
assert(initialAdminLocale(null) === "es");
assert(initialAdminLocale(undefined) === "es");
assert(initialAdminLocale("en") === "en");
assert(initialAdminLocale("fr") === "es");
assert(toolLabel("web_search", "es") === "Búsqueda web", toolLabel("web_search", "es"));
assert(toolLabel("web_search", "en") === "Web Search");
assert(toolLabel("file_search", "es") !== "File Search");
assert(toolLabel("file_search", "en") === "File Search");
assert(toolLabel("x_search", "es") !== toolLabel("x_search", "en"));
assert(toolLabel("code_interpreter", "es") !== "Code Interpreter");
assert(toolLabel("code_interpreter", "en") === "Code Interpreter");
assert(presentSettingLabel("XAI_ENABLE_WEB_SEARCH", "Web Search", "es") === "Búsqueda web");
assert(presentSettingLabel("XAI_ENABLE_FILE_SEARCH", "File Search", "en") === "File Search");
assert(presentSettingLabel("LIVEKIT_API_KEY", "API Key", "es") === "Clave API");
assert(presentSettingLabel("LIVEKIT_API_KEY", "API Key", "en") === "API key");
assert(presentSettingLabel("SLACK_WEBHOOK_URL", "Slack Webhook", "es") === "Webhook de Slack");
assert(presentSettingLabel("CRM_DB_PATH", "CRM DB Path", "es") === "Ruta de la base del CRM");
for (const key of catalogKeys) {
  const esLabel = presentSettingLabel(key, "FALLBACK", "es");
  const enLabel = presentSettingLabel(key, "FALLBACK", "en");
  assert(esLabel !== "FALLBACK" && enLabel !== "FALLBACK", key);
  assert(esLabel !== enLabel, `${key}: ${esLabel} / ${enLabel}`);
  assert(!esLabel.includes(key) && !enLabel.includes(key), key);
}
const bodyKeys = [
  ["../admin-ui/src/pages/SetupWizard.tsx", "setup.livekitKeys"],
  ["../admin-ui/src/pages/Dashboard.tsx", "dashboard.avgDuration"],
  ["../admin-ui/src/pages/Dashboard.tsx", "dashboard.activeCalls"],
  ["../admin-ui/src/pages/Calls.tsx", "calls.searchPlaceholder"],
  ["../admin-ui/src/pages/Calls.tsx", "calls.empty"],
  ["../admin-ui/src/pages/Calls.tsx", "calls.allChannels"],
  ["../admin-ui/src/pages/Analytics.tsx", "analytics.runReport"],
  ["../admin-ui/src/pages/Analytics.tsx", "analytics.filters"],
  ["../admin-ui/src/pages/Analytics.tsx", "analytics.tabSummary"],
  ["../admin-ui/src/pages/Analytics.tsx", "analytics.tabDetail"],
  ["../admin-ui/src/components/reports/ReportCharts.tsx", "analytics.seriesPeriod"],
  ["../admin-ui/src/components/reports/ReportCharts.tsx", "analytics.noSeries"],
  ["../admin-ui/src/components/reports/ReportDetailGrid.tsx", "detail.noRows"],
  ["../admin-ui/src/components/reports/ReportDetailGrid.tsx", "detail.openRecord"],
  ["../admin-ui/src/lib/breadcrumbs.ts", "nav.calls"],
  ["../admin-ui/src/components/reports/ExportReportMenu.tsx", "analytics.export"],
];
for (const [file, key] of bodyKeys) {
  const text = source(file);
  assert(text.includes(key), `${file} missing ${key}`);
  assert(translate(key, "es") !== translate(key, "en"), `${key} does not switch`);
}
const crumbs = source("../admin-ui/src/components/Breadcrumbs.tsx");
assert(crumbs.includes("useUiLocale"), crumbs);
assert(!crumbs.includes('"Registros"'), crumbs);
assert(callsPage.includes('t("calls.searchPlaceholder")'), callsPage);
assert(!callsPage.includes("Buscar por teléfono"), callsPage);
assert(!callsPage.includes("Sin registros que coincidan"), callsPage);
assert(analytics.includes('t("analytics.runReport")'), analytics);
assert(!analytics.includes("Ejecutar reporte"), analytics);
assert(analytics.includes('t("analytics.filters")'), analytics);
assert(analytics.includes('t("analytics.tabSummary")'), analytics);
assert(analytics.includes('t("analytics.tabDetail")'), analytics);
const charts = source("../admin-ui/src/components/reports/ReportCharts.tsx");
assert(charts.includes("useUiLocale"), charts);
assert(charts.includes('t("analytics.seriesPeriod")'), charts);
assert(!charts.includes(">Periodo<"), charts);
assert(grid.includes("useUiLocale"), grid);
assert(grid.includes('t("detail.noRows")'), grid);
assert(!grid.includes("Sin registros en el período"), grid);
for (const key of ["settings.title", "setup.title", "calls.title", "analytics.title", "nav.calls", "nav.settings", "nav.setup", "nav.analytics"]) {
  assert(translate(key, "es") !== translate(key, "en"), key);
}
const localeContext = source("../admin-ui/src/contexts/LocaleContext.tsx");
assert(!localeContext.includes("lib/api"), localeContext);
assert(!localeContext.replaceAll("DEFAULT_ADMIN_LOCALE", "").includes("DEFAULT_LOCALE"), localeContext);
const wired = [
  ["../admin-ui/src/pages/Settings.tsx", "useUiLocale"],
  ["../admin-ui/src/pages/SetupWizard.tsx", "useUiLocale"],
  ["../admin-ui/src/pages/Dashboard.tsx", "useUiLocale"],
  ["../admin-ui/src/pages/Calls.tsx", "useUiLocale"],
  ["../admin-ui/src/pages/Analytics.tsx", "useUiLocale"],
  ["../admin-ui/src/components/Layout.tsx", "useUiLocale"],
  ["../admin-ui/src/pages/Agents.tsx", "toolLabel"],
];
for (const [file, needle] of wired) {
  assert(source(file).includes(needle), `${file} missing ${needle}`);
}
const agentsPage = source("../admin-ui/src/pages/Agents.tsx");
assert(!agentsPage.includes("TOOL_LABELS"), agentsPage);
assert(agentsPage.includes("localeLabel(profile.locale)"), agentsPage);
const appSource = source("../admin-ui/src/main.tsx");
assert(appSource.includes("<LocaleProvider>"), appSource);

const differKeys = [
  "fleet.title",
  "fleet.live",
  "fleet.operating",
  "fleet.live.closed",
  "fleet.live.onCall",
  "fleet.live.available",
  "fleet.active",
  "fleet.opsLine",
  "webhooks.add",
  "webhooks.empty",
  "webhooks.events",
  "webhooks.needCompany",
  "api.title",
  "api.copyNow",
  "api.create",
  "api.keysFor",
  "api.scope.calls.read",
  "api.scope.customers.read",
  "api.scope.appointments.read",
  "api.scope.appointments.write",
  "audit.title",
  "audit.empty",
  "filters.clear",
  "filters.showing",
  "date.select",
  "date.today",
  "date.clear",
  "date.prevMonth",
  "date.month.1",
  "date.month.8",
  "date.cal.3",
  "date.cal.6",
  "recording.title",
  "recording.download",
  "recording.loadError",
  "outcome.completed",
  "sentiment.negative",
  "sentiment.positive",
  "provider.xai",
  "provider.inference",
  "playground.connect",
  "playground.disconnect",
  "playground.placeholderMessage",
  "playground.placeholderSession",
  "playground.modeXai",
  "playground.modeLivekit",
  "playground.emptyVoice",
  "playground.subtitle",
  "playground.voice",
  "playground.text",
  "nav.playground",
  "toolsLog.title",
  "toolsLog.empty",
  "voice.mcpInProgress",
  "voice.mcpCompleted",
  "voice.mcpFailed",
  "voice.search",
  "voice.codeInterpreter",
  "voice.transcriptSave",
  "voice.connect",
  "voice.socketClosed",
  "voice.micDenied",
  "voice.micIos",
  "voice.micPersist",
  "voice.micMissing",
  "voice.micGeneric",
];
for (const key of differKeys) {
  assert(translate(key, "es") !== translate(key, "en"), key);
  assert(translate(key, "es") !== key && translate(key, "en") !== key, key);
}

const copySites = [
  ["../admin-ui/src/components/AgentFleetStatus.tsx", 't("fleet.title")', "Flota de agentes"],
  ["../admin-ui/src/components/AgentFleetStatus.tsx", 't("fleet.live")', '"En vivo"'],
  ["../admin-ui/src/components/AgentFleetStatus.tsx", 't("fleet.operating")', "Operativos ahora"],
  ["../admin-ui/src/components/AgentFleetStatus.tsx", 't("fleet.active")', "Agentes activos"],
  ["../admin-ui/src/components/AgentFleetStatus.tsx", "deriveAgentLiveState(agent, locale)", "Fuera de horario"],
  ["../admin-ui/src/lib/agentStatus.ts", "fleet.live.closed", "Fuera de horario"],
  ["../admin-ui/src/components/WebhooksPanel.tsx", 't("webhooks.add")', ">Agregar<"],
  ["../admin-ui/src/components/WebhooksPanel.tsx", 't("webhooks.empty")', "Sin webhooks configurados"],
  ["../admin-ui/src/components/WebhooksPanel.tsx", 't("webhooks.events")', "con reintentos"],
  ["../admin-ui/src/components/ApiKeysPanel.tsx", 't("api.title")', "API pública"],
  ["../admin-ui/src/components/ApiKeysPanel.tsx", 't("api.copyNow")', "Copia esta clave"],
  ["../admin-ui/src/components/ApiKeysPanel.tsx", "api.scope.", "Leer llamadas"],
  ["../admin-ui/src/components/WebhookAuditPanel.tsx", 't("audit.title")', "Auditoría de webhooks"],
  ["../admin-ui/src/components/WebhookAuditPanel.tsx", 't("audit.empty")', "Sin entregas registradas"],
  ["../admin-ui/src/components/ListFilterBar.tsx", 't("filters.clear")', ">Limpiar<"],
  ["../admin-ui/src/components/ListFilterBar.tsx", 't("filters.showing"', "Mostrando"],
  ["../admin-ui/src/components/DateField.tsx", 't("date.select")', "Seleccionar fecha"],
  ["../admin-ui/src/components/DateField.tsx", "calendarWeekdayInitial(", "Seleccionar fecha"],
  ["../admin-ui/src/components/DateField.tsx", "monthName(", "Enero"],
  ["../admin-ui/src/components/CallRecordingPlayer.tsx", 't("recording.title")', "Grabación de audio"],
  ["../admin-ui/src/components/CallRecordingPlayer.tsx", 't("recording.download")', "Descargar grabación"],
  ["../admin-ui/src/pages/Playground.tsx", 't("nav.playground")', "Probar agente"],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.connect")', '"Conectar"'],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.disconnect")', "Desconectar"],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.placeholderMessage")', "Escribe tu mensaje"],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.modeXai")', "xAI directo"],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.modeLivekit")', "LiveKit producción"],
  ["../admin-ui/src/pages/Playground.tsx", 't("playground.emptyVoice")', "Elige un agente"],
  ["../admin-ui/src/pages/Dashboard.tsx", "outcomeLabel(", "capitalize"],
  ["../admin-ui/src/pages/Dashboard.tsx", "sentimentLabel(", "capitalize"],
  ["../admin-ui/src/pages/Calls.tsx", "outcomeLabel(", "capitalize"],
  ["../admin-ui/src/pages/Analytics.tsx", "sentimentLabel(", "capitalize"],
  ["../admin-ui/src/pages/Analytics.tsx", "outcomeLabel(", "replaceAll"],
  ["../admin-ui/src/components/reports/PivotTable.tsx", "weekdayLabel(", ""],
  ["../admin-ui/src/components/reports/ReportCharts.tsx", "seriesPointLabel(", ""],
];
for (const [file, needle, forbidden] of copySites) {
  const text = source(file);
  assert(text.includes(needle), `${file} missing ${needle}`);
  if (forbidden) assert(!text.includes(forbidden), `${file} still hardcodes ${forbidden}`);
}

assert(outcomeLabel("completed", "es") !== "Completed", "completed es");
assert(outcomeLabel("completed", "en") === "Completed", "completed en");
assert(outcomeLabel("completed", "es") !== outcomeLabel("completed", "en"), "completed pair");
assert(outcomeLabel("completed", "es") === translate("outcome.completed", "es"), "completed catalog");
assert(sentimentLabel("negative", "es") !== "Negative", "negative es");
assert(sentimentLabel("negative", "en") === "Negative", "negative en");
assert(sentimentLabel("negative", "es") !== sentimentLabel("negative", "en"), "negative pair");
assert(sentimentLabel("neutral", "es") === translate("sentiment.neutral", "es"), "neutral es");
assert(sentimentLabel("neutral", "en") === translate("sentiment.neutral", "en"), "neutral en");
assert(sentimentLabel("positive", "es") !== sentimentLabel("positive", "en"), "positive pair");
assert(sentimentLabel("positive", "en") === "Positive", "positive en");
assert(providerLabel("xai", "es") !== "xai", "provider es token");
assert(providerLabel("xai", "en") !== "xai", "provider en token");
assert(providerLabel("xai", "es") !== providerLabel("xai", "en"), "provider pair");
assert(settingOptionLabel("MODEL_PROVIDER", "xai", "es") === providerLabel("xai", "es"), "option es");
assert(settingOptionLabel("MODEL_PROVIDER", "xai", "en") === providerLabel("xai", "en"), "option en");
assert(settingOptionLabel("LOG_LEVEL", "INFO", "es") === "INFO", "other options stay");
assert(settingsPage.includes("value: opt"), settingsPage);
assert(settingsPage.includes("settingOptionLabel(field.key, opt, locale)"), settingsPage);

assert(pathSegmentLabel("onboarding", "es") === translate("nav.setup", "es"), "onboarding es");
assert(pathSegmentLabel("onboarding", "en") === translate("nav.setup", "en"), "onboarding en");
assert(pathSegmentLabel("onboarding", "es") !== "onboarding", "onboarding raw");
assert(pathSegmentLabel("onboarding", "en") !== "onboarding", "onboarding raw en");
assert(pathSegmentLabel("setup", "es") === pathSegmentLabel("onboarding", "es"), "setup alias");
const crumbSource = source("../admin-ui/src/lib/breadcrumbs.ts");
assert(crumbSource.includes('onboarding: "nav.setup"'), crumbSource);
assert(crumbs.includes("pathSegmentLabel"), crumbs);

assert(weekdayLabel("4", "es") === "Jue", "thu es");
assert(weekdayLabel(4, "es") === "Jue", "thu number");
assert(weekdayLabel("Jue", "es") === "Jue", "thu mark es");
assert(weekdayLabel("4", "en") === "Thu", "thu en");
assert(weekdayLabel("Jue", "en") !== "Jue", "thu mark en");
assert(weekdayLabel("6", "es") === "Sáb", "sat es");
assert(weekdayLabel(6, "es") === "Sáb", "sat number");
assert(weekdayLabel("6", "en") === "Sat", "sat en");
assert(weekdayLabel("Sáb", "en") !== "Sáb", "sat mark en");
assert(seriesPointLabel("4", "Jue", "weekday", "en") === weekdayLabel("4", "en"), "series thu");
assert(seriesPointLabel("4", "Jue", "weekday", "en") !== "Jue", "series thu not es");
assert(seriesPointLabel("6", "Sáb", "weekday", "es") === "Sáb", "series sat es");
assert(seriesPointLabel("6", "Sáb", "weekday", "en") !== "Sáb", "series sat en");
assert(seriesPointLabel("2026-08-19", "19/08/2026", "day", "en") === "19/08/2026", "series day");
assert(calendarWeekdayInitial(3, "es") === "Ju", "cal thu es");
assert(calendarWeekdayInitial(3, "en") === "Th", "cal thu en");
assert(calendarWeekdayInitial(3, "en") !== "Ju", "cal thu not es");
assert(calendarWeekdayInitial(3, "en") !== "Jue", "cal thu not pivot");
assert(monthName(1, "es") !== monthName(1, "en"), "month");
assert(monthName(8, "es") === "Agosto", "august es");
assert(monthName(8, "en") === "August", "august en");

const closedAgent = {
  id: "a",
  display_name: "A",
  status: "active",
  call_count_today: 0,
  schedule_status: "closed",
};
assert(deriveAgentLiveState(closedAgent, "es").label === translate("fleet.live.closed", "es"), "closed es");
assert(deriveAgentLiveState(closedAgent, "en").label === translate("fleet.live.closed", "en"), "closed en");
assert(deriveAgentLiveState(closedAgent, "es").label !== deriveAgentLiveState(closedAgent, "en").label, "closed pair");
assert(deriveAgentLiveState(closedAgent, "es").key === "closed", "closed key");
assert(statusLabel("active", "es") !== statusLabel("active", "en"), "status pair");
assert(statusLabel("paused", "en") === translate("fleet.status.paused", "en"), "paused en");

const unassignedCall = formatAgentsHandled(
  { agent_instance_id: "", transferred_to: "", summary: "" },
  new Map(),
  [],
);
assert(unassignedCall === "—", unassignedCall);
assert(unassignedCall !== "Sin asignar", unassignedCall);

const toolLog = source("../admin-ui/src/components/ToolCallLog.tsx");
assert(toolLog.includes('t("toolsLog.title")'), "tool log title");
assert(toolLog.includes('t("toolsLog.empty")'), "tool log empty");
assert(toolLog.includes("tool-log-empty") && toolLog.includes("{heading}"), "tool log heading");
assert(!toolLog.includes("Tools ejecutadas"), "tool log spanish title");
assert(!toolLog.includes("Las llamadas a tools"), "tool log spanish empty");
assert(mcpCallLabel("response.mcp_call.in_progress", "es") === translate("voice.mcpInProgress", "es"), "mcp es");
assert(mcpCallLabel("response.mcp_call.in_progress", "en") === translate("voice.mcpInProgress", "en"), "mcp en");
assert(mcpCallLabel("response.mcp_call.completed", "es") !== mcpCallLabel("response.mcp_call.completed", "en"), "mcp done");
assert(mcpCallLabel("response.mcp_call.failed", "en") === translate("voice.mcpFailed", "en"), "mcp fail");
assert(voiceSearchLine("web_search_call", "es") === translate("voice.search", "es", { kind: toolLabel("web_search", "es") }), "search es");
assert(voiceSearchLine("web_search_call", "en") === translate("voice.search", "en", { kind: toolLabel("web_search", "en") }), "search en");
assert(voiceSearchLine("x_search_call", "en") !== voiceSearchLine("x_search_call", "es"), "search pair");
assert(!voiceSearchLine("web_search_call", "en").startsWith("Búsqueda"), "search prefix");
assert(voiceCodeInterpreterLine("es") !== voiceCodeInterpreterLine("en"), "code pair");
assert(voiceCodeInterpreterLine("en") === translate("voice.codeInterpreter", "en"), "code en");
assert(voiceTranscriptSaveError("es") !== voiceTranscriptSaveError("en"), "save pair");
assert(voiceTranscriptSaveError("en") === translate("voice.transcriptSave", "en"), "save en");
assert(voiceConnectError("es") !== voiceConnectError("en"), "connect pair");
assert(voiceConnectError("en") === translate("voice.connect", "en"), "connect en");
assert(voiceSocketClosed(1006, "es") !== voiceSocketClosed(1006, "en"), "socket pair");
assert(voiceSocketClosed(1006, "en").includes("1006"), "socket code");
assert(voice.includes("mcpCallLabel(message.type, locale)"), "voice mcp call");
assert(voice.includes("voiceSearchLine(item.type, locale)"), "voice search call");
assert(voice.includes("voiceCodeInterpreterLine(locale)"), "voice code call");
assert(voice.includes("voiceTranscriptSaveError(locale)"), "voice save call");
assert(voice.includes("voiceConnectError(locale)"), "voice connect call");
assert(voice.includes("voiceSocketClosed(ev.code, locale)"), "voice socket call");
assert(voice.includes("microphoneErrorMessage(err, locale)"), "voice mic call");
assert(voice.includes("preserveUserActivation: true, locale"), "voice mic locale");
assert(!voice.includes("MCP en curso"), "voice mcp spanish");
assert(!voice.includes("Búsqueda:"), "voice search spanish");
assert(!voice.includes("Code interpreter ejecutando"), "voice code spanish");
assert(!voice.includes("No se pudo guardar la transcripción"), "voice save spanish");
assert(!voice.includes("No se pudo conectar al Voice Agent"), "voice connect spanish");
assert(!voice.includes("WebSocket cerrado"), "voice socket spanish");
const audioSource = source("../admin-ui/src/lib/audio.ts");
for (const key of ["voice.micDenied", "voice.micIos", "voice.micPersist", "voice.micMissing", "voice.micGeneric"]) {
  assert(audioSource.includes(key), key);
}
assert(!audioSource.includes("No se pudo usar el micrófono"), "audio mic spanish");
const denied = new DOMException("Permission denied", "NotAllowedError");
const esMic = microphoneErrorMessage(denied, "es");
const enMic = microphoneErrorMessage(denied, "en");
assert(esMic !== enMic, "mic pair");
assert(esMic.startsWith(translate("voice.micDenied", "es")), "mic es");
assert(enMic.startsWith(translate("voice.micDenied", "en")), "mic en");
assert(esMic.endsWith(translate("voice.micPersist", "es")), "mic es tail");
assert(enMic.endsWith(translate("voice.micPersist", "en")), "mic en tail");
assert(!enMic.includes("micrófono"), "mic en word");
const missingMic = new DOMException("device not found", "NotFoundError");
assert(microphoneErrorMessage(missingMic, "es") === translate("voice.micMissing", "es"), "mic missing es");
assert(microphoneErrorMessage(missingMic, "en") === translate("voice.micMissing", "en"), "mic missing en");
assert(microphoneErrorMessage("", "en") === translate("voice.micGeneric", "en"), "mic generic");
const liveKitVoice = source("../admin-ui/src/hooks/useLiveKitVoice.ts");
assert(liveKitVoice.includes("microphoneErrorMessage(err, locale)"), "livekit mic");

console.log(when);
console.log(supportUs);
console.log(reception);
console.log(toolLine.slice(0, 40));
console.log(duration);
console.log(dayMark);
console.log(toolLabel("web_search", "es"));
console.log(toolLabel("web_search", "en"));
console.log(root);
