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
