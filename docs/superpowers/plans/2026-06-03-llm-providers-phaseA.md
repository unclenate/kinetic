# LLM Providers — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM layer pluggable behind a registry and add a local **Ollama** provider and an **OpenAI** provider, so any capture can be processed by a chosen provider/model selected via `KINETIC_PROVIDER` (per-call routing is Phase B).

**Architecture:** A `registry` maps provider names → modules implementing a unified `process(input, opts)` contract. A `runProvider(name, input, opts)` wrapper validates output against the canonical schema and retries once with the validation errors as feedback. `server.mjs` and `regression.mjs` resolve providers through the registry instead of a hardcoded `switch`. Output is always gated by the existing zero-dep `validate()`.

**Tech Stack:** Node ESM (`.mjs`), zero runtime deps, global `fetch`. Tests are standalone `node` scripts using `node:assert/strict` with a stubbed `globalThis.fetch` (same pattern as `tests/harvesters.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md` (Phase A scope).

---

### Task 1: Schema-projection helper

**Files:**
- Create: `src/providers/schema-project.mjs`
- Test: `tests/providers.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/providers.test.mjs` with the shared harness + first test:

```js
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
  // shape-defining keywords survive
  assert.deepEqual(out.required, ["id"]);
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.properties.kind.enum, ["a", "b"]);
  assert.deepEqual(out.properties.n.type, ["integer", "null"]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/providers.test.mjs`
Expected: FAIL — `Cannot find module '../src/providers/schema-project.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/providers/schema-project.mjs
// Project a JSON Schema down to the keywords that structured-output modes
// (Ollama `format`, OpenAI json_schema) accept. Constraint keywords are
// dropped here because our validate() remains the authoritative gate.

const DROP = new Set([
  "pattern", "minLength", "maxLength", "minimum", "maximum",
  "format", "minItems", "maxItems", "minProperties", "maxProperties",
]);

export function projectStrict(schema) {
  if (Array.isArray(schema)) return schema.map(projectStrict);
  if (schema && typeof schema === "object") {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (DROP.has(k)) continue;
      out[k] = v && typeof v === "object" ? projectStrict(v) : v;
    }
    return out;
  }
  return schema;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/providers.test.mjs`
Expected: PASS — `1 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src/providers/schema-project.mjs tests/providers.test.mjs
git commit -m "feat(providers): schema-project helper for structured-output modes"
```

---

### Task 2: Provider registry + runProvider (validate + retry)

**Files:**
- Create: `src/providers/registry.mjs`
- Test: `tests/providers.test.mjs` (append before the final summary lines)

- [ ] **Step 1: Write the failing tests**

Insert these tests in `tests/providers.test.mjs` immediately before the
`console.log(\`\n${pass} passed...\`)` line:

```js
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
  // openai provider returns whatever the stubbed API returns; first call is
  // schema-invalid, second is valid → runProvider must retry and return valid.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/providers.test.mjs`
Expected: FAIL — `Cannot find module '../src/providers/registry.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/providers/registry.mjs
// Central registry mapping provider name -> module + residency class, plus a
// runProvider() wrapper that validates output and retries once with feedback.

import { validate, loadKineticSchema } from "../validate.mjs";

const _node = globalThis.process;

const PROVIDERS = {
  mock:   { load: () => import("./mock.mjs"),   residency: "local" },
  ollama: { load: () => import("./ollama.mjs"), residency: "local" },
  openai: { load: () => import("./openai.mjs"), residency: "cloud" },
  claude: { load: () => import("./claude.mjs"), residency: "cloud" },
  gemini: { load: () => import("./gemini.mjs"), residency: "cloud" },
};

export function listProviders() { return Object.keys(PROVIDERS); }

export function residencyOf(name) { return PROVIDERS[name]?.residency || "cloud"; }

export async function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`unknown provider: ${name} (expected ${listProviders().join(" | ")})`);
  return p.load();
}

/** Best-effort availability: key present / local endpoint reachable. */
export async function isAvailable(name) {
  switch (name) {
    case "mock":   return true;
    case "openai": return !!_node.env.OPENAI_API_KEY;
    case "claude": return !!_node.env.ANTHROPIC_API_KEY;
    case "gemini": return !!_node.env.GEMINI_API_KEY;
    case "ollama": {
      const base = (_node.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
      try { const r = await fetch(`${base}/api/tags`); return r.ok; } catch { return false; }
    }
    default: return false;
  }
}

/** Run a provider, validate output, retry once with the errors as feedback. */
export async function runProvider(name, input, opts = {}) {
  const mod = await getProvider(name);
  const schema = await loadKineticSchema();
  let out = await mod.process(input, opts);
  let v = validate(out, schema);
  if (!v.valid) {
    out = await mod.process(input, { ...opts, feedback: v.errors.slice(0, 5).join("; ") });
    v = validate(out, schema);
  }
  if (!v.valid) throw new Error(`provider ${name} produced invalid output: ${v.errors.slice(0, 3).join("; ")}`);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/providers.test.mjs`
Expected: PASS — `5 passed, 0 failed`. (Note: Task 2 depends on the `openai.mjs` from Task 3 for the retry test; if running strictly in order, move the retry test to the end of Task 3. Implement `openai.mjs` first if the retry test errors on a missing module.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/registry.mjs tests/providers.test.mjs
git commit -m "feat(providers): registry + runProvider with validate-and-retry"
```

---

### Task 3: Ollama provider (local)

**Files:**
- Create: `src/providers/ollama.mjs`
- Test: `tests/providers.test.mjs` (append before summary)

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/providers.test.mjs`
Expected: FAIL — `Cannot find module '../src/providers/ollama.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/providers/ollama.mjs
// Local Ollama provider. POST {OLLAMA_BASE_URL}/api/chat with structured
// outputs via `format` = projected schema. No API key (runs on the machine).
//
// Optional env: OLLAMA_BASE_URL (default http://localhost:11434), OLLAMA_MODEL.

import { readFile } from "node:fs/promises";
import { projectStrict } from "./schema-project.mjs";

const _node = globalThis.process;
const baseUrl = () => (_node.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const defaultModel = () => _node.env.OLLAMA_MODEL || "llama3.1";

async function loadPrompt() { return readFile(new URL("../../prompts/capture-to-output.md", import.meta.url), "utf8"); }
async function loadSchema() { return JSON.parse(await readFile(new URL("../../schemas/kinetic-output.schema.json", import.meta.url), "utf8")); }

export async function process(input, opts = {}) {
  const model = opts.model || defaultModel();
  const schema = await loadSchema();
  let content = (await loadPrompt())
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "");
  if (opts.feedback) content += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;

  const body = {
    model,
    stream: false,
    options: { temperature: 0.2 },
    format: projectStrict(schema),
    messages: [{ role: "user", content }],
  };
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${detail.slice(0, 300)} (is Ollama running at ${baseUrl()}?)`);
  }
  const json = await res.json();
  const text = json.message?.content || "";
  try { return JSON.parse(text); }
  catch { throw new Error(`Ollama returned non-JSON content: ${String(text).slice(0, 200)}`); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/providers.test.mjs`
Expected: PASS (ollama test green; the Task 2 retry test now resolvable too).

- [ ] **Step 5: Commit**

```bash
git add src/providers/ollama.mjs tests/providers.test.mjs
git commit -m "feat(providers): local Ollama provider with structured-output format"
```

---

### Task 4: OpenAI provider (cloud)

**Files:**
- Create: `src/providers/openai.mjs`
- Test: `tests/providers.test.mjs` (append before summary)

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/providers.test.mjs`
Expected: FAIL — `Cannot find module '../src/providers/openai.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/providers/openai.mjs
// OpenAI provider. Chat Completions in JSON mode (response_format json_object);
// the schema is embedded in the prompt and validate()+retry is the gate.
//
// Requires: OPENAI_API_KEY. Optional: OPENAI_MODEL (default gpt-4o-mini).

import { readFile } from "node:fs/promises";

const _node = globalThis.process;
const API_BASE = "https://api.openai.com/v1";
const defaultModel = () => _node.env.OPENAI_MODEL || "gpt-4o-mini";

async function loadPrompt() { return readFile(new URL("../../prompts/capture-to-output.md", import.meta.url), "utf8"); }
async function loadSchema() { return JSON.parse(await readFile(new URL("../../schemas/kinetic-output.schema.json", import.meta.url), "utf8")); }

export async function process(input, opts = {}) {
  const apiKey = _node.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set. Run with KINETIC_PROVIDER=mock or set the key.");
  const model = opts.model || defaultModel();
  const schema = await loadSchema();
  let content = (await loadPrompt())
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "");
  if (opts.feedback) content += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content }],
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  try { return JSON.parse(text); }
  catch { throw new Error(`OpenAI returned non-JSON content: ${String(text).slice(0, 200)}`); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/providers.test.mjs`
Expected: PASS — all provider tests green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai.mjs tests/providers.test.mjs
git commit -m "feat(providers): OpenAI provider (JSON mode + validate/retry)"
```

---

### Task 5: Refit existing providers to the unified `(input, opts)` signature

**Files:**
- Modify: `src/providers/claude.mjs:32` (signature + model + feedback)
- Modify: `src/providers/gemini.mjs` (signature + model + feedback)
- Modify: `src/providers/mock.mjs:146` (accept and ignore opts)

- [ ] **Step 1: Update mock signature**

In `src/providers/mock.mjs`, change `export async function process(input) {` to:
```js
export async function process(input, _opts = {}) {
```
(Mock is deterministic; it ignores model/feedback. No other change.)

- [ ] **Step 2: Update claude to accept opts.model + feedback**

In `src/providers/claude.mjs`, change the signature and model/prompt handling:
```js
export async function process(input, opts = {}) {
  const apiKey = _node.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set. Run with KINETIC_PROVIDER=mock or set the key.");
  }
  const model = opts.model || DEFAULT_MODEL;
  const promptTemplate = await loadPrompt();
  const schema = await loadSchema();

  let filled = promptTemplate
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "");
  if (opts.feedback) filled += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;
```
Then change `model: DEFAULT_MODEL,` in the `body` to `model,`.

- [ ] **Step 3: Update gemini similarly**

Open `src/providers/gemini.mjs`. Change `export async function process(input)` to
`export async function process(input, opts = {})`. Where it selects the model
(a `const ... MODEL` / `GEMINI_MODEL` reference), prefer `opts.model` first:
`const model = opts.model || <existing default>;` and use `model` in the request
URL/body. After building the prompt string, append the feedback line when present:
```js
if (opts.feedback) prompt += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;
```
(Match the existing variable names in that file — read it first.)

- [ ] **Step 4: Verify the regression still passes with mock**

Run: `node src/regression.mjs`
Expected: `✓ M8 exit criterion MET for provider "mock"` (mock unaffected by the signature change).

- [ ] **Step 5: Commit**

```bash
git add src/providers/mock.mjs src/providers/claude.mjs src/providers/gemini.mjs
git commit -m "refactor(providers): unified process(input, opts) signature + model/feedback"
```

---

### Task 6: Route regression.mjs and server.mjs through the registry

**Files:**
- Modify: `src/regression.mjs` (replace `loadProvider` switch)
- Modify: `web/server.mjs` (replace `loadProvider` + `provider.process` calls)

- [ ] **Step 1: Update regression.mjs**

In `src/regression.mjs`, remove the local `loadProvider` function and its
`provider.process` usage. Import the registry and use `runProvider`:
```js
import { runProvider, listProviders } from "./providers/registry.mjs";
```
Replace `const provider = await loadProvider(providerName);` with a guard:
```js
if (!listProviders().includes(providerName)) {
  throw new Error(`Unknown provider: ${providerName}. Use ${listProviders().join(" | ")}.`);
}
```
Replace the call `output = await provider.process(input);` with:
```js
output = await runProvider(providerName, input);
```
(Keep the existing try/catch and validation reporting.)

- [ ] **Step 2: Run the regression to verify**

Run: `node src/regression.mjs`
Expected: `Schema-valid: 20/20`, `✓ M8 exit criterion MET for provider "mock"`.

- [ ] **Step 3: Update server.mjs to use the registry**

In `web/server.mjs`:
- Remove the local `loadProvider` function.
- Replace the import-time provider load. In `main()`, delete
  `const provider = await loadProvider(PROVIDER_NAME);`.
- Add at top: `import { runProvider, residencyOf } from "../src/providers/registry.mjs";`
- In `handleProcess`, replace:
  ```js
  output = await provider.process({ text: input.text, image_caption: input.image_caption || "" });
  ```
  with:
  ```js
  output = await runProvider(PROVIDER_NAME, { text: input.text, image_caption: input.image_caption || "" });
  ```
  and drop the now-unused `provider` parameter from `handleProcess` (and its
  call site). Add `residency: residencyOf(PROVIDER_NAME)` to the success response.
- In `handleHarvest`, replace
  `output = await provider.process({ text: item.text, image_caption: item.image_caption || "" });`
  with
  `output = await runProvider(PROVIDER_NAME, { text: item.text, image_caption: item.image_caption || "" });`
  and drop the `provider` parameter there too.
- Update the two route call sites that pass `provider` to these handlers to stop passing it.

- [ ] **Step 4: Verify the server boots and processes via the registry**

Run (in one shell):
```bash
PORT=5210 node web/server.mjs &
sleep 1
curl -s -X POST localhost:5210/api/process -H 'content-type: application/json' -d '{"text":"shipped the billing dashboard to prod"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("provider:",j.provider,"residency:",j.residency,"domain:",j.output.proof_card.domain)})'
kill %1
```
Expected: `provider: mock residency: local domain: business`.

- [ ] **Step 5: Commit**

```bash
git add src/regression.mjs web/server.mjs
git commit -m "refactor: route regression + server through the provider registry"
```

---

### Task 7: Config, npm test wiring, and live Ollama verification

**Files:**
- Modify: `.env.example`
- Modify: `package.json` (add providers suite to `test`)

- [ ] **Step 1: Add provider env to `.env.example`**

Append under the LLM section of `.env.example`:
```
# Local Ollama provider (no key; runs on your machine)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1

# OpenAI provider
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

- [ ] **Step 2: Add the providers suite to `npm test`**

In `package.json`, append ` && node tests/providers.test.mjs` to the `test`
script, and add `"providers:test": "node tests/providers.test.mjs"`.

- [ ] **Step 3: Run the full battery**

Run: `npm test`
Expected: every suite passes (selftest, regression, harvesters, oauth, store, m10, providers).

- [ ] **Step 4: Live Ollama verification (requires Ollama running locally)**

Run:
```bash
OLLAMA_MODEL=${OLLAMA_MODEL:-llama3.1} KINETIC_PROVIDER=ollama PORT=5210 node web/server.mjs &
sleep 1
curl -s -X POST localhost:5210/api/process -H 'content-type: application/json' \
  -d '{"text":"Took my son to his pediatric checkup, vaccinations updated."}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("provider:",j.provider,"residency:",j.residency);console.log("domain:",j.output.proof_card.domain,"activity:",j.output.proof_card.activity_type,"title:",j.output.proof_card.title)})'
kill %1
```
Expected: `provider: ollama residency: local`; the domain should be a real
classification (e.g. `parenting`/`personal`) from the local model — proving
Ollama processes captures locally end-to-end. If Ollama returns invalid JSON,
`runProvider` retries once; persistent failure surfaces a clear error.

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json
git commit -m "chore(providers): env config + npm test wiring for Ollama/OpenAI"
```

---

## Self-Review notes

- **Spec coverage (Phase A):** registry + unified interface (Task 2, 5), Ollama
  (Task 3), OpenAI (Task 4), schema-project (Task 1), regression integration
  (Task 6), config (Task 7). Routing/fail-closed/residency-rules, at-rest
  encryption, override-ack, and feedback-readiness columns are **Phases B–C**
  (separate plans) per the spec.
- **Residency in responses** is introduced here (Task 6) as a static
  `residencyOf(KINETIC_PROVIDER)`; per-call routing replaces it in Phase B.
- **Ordering caveat:** Task 2's retry test imports `openai.mjs` (Task 4). If
  executing strictly top-to-bottom, implement `openai.mjs` (Task 4 Step 3)
  before running Task 2 Step 4, or move that single retry test into Task 4.

## Next plans
- **Phase B** — router (override → source-pin → hint-rule → default), fail-closed, override-ack, residency wiring.
- **Phase C** — at-rest encryption for sensitive rows + schema migration (incl. feedback-readiness columns) + privacy-audit extension + UI residency chip.
- **Phase D (optional)** — two-pass classify-then-route behind `KINETIC_TWO_PASS`.
- **Sub-project 2** — categorization-feedback / finetuning loop (own spec).
