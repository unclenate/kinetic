<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Test Strategy

<!-- Source: platform/profiles/management/testing-standard -->
<!-- Fill in: testing pyramid layers, enforcement posture, and framework choices -->
<!-- Companion rule: changes here require a change-log entry or ADR -->

**Owner:** @unclenate
**Last reviewed:** 2026-06-03
**Delivery stage:** PROTOTYPE

This document declares the testing approach for Kinetic (AutoPortfolio). It defines which
layers of the testing pyramid are active, what is enforced by `npm test`, what is deferred
to manual review, and what frameworks are in use.

Kinetic is a zero-dependency Node ESM project (Node >= 18, no build step, no npm runtime
dependencies — see `docs/project/dependency-log.md`). That constraint shapes the entire
test approach: there is no test framework. Every suite is a plain `.mjs` script that
imports the module under test, asserts with `node:assert`, prints `N passed, N failed`,
and exits non-zero on failure. The whole suite is the chain wired into the `test` script
in `package.json`:

```
node src/validate.mjs --selftest
  && node src/regression.mjs
  && node tests/harvesters.test.mjs
  && node tests/oauth.test.mjs
  && node tests/store.test.mjs
  && node tests/m10.test.mjs
```

**Working practice — TDD.** New behavior is written test-first: add a failing assertion,
watch it go red, then write the minimum implementation to make it green. The harvester,
OAuth, store, and M10 suites were all grown this way.

---

## Testing Pyramid

### Unit Tests

**Status:** Active

**Framework:** None — plain Node `.mjs` scripts using `node:assert`, run directly by
`node <file>`. No Jest/Vitest/Mocha; the zero-dependency rule forbids a framework.

**Scope:** Pure logic and module contracts with all network I/O stubbed.

- `src/validate.mjs --selftest` — the authoritative zero-dependency JSON-schema gate.
  Confirms the canonical `schemas/kinetic-output.schema.json` accepts a schema-valid
  sample, rejects an obviously-invalid one, and rejects samples that omit the required
  `domain` or use an out-of-enum `domain` (the ADR-0003 two-dimensional contract).
- `tests/harvesters.test.mjs` (14 tests) — the signal harvesters on the `harvest()`
  contract (Microsoft calendar, Google Drive, OneDrive, Gmail-sent, Outlook-sent, GitHub
  public events, calendar lines). Covers token-required guards, event-to-capture mapping,
  domain-hint heuristics (personal-keyword/free-mail), and the GitHub PR enrichment path.
- `tests/oauth.test.mjs` (12 tests) — the OAuth PKCE core and token crypto: PKCE
  verifier/challenge generation and AES-256-GCM encrypt/decrypt round-trips for tokens at
  rest.
- `tests/store.test.mjs` (6 tests) — the persistence layer: the in-memory store and the
  Supabase/PostgREST adapter shape, exercised offline.
- `tests/m10.test.mjs` (4 tests) — the feed plus privacy-gate backend (public vs.
  private card visibility).

External I/O is mocked at the network boundary: the suites stub `globalThis.fetch` so
harvesters, providers, and the Supabase adapter run fully offline and deterministically.

**CI enforcement:** Not yet — there is no `.github/workflows/ci.yml` in the repo today.
`npm test` is the gate and is run locally before merge; wiring it into CI is an open item
(see "What Is NOT Tested Automatically").

---

### Integration Tests

**Status:** Active (offline) / Deferred (live providers and live Supabase)

**Framework:** None — same plain `.mjs` script approach as unit tests.

**Scope:**

- `src/regression.mjs` is the contract/integration gate for the LLM pipeline. It loads
  the 20 fixtures in `tests/regression-inputs.jsonl`, runs each through the selected
  provider's `process()`, validates the output against the canonical schema, and scores
  `domain` classification correctness. **Exit gate:** >= 90% schema-valid AND >= 95%
  `domain`-correct for the chosen provider. `activity_type` match is reported but
  informational (not a gate). The default `mock` provider passes 20/20 (100% schema-valid,
  100% domain-correct), which is what `npm test` exercises.
- The store and harvester suites double as integration tests for the
  capture -> normalize -> persist boundaries, with `fetch` stubbed.

**Test environment:** Fully offline. No live test database and no live LLM are required
for `npm test`. The Supabase path is exercised against a stubbed PostgREST `fetch`; the
in-memory store is the real fallback. Real-provider runs target the live vendor APIs
directly (no local mock server).

