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

// Shared schema-valid provider output for prompt-building tests (Phase 2b).
const validOutput = {
  admin_tasks: [],
  proof_card: {
    id: "proof_abc123", title: "Card", summary: "s".repeat(25), tech_tags: [],
    time_to_resolution_minutes: null, impact_metric: null,
    domain: "business", activity_type: "build", visual_theme: "neon", narrative: "n".repeat(45),
  },
};

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

await test("registry: lists providers and reports residency", async () => {
  const reg = await import("../src/providers/registry.mjs");
  assert.ok(reg.listProviders().includes("ollama"));
  assert.equal(reg.residencyOf("ollama"), "local");
  assert.equal(reg.residencyOf("openai"), "cloud");
  assert.equal(reg.residencyOf("mock"), "local");
});

await test("registry: getProvider throws on unknown name", async () => {
  const reg = await import("../src/providers/registry.mjs");
  await assert.rejects(() => reg.getProvider("myspace"), /unknown provider/i);
});

await test("registry: runProvider returns valid mock output", async () => {
  const reg = await import("../src/providers/registry.mjs");
  const out = await reg.runProvider("mock", { text: "shipped the dashboard to prod" });
  assert.equal(out.proof_card.domain, "business");
  assert.ok(Array.isArray(out.admin_tasks));
});

await test("registry: runProvider retries once on invalid output then succeeds", async () => {
  const reg = await import("../src/providers/registry.mjs");
  process.env.OPENAI_API_KEY = "sk-test";
  const validOutput = {
    admin_tasks: [],
    proof_card: {
      id: "proof_abc123", title: "Card", summary: "s".repeat(25), tech_tags: [],
      time_to_resolution_minutes: null, impact_metric: null,
      domain: "business", activity_type: "build", visual_theme: "neon", narrative: "n".repeat(45),
    },
  };
  let call = 0;
  const stub = async () => {
    call++;
    const content = call === 1 ? JSON.stringify({ bogus: true }) : JSON.stringify(validOutput);
    return jsonResponse({ choices: [{ message: { content } }] });
  };
  const out = await withFetch(stub, () => reg.runProvider("openai", { text: "x" }));
  assert.equal(call, 2, "retried exactly once");
  assert.equal(out.proof_card.activity_type, "build");
});

// ---------------------------------------------------------------------------
// mock provider honors a learned domain prior (Phase 2b) — but content wins,
// and the no-prior path stays byte-identical (regression determinism).
// ---------------------------------------------------------------------------

await test("mock: a learned prior sets the domain when content has no positive signal", async () => {
  const { process: run } = await import("../src/providers/mock.mjs");
  const neutral = "Reviewed the attached document and sent it back with notes.";
  const baseline = await run({ text: neutral });
  assert.equal(baseline.proof_card.domain, "business", "no-signal default is business");
  const withPrior = await run({ text: neutral, domain_hint: "personal" });
  assert.equal(withPrior.proof_card.domain, "personal", "prior fills the no-signal gap");
});

await test("mock: content with a clear signal overrides the prior", async () => {
  const { process: run } = await import("../src/providers/mock.mjs");
  // A parenting signal in the text must beat a 'business' prior.
  const out = await run({ text: "Picked up the kids from school and helped with homework.", domain_hint: "business" });
  assert.equal(out.proof_card.domain, "parenting");
});

await test("mock: no prior leaves classification unchanged (regression-safe)", async () => {
  const { process: run } = await import("../src/providers/mock.mjs");
  const neutral = "Reviewed the attached document and sent it back with notes.";
  const a = await run({ text: neutral });
  const b = await run({ text: neutral });
  assert.equal(a.proof_card.domain, b.proof_card.domain);
  assert.equal(a.proof_card.domain, "business");
});

// ---------------------------------------------------------------------------
// text providers inject the {{DOMAIN_PRIOR}} fragment when a prior is present,
// and never leak the literal placeholder when it is absent.
// ---------------------------------------------------------------------------

await test("ollama: injects the learned prior into the prompt, no placeholder leak", async () => {
  const { process: run } = await import("../src/providers/ollama.mjs");
  let captured;
  const stub = async (_url, opts) => { captured = JSON.parse(opts.body); return jsonResponse({ message: { content: JSON.stringify(validOutput) } }); };
  await withFetch(stub, () => run({ text: "x", domain_hint: "personal" }));
  const prompt = captured.messages[0].content;
  assert.match(prompt, /learned_domain_prior: personal/);
  assert.ok(!prompt.includes("{{DOMAIN_PRIOR}}"), "placeholder replaced");
});

await test("ollama: no prior leaves no placeholder and no prior line", async () => {
  const { process: run } = await import("../src/providers/ollama.mjs");
  let captured;
  const stub = async (_url, opts) => { captured = JSON.parse(opts.body); return jsonResponse({ message: { content: JSON.stringify(validOutput) } }); };
  await withFetch(stub, () => run({ text: "x" }));
  const prompt = captured.messages[0].content;
  assert.ok(!prompt.includes("{{DOMAIN_PRIOR}}"), "placeholder replaced");
  // The template's instruction mentions the term; assert no *injected* value line.
  assert.ok(!/learned_domain_prior:\s*\w/.test(prompt), "no prior value line when none provided");
});

await test("openai: injects the learned prior into the prompt", async () => {
  const { process: run } = await import("../src/providers/openai.mjs");
  process.env.OPENAI_API_KEY = "k";
  let captured;
  const stub = async (_url, opts) => { captured = JSON.parse(opts.body); return jsonResponse({ choices: [{ message: { content: JSON.stringify(validOutput) } }] }); };
  await withFetch(stub, () => run({ text: "x", domain_hint: "family" }));
  const prompt = JSON.stringify(captured.messages);
  assert.match(prompt, /learned_domain_prior: family/);
  assert.ok(!prompt.includes("{{DOMAIN_PRIOR}}"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
