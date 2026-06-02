// src/db/supabase.mjs
// Minimal Supabase PostgREST client over `fetch` — no SDK, keeping the project
// zero-dependency. Server-side only: uses the service role key, which must
// never reach the browser. All access to user data is mediated here.
//
// PostgREST conventions used:
//   - filters as querystring: `?provider=eq.google`
//   - Prefer: return=representation  -> mutations return the affected rows
//   - Prefer: resolution=merge-duplicates + ?on_conflict=cols -> upsert

const _env = () => globalThis.process.env;

function cfg() {
  const url = _env().SUPABASE_URL;
  const key = _env().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("supabase: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

function headers(extra = {}) {
  const { key } = cfg();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}

async function handle(res) {
  const raw = await res.text();
  let json = null;
  if (raw) { try { json = JSON.parse(raw); } catch { json = raw; } }
  if (!res.ok) {
    const detail = typeof json === "string" ? json : json?.message || JSON.stringify(json);
    throw new Error(`supabase ${res.status}: ${String(detail).slice(0, 200)}`);
  }
  return json;
}

/** GET rows. `query` is a raw PostgREST querystring (without leading '?'). */
export async function select(table, query = "") {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ""}`, { headers: headers() });
  const rows = await handle(res);
  return Array.isArray(rows) ? rows : rows == null ? [] : [rows];
}

/** GET a single row (first match) or null. */
export async function selectOne(table, query = "") {
  const rows = await select(table, query);
  return rows[0] || null;
}

/** POST a row (or rows). Returns the inserted representation. */
export async function insert(table, row) {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  return handle(res);
}

/** PATCH rows matching `query`. Returns the updated representation. */
export async function update(table, query, patch) {
  const { url } = cfg();
  const res = await fetch(`${url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  return handle(res);
}

/** Upsert on the given conflict columns (comma-separated). */
export async function upsert(table, row, onConflict) {
  const { url } = cfg();
  const q = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const res = await fetch(`${url}/rest/v1/${table}${q}`, {
    method: "POST",
    headers: headers({ Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(row),
  });
  return handle(res);
}

/** True when Supabase credentials are present. */
export function isConfigured() {
  return !!(_env().SUPABASE_URL && _env().SUPABASE_SERVICE_ROLE_KEY);
}
