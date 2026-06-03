// src/providers/gemini.mjs
// Gemini provider for Kinetic. Uses the official Gemini REST API with
// structured-output mode (response_schema). Zero npm deps; uses global fetch.
//
// Requires: GEMINI_API_KEY environment variable.
// Optional: GEMINI_MODEL (defaults to gemini-2.5-flash).
//
// The schema is enforced TWICE: once by Gemini (response_schema) and once by
// our local validator after the response is received. Belt and suspenders.

import { readFile } from "node:fs/promises";

// `process` is shadowed by our exported function below, so capture the Node
// global up front under a different name.
const _node = globalThis.process;

const DEFAULT_MODEL = _node.env.GEMINI_MODEL || "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function loadPrompt() {
  const url = new URL("../../prompts/capture-to-output.md", import.meta.url);
  return readFile(url, "utf8");
}

async function loadSchema() {
  const url = new URL("../../schemas/kinetic-output.schema.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

/**
 * Convert a JSON Schema fragment into the subset accepted by Gemini's
 * response_schema. We allowlist only the keywords Gemini supports:
 *   type, properties, required, items, enum, minimum, maximum, description, nullable
 *
 * Everything else (additionalProperties, pattern, minLength, maxLength,
 * minItems, maxItems, $schema, $id, title, format) is dropped. Gemini will
 * accept the trimmed schema; our local validator still enforces the full
 * schema on the response (belt and suspenders).
 */
function toGeminiSchema(node) {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;

  let type = node.type;
  let nullable = false;
  if (Array.isArray(type)) {
    nullable = type.includes("null");
    type = type.find((t) => t !== "null");
  }

  const out = {};
  if (type) out.type = type.toUpperCase();
  if (nullable) out.nullable = true;

  if (node.description !== undefined) out.description = node.description;
  if (node.enum !== undefined) out.enum = node.enum;
  if (node.minimum !== undefined) out.minimum = node.minimum;
  if (node.maximum !== undefined) out.maximum = node.maximum;
  if (node.required !== undefined) out.required = node.required;

  if (node.properties && typeof node.properties === "object") {
    out.properties = {};
    for (const [k, v] of Object.entries(node.properties)) {
      out.properties[k] = toGeminiSchema(v);
    }
  }
  if (node.items !== undefined) {
    out.items = toGeminiSchema(node.items);
  }
  return out;
}

/**
 * @param {{ text: string, image_caption?: string }} input
 * @returns {Promise<{ admin_tasks: any[], proof_card: any }>}
 */
export async function process(input, opts = {}) {
  const apiKey = _node.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set. Run with KINETIC_PROVIDER=mock or set the key.");
  }
  const promptTemplate = await loadPrompt();
  const schema = await loadSchema();
  const geminiSchema = toGeminiSchema(schema);

  let filled = promptTemplate
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "");

  if (opts.feedback) filled += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;

  const model = opts.model || DEFAULT_MODEL;

  const body = {
    contents: [{ role: "user", parts: [{ text: filled }] }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: geminiSchema,
      temperature: 0.2,
    },
  };

  const url = `${API_BASE}/models/${model}:generateContent?key=${apiKey}`;

  // Retry transient errors (429 rate limit, 5xx) with exponential backoff.
  // Free-tier limit on gemini-2.5-flash is 5 requests / minute, so 429 is
  // expected during a 10-input run.
  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no text part");
      return JSON.parse(text);
    }
    const detail = await res.text().catch(() => "");
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === MAX_RETRIES) {
      throw new Error(`Gemini ${res.status}: ${detail.slice(0, 500)}`);
    }
    // Honor the server-suggested retry delay if present, else exponential backoff.
    const retryMatch = detail.match(/retry in\s+([\d.]+)s/i);
    const waitMs = retryMatch
      ? Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500
      : 1500 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new Error("Gemini: exhausted retries");
}
