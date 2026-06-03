// tests/providers.test.mjs
import assert from "node:assert/strict";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}
async function withFetch(stub, fn) {
  const orig = globalThis.fetch; globalThis.fetch = stub;
  try { return await fn(); } finally { globalThis.fetch = orig; }
}
function jsonResponse(obj, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj, text: async () => JSON.stringify(obj ?? "") };
}

await test("projectStrict drops unsupported keywords but keeps shape", async () => {
  const { projectStrict } = await import("../src/providers/schema-project.mjs");
  const input = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: "^x", minLength: 2, maxLength: 4 },
      n: { type: ["integer", "null"], minimum: 0, maximum: 9 },
      tags: { type: "array", items: { type: "string", maxLength: 3 }, maxItems: 5 },
      kind: { type: "string", enum: ["a", "b"] },
    },
  };
  const out = projectStrict(input);
  assert.equal(out.properties.id.pattern, undefined);
  assert.equal(out.properties.id.minLength, undefined);
  assert.equal(out.properties.n.minimum, undefined);
  assert.equal(out.properties.tags.maxItems, undefined);
  assert.equal(out.properties.tags.items.maxLength, undefined);
  assert.deepEqual(out.required, ["id"]);
  assert.equal(out.additionalProperties, false);
  assert.deepEqual(out.properties.kind.enum, ["a", "b"]);
  assert.deepEqual(out.properties.n.type, ["integer", "null"]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
