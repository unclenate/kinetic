# LLM Routing — Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each capture to a provider by privacy-aware rules (override → source-pin → hint-rule → default), with fail-closed enforcement and a cloud-acknowledgment gate for sensitive captures.

**Architecture:** A pure `router.resolve({source, domainHint, override})` returns `{provider, model, residency, sensitive, requiresCloudAck}`. The `domain-hint` helper gains an `unknown` value (no positive signal) so "uncertain → local" is real. `web/server.mjs` computes a hint per capture (typed: `hintFromKeywords(text)`; harvested: `item.provider_domain_hint`), resolves the route, enforces fail-closed (sensitive + local provider unavailable → 503) and cloud-ack (sensitive → cloud override without ack → 400), then runs the chosen provider. Routing is opt-in via `KINETIC_PROVIDER=auto`; any other value forces that provider (preserves the zero-setup mock demo).

**Tech Stack:** Zero-dependency Node ESM, global `fetch`. Tests are standalone `node` scripts using `node:assert/strict` (same pattern as `tests/providers.test.mjs`). Builds on Phase A's `src/providers/registry.mjs` (`residencyOf`, `runProvider`, `isAvailable`).

**Spec:** `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md` (Phase B scope: §3 router, §4 fail-closed, §7 override; the §3 hint refinement). At-rest encryption + the residency UI chip are **Phase C** — do NOT build them here.

---

### Task 1: `domain-hint` gains an `unknown` value

**Files:**
- Modify: `src/harvesters/domain-hint.mjs`
- Modify: `tests/harvesters.test.mjs` (widen the allowed-domain set so `unknown` hints pass)
- Test: `tests/router.test.mjs` (new — shared file for Phase B; Task 2 extends it)

- [ ] **Step 1: Write the failing tests**

Create `tests/router.test.mjs`:

```js
// tests/router.test.mjs
import assert from "node:assert/strict";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}

await test("hintFromKeywords returns 'unknown' when no signal", async () => {
  const { hintFromKeywords } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(hintFromKeywords("just a normal note about the project"), "unknown");
  assert.equal(hintFromKeywords("paid the mortgage and filed taxes"), "financial");
  assert.equal(hintFromKeywords("took my son to the doctor"), "parenting");
});

await test("hintFromEmailDomains: none -> unknown, org -> business, free -> personal", async () => {
  const { hintFromEmailDomains } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(hintFromEmailDomains([]), "unknown");
  assert.equal(hintFromEmailDomains(["a@acme.com"]), "business");
  assert.equal(hintFromEmailDomains(["mom@gmail.com"]), "personal");
});

await test("combineHints: keyword wins; else email; both empty -> unknown", async () => {
  const { combineHints } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(combineHints(["a@acme.com"], "normal note"), "business");
  assert.equal(combineHints([], "normal note"), "unknown");
  assert.equal(combineHints([], "took my son to the doctor"), "parenting");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/router.test.mjs`
Expected: FAIL — `hintFromKeywords(...)` returns `"business"` not `"unknown"` (and `hintFromEmailDomains([])` returns `"business"`).

- [ ] **Step 3: Edit `src/harvesters/domain-hint.mjs`**

Change the no-signal returns to `"unknown"` and update `combineHints`:

In `hintFromKeywords`, change the final `return "business";` to:
```js
  return "unknown";
```
Update its JSDoc return type to `@returns {"business"|"personal"|"family"|"financial"|"parenting"|"unknown"}` (note: `business` only appears here historically; keyword matches are non-business, so this function now returns a sensitive domain or `"unknown"`).

In `hintFromEmailDomains`, change `if (domains.length === 0) return "business";` to:
```js
  if (domains.length === 0) return "unknown";
```
and update its JSDoc return type to `@returns {"business"|"personal"|"unknown"}`.

In `combineHints`, change `if (kw !== "business") return kw;` to:
```js
  if (kw !== "unknown") return kw;
```
(Keyword result wins when it resolved a specific domain; otherwise fall back to the email-domain hint, which may itself be `unknown`.)

