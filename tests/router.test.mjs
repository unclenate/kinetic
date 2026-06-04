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

await test("router: business hint -> cloud provider, not sensitive", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  delete process.env.KINETIC_LOCAL_SOURCES;
  const d = resolve({ source: "manual", domainHint: "business" });
  assert.equal(d.provider, "claude");
  assert.equal(d.residency, "cloud");
  assert.equal(d.sensitive, false);
  assert.equal(d.requiresCloudAck, false);
});

await test("router: personal/unknown hint -> local provider, sensitive", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  for (const hint of ["personal", "family", "financial", "parenting", "unknown"]) {
    const d = resolve({ source: "manual", domainHint: hint });
    assert.equal(d.provider, "ollama", `hint=${hint}`);
    assert.equal(d.residency, "local", `hint=${hint}`);
    assert.equal(d.sensitive, true, `hint=${hint}`);
  }
});

await test("router: source pin forces local even for business hint", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
  process.env.KINETIC_LOCAL_SOURCES = "gmail_sent, outlook_sent";
  const d = resolve({ source: "gmail_sent", domainHint: "business" });
  assert.equal(d.provider, "ollama");
  assert.equal(d.sensitive, true);
  delete process.env.KINETIC_LOCAL_SOURCES;
});

await test("router: sensitive -> cloud override requires acknowledgment", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_CLOUD_PROVIDER = "claude";
  const noAck = resolve({ source: "manual", domainHint: "personal", override: { provider: "claude" } });
  assert.equal(noAck.provider, "claude");
  assert.equal(noAck.residency, "cloud");
  assert.equal(noAck.requiresCloudAck, true);
  const acked = resolve({ source: "manual", domainHint: "personal", override: { provider: "claude", acknowledge_cloud: true } });
  assert.equal(acked.requiresCloudAck, false);
});

await test("router: explicit override provider+model wins", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  const d = resolve({ source: "manual", domainHint: "business", override: { provider: "ollama", model: "llama3.2:3b" } });
  assert.equal(d.provider, "ollama");
  assert.equal(d.model, "llama3.2:3b");
  assert.equal(d.residency, "local");
});

await test("router: local/cloud providers are configurable via env", async () => {
  const { resolve } = await import("../src/providers/router.mjs");
  process.env.KINETIC_LOCAL_PROVIDER = "mock";
  const d = resolve({ source: "manual", domainHint: "personal" });
  assert.equal(d.provider, "mock");
  assert.equal(d.residency, "local");
  process.env.KINETIC_LOCAL_PROVIDER = "ollama";
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
