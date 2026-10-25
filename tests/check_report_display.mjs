const { formatAgentsHandled, templateAgentFromSummary } = await import(
  "../admin-ui/src/lib/reportDisplay.ts"
);

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const spanish = templateAgentFromSummary("ID de llamada: call_1\nAgente final: support\n");
const english = templateAgentFromSummary("Final agent: support");
assert(spanish === "support", `spanish parse: ${spanish}`);
assert(english === "support", `english parse: ${english}`);

const label = formatAgentsHandled(
  { agent_instance_id: "", transferred_to: "", summary: "Agente final: support" },
  new Map(),
);
assert(label === "Soporte general", `label: ${label}`);
console.log(label);
