// src/providers/openai.mjs
// OpenAI provider. Chat Completions in JSON mode (response_format json_object);
// the schema is embedded in the prompt and validate()+retry is the gate.
//
// Requires: OPENAI_API_KEY. Optional: OPENAI_MODEL (default gpt-4o-mini).

import { readFile } from "node:fs/promises";
import { domainPriorLine } from "../learning/sender-map.mjs";

const _node = globalThis.process;
const API_BASE = "https://api.openai.com/v1";
const defaultModel = () => _node.env.OPENAI_MODEL || "gpt-4o-mini";

async function loadPrompt() { return readFile(new URL("../../prompts/capture-to-output.md", import.meta.url), "utf8"); }
async function loadSchema() { return JSON.parse(await readFile(new URL("../../schemas/kinetic-output.schema.json", import.meta.url), "utf8")); }

export async function process(input, opts = {}) {
  const apiKey = _node.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set. Run with KINETIC_PROVIDER=mock or set the key.");
  const model = opts.model || defaultModel();
  const schema = await loadSchema();
  let content = (await loadPrompt())
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "")
    .replace("{{DOMAIN_PRIOR}}", domainPriorLine(input.domain_hint));
  if (opts.feedback) content += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content }],
  };
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  try { return JSON.parse(text); }
  catch { throw new Error(`OpenAI returned non-JSON content: ${String(text).slice(0, 200)}`); }
}
