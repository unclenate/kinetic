<!--
Copyright 2026 Nate DiNiro
SPDX-License-Identifier: MIT OR Apache-2.0
-->

# AGENTS.md

## Cross-Agent Operating Manual — Kinetic (AutoPortfolio)

This document governs all AI agent tooling used on this repository. It is also the
workspace-instructions entrypoint; keep it as the single shared guidance file rather than
duplicating it into tool-specific files. Claude Code reads `CLAUDE.md`, which links here.

Kinetic is governed by the auto-harness platform mounted at `.harness/` (a git submodule).
The authoritative governance rules live there; see `HARNESS.md` and the `harness-governance`
skill.

---

## Repository Shape

Kinetic is a deployable application (unlike the harness itself). Work happens in:

- `web/server.mjs` — the single zero-dependency Node HTTP server (APIs + static UI).
- `web/public/` — the browser UI (capture, feed, public proof page).
- `src/providers/` — LLM providers (`mock`, `claude`, `gemini`; `ollama`/`openai` planned).
- `src/harvesters/` — signal harvesters on the `harvest()` contract (github, gcal, calendar,
  mscal, gdrive, onedrive, gmail_sent, outlook_sent).
- `src/oauth/` — authorization-code + PKCE OAuth + AES-256-GCM token crypto + token store.
- `src/db/` — Supabase PostgREST client + pluggable store (memory ↔ supabase).
- `src/validate.mjs` — the zero-dependency JSON-schema validator (authoritative output gate).
- `schemas/`, `prompts/` — the LLM output contract and prompt template.
- `tests/` — zero-dependency Node test scripts (`npm test`).
- `docs/` — governance artifacts (product, project, adr, architecture, security, ops,
  testing, knowledge, superpowers specs/plans).
- `db/schema.sql` — the Supabase schema source of truth.

Treat `.harness/` as the governance platform (do not edit submodule contents from here),
and `.remember/` as session-continuity scratch (hook-managed).

---

## Build and Test

There is no build step (zero-dependency Node ESM). Verification is the test suite plus the
harness validator chain. Run from the repository root:

```bash
npm test                              # selftest + regression + harvesters + oauth + store + m10 (+ providers)
node web/server.mjs                   # run the app locally (PORT default 5173)

# Harness governance validators (PLATFORM=.harness/platform):
bash .harness/platform/validators/validate-manifest.sh harness.manifest.yaml
bash .harness/platform/validators/validate-module-graph.sh harness.manifest.yaml
bash .harness/platform/validators/validate-required-artifacts.sh harness.manifest.yaml .
bash .harness/platform/validators/validate-companions.sh harness.manifest.yaml .
bash .harness/platform/validators/validate-placeholders.sh .
```

Run the validator chain before committing any change to `docs/`, `harness.manifest.yaml`,
or a companion-trigger path.

---

## Working Conventions

- Follow **link, don't embed**: reference existing docs instead of duplicating guidance.
- A change is not complete until its documentation is current (see `docs/operating-principles.md` §3).
- TDD is the working practice: write the failing test, watch it fail, then implement.
- Zero runtime dependencies is a deliberate constraint — do not add npm runtime deps
  without an ADR.
- Secrets live only in `.env.local`. Never commit secrets; never print them.
- Preserve trust-tier boundaries and companion rules; do not weaken them without explicit
  human direction.

---

## Trust Tier Model

| Tier | Actions | Authorization |
|------|---------|--------------|
| 0 | Read-only inspection | Always permitted |
| 1 | Local analysis (tests, validators) | Always permitted |
| 2 | Workspace mutation (file edits, scaffolding docs) | Default agent scope |
| 3 | Git-writing (commits, feature branches, PRs) | Requires explicit instruction |
| 4 | Environment-altering (npm install, non-local DB migrations, configuring services) | Requires human authorization |
| 5 | Remote/production (deploys, secrets rotation, production migrations) | Human authorization + named owner |

Default operating tier: **Tier 2**. Note: applying a migration to the shared Supabase
project (`apply_migration` via MCP) is **Tier 4** — it mutates a non-local environment.

---

## Scope

**In scope for agents:**
- Reading, analyzing, and editing application + governance files.
- Running the test suite and validators.
- Creating/editing governance artifacts (ADRs, checklists, READMEs) with their companions.

**Out of scope without explicit human direction:**
- Pushing to remote (Tier 3+).
- Installing dependencies or applying non-local migrations (Tier 4).
- Any deploy or secrets rotation (Tier 5).
- Changing `harness.manifest.yaml` active modules or weakening governance rules.

---

## Stop Conditions

Halt and surface to the operator when:

- A change would weaken a governance control, companion rule, or trust-tier boundary.
- A validator or test starts failing and the fix is not obvious.
- An action would require Tier 4/5 authorization.
- A privacy control (token encryption, the domain-based public-eligibility gate) would be
  bypassed or weakened.

---

## Canonical Artifacts

| Artifact | Authority |
|----------|-----------|
| `harness.manifest.yaml` | Active module composition |
| `HARNESS.md` | Project-level governance entrypoint |
| `AGENTS.md` | This file — agent operating contract |
| `CLAUDE.md` | Claude Code workspace guidance (links here) |
| `docs/operating-principles.md` | Team operating principles |
| `docs/product/requirements.md` | Product requirements |
| `docs/adr/` | Architectural decision records |
| `docs/security/risk-register.md` | Tracked risks |