Also update the file's top comment: replace "When in doubt these helpers default to \"business\"" with: "When there is no positive signal these helpers return \"unknown\" (the router treats unknown as sensitive → local; ADR-0003 / routing spec)."

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/router.test.mjs`
Expected: PASS — `3 passed, 0 failed`.

- [ ] **Step 5: Widen the harvester test's allowed-domain set**

In `tests/harvesters.test.mjs`, the `assertCaptureShape` helper checks `provider_domain_hint` against a `DOMAINS` set. Find:
```js
const DOMAINS = new Set(["business", "personal", "family", "financial", "parenting"]);
```
and add `"unknown"`:
```js
const DOMAINS = new Set(["business", "personal", "family", "financial", "parenting", "unknown"]);
```
(Harvested items with no keyword/email signal — e.g. a Drive file titled "Q3 Launch Plan" — now carry `provider_domain_hint: "unknown"`, which is valid.)

- [ ] **Step 6: Run the harvester suite to confirm nothing broke**

Run: `node tests/harvesters.test.mjs`
Expected: `14 passed, 0 failed`.

- [ ] **Step 7: Commit**

```bash
git add src/harvesters/domain-hint.mjs tests/harvesters.test.mjs tests/router.test.mjs
git commit -m "feat(routing): domain-hint gains 'unknown' (no-signal) value"
```

---

### Task 2: `router.resolve()` — privacy-aware routing decision

**Files:**
- Create: `src/providers/router.mjs`
- Test: `tests/router.test.mjs` (append before the final summary lines)

- [ ] **Step 1: Write the failing tests**

In `tests/router.test.mjs`, insert these tests IMMEDIATELY BEFORE the final
`console.log(...)`/`process.exit(...)` lines:

```js
await test("router: business hint -> cloud provider, not sensitive", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  delete process.env.KINETIC_LOCAL_SOURCES;
  const d = resolve({ source: "manual", domainHint: "business" });
  assert.equal(d.provider, "claude");
  assert.equal(d.residency, "cloud");
  assert.equal(d.sensitive, false);
  assert.equal(d.requiresCloudAck, false);
});

await test("router: personal/unknown hint -> local provider, sensitive", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  for (const hint of ["personal", "family", "financial", "parenting", "unknown"]) {
    const d = resolve({ source: "manual", domainHint: hint });
    assert.equal(d.provider, "ollama", `hint=${hint}`);
    assert.equal(d.residency, "local", `hint=${hint}`);
    assert.equal(d.sensitive, true, `hint=${hint}`);
  }
});

await test("router: source pin forces local even for business hint", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_LOCAL_SOURCES = "gmail_sent, outlook_sent";
  const d = resolve({ source: "gmail_sent", domainHint: "business" });
  assert.equal(d.provider, "ollama");
  assert.equal(d.sensitive, true);
  delete process.env.KINETIC_LOCAL_SOURCES;
});

await test("router: sensitive -> cloud override requires acknowledgment", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  const noAck = resolve({ source: "manual", domainHint: "personal", override: { provider: "claude" } });
  assert.equal(noAck.provider, "claude");
  assert.equal(noAck.residency, "cloud");
  assert.equal(noAck.requiresCloudAck, true);
  const acked = resolve({ source: "manual", domainHint: "personal", override: { provider: "claude", acknowledge_cloud: true } });
  assert.equal(acked.requiresCloudAck, false);
});

await test("router: explicit override provider+model wins", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  const d = resolve({ source: "manual", domainHint: "business", override: { provider: "ollama", model: "llama3.2:3b" } });
  assert.equal(d.provider, "ollama");
  assert.equal(d.model, "llama3.2:3b");
  assert.equal(d.residency, "local");
});

