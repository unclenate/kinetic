<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Coverage Thresholds

<!-- Source: platform/profiles/management/testing-standard -->
<!-- Companion rule: changes here require a change-log entry or ADR -->
<!-- These thresholds must be wired into the CI tool (Jest, Pytest, etc.) -->
<!-- to take effect — documentation alone is not enforcement. -->

**Owner:** @unclenate
**Last reviewed:** 2026-06-03
**Delivery stage:** PROTOTYPE

This document declares the coverage commitments that must be met before a PR can merge.

**Honest statement of fact:** Kinetic measures **no statement or branch line-coverage
percentage today.** It is a zero-dependency Node project (no npm runtime deps, no build —
see `docs/project/dependency-log.md`), and a line-coverage tool such as `c8`/`nyc` or
Jest's Istanbul instrumentation has deliberately not been added, because adding it would
introduce a dev dependency and toolchain we have chosen to live without at alpha. Node's
built-in coverage (`node --experimental-test-coverage`) is available with the native test
runner but is not yet adopted.

Therefore "coverage" in Kinetic is expressed two ways, and **these are the enforced
thresholds**:

1. **Required suites must pass** — `npm test` must exit zero. That command runs the
   validator self-test, the mock regression, and all four unit/integration suites
   (harvesters 14, oauth 12, store 6, m10 4). A failing or removed suite is a blocked
   merge.
2. **The LLM regression gate** — for the chosen provider, `src/regression.mjs` must score
   **>= 90% schema-valid AND >= 95% `domain`-correct** across the 20 fixtures in
   `tests/regression-inputs.jsonl`. `activity_type` match is informational, not a gate.

This document is the source of truth; the enforcement mechanism is the `test` script in
`package.json` and the exit-code gate inside `src/regression.mjs`. Changing either is an
architectural commitment — the companion rule requires a change-log entry or ADR in the
same PR.

---

## Thresholds

| Type | Layer | Minimum | Enforced in CI | Notes |
| ---- | ----- | ------- | -------------- | ----- |
| Suites passing | All (`npm test`) | 6 of 6 suites green (validator self-test + mock regression + 4 unit suites, 36 unit/integration assertions total) | No (run locally — no CI yet) | Exit-code gate via `package.json` `test` script |
| Schema-valid | LLM regression (chosen provider) | 90% of 20 fixtures | No (run locally) | Hard exit gate in `src/regression.mjs`; `mock` currently 100% |
| Domain-correct | LLM regression (chosen provider) | 95% of 20 fixtures | No (run locally) | Hard exit gate in `src/regression.mjs`; `mock` currently 100% |
| Activity-type match | LLM regression | Reported, no minimum | No | Informational since M1 |
| Line coverage | Unit | Not measured | No | No coverage tool (zero-dependency by design) |
| Branch coverage | Unit | Not measured | No | No coverage tool (zero-dependency by design) |
| Function coverage | Unit | Not measured | No | No coverage tool (zero-dependency by design) |
| E2E | Key flows | 0 automated (manual demo) | No | Capture -> classify -> persist -> share verified by hand |

**Default starting values by delivery stage (harness reference):**

| Stage | Unit line | Unit branch | Integration | E2E |
| ----- | --------- | ----------- | ----------- | --- |
| Prototype | 0% | 0% | Not enforced | Not enforced |
| MVP | 60% | 50% | Critical paths | 2–3 flows |
| Production | 80% | 75% | All boundaries | 5–10 flows |
| Scale | 85% | 80% | All critical paths | Full regression |

Kinetic is at **Prototype/alpha**, so 0% line/branch is the honest current posture. The
project compensates with the contract-level regression gate above, which is stricter than
nominal prototype line coverage.

### Proposed pragmatic thresholds (path forward)

When the project advances toward MVP, adopt these without taking on a heavy framework:

- **Adopt `node --test` + `--experimental-test-coverage`** (still zero third-party deps)
  to start *measuring* line/branch — no Jest/Vitest required.
- **MVP target:** line >= 60%, branch >= 50% on `src/` (excluding `web/` static assets and
  vendor-call wrappers), measured by the native runner.
- **Keep the regression gate at >= 90% schema-valid / >= 95% domain-correct** and require
  it to pass on **at least one real provider** (Claude or Gemini), not only `mock`, before
  the MVP label is claimed.
- **Wire `npm test` into `.github/workflows/ci.yml`** so all of the above is enforced on
  PRs rather than locally — this is the single biggest gap today.

---

## Exclusions

Files legitimately excluded from any future coverage measurement, so the exclusion is
documented and deliberate:

| Excluded path / pattern | Reason |
| ----------------------- | ------ |
| `web/` static assets (HTML/CSS/client JS) | Rendered UI — behavior verified by manual demo, not unit-testable |
| `src/providers/claude.mjs`, `src/providers/gemini.mjs` | Thin live-API wrappers — exercised by real-provider regression with API keys, not by `npm test` |
| `src/db/supabase.mjs` (live PostgREST calls) | Network boundary — covered offline via `fetch` stub; live path verified manually |
| `schemas/*.json` | Declarative schema — it is the source of truth, validated *by* tests, not *as* code |

When a coverage tool is adopted, these exclusions must be reflected in its config
(e.g., `c8`'s `exclude`, or the native runner's coverage exclude globs).

---

## Implementation

There is no framework coverage config today (no Jest/Vitest/pytest). The enforcement that
exists lives in two places and must stay there:

### Suite gate (`package.json`)

```json
"scripts": {
  "test": "node src/validate.mjs --selftest && node src/regression.mjs && node tests/harvesters.test.mjs && node tests/oauth.test.mjs && node tests/store.test.mjs && node tests/m10.test.mjs"
}
```

### Regression gate (`src/regression.mjs`)

```javascript
const SCHEMA_GATE = 90;   // % schema-valid
const DOMAIN_GATE = 95;   // % domain-correct
const pass = schemaPct >= SCHEMA_GATE && domainPct >= DOMAIN_GATE;
process.exit(pass ? 0 : 1);
```

### When a coverage tool is adopted (native runner, no new deps)

```bash
node --test --experimental-test-coverage tests/
# enforce a floor with a small post-process script; do NOT add Jest/Vitest
# without an ADR, since that breaks the zero-dependency invariant (ADR-0001).
```

---

## Coverage Threshold Change Policy

Thresholds may only be lowered with:
1. A documented rationale in `docs/project/change-log.md` or a new ADR
2. Explicit human approval (not agent-initiated)
3. A plan to restore the threshold within one milestone

Lowering the 90% schema-valid or 95% domain-correct regression gate, or removing a required
suite from `npm test`, specifically requires an ADR because it weakens the load-bearing LLM
contract (ADR-0003).

Thresholds may be raised at any time without ceremony — raising them is an improvement.

---

## Reference

| Resource | Path |
| -------- | ---- |
| Test strategy | `docs/testing/test-strategy.md` |
| Change log | `docs/project/change-log.md` |
| Regression runner | `src/regression.mjs` |
| Output schema (contract) | `schemas/kinetic-output.schema.json` |
| CI workflow | `.github/workflows/ci.yml` (not yet created) |
