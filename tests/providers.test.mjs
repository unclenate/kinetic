// tests/providers.test.mjs
import assert from "node:assert/strict";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}
async function withFetch(stub, fn) {
  const orig = globalThis.fetch; globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
function jsonResponse(obj, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj ?? "") };
}

await test("projectStrict drops unsupported keywords but keeps shape", async () => {
  const { projectStrict } = await import("../src/providers/schema-project.mjs");
  const input = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^x", minLength: 2, maxLength: 4 },
      n: { type: ["integer", "null"], minimum: 0, maximum: 9 },
      tags: { type: "array", items: { type: "string", maxLength: 3 }, maxItems: 5 },
      kind: { type: "string", enum: ["a", "b"] },
    },
  };
  const out = projectStrict(input);
  assert.equal(out.properties.id.pattern, undefined);
  assert.equal(out.properties.id.minLength, undefined);
  assert.equal(out.properties.n.minimum, undefined);
  assert.equal(out.properties.tags.maxItems, undefined);
  assert.equal(out.properties.tags.items.maxLength, undefined);
  assert.deepEqual(out.required, ["id"]);
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.properties.kind.enum, ["a", "b"]);
  assert.deepEqual(out.properties.n.type, ["integer", "null"]);
});

await test("ollama: builds /api/chat request with format and parses content", async () => {
  const { process: run } = await import("../src/providers/ollama.mjs");
  process.env.OLLAMA_BASE_URL = "http://localhost:11434";
  const validOutput = {
    admin_tasks: [],
    proof_card: {
      id: "proof_abc123", title: "Card", summary: "s".repeat(25), tech_tags: [],
      time_to_resolution_minutes: null, impact_metric: null,
      domain: "business", activity_type: "build", visual_theme: "neon", narrative: "n".repeat(45),
    },
  };
  let captured;
  const stub = async (url, opts) => {
    captured = { url, body: JSON.parse(opts.body) };
    return jsonResponse({ message: { content: JSON.stringify(validOutput) } });
  };
  const out = await withFetch(stub, () => run({ text: "shipped" }, { model: "llama3.1" }));
  assert.equal(captured.url, "http://localhost:11434/api/chat");
  assert.equal(captured.body.model, "llama3.1");
  assert.equal(captured.body.stream, false);
  assert.ok(captured.body.format && captured.body.format.type === "object", "format carries the projected schema");
  assert.equal(out.proof_card.activity_type, "build");
});

await test("openai: builds chat/completions request and parses JSON content", async () => {
  const { process: run } = await import("../src/providers/openai.mjs");
  process.env.OPENAI_API_KEY = "sk-test";
  const validOutput = {
    admin_tasks: [],
    proof_card: {
      id: "proof_abc123", title: "Card", summary: "s".repeat(25), tech_tags: [],
      time_to_resolution_minutes: null, impact_metric: null,
      domain: "business", activity_type: "fix", visual_theme: "midnight", narrative: "n".repeat(45),
    },
  };
  let captured;
  const stub = async (url, opts) => {
    captured = { url, auth: opts.headers.Authorization, body: JSON.parse(opts.body) };
    return jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] });
  };
  const out = await withFetch(stub, () => run({ text: "fixed the bug" }, { model: "gpt-4o-mini" }));
  assert.equal(captured.url, "https://api.openai.com/v1/chat/completions");
  assert.match(captured.auth, /Bearer sk-test/);
  assert.equal(captured.body.model, "gpt-4o-mini");
  assert.equal(captured.body.response_format.type, "json_object");
  assert.equal(out.proof_card.activity_type, "fix");
});

await test("openai: missing key throws", async () => {
  delete process.env.OPENAI_API_KEY;
  const { process: run } = await import("../src/providers/openai.mjs");
  await assert.rejects(() => run({ text: "x" }), /OPENAI_API_KEY/);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
