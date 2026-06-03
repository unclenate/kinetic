<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Documentation Revision Tracker

**Version:** 1.0 | **Owner:** @unclenate | **Last Updated:** 2026-06-03

Tracks findings from reviews, audits, and validator runs, along with their
resolution status over time. Validator failures aren't failures — they're
the backlog.

This project is at **alpha maturity** (criticality medium). The governance surface is
young: most ADRs landed in the v0.5 expansion, and several required artifacts (CI workflow,
real-provider regression evidence) are still open. The findings below are seeded from the
recent governance and scope revisions rather than from a formal validator run, which has
not yet been executed against the full docs tree.

---

| Finding ID | Severity | Description | Affected Documents | Status | Resolution | Date |
|------------|----------|-------------|--------------------|--------|------------|------|
| C-1 | Critical | No CI workflow exists (`.github/workflows/ci.yml` absent), so the `npm test` suite and the >=90%/>=95% regression gate are enforced only locally — nothing blocks a merge automatically. | `docs/testing/test-strategy.md`, `docs/testing/coverage-thresholds.md` | Open | — | — |
| H-1 | High | Composition advanced from `new-product-discovery` to `node-web-saas-postgres` per ADR-0005; governance artifacts (HARNESS/manifest, change-log) need to reflect the heavier required-artifact posture the new composition implies. | `docs/adr/ADR-0005-*`, `docs/project/change-log.md`, `.harness/harness.manifest.yaml` | Open | — | 2026-06-03 |
| H-2 | High | Real-provider regression (Claude / Gemini / Ollama / OpenAI) is unproven against the >=90% schema / >=95% domain gate — only the deterministic `mock` provider (20/20) has passed. Pending API keys / a local model. | `docs/testing/coverage-thresholds.md`, `docs/project/dependency-log.md` | Open | — | 2026-06-03 |
| M-1 | Medium | The v0.5 expansion (ADR-0002 five-day track, ADR-0003 two-dimensional domain x activity_type, ADR-0004 real OAuth + Supabase) widened product scope and the LLM contract; downstream product/requirements docs were revised to match and should be re-reviewed for drift. | `docs/product/requirements.md`, `docs/discovery/mvp-scope.md`, `docs/project/scope-plan.md`, `docs/project/milestones.md` | Partially Resolved | v0.5 ADRs accepted 2026-05-16; product docs updated in the working tree. Cross-check pass still pending. | 2026-06-03 |
| M-2 | Medium | Microsoft Graph harvesters (`mscal.mjs`, `outlook_sent.mjs`, `onedrive.mjs`) are scaffolded and unit-tested offline but their live OAuth path is planned, not implemented — docs should not imply Microsoft capture works end-to-end. | `docs/project/dependency-log.md`, `docs/adr/ADR-0004-real-oauth-and-supabase.md` | Open | — | 2026-06-03 |
| L-1 | Lower | No automated statement/branch line-coverage is measured (zero-dependency by design); coverage is expressed as suites-passing plus the regression gate. Documented honestly, but worth a forward path (native `node --test` coverage). | `docs/testing/coverage-thresholds.md` | Deferred | Revisit at MVP transition; adopt `node --experimental-test-coverage` rather than a framework. | 2026-06-03 |

---

## Finding ID Convention

- **C-n** — Critical: blocks release, security risk, data integrity issue
- **H-n** — High: governance gap, incomplete required artifact, broken dependency
- **M-n** — Medium: structural inconsistency, documentation gap
- **L-n** — Lower: style, naming, cross-reference improvements

## Status Values

- **Open** — finding acknowledged, no resolution yet
- **In Progress** — work underway
- **Partially Resolved** — some but not all aspects addressed
- **Resolved** — fully addressed, with resolution description and date
- **Deferred** — intentionally postponed; note when to revisit

## Resolution Format

When a finding is resolved, the Resolution column should:
- Describe what was done (e.g., "ADR-0008 accepted; credentials now via env vars")
- Reference the ADR, PR, or commit that resolved it
- Note the resolution date

---

## Summary

- **Resolved:** 0 of 6 findings
- **Partially Resolved:** 1 (M-1)
- **Open:** 4 (C-1, H-1, H-2, M-2)
- **Deferred:** 1 (L-1)

---

**Document Owner:** @unclenate
