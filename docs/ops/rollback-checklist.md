<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Rollback Checklist — Kinetic (AutoPortfolio)

> Owner: @unclenate (Nate DiNiro)
> Rollback authority: @unclenate (Nate DiNiro)
> Last updated: 2026-06-03
> Last exercised: 2026-06-03 (never formally exercised — first drafted with this document; treat as untested)

A rollback checklist that has never been exercised is not a rollback plan. Test this
checklist before you need it.

> Alpha note: there is **no production deployment and no deploy pipeline** today. "Rollback"
> currently means reverting the local runtime to a previous known-good git commit and, if a
> schema change was applied, reconciling the shared Supabase project `wdjktkfeqaainzartztx`.
> There is no auto-deploy, blue/green, or canary to fail back to.

---

## Pre-Conditions

Before starting a rollback, confirm:

- [ ] The decision to rollback has been authorized by @unclenate (Nate DiNiro)
- [ ] The issue triggering rollback has been identified or categorized
- [ ] The target rollback version has been identified: `previous known-good git commit (e.g. last green tag/SHA on main)`
- [ ] Affected users or stakeholders have been notified (if applicable) — single-operator alpha; usually N/A

---

## Rollback Steps

### 1. Halt Forward Deployment

- [ ] Stop the running server process (`node web/server.mjs`)
- [ ] Disable auto-deploy or merge queue if active — N/A: no auto-deploy or merge queue exists yet

### 2. Revert Application

- [ ] Deploy previous known-good version: `git checkout <known-good-SHA> && node web/server.mjs`
- [ ] Verify the process started cleanly (no startup errors in console)
- [ ] Confirm health check passes: `curl -s http://localhost:5173/health` returns `{ ok: true, ... }`

### 3. Database Considerations

- [ ] Determine if the release included migrations (a Supabase MCP `apply_migration` / `db/schema.sql` change)
- [ ] If migrations are backward-compatible (additive columns/tables): no database rollback needed — the reverted code ignores new fields
- [ ] If migrations are NOT backward-compatible: manually reverse the change in Supabase using `mcp__supabase__apply_migration` (or the SQL editor) to restore the prior schema — there is no scripted down-migration; restore from the schema snapshot captured before release
- [ ] Verify data integrity after migration rollback (spot-check `users`, `oauth_tokens`, `captures`, `proof_cards`); confirm `oauth_tokens.*_enc` blobs still decrypt with the current `KINETIC_TOKEN_ENCRYPTION_KEY`

### 4. External Dependencies

- [ ] Verify third-party integrations still function with the rolled-back version: Google OAuth start/callback, refresh-on-use, and the active LLM provider (Anthropic/Gemini)
- [ ] Check webhook configurations are compatible — N/A: Kinetic registers no inbound webhooks
- [ ] Confirm OAuth redirect URI(s) registered with Google/Microsoft still match `KINETIC_BASE_URL` for the reverted version

### 5. Verification

- [ ] Application is responding on all endpoints (`/`, `/api/process`, `/api/share/:id`, `/proof/:slug`, `/oauth/google/start`, `/health`)
- [ ] Error rates have returned to baseline (manual observation of server logs)
- [ ] Key user flows are functional: capture → process → share → public `/proof/:slug` read; OAuth connect + harvest
- [ ] Monitoring confirms recovery: Supabase project logs/usage (no dashboards yet)

---

## Post-Rollback

- [ ] Record the incident in `docs/ops/incidents/` using the incident template
- [ ] Update the risk register (`docs/security/risk-register.md`) if a new risk was discovered
- [ ] Schedule a post-incident review within 48 hours
- [ ] Document what went wrong and the fix plan before re-attempting the release

---

## Rollback Contacts

| Role | Person | Contact |
|------|--------|---------|
| Rollback authority | @unclenate (Nate DiNiro) | nate@bdits.io |
| On-call engineer | @unclenate (Nate DiNiro) | nate@bdits.io |
| Escalation | @unclenate (Nate DiNiro) | nate@bdits.io (single operator — no separate escalation path yet) |

---

## Notes

- This checklist must be reviewed and updated with every release that changes the
  deployment topology, adds migrations, or alters external integrations.
- Exercise this checklist at least once per quarter — and run it for real once a staging
  or hosted (Vercel) target exists, since today there is no environment to fail back to.
- Critical recovery dependency: `KINETIC_TOKEN_ENCRYPTION_KEY` must be intact across any
  rollback, or all stored OAuth tokens become undecryptable and every user must reconnect
  (see risk R-001).
