// web/server.mjs
// Zero-dependency Node HTTP server for the Kinetic demo.
// - GET  /                      → capture form (web/public/index.html)
// - GET  /style.css /app.js     → static assets
// - POST /api/process           → run capture through the selected provider
// - POST /api/harvest/:source   → harvest from a signal source, process each item
// - POST /api/share/:id         → mark a card as public; returns share URL
// - GET  /proof/:id             → public read-only Proof card page (no auth)
// - GET  /api/cards/:id         → JSON for a single card
// - GET  /oauth/:provider/start → begin an OAuth authorization (M7)
// - GET  /oauth/:provider/callback → finish OAuth, store encrypted tokens (M7)
// - GET  /health                → { ok, provider, backend, cards }
//
// Persistence is pluggable (src/db/store.mjs): in-memory by default, Supabase
// when SUPABASE_URL is configured. The OAuth routes require provider creds
// (and, to persist, Supabase + KINETIC_TOKEN_ENCRYPTION_KEY); without them they
// return a clear "not configured" response and the rest of the demo is unaffected.
//
// To run:
//   node web/server.mjs                            # mock provider, in-memory
//   KINETIC_PROVIDER=claude node web/server.mjs    # real LLM (Claude)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { validate, loadKineticSchema } from "../src/validate.mjs";
import { createStore } from "../src/db/store.mjs";
import { startAuthorization, exchangeCode } from "../src/oauth/index.mjs";
import { isConfigured as oauthConfigured } from "../src/oauth/providers.mjs";
import { isConfigured as supabaseConfigured } from "../src/db/supabase.mjs";
import { runProvider, residencyOf, isAvailable } from "../src/providers/registry.mjs";
import { resolve as resolveRoute, buildOverride } from "../src/providers/router.mjs";
import { hintFromKeywords } from "../src/harvesters/domain-hint.mjs";

const PORT = parseInt(process.env.PORT || "5173", 10);
const PROVIDER_NAME = process.env.KINETIC_PROVIDER || "mock";

// KINETIC_PROVIDER forces a single provider unless it is "auto"; "auto" engages
// per-capture privacy routing. Default ("mock") forces mock — the zero-setup demo.
// A forced provider is an operator-level choice, so it carries cloud-ack implicitly.
function globalOverride() {
  return (PROVIDER_NAME && PROVIDER_NAME !== "auto")
    ? { provider: PROVIDER_NAME, acknowledge_cloud: true }
    : {};
}

// Resolve the route for a capture, enforcing cloud-ack and fail-closed. Returns
// the decision on success, or sends an error response and returns null.
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

// Pluggable persistence (memory or supabase, chosen by config).
const store = createStore();

