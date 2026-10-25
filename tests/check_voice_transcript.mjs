const { formatVoiceTranscript } = await import(
  "../admin-ui/src/hooks/xai/persistTranscript.ts"
);

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const saved = formatVoiceTranscript([
  { role: "user", text: "..." },
  { role: "user", text: "   " },
  { role: "user", text: "hola" },
  { role: "assistant", text: "buenos días" },
  { role: "system", text: "get_account_summary" },
]);

assert(!saved.includes("[Cliente] ..."), saved);
assert(!saved.includes("[Cliente]   "), saved);
assert(saved.includes("[Cliente] hola"), saved);
assert(saved.includes("[Agente] buenos días"), saved);
assert(saved.includes("[Sistema] get_account_summary"), saved);
console.log(saved);
