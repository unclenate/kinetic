// tests/router.test.mjs
import assert from "node:assert/strict";

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}\n    ${e.stack || e.message}`); }
}

await test("hintFromKeywords returns 'unknown' when no signal", async () => {
  const { hintFromKeywords } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(hintFromKeywords("just a normal note about the project"), "unknown");
  assert.equal(hintFromKeywords("paid the mortgage and filed taxes"), "financial");
  assert.equal(hintFromKeywords("took my son to the doctor"), "parenting");
});

await test("hintFromEmailDomains: none -> unknown, org -> business, free -> personal", async () => {
  const { hintFromEmailDomains } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(hintFromEmailDomains([]), "unknown");
  assert.equal(hintFromEmailDomains(["a@acme.com"]), "business");
  assert.equal(hintFromEmailDomains(["mom@gmail.com"]), "personal");
});

await test("combineHints: keyword wins; else email; both empty -> unknown", async () => {
  const { combineHints } = await import("../src/harvesters/domain-hint.mjs");
  assert.equal(combineHints(["a@acme.com"], "normal note"), "business");
  assert.equal(combineHints([], "normal note"), "unknown");
  assert.equal(combineHints([], "took my son to the doctor"), "parenting");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