// Short-TTL state -> { provider, codeVerifier } map for the OAuth handshake.
const pendingAuth = new Map();
const AUTH_TTL_MS = 10 * 60 * 1000;
function rememberAuth(state, data) {
  pendingAuth.set(state, { ...data, createdAt: Date.now() });
  for (const [k, v] of pendingAuth) if (Date.now() - v.createdAt > AUTH_TTL_MS) pendingAuth.delete(k);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  const isString = typeof body === "string";
  res.writeHead(status, {
    "Content-Type": isString ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(isString ? body : JSON.stringify(body));
}

async function sendFile(res, filePath) {
  try {
    const data = await readFile(filePath);
    const mime = MIME[extname(filePath.toString())] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found" });
  }
}

async function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > maxBytes) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function escapeForJsScript(json) {
  // Prevent </script> in user data from breaking out of the embedded JSON.
  return json.replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}

function baseUrlFrom(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

async function handleProcess(req, res, schema) {
  const raw = await readBody(req);
  let input;
  try { input = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid JSON" }); }
  if (typeof input?.text !== "string" || !input.text.trim()) {
    return send(res, 400, { error: "text is required" });
  }

  const t0 = Date.now();
  const domainHint = hintFromKeywords(input.text);
  // A per-request provider override is the user's explicit choice and carries its
  // own acknowledge_cloud; it must NOT inherit the operator's forced-provider ack.
  const override = buildOverride(globalOverride(), input);
  const decision = await routeOrReject(res, { source: "manual", domainHint, override });
  if (!decision) return;

  let output;
  try {
    output = await runProvider(decision.provider, { text: input.text, image_caption: input.image_caption || "" }, decision.model ? { model: decision.model } : {});
  } catch (e) {
    return send(res, 502, { error: "provider error", detail: String(e.message || e) });
  }

  const v = validate(output, schema);
  if (!v.valid) {
    return send(res, 502, { error: "provider returned invalid output", errors: v.errors });
  }

  const persistSensitive = output.proof_card.domain !== "business" || decision.residency === "local";
  const { id, output: stored } = await store.saveCard({ output, provider: decision.provider, sensitive: persistSensitive, hint: domainHint, residency: decision.residency });
  send(res, 200, { id, output: stored, elapsedMs: Date.now() - t0, provider: decision.provider, model: decision.model, residency: decision.residency });
}

async function handleShare(req, res, id) {
  const rec = await store.shareCard(id);
  if (!rec) return send(res, 404, { error: "card not found" });
  send(res, 200, { id, url: `${baseUrlFrom(req)}/proof/${id}` });
}

async function handleCard(_req, res, id) {
  const rec = await store.getCard(id);
  if (!rec) return send(res, 404, { error: "card not found" });
  send(res, 200, rec);
}

async function handleCardList(_req, res) {
  const cards = await store.listCards();
  // Lightweight feed shape: surface domain/activity for client-side filtering.
  const feed = cards.map((c) => ({
    id: c.id,
    createdAt: c.createdAt,
    isPublic: !!c.isPublic,
    domain: c.output?.proof_card?.domain || "business",
    activity_type: c.output?.proof_card?.activity_type || "other",
    output: c.output,
  }));
  send(res, 200, { count: feed.length, cards: feed });
}

async function handleConnections(_req, res) {
  const out = {};
  let hasToken = null;
  if (supabaseConfigured()) {
    ({ hasToken } = await import("../src/oauth/token-store.mjs"));
  }
  for (const name of ["google", "microsoft"]) {
    const configured = oauthConfigured(name);
    const connected = configured && hasToken ? await hasToken(name) : false;
    out[name] = { configured, connected };
  }
  // GitHub uses public events / PAT in v0.5 — no OAuth handshake.
  out.github = { configured: true, connected: false, note: "public events; PAT optional" };
  send(res, 200, { storage: supabaseConfigured() ? "supabase" : "memory", providers: out });
}

async function handleHarvest(req, res, sourceName, schema) {
  const raw = await readBody(req);
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid JSON" }); }

  let harvester;
  try {
    harvester = await import(`../src/harvesters/${sourceName}.mjs`);
  } catch {
    return send(res, 404, { error: `unknown source: ${sourceName}` });
  }

  // OAuth-backed sources: inject the stored (auto-refreshed) access token so a
  // connected account powers harvesting without the user pasting a token.
  // A token explicitly supplied in the body still wins (debug path).
  const OAUTH_SOURCE = {
    gcal: "google", gdrive: "google", gmail_sent: "google",
    mscal: "microsoft", onedrive: "microsoft", outlook_sent: "microsoft",
  };
  const tokenProvider = OAUTH_SOURCE[sourceName];
  if (tokenProvider && !body.accessToken && supabaseConfigured()) {
    try {
      const { loadToken } = await import("../src/oauth/token-store.mjs");
      body.accessToken = await loadToken(tokenProvider); // decrypts + refreshes on use
    } catch (e) {
      return send(res, 400, { error: `${tokenProvider} not connected`, detail: String(e.message || e) });
    }
  }

  let items;
  try {
    items = await harvester.harvest(body);
  } catch (e) {
    return send(res, 502, { error: "harvest failed", detail: String(e.message || e) });
  }

  // Process each harvested item through the LLM contract; cap to keep demo snappy.
  const PROCESS_CAP = Math.min(items.length, Number(body.process_max) || 3);
  const results = [];
  for (const item of items.slice(0, PROCESS_CAP)) {
    const t0 = Date.now();
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
    const v = validate(output, schema);
    if (!v.valid) {
      results.push({ source_id: item.source_id, error: "invalid output", errors: v.errors });
      continue;
    }
    const persistSensitive = output.proof_card.domain !== "business" || decision.residency === "local";
    const { id, output: stored } = await store.saveCard({
      output,
      provider: decision.provider,
      sensitive: persistSensitive,
      hint: domainHint,
      residency: decision.residency,
      origin: item.source_id || null,
      source: { name: sourceName, source_id: item.source_id, occurred_at: item.occurred_at || null, domain_hint: item.provider_domain_hint || null },
    });
    results.push({ source_id: item.source_id, id, output: stored, elapsedMs: Date.now() - t0, provider: decision.provider, model: decision.model, residency: decision.residency });
  }

  send(res, 200, {
    source: sourceName,
    harvested: items.length,
    processed: results.length,
    skipped_unprocessed: Math.max(0, items.length - results.length),
    items, // raw harvested signals (visible to user)
    cards: results,
  });
}

async function handleProofPage(_req, res, id) {
  const rec = await store.getCard(id);
  const proofHtmlUrl = new URL("./public/proof.html", import.meta.url);
  const missingHtmlUrl = new URL("./public/proof-missing.html", import.meta.url);
  if (!rec || !rec.isPublic) {
    return sendFile(res, missingHtmlUrl);
  }
  const tmpl = await readFile(proofHtmlUrl, "utf8");
  const filled = tmpl
    .replace("{{CARD_JSON}}", escapeForJsScript(JSON.stringify(rec.output.proof_card)))
    .replace("{{TASKS_JSON}}", escapeForJsScript(JSON.stringify(rec.output.admin_tasks)))
    .replace("{{CREATED_AT}}", new Date(rec.createdAt).toUTCString());
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(filled);
}

// ---- OAuth (M7) ----------------------------------------------------------

function handleOAuthStart(_req, res, provider) {
  if (provider !== "google" && provider !== "microsoft") {
    return send(res, 404, { error: `unknown oauth provider: ${provider}` });
  }
  if (!oauthConfigured(provider)) {
    return send(res, 503, {
      error: "oauth not configured",
      detail: `Set ${provider.toUpperCase()}_OAUTH_CLIENT_ID / _SECRET (and KINETIC_BASE_URL) in .env.local.`,
    });
  }
  const { url, state, codeVerifier } = startAuthorization(provider);
  rememberAuth(state, { provider, codeVerifier });
  res.writeHead(302, { Location: url });
  res.end();
}

async function handleOAuthCallback(_req, res, provider, url) {
  if (provider !== "google" && provider !== "microsoft") {
    return send(res, 404, { error: `unknown oauth provider: ${provider}` });
  }
  const error = url.searchParams.get("error");
  if (error) return send(res, 400, { error: "oauth denied", detail: error });

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const pending = state && pendingAuth.get(state);
  if (!code || !pending || pending.provider !== provider) {
    return send(res, 400, { error: "invalid or expired oauth state" });
  }
  pendingAuth.delete(state);

  if (!supabaseConfigured()) {
    return send(res, 503, {
      error: "token storage not configured",
      detail: "OAuth succeeded but SUPABASE_URL + KINETIC_TOKEN_ENCRYPTION_KEY are required to persist tokens.",
    });
  }

  try {
    const tokens = await exchangeCode(provider, { code, codeVerifier: pending.codeVerifier });
    // Imported lazily so the rest of the server runs without the crypto key set.
    const { saveToken } = await import("../src/oauth/token-store.mjs");
    await saveToken(provider, tokens);
  } catch (e) {
    return send(res, 502, { error: "oauth exchange failed", detail: String(e.message || e) });
  }
  res.writeHead(302, { Location: "/?connected=" + provider });
  res.end();
}

async function main() {
  const schema = await loadKineticSchema();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const p = url.pathname;
      if (req.method === "GET" && p === "/")          return sendFile(res, new URL("./public/index.html", import.meta.url));
      if (req.method === "GET" && p === "/style.css") return sendFile(res, new URL("./public/style.css", import.meta.url));
      if (req.method === "GET" && p === "/app.js")    return sendFile(res, new URL("./public/app.js", import.meta.url));
      if (req.method === "GET" && p === "/health")    return send(res, 200, { ok: true, provider: PROVIDER_NAME, backend: store.backend, cards: store.size ?? null });
      if (req.method === "GET" && p === "/api/cards")  return handleCardList(req, res);
      if (req.method === "GET" && p === "/api/connections") return handleConnections(req, res);
      if (req.method === "POST" && p === "/api/process") return handleProcess(req, res, schema);

      const harvestMatch = p.match(/^\/api\/harvest\/([a-z0-9_]+)$/);
      if (req.method === "POST" && harvestMatch) return handleHarvest(req, res, harvestMatch[1], schema);

      const shareMatch = p.match(/^\/api\/share\/([a-f0-9]{6,16})$/);
      if (req.method === "POST" && shareMatch) return handleShare(req, res, shareMatch[1]);

      const cardMatch = p.match(/^\/api\/cards\/([a-f0-9]{6,16})$/);
      if (req.method === "GET" && cardMatch) return handleCard(req, res, cardMatch[1]);

      const proofMatch = p.match(/^\/proof\/([a-f0-9]{6,16})$/);
      if (req.method === "GET" && proofMatch) return handleProofPage(req, res, proofMatch[1]);

      const startMatch = p.match(/^\/oauth\/([a-z]+)\/start$/);
      if (req.method === "GET" && startMatch) return handleOAuthStart(req, res, startMatch[1]);

      const cbMatch = p.match(/^\/oauth\/([a-z]+)\/callback$/);
      if (req.method === "GET" && cbMatch) return handleOAuthCallback(req, res, cbMatch[1], url);

      send(res, 404, { error: "not found", path: p });
    } catch (e) {
      console.error("server error:", e);
      send(res, 500, { error: "internal", detail: String(e.message || e) });
    }
  });

  server.listen(PORT, () => {
    console.log(`\nKinetic demo`);
    console.log(`  provider: ${PROVIDER_NAME}`);
    console.log(`  store:    ${store.backend}`);
    console.log(`  url:      http://localhost:${PORT}`);
    console.log(`  health:   http://localhost:${PORT}/health`);
    console.log("");
  });
}

main().catch((e) => {
  console.error("startup failed:", e);
  process.exit(1);
});
