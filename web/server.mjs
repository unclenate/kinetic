// web/server.mjs
// Zero-dependency Node HTTP server for the Kinetic M2 demo.
// - GET  /                 → capture form (web/public/index.html)
// - GET  /style.css /app.js → static assets
// - POST /api/process      → run capture through the selected provider
// - POST /api/share/:id    → mark a card as public; returns share URL
// - GET  /proof/:id        → public read-only Proof card page (no auth)
// - GET  /api/cards/:id    → JSON for a single card
// - GET  /health           → { ok, provider, cards }
//
// Persistence is in-memory only for v0 (M2). Supabase wiring is deferred.
// To run:
//   node web/server.mjs                            # mock provider
//   KINETIC_PROVIDER=claude node web/server.mjs    # real LLM (Claude)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { randomBytes } from "node:crypto";
import { validate, loadKineticSchema } from "../src/validate.mjs";

const PORT = parseInt(process.env.PORT || "5173", 10);
const PROVIDER_NAME = process.env.KINETIC_PROVIDER || "mock";

async function loadProvider(name) {
  switch (name) {
    case "mock":   return import("../src/providers/mock.mjs");
    case "gemini": return import("../src/providers/gemini.mjs");
    case "claude": return import("../src/providers/claude.mjs");
    default: throw new Error(`Unknown provider: ${name}`);
  }
}

// In-memory store. Key: card id, value: { output, createdAt, isPublic, ... }
const cards = new Map();

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

function shortId() { return randomBytes(4).toString("hex"); }

function escapeForJsScript(json) {
  // Prevent </script> in user data from breaking out of the embedded JSON.
  return json.replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
}

async function handleProcess(req, res, provider, schema) {
  const raw = await readBody(req);
  let input;
  try { input = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid JSON" }); }
  if (typeof input?.text !== "string" || !input.text.trim()) {
    return send(res, 400, { error: "text is required" });
  }

  const t0 = Date.now();
  let output;
  try {
    output = await provider.process({
      text: input.text,
      image_caption: input.image_caption || "",
    });
  } catch (e) {
    return send(res, 502, { error: "provider error", detail: String(e.message || e) });
  }

  const v = validate(output, schema);
  if (!v.valid) {
    return send(res, 502, { error: "provider returned invalid output", errors: v.errors });
  }

  // Server controls the id namespace on persist.
  const cardId = shortId();
  output.proof_card.id = `proof_${cardId}`;
  output.admin_tasks = output.admin_tasks.map((t, i) => ({
    ...t,
    id: `task_${cardId}${i.toString(16)}`,
  }));

  cards.set(cardId, {
    output,
    createdAt: new Date().toISOString(),
    isPublic: false,
    elapsedMs: Date.now() - t0,
    provider: PROVIDER_NAME,
  });

  send(res, 200, {
    id: cardId,
    output,
    elapsedMs: Date.now() - t0,
    provider: PROVIDER_NAME,
  });
}

function handleShare(req, res, id) {
  const card = cards.get(id);
  if (!card) return send(res, 404, { error: "card not found" });
  card.isPublic = true;
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  send(res, 200, { id, url: `${proto}://${host}/proof/${id}` });
}

function handleCard(_req, res, id) {
  const card = cards.get(id);
  if (!card) return send(res, 404, { error: "card not found" });
  send(res, 200, card);
}

async function handleHarvest(req, res, sourceName, provider, schema) {
  const raw = await readBody(req);
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: "invalid JSON" }); }

  let harvester;
  try {
    harvester = await import(`../src/harvesters/${sourceName}.mjs`);
  } catch {
    return send(res, 404, { error: `unknown source: ${sourceName}` });
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
    let output;
    try {
      output = await provider.process({ text: item.text, image_caption: item.image_caption || "" });
    } catch (e) {
      results.push({ source_id: item.source_id, error: String(e.message || e) });
      continue;
    }
    const v = validate(output, schema);
    if (!v.valid) {
      results.push({ source_id: item.source_id, error: "invalid output", errors: v.errors });
      continue;
    }
    const cardId = shortId();
    output.proof_card.id = `proof_${cardId}`;
    output.admin_tasks = output.admin_tasks.map((t, i) => ({ ...t, id: `task_${cardId}${i.toString(16)}` }));
    cards.set(cardId, {
      output,
      createdAt: new Date().toISOString(),
      isPublic: false,
      elapsedMs: Date.now() - t0,
      provider: PROVIDER_NAME,
      source: { name: sourceName, source_id: item.source_id, occurred_at: item.occurred_at || null },
    });
    results.push({
      source_id: item.source_id,
      id: cardId,
      output,
      elapsedMs: Date.now() - t0,
    });
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
  const card = cards.get(id);
  const proofHtmlUrl = new URL("./public/proof.html", import.meta.url);
  const missingHtmlUrl = new URL("./public/proof-missing.html", import.meta.url);
  if (!card || !card.isPublic) {
    return sendFile(res, missingHtmlUrl);
  }
  const tmpl = await readFile(proofHtmlUrl, "utf8");
  const filled = tmpl
    .replace("{{CARD_JSON}}", escapeForJsScript(JSON.stringify(card.output.proof_card)))
    .replace("{{TASKS_JSON}}", escapeForJsScript(JSON.stringify(card.output.admin_tasks)))
    .replace("{{CREATED_AT}}", new Date(card.createdAt).toUTCString());
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(filled);
}

async function main() {
  const provider = await loadProvider(PROVIDER_NAME);
  const schema = await loadKineticSchema();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (req.method === "GET" && url.pathname === "/")        return sendFile(res, new URL("./public/index.html", import.meta.url));
      if (req.method === "GET" && url.pathname === "/style.css") return sendFile(res, new URL("./public/style.css", import.meta.url));
      if (req.method === "GET" && url.pathname === "/app.js")    return sendFile(res, new URL("./public/app.js", import.meta.url));
      if (req.method === "GET" && url.pathname === "/health")    return send(res, 200, { ok: true, provider: PROVIDER_NAME, cards: cards.size });
      if (req.method === "POST" && url.pathname === "/api/process") return handleProcess(req, res, provider, schema);
      const harvestMatch = url.pathname.match(/^\/api\/harvest\/([a-z0-9_]+)$/);
      if (req.method === "POST" && harvestMatch) return handleHarvest(req, res, harvestMatch[1], provider, schema);
      const shareMatch = url.pathname.match(/^\/api\/share\/([a-f0-9]{6,16})$/);
      if (req.method === "POST" && shareMatch) return handleShare(req, res, shareMatch[1]);
      const cardMatch = url.pathname.match(/^\/api\/cards\/([a-f0-9]{6,16})$/);
      if (req.method === "GET" && cardMatch) return handleCard(req, res, cardMatch[1]);
      const proofMatch = url.pathname.match(/^\/proof\/([a-f0-9]{6,16})$/);
      if (req.method === "GET" && proofMatch) return handleProofPage(req, res, proofMatch[1]);
      send(res, 404, { error: "not found", path: url.pathname });
    } catch (e) {
      console.error("server error:", e);
      send(res, 500, { error: "internal", detail: String(e.message || e) });
    }
  });

  server.listen(PORT, () => {
    console.log(`\nKinetic demo`);
    console.log(`  provider: ${PROVIDER_NAME}`);
    console.log(`  url:      http://localhost:${PORT}`);
    console.log(`  health:   http://localhost:${PORT}/health`);
    console.log("");
  });
}

main().catch((e) => {
  console.error("startup failed:", e);
  process.exit(1);
});
