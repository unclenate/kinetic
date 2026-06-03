<!--
Copyright 2026 Nate DiNiro
SPDX-License-Identifier: MIT OR Apache-2.0
-->

# Operating Principles — Kinetic (AutoPortfolio)

> Owner: @unclenate (Nate DiNiro)
> Last updated: 2026-06-03

These principles govern how Kinetic is built and shipped. They are derived from the
auto-harness kernel doctrine and adapted to this project's context (a single-operator
alpha with real third-party integrations). Changes to this file should be deliberate
and logged in `docs/project/change-log.md` or an ADR.

---

## 1. Ownership

Every artifact, service, and decision area has a named owner.

- Primary owner: @unclenate (Nate DiNiro, nate@bdits.io)
- Backup: none today — this is a single-operator project. Until a second maintainer
  exists, the primary owner is also the sole reviewer; this is recorded as a known gap
  in `docs/project/revision-tracker.md`.
- Ownership means you are the person who gets asked, not the person who does all the work.

---

## 2. Review Discipline

Review is a knowledge-distribution mechanism, not a rubber stamp.

- Ordinarily PRs require at least one reviewer who is not the author. With a single
  operator this is not yet possible; the compensating control is the validator chain
  (`harness-governance` skill) plus the `npm test` suite, which must be green before any
  commit to `docs/`, `harness.manifest.yaml`, or a companion-trigger path.
- Governance-sensitive paths (`HARNESS.md`, `AGENTS.md`, `CLAUDE.md`, CI workflows,
  the manifest) require an accompanying ADR or an `operating-principles.md` update in the
  same commit (companion rule).
- Approval means "I understand this change and believe it is correct."

---

## 3. Documentation as Part of the Change

Documentation is not follow-up work. A change is not complete until its documentation is current.

- Requirements changes require a change-log entry or ADR.
- Architecture decisions require an ADR (`docs/adr/`).
- Operational changes require updated runbooks or checklists (`docs/ops/`).
- Schema/data changes are reflected in `db/schema.sql` and `docs/database/migration-readiness.md`.

---

## 4. Secrets and Credentials

Secrets never belong in tracked artifacts.

- No API keys, tokens, client secrets, service-role keys, or connection strings in
  committed files. They live in `.env.local` (gitignored); `.env.example` is the template.
- OAuth tokens are encrypted at rest (AES-256-GCM, `KINETIC_TOKEN_ENCRYPTION_KEY`) before
  they reach Supabase; the database sees ciphertext only.
- The Supabase service-role key is server-side only and is never sent to the browser.
- No secret manager exists yet (alpha); this is tracked as risk R-007 in
  `docs/security/risk-register.md`.

---

## 5. Operational Awareness

The team explicitly decides and documents:

- Release decisions and rollback authority: @unclenate (`docs/ops/release-checklist.md`,
  `docs/ops/rollback-checklist.md`).
- Incident recording: `docs/security/risk-register.md` and post-incident notes.
- Risk tracking: `docs/security/risk-register.md`.
- Environments: `docs/ops/environment-inventory.md` (local-only today; Vercel planned).

These are not deferred to "when we need them."

---

## 6. AI-Assisted Development

This project is built primarily with AI agents (Claude Code). AI acceleration increases
the need for controls, not the license to skip them.

- Agents operate within the six-tier trust model defined in `AGENTS.md`. Default scope is
  Tier 2 (workspace mutation). Tier 4 (installs, non-local migrations) and Tier 5 (deploys,
  secrets rotation) require explicit human authorization.
- Agent output is reviewed to the same standard as human output, and gated by the
  validator chain + `npm test`.
- Agents do not self-elevate permissions, weaken governance controls, or bypass companion
  rules. They halt and surface to the operator when a change would do so.