await test("router: local/cloud providers are configurable via env", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "mock";
  const d = resolve({ source: "manual", domainHint: "personal" });
  assert.equal(d.provider, "mock");
  assert.equal(d.residency, "local");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/router.test.mjs`
Expected: FAIL — `Cannot find module '../src/providers/router.mjs'`.

- [ ] **Step 3: Implement `src/providers/router.mjs`**

```js
// src/providers/router.mjs
// Privacy-aware routing decision (Phase B). Pure + synchronous: given the
// pre-LLM signals (source + domainHint + any per-request override) it returns
// which provider runs and whether the capture is sensitive. Availability
// (fail-closed) and persistence-encryption are enforced by the caller, not here.

import { residencyOf } from "./registry.mjs";

const _env = () => globalThis.process.env;
const localProvider = () => _env().KINETIC_LOCAL_PROVIDER || "ollama";
const cloudProvider = () => _env().KINETIC_CLOUD_PROVIDER || "claude";
const localSources = () =>
  (_env().KINETIC_LOCAL_SOURCES || "").split(",").map((s) => s.trim()).filter(Boolean);

/** True when the capture's source is pinned to local routing. */
export function isSourcePinned(source) {
  return !!source && localSources().includes(source);
}

/**
 * Sensitive = not a positive `business` signal. A pinned source, a non-business
 * domain hint, an `unknown` hint, or a missing hint are all sensitive (privacy
 * as the default).
 */
export function isSensitive(domainHint, source) {
  if (isSourcePinned(source)) return true;
  return domainHint !== "business";
}

/**
 * @param {{ source?: string, domainHint?: string, override?: { provider?: string, model?: string, acknowledge_cloud?: boolean } }} input
 * @returns {{ provider: string, model: string|null, residency: "local"|"cloud", sensitive: boolean, requiresCloudAck: boolean }}
 */
export function resolve({ source, domainHint, override = {} } = {}) {
  const sensitive = isSensitive(domainHint, source);

  let provider;
  if (override.provider) provider = override.provider;
  else if (isSourcePinned(source)) provider = localProvider();
  else if (sensitive) provider = localProvider();
  else provider = cloudProvider();

  const residency = residencyOf(provider);
  const requiresCloudAck = sensitive && residency === "cloud" && !override.acknowledge_cloud;
  return { provider, model: override.model || null, residency, sensitive, requiresCloudAck };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/router.test.mjs`
Expected: PASS — `9 passed, 0 failed` (3 from Task 1 + 6 here).

- [ ] **Step 5: Commit**

```bash
git add src/providers/router.mjs tests/router.test.mjs
git commit -m "feat(routing): router.resolve with override/source-pin/hint precedence"
```

---

### Task 3: Wire routing into the server + config

**Files:**
- Modify: `web/server.mjs` (handleProcess + handleHarvest use the router; fail-closed + cloud-ack)
- Modify: `.env.example` (routing config)
- Modify: `package.json` (add `tests/router.test.mjs` to `test`)

- [ ] **Step 1: Add the router test to `npm test`**

In `package.json`, append ` && node tests/router.test.mjs` to the `test` script, and add
`"router:test": "node tests/router.test.mjs"`.

- [ ] **Step 2: Edit `web/server.mjs` — imports + a routing helper**

Add to the existing import block:
```js
import { runProvider, residencyOf, isAvailable } from "../src/providers/registry.mjs";
import { resolve as resolveRoute } from "../src/providers/router.mjs";
import { hintFromKeywords } from "../src/harvesters/domain-hint.mjs";
```
(Replace the existing `import { runProvider, residencyOf } ...` line — do not duplicate it.)

Below the `PROVIDER_NAME` line, add a global-override helper:
```js
// KINETIC_PROVIDER forces a single provider unless it is "auto"; "auto" engages
// per-capture privacy routing. Default ("mock") forces mock — the zero-setup demo.
// A forced provider is an operator-level choice, so it carries cloud-ack implicitly.
function globalOverride() {
  return (PROVIDER_NAME && PROVIDER_NAME !== "auto")
    ? { provider: PROVIDER_NAME, acknowledge_cloud: true }
    : {};
}

// Resolve the route for a capture, enforcing cloud-ack and fail-closed. Returns
// { decision } on success, or sends an error response and returns null.
async function routeOrReject(res, { source, domainHint, override }) {
  const decision = resolveRoute({ source, domainHint, override });
  if (decision.requiresCloudAck) {
    send(res, 400, { error: "sensitive capture to cloud requires acknowledgment", domain_hint: domainHint, residency: decision.residency });
    return null;
  }
  if (decision.sensitive && decision.residency === "local" && !(await isAvailable(decision.provider))) {
    send(res, 503, { error: "local provider unavailable", held: true, provider: decision.provider, domain_hint: domainHint });
    return null;
  }
  return decision;
}
```

- [ ] **Step 3: Edit `handleProcess` to route**

Replace the body section that currently runs the provider. After the input
validation (`if (typeof input?.text !== "string" ...)`) and `const t0 = Date.now();`,
replace:
```js
  let output;
  try {
    output = await runProvider(PROVIDER_NAME, { text: input.text, image_caption: input.image_caption || "" });
  } catch (e) {
    return send(res, 502, { error: "provider error", detail: String(e.message || e) });
  }
```
with:
```js
  const domainHint = hintFromKeywords(input.text);
  const override = {
    ...globalOverride(),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.acknowledge_cloud ? { acknowledge_cloud: true } : {}),
  };
  const decision = await routeOrReject(res, { source: "manual", domainHint, override });
  if (!decision) return;

  let output;
  try {
    output = await runProvider(decision.provider, { text: input.text, image_caption: input.image_caption || "" }, decision.model ? { model: decision.model } : {});
  } catch (e) {
    return send(res, 502, { error: "provider error", detail: String(e.message || e) });
  }
```
Then change the success response line to report the routed provider/residency. Replace:
```js
  send(res, 200, { id, output: stored, elapsedMs: Date.now() - t0, provider: PROVIDER_NAME, residency: residencyOf(PROVIDER_NAME) });
```
with:
```js
  send(res, 200, { id, output: stored, elapsedMs: Date.now() - t0, provider: decision.provider, model: decision.model, residency: decision.residency });
```

- [ ] **Step 4: Edit `handleHarvest` to route per item**

Inside the `for (const item of items.slice(0, PROCESS_CAP))` loop, replace:
```js
    let output;
    try {
      output = await runProvider(PROVIDER_NAME, { text: item.text, image_caption: item.image_caption || "" });
    } catch (e) {
      results.push({ source_id: item.source_id, error: String(e.message || e) });
      continue;
    }
```
with:
```js
    const domainHint = item.provider_domain_hint || "unknown";
    const decision = resolveRoute({ source: sourceName, domainHint, override: globalOverride() });
    if (decision.requiresCloudAck) {
      results.push({ source_id: item.source_id, error: "sensitive capture to cloud requires acknowledgment" });
      continue;
    }
    if (decision.sensitive && decision.residency === "local" && !(await isAvailable(decision.provider))) {
      results.push({ source_id: item.source_id, error: `local provider unavailable (${decision.provider})` });
      continue;
    }
    let output;
    try {
      output = await runProvider(decision.provider, { text: item.text, image_caption: item.image_caption || "" }, decision.model ? { model: decision.model } : {});
    } catch (e) {
      results.push({ source_id: item.source_id, error: String(e.message || e) });
      continue;
    }
```
(Leave the rest of the loop — validation, `store.saveCard`, the `results.push({ source_id, id, output, elapsedMs })` — unchanged. The stored-token injection earlier in the handler is also unchanged.)

- [ ] **Step 5: Edit `.env.example` — routing config**

After the OpenAI block added in Phase A, add:
```
# Privacy-aware LLM routing (Phase B). Set KINETIC_PROVIDER=auto to route each
# capture by privacy rules; any other value (incl. the default) forces that one
# provider. When routing: sensitive captures (non-business / unknown hint, or a
# pinned source) go local; business goes cloud.
KINETIC_PROVIDER=mock
KINETIC_LOCAL_PROVIDER=ollama
KINETIC_CLOUD_PROVIDER=claude
KINETIC_LOCAL_SOURCES=
```
(If `KINETIC_PROVIDER=` already exists earlier in the file, leave that one and do
not duplicate the key — add only the three `KINETIC_LOCAL_*`/`KINETIC_CLOUD_PROVIDER`
lines and the comment.)

- [ ] **Step 6: Verify — default demo unchanged + the gates fire**

Run the full suite first:
```bash
npm test
```
Expected: all suites green, including `tests/router.test.mjs` (9) and providers (8).

Default (forced mock) still works:
```bash
PORT=5213 node web/server.mjs &
sleep 1
curl -s -X POST localhost:5213/api/process -H 'content-type: application/json' -d '{"text":"shipped the dashboard to prod"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("default:",j.provider,j.residency,j.output.proof_card.domain)})'
kill %1
```
Expected: `default: mock local business`.

Cloud-ack gate (routing on; personal capture; override to a cloud provider, no ack → 400):
```bash
KINETIC_PROVIDER=auto PORT=5213 node web/server.mjs &
sleep 1
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5213/api/process -H 'content-type: application/json' -d '{"text":"took my son to the doctor for his checkup","provider":"claude"}'
kill %1
```
Expected: `400`.

Fail-closed gate (routing on; local provider unreachable; sensitive capture → 503):
```bash
KINETIC_PROVIDER=auto KINETIC_LOCAL_PROVIDER=ollama OLLAMA_BASE_URL=http://127.0.0.1:1 PORT=5213 node web/server.mjs &
sleep 1
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:5213/api/process -H 'content-type: application/json' -d '{"text":"took my son to the doctor for his checkup"}'
kill %1
```
Expected: `503`.

Routed-local success (routing on; mock as the local provider; sensitive → local):
```bash
KINETIC_PROVIDER=auto KINETIC_LOCAL_PROVIDER=mock PORT=5213 node web/server.mjs &
sleep 1
curl -s -X POST localhost:5213/api/process -H 'content-type: application/json' -d '{"text":"took my son to the doctor for his checkup"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("routed:",j.provider,j.residency)})'
kill %1
```
Expected: `routed: mock local`.

- [ ] **Step 7: Commit**

```bash
git add web/server.mjs .env.example package.json
git commit -m "feat(routing): server routes per-capture with fail-closed + cloud-ack"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/project/change-log.md`
- Modify: `docs/knowledge/shared-observations.md`

- [ ] **Step 1: Add a change-log entry**

In `docs/project/change-log.md`, add a new row at the top of the Log table (below the
header row), dated `2026-06-03`, Type `Technical`:
> Phase B (privacy-aware routing) landed: `src/providers/router.mjs` resolves each capture (override → source-pin → hint-rule → default) on pre-LLM signals; `domain-hint` gains an `unknown` (no-signal) value so uncertain→local; the server enforces fail-closed (sensitive + local provider unavailable → 503) and a cloud-acknowledgment gate (sensitive→cloud override without ack → 400). Routing is opt-in via `KINETIC_PROVIDER=auto`; default forces mock (zero-setup demo preserved). At-rest encryption is Phase C. Reason: deliver the privacy-by-design routing core. Owner @unclenate. ADR-0006 (pending, with Phase C).

- [ ] **Step 2: Append a shared-observations entry**

Append a dated section to `docs/knowledge/shared-observations.md` summarizing: routing keys on pre-LLM signals (hint + source), `unknown` makes "privacy as default" real, fail-closed + cloud-ack are the two enforcement gates, and the residual risk (a business-mis-hinted sensitive capture still reaches the cloud model for inference — closed only by source-pinning, the feedback loop, or Phase D two-pass).

- [ ] **Step 3: Run the harness validator chain (docs changed)**

```bash
P=.harness/platform/validators
bash $P/validate-companions.sh harness.manifest.yaml .
bash $P/validate-placeholders.sh .
```
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/project/change-log.md docs/knowledge/shared-observations.md
git commit -m "docs(routing): Phase B change-log + shared-observations"
```

---

## Self-Review notes

- **Spec coverage:** router precedence + sensitivity (Task 2); `unknown` hint refinement (Task 1); fail-closed + cloud-ack + per-capture residency in responses (Task 3); source-pin (Tasks 2-3). At-rest encryption, residency UI chip, ADR-0006, and two-pass (Phase D) are explicitly **out of scope** (Phase C/D).
- **Backward-compat:** `KINETIC_PROVIDER` default `mock` still forces mock, so the zero-setup demo and `npm test` (mock) are unaffected; routing is opt-in via `=auto`.
- **Regression harness** (`src/regression.mjs`) is intentionally NOT changed — it measures one provider via `KINETIC_PROVIDER` and does not route.
- **Type consistency:** `resolve()` returns `{provider, model, residency, sensitive, requiresCloudAck}` and is consumed with those exact names in `web/server.mjs`.

## Next
- **Phase C** — at-rest encryption of sensitive rows + schema migration (+ feedback-readiness columns) + privacy-audit extension + UI residency chip; record **ADR-0006**.
- **Phase D (optional)** — two-pass classify-then-route behind `KINETIC_TWO_PASS`.
