// tests/store.test.mjs
// Offline tests for the M7 persistence layer:
//   - the in-memory card store (default; runs the demo with no Supabase)
//   - the Supabase PostgREST client request-building (stubbed fetch)
//   - the encrypted token store: save encrypts, load decrypts + refreshes
//
// Run: node tests/store.test.mjs

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

const SAMPLE_OUTPUT = {
  admin_tasks: [],
  proof_card: {
    id: "proof_x", title: "Card", summary: "x".repeat(25), tech_tags: [],
    time_to_resolution_minutes: null, impact_metric: null,
    domain: "business", activity_type: "build", visual_theme: "neon",
    narrative: "y".repeat(45),
  },
};

// ---------------------------------------------------------------------------
// memory card store
// ---------------------------------------------------------------------------

await test("memory store: save then get round-trips a card", async () => {
  delete process.env.SUPABASE_URL;
  const { createStore } = await import("../src/db/store.mjs");
  const store = createStore();
  assert.equal(store.backend, "memory");
  const { id } = await store.saveCard({ output: SAMPLE_OUTPUT, provider: "mock" });
  assert.equal(typeof id, "string");
  const rec = await store.getCard(id);
  assert.equal(rec.output.proof_card.domain, "business");
  assert.equal(rec.isPublic, false);
});

await test("memory store: shareCard flips isPublic; unknown id is null", async () => {
  delete process.env.SUPABASE_URL;
  const { createStore } = await import("../src/db/store.mjs");
  const store = createStore();
  const { id } = await store.saveCard({ output: SAMPLE_OUTPUT, provider: "mock" });
  await store.shareCard(id);
  assert.equal((await store.getCard(id)).isPublic, true);
  assert.equal(await store.getCard("nope"), null);
});

// ---------------------------------------------------------------------------
// supabase PostgREST client
// ---------------------------------------------------------------------------

await test("supabase: insert posts to /rest/v1/<table> with service-role auth", async () => {
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { insert } = await import("../src/db/supabase.mjs");
  let captured;
  const stub = async (url, opts) => { captured = { url, opts }; return jsonResponse([{ id: "row1" }], 201); };
  const row = await withFetch(stub, () => insert("captures", { raw_text: "hi" }));
  assert.equal(captured.url, "https://proj.supabase.co/rest/v1/captures");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers.apikey, "service-key");
  assert.match(captured.opts.headers.Authorization, /Bearer service-key/);
  assert.match(captured.opts.headers.Prefer, /return=representation/);
  assert.equal(JSON.parse(captured.opts.body).raw_text, "hi");
  assert.deepEqual(row, [{ id: "row1" }]);
});

await test("supabase: a non-2xx response throws", async () => {
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { insert } = await import("../src/db/supabase.mjs");
  const stub = async () => jsonResponse({ message: "permission denied" }, 403);
  await assert.rejects(() => withFetch(stub, () => insert("captures", {})), /403|permission denied/);
});

// ---------------------------------------------------------------------------
// encrypted token store
// ---------------------------------------------------------------------------

await test("token store: saveToken sends ciphertext, never plaintext, to Supabase", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { saveToken } = await import("../src/oauth/token-store.mjs");
  let body;
  const stub = async (_url, opts) => { body = JSON.parse(opts.body); return jsonResponse([body], 201); };
  await withFetch(stub, () => saveToken("google", {
    access_token: "PLAINTEXT-AT", refresh_token: "PLAINTEXT-RT",
    expires_at: "2030-01-01T00:00:00.000Z", scopes: ["openid"],
  }));
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes("PLAINTEXT-AT"), "access token is not stored in the clear");
  assert.ok(!serialized.includes("PLAINTEXT-RT"), "refresh token is not stored in the clear");
  assert.equal(body.provider, "google");
  assert.ok(body.access_token_enc && body.refresh_token_enc, "encrypted columns are populated");
});

await test("token store: loadToken refreshes when the access token is near expiry", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.GOOGLE_OAUTH_CLIENT_ID = "g";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "s";
  const { encryptToken } = await import("../src/oauth/crypto.mjs");
  const { loadToken } = await import("../src/oauth/token-store.mjs");

  const expiredRow = {
    provider: "google",
    access_token_enc: encryptToken("OLD-AT"),
    refresh_token_enc: encryptToken("THE-RT"),
    expires_at: "2000-01-01T00:00:00.000Z", // long past -> must refresh
    scopes: ["openid"],
  };
  let refreshed = false;
  let updatedBody = null;
  const stub = async (url, opts) => {
    if (url.includes("/rest/v1/oauth_tokens") && (!opts || opts.method === "GET" || !opts.method)) {
      return jsonResponse([expiredRow]); // select
    }
    if (url.includes("oauth2.googleapis.com/token")) {
      refreshed = true;
      return jsonResponse({ access_token: "NEW-AT", expires_in: 3600, scope: "openid" });
    }
    if (url.includes("/rest/v1/oauth_tokens")) {
      updatedBody = opts.body ? JSON.parse(opts.body) : null; // upsert/patch of refreshed token
      return jsonResponse([{}]);
    }
    throw new Error(`unexpected fetch to ${url}`);
  };
  const access = await withFetch(stub, () => loadToken("google"));
  assert.equal(refreshed, true, "refresh endpoint was called");
  assert.equal(access, "NEW-AT", "returns the freshly minted access token");
  assert.ok(updatedBody, "persisted the refreshed token back to Supabase");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
