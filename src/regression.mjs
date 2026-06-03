// src/regression.mjs
// Run the regression set against the selected provider and measure both schema
// validity and domain-classification correctness (ADR-0003).
//
// M8 exit gate (the v0.5 contract): for the chosen provider,
//   - ≥90% of inputs produce schema-valid output, AND
//   - ≥95% of inputs get the correct `domain`.
// `activity_type` match remains informational (not a gate), as it was in M1.
//
// Usage:
//   node src/regression.mjs                         # mock provider (default)
//   KINETIC_PROVIDER=gemini node src/regression.mjs
//   KINETIC_PROVIDER=claude node src/regression.mjs

import { readFile } from "node:fs/promises";
import { validate, loadKineticSchema } from "./validate.mjs";
import { runProvider, listProviders } from "./providers/registry.mjs";

const providerName = process.env.KINETIC_PROVIDER || "mock";

async function loadRegressionInputs() {
  const url = new URL("../tests/regression-inputs.jsonl", import.meta.url);
  const text = await readFile(url, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function fmtPct(n, d) {
  return `${n}/${d} (${((n / d) * 100).toFixed(1)}%)`;
}

async function main() {
  if (!listProviders().includes(providerName)) {
    throw new Error(`Unknown provider: ${providerName}. Use ${listProviders().join(" | ")}.`);
  }
  const schema = await loadKineticSchema();
  const inputs = await loadRegressionInputs();

  console.log(`\nKinetic — M8 regression (domain × activity_type)`);
  console.log(`Provider: ${providerName}`);
  console.log(`Inputs:   ${inputs.length}`);
  console.log(`Schema:   schemas/kinetic-output.schema.json`);
  console.log("");

  const results = [];
  for (const input of inputs) {
    const t0 = Date.now();
    let output, err;
    try {
      output = await runProvider(providerName, input);
    } catch (e) {
      err = e;
    }
    const elapsed = Date.now() - t0;
    const v = output ? validate(output, schema) : { valid: false, errors: [String(err?.message || err)] };

    const domainActual = output?.proof_card?.domain;
    const domainExpected = input.expected_domain;
    const domainHit = domainActual === domainExpected;

    const activityActual = output?.proof_card?.activity_type;
    const activityExpected = input.expected_activity_type;
    const activityHit = activityActual === activityExpected;

    results.push({ id: input.id, valid: v.valid, errors: v.errors, elapsed, domainActual, domainExpected, domainHit, activityActual, activityExpected, activityHit });

    const status = v.valid ? "✓ valid  " : "✗ INVALID";
    const domHint = domainActual
      ? ` dom=${domainActual}${domainHit ? "" : ` (expected ${domainExpected})`}`
      : "";
    const actHint = activityActual
      ? ` act=${activityActual}${activityHit ? "" : ` (expected ${activityExpected})`}`
      : "";
    console.log(`${status}  ${input.id.padEnd(24)} ${String(elapsed).padStart(5)}ms${domHint}${actHint}`);
    if (!v.valid) {
      for (const e of v.errors.slice(0, 5)) console.log(`           - ${e}`);
    }
  }

  const total = results.length;
  const validCount = results.filter((r) => r.valid).length;
  const domainHitCount = results.filter((r) => r.domainHit).length;
  const activityHitCount = results.filter((r) => r.activityHit).length;

  const schemaPct = (validCount / total) * 100;
  const domainPct = (domainHitCount / total) * 100;

  const SCHEMA_GATE = 90;
  const DOMAIN_GATE = 95;

  console.log("");
  console.log(`Schema-valid:     ${fmtPct(validCount, total)}`);
  console.log(`Domain-correct:   ${fmtPct(domainHitCount, total)}`);
  console.log(`Activity match:   ${fmtPct(activityHitCount, total)}  (informational — not a gate)`);
  console.log(`M8 exit target:   ≥${SCHEMA_GATE}% schema-valid AND ≥${DOMAIN_GATE}% domain-correct`);
  console.log("");

  const pass = schemaPct >= SCHEMA_GATE && domainPct >= DOMAIN_GATE;
  if (pass) {
    console.log(`✓ M8 exit criterion MET for provider "${providerName}"`);
    process.exit(0);
  } else {
    const why = [];
    if (schemaPct < SCHEMA_GATE) why.push(`schema-valid ${schemaPct.toFixed(1)}% < ${SCHEMA_GATE}%`);
    if (domainPct < DOMAIN_GATE) why.push(`domain-correct ${domainPct.toFixed(1)}% < ${DOMAIN_GATE}%`);
    console.log(`✗ M8 exit criterion NOT met for provider "${providerName}" (${why.join("; ")})`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("regression failed:", e);
  process.exit(2);
});
