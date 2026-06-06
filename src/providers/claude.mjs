// src/providers/claude.mjs
// Anthropic Claude provider for Kinetic. Used as the fallback per ADR-0001.
// Uses Claude's tool_use mechanism with input_schema as the structured-output
// contract. Zero npm deps; uses global fetch.
//
// Requires: ANTHROPIC_API_KEY
// Optional: ANTHROPIC_MODEL (default claude-sonnet-4-5)

import { readFile } from "node:fs/promises";
import { domainPriorLine } from "../learning/sender-map.mjs";

// `process` is shadowed by our exported function below, so capture the Node
// global up front under a different name.
const _node = globalThis.process;

const DEFAULT_MODEL = _node.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const API_BASE = "https://api.anthropic.com/v1";

async function loadPrompt() {
  const url = new URL("../../prompts/capture-to-output.md", import.meta.url);
  return readFile(url, "utf8");
}

async function loadSchema() {
  const url = new URL("../../schemas/kinetic-output.schema.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

/**
 * @param {{ text: string, image_caption?: string }} input
 * @returns {Promise<{ admin_tasks: any[], proof_card: any }>}
 */
export async function process(input, opts = {}) {
  const apiKey = _node.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set. Run with KINETIC_PROVIDER=mock or set the key.");
  }
  const promptTemplate = await loadPrompt();
  const schema = await loadSchema();

  let filled = promptTemplate
    .replace("{{SCHEMA_INLINE}}", JSON.stringify(schema, null, 2))
    .replace("{{TEXT}}", input.text || "")
    .replace("{{IMAGE_CAPTION}}", input.image_caption || "")
    .replace("{{DOMAIN_PRIOR}}", domainPriorLine(input.domain_hint));

  if (opts.feedback) filled += `\n\nYour previous output was invalid: ${opts.feedback}\nReturn corrected JSON only.`;

  const model = opts.model || DEFAULT_MODEL;

  // Use tool_use to force structured output that matches our schema.
  const body = {
    model,
    max_tokens: 2048,
    temperature: 0.2,
    tools: [
      {
        name: "emit_kinetic_output",
        description: "Emit the structured Kinetic capture output.",
        input_schema: schema, // Claude accepts a JSON Schema-shaped object here.
      },
    ],
    tool_choice: { type: "tool", name: "emit_kinetic_output" },
    messages: [{ role: "user", content: filled }],
  };

  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Claude ${res.status}: ${detail.slice(0, 500)}`);
  }
  const json = await res.json();
  const block = (json.content || []).find((b) => b.type === "tool_use");
  if (!block) throw new Error("Claude returned no tool_use block");
  return block.input;
}
