# ADR-0005: Advance the harness composition to node-web-saas-postgres

**Status:** Accepted
**Date:** 2026-06-03
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** Governance conformance review, 2026-06-03 (pre-Phase-A)

---

## Context

ADR-0001 selected the auto-harness `new-product-discovery` composition for the
discovery phase and committed to migrating to a full composition —
`node-web-saas-postgres` — once the stack was chosen. The root
`harness.manifest.yaml` carried that discovery composition, which sets
`disabledValidations: [required-artifacts]`: it intentionally switches off the
required-artifacts check so discovery work isn't blocked on production governance
docs.

Since then Kinetic has, in fact, built that stack:

- A Node web server (`web/server.mjs`) serving the app + JSON APIs.
- Supabase **Postgres** persistence (live project `wdjktkfeqaainzartztx`) via PostgREST.
- Real **OAuth** (Google live, Microsoft planned) with AES-256-GCM token encryption.
- A multi-provider LLM layer and eight signal harvesters.

A conformance review confirmed the project still passes every *active* validator
(manifest, module-graph, companions) and has no unfilled placeholders — but only
because the discovery composition disables the strict checks. A project handling
real OAuth tokens, a Postgres schema, and encrypted persistence should be governed
at the maturity it has actually reached.

## Decision

Replace the discovery composition in `harness.manifest.yaml` with the
`node-web-saas-postgres` composition (the target named in ADR-0001), adapted to
Kinetic:

- `project.maturity: alpha`, `project.criticality: medium` (honest — real
  integrations, not yet production-hardened).
- Modules: `core/kernel/base`; `stacks/node-typescript`; `architectures/web-app`;
  `data/relational-postgres`; `delivery/production-saas`; management
  `product-lite`, `project-standard`, `testing-standard`, `knowledge-capture`;
  agents `base`, `claude-code`.
- `overrides.disabledValidations: []` — **required-artifacts validation is now
  enabled.**

Create the 17 artifacts this composition requires, from the harness templates,
with real (non-placeholder) content drawn from the project's actual state:
`HARNESS.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`,
`docs/operating-principles.md`, `docs/architecture/overview.md`,
`docs/database/migration-readiness.md`, `docs/security/risk-register.md`,
`docs/ops/{environment-inventory,release-checklist,rollback-checklist}.md`,
`docs/project/{dependency-log,revision-tracker}.md`,
`docs/testing/{test-strategy,coverage-thresholds}.md`, and
`docs/knowledge/{README,distilled-learnings}.md`.

`knowledge-capture` is retained (beyond the bare composition) because the project
already maintains `docs/knowledge/shared-observations.md` heavily; the module adds
the README + distilled-learnings companions.

## Consequences

### Positive

- Governance now matches the project's real maturity: the strict
  required-artifacts and companion checks are active, so future drift is caught.
- The act of writing the required artifacts surfaced and recorded real gaps — no
  CI workflow, unproven real-provider regression, single-operator review, no
  secret manager — in `docs/project/revision-tracker.md` and
  `docs/security/risk-register.md`.
- Operational posture (release/rollback checklists, environment inventory, risk
  register) now exists before it is needed under pressure.

### Negative

- More governance surface to keep current; every requirements/architecture/ops
  change now has an enforced companion.
- Some artifacts are intentionally thin at alpha (e.g. coverage thresholds where no
  line-coverage tool exists) and will mature.

### Watch

- The single-operator review gap (no second reviewer) is a standing exception
  recorded in `docs/operating-principles.md` and the revision tracker; revisit when
  a second maintainer exists.
- Applying schema migrations to the shared Supabase project is a Tier 4 action; keep
  `db/schema.sql` and `docs/database/migration-readiness.md` authoritative.

## Alternatives Considered

### Stay on the discovery composition

- Zero work; validators already pass.
- Rejected: it passes only because the strict checks are disabled. The stack is
  built; the manifest's own comment and ADR-0001 both say to advance now.

### Advance with minimal/stub artifacts

- Faster; satisfy the validator's existence check with thin files.
- Rejected: the governance skill is explicit that empty files don't count — both
  existence and content matter. The artifacts were filled with real content.

## Migration

- `harness.manifest.yaml` replaced in this commit; this ADR is its companion (along
  with the new `HARNESS.md`/`AGENTS.md`/`CLAUDE.md` + `operating-principles.md`).
- The discovery-phase docs (`docs/discovery/`) are retained as history; they are no
  longer required artifacts but do no harm.
- Provider-routing privacy-by-design work (the spec at
  `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md`) will be
  recorded as **ADR-0006** when implemented (this ADR took the 0005 slot).

## References

- [ADR-0001](./ADR-0001-stack-and-composition.md) — original composition choice + migration plan
- `harness.manifest.yaml` — the advanced composition
- `.harness/platform/compositions/node-web-saas-postgres.yaml` — the source composition
- `docs/project/revision-tracker.md`, `docs/security/risk-register.md` — gaps surfaced
