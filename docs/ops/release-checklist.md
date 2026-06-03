<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Release Checklist

<!-- Source: platform/profiles/delivery/production-saas -->
<!-- Complete this checklist before every production release. -->
<!-- If a line item is not applicable, mark it N/A and note why. -->

**Release version:** v0.5 (M7 — real OAuth + Supabase)
**Release owner:** @unclenate (Nate DiNiro)
**Second approver:** @unclenate (single-operator alpha — self-review until a second approver joins)
**Scheduled release window:** 2026-06-03 00:00 UTC (local-dev cutover; no hosted deploy window yet)
**Rollback authority:** @unclenate (Nate DiNiro)

This checklist gates every production release. The release owner is accountable for completing each
section. The second approver independently verifies the Readiness section before deployment begins.
Complete sections in order — a blocking item in one section stops progress to the next.

> Alpha note: Kinetic has **no production deployment** today (local-dev only; Vercel planned).
> Until a hosted target exists, "deployment" means cutting over the local runtime against the
> shared Supabase project `wdjktkfeqaainzartztx`. Items that assume a pipeline, on-call, or
> dashboards are marked N/A with a reason — keep them so this checklist is ready when deploy lands.

---

## 1. Readiness

These items must be verified before any deployment action begins.

**Governance**
- [ ] All harness validators pass: `validate-manifest.sh`, `validate-module-graph.sh`, `validate-required-artifacts.sh`
- [ ] Companion validation passes for this PR (all companion rules satisfied)
- [ ] No open items in `docs/security/risk-register.md` classified High likelihood + High impact without an approved mitigation plan
- [ ] `docs/database/migration-readiness.md` is current if this release includes database migrations (schema changes apply via Supabase MCP `apply_migration` against `db/schema.sql`)

**Code quality**
- [ ] All automated tests pass: `npm test` (validate selftest + 20-fixture regression + harvesters/oauth/store/m10 suites; fetch is stubbed)
- [ ] Code coverage meets declared thresholds in `docs/testing/coverage-thresholds.md`
- [ ] No unresolved critical or high-severity linting or type errors
- [ ] Dependency versions pinned — N/A: zero runtime npm dependencies (Node >= 18 ESM, no build); confirm no new deps were introduced

**Artifacts and documentation**
- [ ] `docs/project/change-log.md` updated with changes in this release
- [ ] `docs/product/release-intent.md` reflects the current release goal
- [ ] Any new required artifacts are present (not stubs with unfilled placeholder tokens)
- [ ] Runbooks updated if operational procedures changed (`docs/ops/rollback-checklist.md`, `docs/ops/environment-inventory.md`)

**Operations**
- [ ] Rollback plan is documented (`docs/ops/rollback-checklist.md`) and rollback owner has been briefed
- [ ] On-call or operational owner identified for the release window — @unclenate (single operator)
- [ ] Monitoring dashboards reviewed; no unexplained anomalies in the past 24 hours — N/A: no dashboards yet; check Supabase project logs/usage instead
- [ ] External dependency health confirmed: Supabase project `wdjktkfeqaainzartztx` not paused/over-quota; Google OAuth + chosen LLM provider (Anthropic/Gemini) reachable
- [ ] Secrets present and valid in `.env.local`: `KINETIC_TOKEN_ENCRYPTION_KEY` (decodes to 32 bytes), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, and the active provider API key

**Human approvals**
- [ ] Second approver has reviewed and signed off on Readiness section — N/A in single-operator alpha; release owner self-attests
- [ ] Any required stakeholder notifications sent

---

## 2. Deployment

Complete these steps in order during the release window.

**Pre-deployment**
- [ ] Feature flags set for partial rollout if applicable — N/A: no feature-flag system; provider chosen via `KINETIC_PROVIDER`
- [ ] Maintenance mode or traffic throttling in place if needed for zero-downtime migration — N/A: single local instance, no live traffic

**Database migrations (if applicable)**
- [ ] Migration script reviewed and tested (apply `db/schema.sql` / migration via Supabase MCP `apply_migration`)
- [ ] Rollback script verified — note: schema migrations on the shared Supabase project are not auto-reversible; capture the prior schema first
- [ ] Migration run against the Supabase project within the past 48 hours with no errors
- [ ] Migration runtime measured; acceptable within the release window

**Deployment execution**
- [ ] Deployment initiated via approved path — currently `node web/server.mjs` against the configured Supabase project (no pipeline yet)
- [ ] Deployment log / server startup output captured
- [ ] Health check green: `GET /health` returns `{ ok, provider, backend, cards }` with `backend: "supabase"`

**Post-deploy validation**
- [ ] Key user workflows tested: capture → `POST /api/process` produces a schema-valid card; `POST /api/share/:id` then `GET /proof/:slug` serves a public card; a `business`-domain card is shareable and a non-business card requires the confirmation step
- [ ] OAuth round-trip verified: `/oauth/google/start` → callback stores an encrypted token; a harvest using refresh-on-use succeeds
- [ ] Error rates and latency reviewed — within normal bounds (manual observation of server logs)
- [ ] Alerts reviewed — N/A: no alerting configured
- [ ] Feature flags re-enabled / rollout expanded if staged — N/A

---

## 3. Verification and Close

Complete within 30 minutes of deployment completing.

- [ ] All post-deploy smoke tests pass (`npm test` green and manual workflow checks above)
- [ ] No incidents opened during the release window
- [ ] Release version tagged in version control
- [ ] Release owner confirms release complete
- [ ] Rollback authority stands down

**Notes / issues encountered during this release:**

_Record any deviations, near-misses, or follow-up actions here. These feed the post-release review._

---

## Release Outcome

- [ ] **Successful** — no rollback required
- [ ] **Successful with issues** — deployed but with deviations noted above
- [ ] **Rolled back** — see `docs/ops/rollback-checklist.md`

**Signed off by:** __________________ **Date:** __________________
