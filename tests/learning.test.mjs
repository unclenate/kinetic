// tests/learning.test.mjs
// Offline unit tests for the passive-learning module (Phase 2a):
//   - counterpartyKey: derive a stable learning key from a card/item
//   - buildLearnedMap: tally operator corrections into key -> domain
//   - learnedHint: look a key up in the map
//
// Pure functions, no network. Run: node tests/learning.test.mjs

import assert from "node:assert/strict";
import { counterpartyKey, buildLearnedMap, learnedHint, effectiveHint } from "../src/learning/sender-map.mjs";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}

// A correction = a stored row where the operator changed the domain, so
// domain !== predicted_domain. `source` carries the counterparty/source name.
const correction = (counterparty, name, domain, predicted) => ({
  domain, predicted_domain: predicted,
  source: counterparty ? { counterparty, name } : { name },
});

// ---------------------------------------------------------------------------
// counterpartyKey
// ---------------------------------------------------------------------------

await test("counterpartyKey: email card keys on recipient domain (mail:)", () => {
  assert.equal(counterpartyKey({ source: { counterparty: "Acme.com", name: "gmail_sent" } }), "mail:acme.com");
});

await test("counterpartyKey: non-email card keys on source name (source:)", () => {
  assert.equal(counterpartyKey({ source: { name: "fathom" } }), "source:fathom");
});

await test("counterpartyKey: no source signal yields null", () => {
  assert.equal(counterpartyKey({ source: {} }), null);
  assert.equal(counterpartyKey({}), null);
});

// ---------------------------------------------------------------------------
// buildLearnedMap
// ---------------------------------------------------------------------------

await test("buildLearnedMap: two agreeing corrections emit a mapping", () => {
  const map = buildLearnedMap([
    correction("acme.com", "gmail_sent", "business", "personal"),
    correction("acme.com", "gmail_sent", "business", "personal"),
  ]);
  assert.equal(map["mail:acme.com"], "business");
});

await test("buildLearnedMap: a single correction is under threshold (omitted)", () => {
  const map = buildLearnedMap([
    correction("acme.com", "gmail_sent", "business", "personal"),
  ]);
  assert.equal(map["mail:acme.com"], undefined);
});

await test("buildLearnedMap: a tie is ambiguous (omitted)", () => {
  const map = buildLearnedMap([
    correction("acme.com", "gmail_sent", "business", "personal"),
    correction("acme.com", "gmail_sent", "personal", "business"),
  ]);
  assert.equal(map["mail:acme.com"], undefined);
});

await test("buildLearnedMap: strict plurality wins over a minority vote", () => {
  const map = buildLearnedMap([
    correction("acme.com", "gmail_sent", "business", "personal"),
    correction("acme.com", "gmail_sent", "business", "personal"),
    correction("acme.com", "gmail_sent", "personal", "business"),
  ]);
  assert.equal(map["mail:acme.com"], "business");
});

await test("buildLearnedMap: rows that agree with the prediction are not corrections", () => {
  // domain === predicted_domain: the operator never changed it. Must be ignored.
  const map = buildLearnedMap([
    { domain: "business", predicted_domain: "business", source: { counterparty: "acme.com", name: "gmail_sent" } },
    { domain: "business", predicted_domain: "business", source: { counterparty: "acme.com", name: "gmail_sent" } },
  ]);
  assert.equal(map["mail:acme.com"], undefined);
});

await test("buildLearnedMap: minVotes is configurable", () => {
  const rows = [correction("acme.com", "gmail_sent", "business", "personal")];
  assert.equal(buildLearnedMap(rows, { minVotes: 1 })["mail:acme.com"], "business");
});

await test("buildLearnedMap: rows without a usable key are skipped", () => {
  const map = buildLearnedMap([
    { domain: "business", predicted_domain: "personal", source: {} },
    { domain: "business", predicted_domain: "personal", source: {} },
  ]);
  assert.deepEqual(map, {});
});

// ---------------------------------------------------------------------------
// learnedHint
// ---------------------------------------------------------------------------

await test("learnedHint: hit returns the learned domain", () => {
  assert.equal(learnedHint({ "mail:acme.com": "business" }, "mail:acme.com"), "business");
});

await test("learnedHint: miss returns unknown", () => {
  assert.equal(learnedHint({ "mail:acme.com": "business" }, "source:fathom"), "unknown");
  assert.equal(learnedHint({}, null), "unknown");
});

// ---------------------------------------------------------------------------
// effectiveHint — merge the learned map with the harvester's heuristic hint.
// Precedence: learned (if known) > heuristic provider_domain_hint > "unknown".
// (Explicit per-request/operator provider overrides win later, at routing.)
// ---------------------------------------------------------------------------

await test("effectiveHint: a learned mapping overrides the heuristic hint", () => {
  const map = { "mail:acme.com": "business" };
  const item = { counterparty: "acme.com", name: "gmail_sent", provider_domain_hint: "personal" };
  assert.equal(effectiveHint(map, item), "business");
});

await test("effectiveHint: falls back to the heuristic hint when nothing is learned", () => {
  const item = { counterparty: "newco.com", name: "gmail_sent", provider_domain_hint: "personal" };
  assert.equal(effectiveHint({}, item), "personal");
});

await test("effectiveHint: missing heuristic hint falls through to unknown", () => {
  assert.equal(effectiveHint({}, { counterparty: "newco.com", name: "gmail_sent" }), "unknown");
});

await test("effectiveHint: source-name key learns coarse non-email priors", () => {
  const map = { "source:fathom": "business" };
  assert.equal(effectiveHint(map, { name: "fathom", provider_domain_hint: "unknown" }), "business");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
