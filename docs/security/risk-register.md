<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Risk Register

<!-- Source: platform/profiles/delivery/production-saas or management/project-standard -->
<!-- Review cadence: monthly minimum; after every incident; before each major release. -->
<!-- Web3 projects: use templates/web3/risk-register-web3.md for chain-specific risks. -->

**Owner:** @unclenate (Nate DiNiro)
**Last reviewed:** 2026-06-05

This register tracks risks that could affect delivery, operations, security, or compliance.
It is a living document — add new risks as they are identified, update mitigations as they
are implemented, and move resolved risks to the Closed section.

A risk that becomes an active incident moves out of this register and into an incident
record (`docs/ops/incidents/`).

Project context: Kinetic is at **alpha** maturity with **medium** criticality. It runs
local-dev-only today (`node web/server.mjs`, no staging/prod deploy), backed by a single
shared Supabase project (`wdjktkfeqaainzartztx`). Many operational controls below are
nascent or manual — this register is honest about that.

---

## Open Risks

| ID | Area | Risk | Likelihood | Impact | Mitigation | Owner | Status |
| -- | ---- | ---- | ---------- | ------ | ---------- | ----- | ------ |
| R-001 | Security | Loss of `KINETIC_TOKEN_ENCRYPTION_KEY`: the AES-256-GCM key lives only in `.env.local` (no backup, no secret manager). As of Phase C (ADR-0006) it protects **two** things — every `oauth_tokens.*_enc` blob AND every `proof_cards.output_enc` (sensitive card content). If lost or rotated, all stored OAuth tokens die (re-OAuth required) **and** every encrypted sensitive Proof card becomes permanently unreadable, with no recovery path for the card content. | Med | High | Treat the key as a recovery asset: back it up out-of-band (password manager) before any reinstall/machine change. Re-OAuth recovers tokens, but encrypted card content is unrecoverable on key loss. Plan a secret store + key rotation (re-encrypt on rotate) before multi-user; no automated rotation today. | @unclenate | Monitoring |
| R-002 | Security | Supabase **service-role key** exposure: `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS. The server uses it server-side only, but it sits in plaintext `.env.local` with no secret manager. Leakage (accidental commit, shared dump, compromised laptop) grants full read/write to users, captures, oauth_tokens, and proof_cards. | Low | High | `.env.local` is gitignored; only `.env.example` (empty) is tracked. Key never sent to the client. Rotate via Supabase dashboard if exposure suspected. Future: move to a secret manager and scope server access. | @unclenate | Monitoring |
| R-003 | Data | OAuth/domain hint **misclassification → sensitive data sent to a cloud LLM**: harvesters attach a soft `provider_domain_hint` (ADR-0003), but the actual domain × activity_type classification runs through a cloud provider (Claude/Gemini). A personal/family/financial capture can be forwarded to a third-party LLM as part of classification, leaking sensitive content off-box. | Med | High | Hint is computed locally and is a soft signal; a `mock` provider runs fully offline (default). Planned: local providers (ollama) and a privacy pre-screen before any cloud call. Document that real-provider mode sends capture text to a third party. | @unclenate | Open |
| R-004 | Data | **Domain misclassification publishes a non-business card**: only `domain=business` cards are public-eligible (ADR-0003). If the LLM labels a personal/family/financial capture as `business`, a user could share it publicly via `/api/share/:id`, exposing private content at a public `/proof/:slug` URL. | Med | High | Per-card user override before publish; non-business "Share publicly" path requires an extra domain-named confirmation step. `proof_cards_public_read` RLS gates anon reads on `is_public`. Sharing is explicit (never automatic). Improve classifier precision and add a pre-publish domain review. | @unclenate | Open |
| R-005 | Third-party | **Supabase free-tier limits / project pausing**: project `wdjktkfeqaainzartztx` is the single shared backing DB. Free-tier projects pause after inactivity and have row/storage/egress caps. A paused or throttled project breaks persistence (captures, proof cards, oauth tokens) for everyone. | Med | Med | Server degrades to in-memory store when `SUPABASE_URL` is unset, so the demo still runs (data not persisted). Restore a paused project from the dashboard. Monitor usage; upgrade tier before any real traffic. | @unclenate | Monitoring |
| R-006 | Security | **Single seeded user, no real auth yet (app-wide; includes IDOR on all mutating routes)**: v0.5 uses one hard-coded demo user (`00000000-...0001`, `KINETIC_DEMO_USER_ID`); full Supabase Auth is post-v0.5. There is no per-user isolation and **no authentication or authorization on any HTTP route**. Every mutating endpoint — `POST /api/process`, `POST /api/share/:id`, `POST /api/harvest/:provider`, and `POST /api/cards/:id/recategorize` — accepts an unauthenticated caller and operates on any card by id (a classic IDOR / missing-access-control). A security review (2026-06-05) flagged the recategorize route specifically; it is not a regression but an instance of this app-wide posture, recorded here so the finding is tracked rather than dismissed as "internal-only". | High | Med | Acceptable for local-dev alpha (single operator, localhost only, no hosted deploy). RLS policies are already authored for the post-auth model. **Do not patch auth onto individual routes** — that creates a false sense of coverage while sibling routes stay open. Blocking dependency: real auth (Supabase Auth + a per-user ownership check applied uniformly to every route, recategorize included) must land as one change before any multi-user or hosted deployment. | @unclenate | Open |
| R-007 | Security | **Secrets in `.env.local` only — no secret manager**: all secrets (encryption key, service-role key, Google OAuth client secret, LLM API keys) live in a single gitignored `.env.local`. No rotation schedule, no central management, no audit of access. | High | Med | File is gitignored; `.env.example` ships empty. Single-developer alpha limits blast radius. Adopt a secret manager (e.g. Vercel env / 1Password) as part of the planned hosted deploy. | @unclenate | Open |
| R-008 | Third-party | **Reduced GitHub events payload** (handled): the GitHub events harvester works from the public events API, whose payloads are trimmed/eventually-consistent and omit some detail vs. the full API. Captures derived from it can be thinner than expected. | Low | Low | Already handled — the harvester normalizes to the canonical capture shape and tolerates missing fields; downstream classification still runs. Monitored; no action needed unless richer GitHub data is required. | @unclenate | Mitigated |

**Area categories:** Security, Data, Infrastructure, Delivery, Compliance, Third-party, Team

**Likelihood definitions:**

- **High** — likely to occur within this release cycle
- **Med** — possible but not expected; worth monitoring
- **Low** — unlikely; document for awareness

**Impact definitions:**

- **High** — would block release, cause data loss, or create compliance exposure
- **Med** — would require significant rework or delay a milestone
- **Low** — manageable within normal operations

---

## Mitigation Guidance by Area

### Security

Common controls: dependency scanning in CI, secret scanning, SAST, pen test before launch,
security review for auth and data access paths. Kinetic-specific: encrypt OAuth tokens at
rest (AES-256-GCM, done), keep the service-role key server-side only (done), and migrate
secrets off `.env.local` into a secret manager before any hosted deploy (pending).

### Data

Common controls: migration dry-run in staging, rollback plan documented, backup verified
before migration, data access audit log active. Kinetic-specific: the domain × activity_type
contract is the privacy boundary — only `business` is public-eligible, and any cloud-LLM
classification path must be treated as data egress to a third party.

### Infrastructure

Common controls: environment parity checks, load testing before production, runbook for
critical operations, on-call rotation defined. Kinetic-specific: there is no staging/prod
yet; the in-memory store fallback is the de-facto degraded mode when Supabase is unavailable.

### Compliance

Common controls: legal review for PII handling, GDPR/CCPA checklist, audit trail active
for regulated operations, retention policy documented. Kinetic-specific: captures can
contain personal/family/financial content; a retention and deletion policy is needed before
real users.

### Third-party

Common controls: fallback for critical integrations, SLA reviewed, quota increase requested,
vendor incident contact documented. Kinetic-specific: Supabase (free tier), Google/Microsoft
OAuth, and the LLM providers (Anthropic/Gemini) are the external dependencies.

### Delivery

Common controls: scope freeze date agreed, dependency log updated weekly, blockers escalated
within 24 hours, milestone exit criteria defined.

---

## Closed Risks

Move risks here when they are fully mitigated or no longer applicable. Preserve the record
— closed risks provide context for future decisions.

| ID | Area | Risk | Closed Date | Resolution |
| -- | ---- | ---- | ----------- | ---------- |
| _none yet_ | — | No risks have been closed at this stage of the project. | 2026-06-03 | — |

---

## Reference

| Resource | Path |
| -------- | ---- |
| Web3 risk register | `platform/templates/web3/risk-register-web3.md` |
| Incident template | `platform/templates/incident.md` |
| Ownership map | `docs/security/ownership-map.md` |
| Trust model | `platform/core/kernel/base/trust-model.md` |
