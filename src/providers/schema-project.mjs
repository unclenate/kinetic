// src/providers/schema-project.mjs
// Project a JSON Schema down to the keywords that structured-output modes
// (Ollama `format`, OpenAI json_schema) accept. Constraint keywords are
// dropped here because our validate() remains the authoritative gate.

const DROP = new Set([
  "pattern", "minLength", "maxLength", "minimum", "maximum",
  "format", "minItems", "maxItems", "minProperties", "maxProperties",
]);

export function projectStrict(schema) {
  if (Array.isArray(schema)) return schema.map(projectStrict);
  if (schema && typeof schema === "object") {
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
      if (DROP.has(k)) continue;
      out[k] = v && typeof v === "object" ? projectStrict(v) : v;
    }
    return out;
  }
  return schema;
}
