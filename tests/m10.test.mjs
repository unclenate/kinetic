// tests/m10.test.mjs
// Offline tests for the M10 feed + privacy-gate backend:
//   - store.listCards() (memory order; supabase request-building)
//   - the privacy-audit assertion (public cards must be domain=business)
//
// Run: node tests/m10.test.mjs

import assert from "node:assert/strict";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}
async function withFetch(stub, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
function jsonResponse(obj, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj ?? "") };
}
function card(domain, activity_type = "build") {
  return {
    admin_tasks: [],
    proof_card: {
      id: "proof_x", title: "Card", summary: "s".repeat(25), tech_tags: [],
      time_to_resolution_minutes: null, impact_metric: null,
      domain, activity_type, visual_theme: "neon", narrative: "n".repeat(45),
    },
  };
}

// ---------------------------------------------------------------------------
// store.listCards
// ---------------------------------------------------------------------------

await test("memory store: listCards returns saved cards newest-first with ids", async () => {
  delete process.env.SUPABASE_URL;
  const { createStore } = await import("../src/db/store.mjs");
  const store = createStore();
  const { id: first } = await store.saveCard({ output: card("business"), provider: "mock" });
  const { id: second } = await store.saveCard({ output: card("personal"), provider: "mock" });
  const list = await store.listCards();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, second, "newest first");
  assert.equal(list[1].id, first);
  assert.equal(list[0].output.proof_card.domain, "personal");
});

await test("supabase store: listCards requests proof_cards ordered newest-first", async () => {
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  // Re-import with a cache-busting query so createStore picks the supabase backend.
  const { createStore } = await import("../src/db/store.mjs?m10");
  const store = createStore();
  assert.equal(store.backend, "supabase");
  let captured;
  const stub = async (url) => { captured = url; return jsonResponse([{ slug: "abc", output: card("business"), is_public: true, created_at: "2026-06-02T00:00:00Z" }]); };
  const list = await withFetch(stub, () => store.listCards());
  assert.match(captured, /\/rest\/v1\/proof_cards\?/);
  assert.match(captured, /order=created_at\.desc/);
  assert.equal(list[0].id, "abc");
  assert.equal(list[0].isPublic, true);
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

// ---------------------------------------------------------------------------
// privacy audit
// ---------------------------------------------------------------------------

await test("privacy audit: flags public non-business cards, ignores private ones", async () => {
  const { auditPublicCards } = await import("../tools/privacy-audit.mjs");
  const cards = [
    { id: "a", isPublic: true, output: card("business") },
    { id: "b", isPublic: true, output: card("personal") },   // VIOLATION
    { id: "c", isPublic: false, output: card("family") },    // private, fine
    { id: "d", isPublic: true, output: card("financial") },  // VIOLATION
  ];
  const report = auditPublicCards(cards);
  assert.equal(report.publicCount, 3);
  assert.equal(report.violations.length, 2);
  assert.deepEqual(report.violations.map((v) => v.id).sort(), ["b", "d"]);
  assert.equal(report.ok, false);
});

await test("privacy audit: clean when every public card is business", async () => {
  const { auditPublicCards } = await import("../tools/privacy-audit.mjs");
  const report = auditPublicCards([
    { id: "a", isPublic: true, output: card("business") },
    { id: "b", isPublic: false, output: card("personal") },
  ]);
  assert.equal(report.violations.length, 0);
  assert.equal(report.ok, true);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
