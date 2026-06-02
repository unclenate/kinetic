// tests/oauth.test.mjs
// Offline, zero-dependency tests for the M7 OAuth + token-crypto cores.
//
// These cover the parts that are fully verifiable without credentials:
//   - AES-256-GCM token encryption (round-trip, tamper, key handling)
//   - PKCE verifier/challenge generation
//   - provider authorization-URL construction
//   - token exchange + refresh (with a stubbed `fetch`)
//
// The server wiring (/oauth/:provider/start|callback) and the Supabase token
// store are exercised separately / verified live once credentials exist (M7-live).
//
// Run: node tests/oauth.test.mjs

import assert from "node:assert/strict";
import { createHash } from "node:crypto";

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
  return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj) };
}
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const TEST_KEY = Buffer.alloc(32, 7).toString("base64"); // deterministic 32-byte key

// ---------------------------------------------------------------------------
// crypto — AES-256-GCM token encryption
// ---------------------------------------------------------------------------

await test("crypto: round-trips a token", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  const { encryptToken, decryptToken } = await import("../src/oauth/crypto.mjs");
  const secret = "ya29.super-secret-refresh-token";
  const blob = encryptToken(secret);
  assert.notEqual(blob, secret, "ciphertext differs from plaintext");
  assert.equal(decryptToken(blob), secret, "decrypt recovers plaintext");
});

await test("crypto: two encryptions of the same value differ (random IV)", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  const { encryptToken } = await import("../src/oauth/crypto.mjs");
  assert.notEqual(encryptToken("same"), encryptToken("same"));
});

await test("crypto: tampered ciphertext fails authentication", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  const { encryptToken, decryptToken } = await import("../src/oauth/crypto.mjs");
  const blob = Buffer.from(encryptToken("token"), "base64");
  blob[blob.length - 1] ^= 0xff; // flip a ciphertext byte
  assert.throws(() => decryptToken(blob.toString("base64")), /auth|decrypt|unable/i);
});

await test("crypto: missing key throws a helpful error", async () => {
  delete process.env.KINETIC_TOKEN_ENCRYPTION_KEY;
  const { encryptToken } = await import("../src/oauth/crypto.mjs");
  assert.throws(() => encryptToken("x"), /KINETIC_TOKEN_ENCRYPTION_KEY/);
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

// ---------------------------------------------------------------------------
// pkce — verifier / challenge / state
// ---------------------------------------------------------------------------

await test("pkce: challenge is base64url(sha256(verifier))", async () => {
  const { createVerifier, challengeFromVerifier } = await import("../src/oauth/pkce.mjs");
  const verifier = createVerifier();
  assert.match(verifier, /^[A-Za-z0-9\-_]{43,128}$/, "verifier is url-safe and 43-128 chars");
  const expected = b64url(createHash("sha256").update(verifier).digest());
  assert.equal(challengeFromVerifier(verifier), expected);
});

await test("pkce: verifiers and states are unique per call", async () => {
  const { createVerifier, createState } = await import("../src/oauth/pkce.mjs");
  assert.notEqual(createVerifier(), createVerifier());
  assert.notEqual(createState(), createState());
});

// ---------------------------------------------------------------------------
// providers — authorization URL construction
// ---------------------------------------------------------------------------

await test("providers: google auth URL carries the required params", async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client.apps";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";
  process.env.KINETIC_BASE_URL = "http://localhost:5173";
  const { buildAuthUrl } = await import("../src/oauth/providers.mjs");
  const url = new URL(buildAuthUrl("google", { state: "st8", codeChallenge: "chal" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "google-client.apps");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:5173/oauth/google/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge"), "chal");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), "st8");
  assert.equal(url.searchParams.get("access_type"), "offline"); // refresh tokens
  assert.match(url.searchParams.get("scope"), /calendar\.readonly/);
});

await test("providers: microsoft auth URL points at the tenant and carries PKCE", async () => {
  process.env.MICROSOFT_OAUTH_CLIENT_ID = "ms-client";
  process.env.MICROSOFT_OAUTH_CLIENT_SECRET = "mssecret";
  process.env.MICROSOFT_OAUTH_TENANT_ID = "common";
  process.env.KINETIC_BASE_URL = "http://localhost:5173";
  const { buildAuthUrl } = await import("../src/oauth/providers.mjs");
  const url = new URL(buildAuthUrl("microsoft", { state: "st8", codeChallenge: "chal" }));
  assert.match(url.href, /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/);
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:5173/oauth/microsoft/callback");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("scope"), /offline_access/);
});

await test("providers: unknown provider is rejected", async () => {
  const { buildAuthUrl } = await import("../src/oauth/providers.mjs");
  assert.throws(() => buildAuthUrl("myspace", { state: "s", codeChallenge: "c" }), /provider/i);
});

// ---------------------------------------------------------------------------
// coordinator — token exchange + refresh (stubbed fetch)
// ---------------------------------------------------------------------------

await test("coordinator: exchangeCode posts to the token endpoint and normalizes the result", async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client.apps";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";
  process.env.KINETIC_BASE_URL = "http://localhost:5173";
  const { exchangeCode } = await import("../src/oauth/index.mjs");
  let captured;
  const stub = async (url, opts) => {
    captured = { url, opts };
    return jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid email" });
  };
  const tok = await withFetch(stub, () => exchangeCode("google", { code: "auth-code", codeVerifier: "ver" }));
  assert.equal(captured.url, "https://oauth2.googleapis.com/token");
  assert.match(captured.opts.body, /grant_type=authorization_code/);
  assert.match(captured.opts.body, /code_verifier=ver/);
  assert.equal(tok.access_token, "at");
  assert.equal(tok.refresh_token, "rt");
  assert.equal(typeof tok.expires_at, "string"); // absolute ISO expiry, not relative
  assert.deepEqual(tok.scopes, ["openid", "email"]);
});

await test("coordinator: refreshAccessToken preserves an unreturned refresh token", async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-client.apps";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "gsecret";
  const { refreshAccessToken } = await import("../src/oauth/index.mjs");
  // Google often omits refresh_token on refresh; we must keep the old one.
  const stub = async () => jsonResponse({ access_token: "at2", expires_in: 3600, scope: "openid" });
  const tok = await withFetch(stub, () => refreshAccessToken("google", "old-refresh"));
  assert.equal(tok.access_token, "at2");
  assert.equal(tok.refresh_token, "old-refresh", "kept the existing refresh token");
});

await test("coordinator: a token-endpoint error surfaces, not swallowed", async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "g";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "s";
  const { exchangeCode } = await import("../src/oauth/index.mjs");
  const stub = async () => jsonResponse({ error: "invalid_grant" }, 400);
  await assert.rejects(
    () => withFetch(stub, () => exchangeCode("google", { code: "bad", codeVerifier: "v" })),
    /invalid_grant|400/
  );
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
