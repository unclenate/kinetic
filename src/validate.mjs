// src/validate.mjs
// Minimal, zero-dependency JSON Schema validator scoped to the shape Kinetic uses.
// This is NOT a full Draft 2020-12 implementation — it only covers the keywords
// we actually use in schemas/kinetic-output.schema.json. Keep it simple; keep it
// readable; keep it auditable for a 72-hour hackathon.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} errors
 */

/**
 * Validate `instance` against `schema`. Supports the keywords we use:
 * type (incl. array of types), required, properties, additionalProperties,
 * items, minItems, maxItems, minLength, maxLength, enum, pattern, minimum,
 * maximum.
 *
 * @param {unknown} instance
 * @param {Record<string, unknown>} schema
 * @param {string} path
 * @returns {ValidationResult}
 */
export function validate(instance, schema, path = "$") {
  const errors = [];

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : null;
  if (types) {
    const actual = jsonType(instance);
    if (!types.includes(actual)) {
      errors.push(`${path}: expected type ${types.join("|")}, got ${actual}`);
      return { valid: false, errors };
    }
  }

  if (schema.enum && !schema.enum.includes(instance)) {
    errors.push(`${path}: value ${JSON.stringify(instance)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (typeof instance === "string") {
    if (schema.minLength != null && instance.length < schema.minLength) {
      errors.push(`${path}: string length ${instance.length} < minLength ${schema.minLength}`);
    }
    if (schema.maxLength != null && instance.length > schema.maxLength) {
      errors.push(`${path}: string length ${instance.length} > maxLength ${schema.maxLength}`);
    }
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(instance)) {
        errors.push(`${path}: string does not match pattern ${schema.pattern}`);
      }
    }
  }

  if (typeof instance === "number") {
    if (schema.minimum != null && instance < schema.minimum) {
      errors.push(`${path}: number ${instance} < minimum ${schema.minimum}`);
    }
    if (schema.maximum != null && instance > schema.maximum) {
      errors.push(`${path}: number ${instance} > maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(instance)) {
    if (schema.minItems != null && instance.length < schema.minItems) {
      errors.push(`${path}: array length ${instance.length} < minItems ${schema.minItems}`);
    }
    if (schema.maxItems != null && instance.length > schema.maxItems) {
      errors.push(`${path}: array length ${instance.length} > maxItems ${schema.maxItems}`);
    }
    if (schema.items) {
      instance.forEach((item, i) => {
        const sub = validate(item, schema.items, `${path}[${i}]`);
        errors.push(...sub.errors);
      });
    }
  }

  if (instance && typeof instance === "object" && !Array.isArray(instance)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in instance)) {
          errors.push(`${path}: missing required property "${key}"`);
        }
      }
    }
    if (schema.properties) {
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in instance) {
          const r = validate(instance[key], sub, `${path}.${key}`);
          errors.push(...r.errors);
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(instance)) {
        if (!allowed.has(key)) {
          errors.push(`${path}: unexpected additional property "${key}"`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function jsonType(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  if (typeof v === "number") return "number";
  return typeof v; // string | boolean | object | undefined
}

/**
 * Load the canonical Kinetic output schema from disk.
 */
export async function loadKineticSchema() {
  const url = new URL("../schemas/kinetic-output.schema.json", import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

// ---- Self-test ----
// `node src/validate.mjs --selftest` runs a tiny inline test of the v0.5
// two-dimensional contract (ADR-0003: domain × activity_type):
//  - one schema-valid sample passes
//  - one obviously-invalid sample fails
//  - a sample missing the required `domain` is rejected
//  - a sample with an out-of-enum `domain` is rejected
async function selfTest() {
  const schema = await loadKineticSchema();
  const valid = {
    admin_tasks: [
      { id: "task_abc123", title: "Promote fix", status: "todo", due: null, source: "self-test" },
    ],
    proof_card: {
      id: "proof_abc123",
      title: "Self-test card",
      summary: "A minimal Proof card used by the validator self-test. Should pass schema.",
      tech_tags: ["self-test"],
      time_to_resolution_minutes: null,
      impact_metric: null,
      domain: "business",
      activity_type: "other",
      visual_theme: "graphite",
      narrative: "This narrative exists only to make the self-test pass. It is at least forty characters long.",
    },
  };
  const invalid = {
    admin_tasks: [{ id: "BADID", title: "x", status: "nope", source: "self-test" }],
    proof_card: {
      // missing required `id`
      title: "no",
      summary: "too short",
      tech_tags: ["ok"],
      time_to_resolution_minutes: -1,
      impact_metric: null,
      domain: "nonsense",
      activity_type: "made-up",
      visual_theme: "rainbow",
      narrative: "short",
    },
  };
  // Valid in every respect except the required `domain` is absent.
  const missingDomain = JSON.parse(JSON.stringify(valid));
  delete missingDomain.proof_card.domain;
  // Valid in every respect except `domain` is outside the closed enum.
  const badDomain = JSON.parse(JSON.stringify(valid));
  badDomain.proof_card.domain = "work-ish";

  const a = validate(valid, schema);
  const b = validate(invalid, schema);
  const c = validate(missingDomain, schema);
  const d = validate(badDomain, schema);

  if (!a.valid) {
    console.error("✗ self-test: valid sample failed unexpectedly");
    for (const e of a.errors) console.error("   -", e);
    process.exit(1);
  }
  if (b.valid) {
    console.error("✗ self-test: invalid sample passed unexpectedly");
    process.exit(1);
  }
  if (c.valid) {
    console.error("✗ self-test: sample missing required `domain` passed unexpectedly");
    process.exit(1);
  }
  if (d.valid) {
    console.error("✗ self-test: sample with out-of-enum `domain` passed unexpectedly");
    process.exit(1);
  }
  console.log("✓ validator self-test passed");
  console.log("  valid sample → ok");
  console.log(`  invalid sample → rejected with ${b.errors.length} errors (expected ≥1)`);
  console.log("  missing domain → rejected");
  console.log("  bad domain enum → rejected");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    await selfTest();
  } else {
    console.error("usage: node src/validate.mjs --selftest");
    process.exit(2);
  }
}
