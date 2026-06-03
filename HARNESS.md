<!--
Copyright 2026 Nate DiNiro
SPDX-License-Identifier: MIT OR Apache-2.0
-->

# HARNESS.md

## Governance Entrypoint — Kinetic (AutoPortfolio)

Kinetic is governed by the [auto-harness](https://github.com/unclenate/auto-harness)
platform, mounted as a git submodule at `.harness/`. This file is the project-level
entrypoint; the platform modules under `.harness/platform/` are the authority.

**Manifest:** `harness.manifest.yaml` (composition: `node-web-saas-postgres`)
**Maturity:** Alpha
**Criticality:** Medium
**Owner:** @unclenate (Nate DiNiro)
**Composition history:** advanced from the discovery composition to
`node-web-saas-postgres` once the stack was chosen and built — see
[ADR-0005](docs/adr/ADR-0005-harness-composition-advance.md).

---

## Active Modules

| Family | Module | Purpose |
|--------|--------|---------|
| Core | `kernel/base` | Governance kernel — doctrine, trust tiers, lifecycle controls |
| Stacks | `node-typescript` | Node/JS stack posture (Kinetic ships zero-dependency Node ESM) |
| Architectures | `web-app` | Web application architecture posture |
| Data | `relational-postgres` | Relational Postgres data posture (Supabase) |
| Delivery | `production-saas` | SaaS delivery posture — ops readiness artifacts |
| Management | `product-lite` | Problem framing, personas, requirements, release intent |
| Management | `project-standard` | Scope, milestones, change log, dependency log, revision tracker |
| Management | `testing-standard` | Test strategy + coverage thresholds |
| Management | `knowledge-capture` | Append-only shared observations + distilled learnings |
| Agents | `base` | Cross-agent trust-tier contract |
| Agents | `claude-code` | Claude Code agent pack (`CLAUDE.md`, `.claude/settings.json`) |

---

## Governance Artifacts

| Artifact | Path |
|----------|------|
| Operating principles | `docs/operating-principles.md` |
| Problem statement | `docs/product/problem-statement.md` |
| Personas | `docs/product/personas.md` |
| Requirements | `docs/product/requirements.md` |
| Release intent | `docs/product/release-intent.md` |
| Scope plan | `docs/project/scope-plan.md` |
| Milestones | `docs/project/milestones.md` |
| Change log | `docs/project/change-log.md` |
| Dependency log | `docs/project/dependency-log.md` |
| Revision tracker | `docs/project/revision-tracker.md` |
| Architecture overview | `docs/architecture/overview.md` |
| Database migration readiness | `docs/database/migration-readiness.md` |
| Security risk register | `docs/security/risk-register.md` |
| Environment inventory | `docs/ops/environment-inventory.md` |
| Release checklist | `docs/ops/release-checklist.md` |
| Rollback checklist | `docs/ops/rollback-checklist.md` |
| Test strategy | `docs/testing/test-strategy.md` |
| Coverage thresholds | `docs/testing/coverage-thresholds.md` |
| Shared observations | `docs/knowledge/shared-observations.md` |
| Distilled learnings | `docs/knowledge/distilled-learnings.md` |
| ADRs | `docs/adr/` |
| Design specs / plans | `docs/superpowers/specs/`, `docs/superpowers/plans/` |

---

## Source of Truth

Governance rules live in the mounted platform:

- Kernel doctrine and trust model: `.harness/platform/core/kernel/base/`
- Module contracts: `.harness/platform/profiles/**/module.yaml`
- Validators: `.harness/platform/validators/`
- Templates: `.harness/platform/templates/`

This file is the project-level entrypoint. The platform modules are the authority.

---

## Validating Governance

Run the validator chain before committing changes to `docs/`, `harness.manifest.yaml`, or
any companion-trigger path (see `AGENTS.md` → Build and Test). All must exit 0:

```bash
P=.harness/platform/validators
bash $P/validate-manifest.sh harness.manifest.yaml
bash $P/validate-module-graph.sh harness.manifest.yaml
bash $P/validate-required-artifacts.sh harness.manifest.yaml .
bash $P/validate-companions.sh harness.manifest.yaml .
bash $P/validate-placeholders.sh .
```

The `harness-governance` skill encapsulates trust tiers, companion rules, and lifecycle
conditions for day-to-day work.