**CI enforcement:** No — not wired into CI yet; the regression gate is enforced locally
via `npm run regression` and the `npm test` chain.

---

### End-to-End (E2E) Tests

**Status:** Deferred

**Framework:** None selected (no Playwright/Cypress). At alpha, end-to-end coverage is
manual.

**Scope:** The end-to-end journey — capture a signal, harvest it, classify via a provider,
persist it, and render a public share link from `web/server.mjs` — is verified by hand.
The "real Google Calendar API harvester, verified end-to-end" and "demoable end-to-end
capture + public share link" commits were validated manually against a running server, not
by an automated browser suite.

**CI enforcement:** No — no automated E2E suite exists; this is a deliberate alpha-stage
deferral.

---

### Contract Tests (if applicable)

**Status:** Active

**Framework:** Custom — `src/validate.mjs` (the zero-dependency JSON-schema validator)
plus `src/regression.mjs`.

**Scope:** The load-bearing contract is the LLM output schema
(`schemas/kinetic-output.schema.json`): every provider (`mock`, `claude`, `gemini`, and
the planned `ollama`/`openai`) must emit output that validates against it, including the
two-dimensional `domain` x `activity_type` classification from ADR-0003. The validator
self-test plus the 20-fixture regression set are the enforcement of that contract.

---

## What Is NOT Tested Automatically

Be explicit about what is deferred to manual review or not tested. This prevents the
assumption that "the suite is green = everything is correct."

- **Real-provider regression (Claude / Gemini / Ollama / OpenAI)** — verified manually by
  running `KINETIC_PROVIDER=<name> node src/regression.mjs` against live API keys or a
  local model. Real-provider pass rates are pending API keys / a local Ollama model and
  are NOT part of `npm test` (which runs the deterministic `mock` provider). The >= 90% /
  >= 95% gate has only been demonstrated on `mock` (20/20) so far.
- **Live Google OAuth consent + token refresh** — verified manually against Google's real
  OAuth (PKCE) flow; the automated `oauth.test.mjs` covers PKCE math and token crypto
  offline, not a live round-trip. Microsoft OAuth is planned, not implemented.
- **Live Supabase/PostgREST persistence** — verified manually against a real project; the
  store suite runs against a stubbed `fetch`, and the in-memory fallback is the only path
  exercised by default.
- **End-to-end browser UX of `web/server.mjs` and the share-link page** — verified by
  manual demo, out of scope for automation at alpha because the UI surface is still
  changing.
- **CI execution of the suite** — out of scope today because no
  `.github/workflows/ci.yml` exists yet; `npm test` is run locally before merge. Wiring it
  into CI is the next testing-infrastructure step.

---

## Test Execution

### Running tests locally

```bash
# Full suite (validator self-test + mock regression + all unit suites)
npm test

# Just the LLM regression set against a chosen provider
npm run regression                 # mock (default; part of npm test)
KINETIC_PROVIDER=gemini node src/regression.mjs   # live Gemini (needs API key)
KINETIC_PROVIDER=claude node src/regression.mjs   # live Claude (needs API key)

# Just the schema validator self-test
npm run validator:selftest

# A single suite
node tests/harvesters.test.mjs
```

### CI execution

There is no CI workflow yet. When one is added it should run `npm test` (and, with secrets
available, the live-provider regression variants). The harness template references a
`stack` job in `.github/workflows/ci.yml`; creating that workflow is tracked as an open
testing-infrastructure item.

---

## Flaky Test Policy

A flaky test (fails intermittently without code changes) must be:
1. Triaged within 1 working day of detection
2. Either fixed or marked skipped with a linked change-log note
3. Not allowed to accumulate — an untracked flaky test is a blocked release

Because every suite stubs `globalThis.fetch` and uses no real network, time, or random
seed in its assertions, flakiness should be near-zero by construction; any flake is treated
as a real determinism bug in the suite or the code under test.

---

## Reference

| Resource | Path |
| -------- | ---- |
| Coverage thresholds | `docs/testing/coverage-thresholds.md` |
| Output schema (contract) | `schemas/kinetic-output.schema.json` |
| Regression fixtures | `tests/regression-inputs.jsonl` |
| Test suite notes | `tests/README.md` |
| Two-dimensional contract | `docs/adr/ADR-0003-two-dimensional-categorization.md` |
| CI workflow | `.github/workflows/ci.yml` (not yet created) |
