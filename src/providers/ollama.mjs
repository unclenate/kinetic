// src/providers/ollama.mjs
// Local Ollama provider. POST {OLLAMA_BASE_URL}/api/chat with structured
// outputs via `format` = projected schema. No API key (runs on the machine).
//
// Optional env: OLLAMA_BASE_URL (default http://localhost:11434), OLLAMA_MODEL.

import { readFile } from "node:fs/promises";
import { projectStrict } from "./schema-project.mjs";
import { domainPriorLine } from "../learning/sender-map.mjs";

const _node = globalThis.process;
const baseUrl = () => (_node.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, "");
const defaultModel = () => _node.env.OLLAMA_MODEL || "llama3.1";

async function loadPrompt() { return readFile(new URL("../../prompts/capture-to-output.md", import.meta.url), "utf8"); }
async function loadSchema() { return JSON.parse(await readFile(new URL("../../schemas/kinetic-output.schema.json", import.meta.url), "utf8")); }

export async function process(input, opts = {}) {
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
    stream: false,
    options: { temperature: 0.2 },
    format: projectStrict(schema),
    messages: [{ role: "user", content }],
  };
  const res = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${detail.slice(0, 300)} (is Ollama running at ${baseUrl()}?)`);
  }
  const json = await res.json();
  const text = json.message?.content || "";
  try { return JSON.parse(text); }
  catch { throw new Error(`Ollama returned non-JSON content: ${String(text).slice(0, 200)}`); }
}
