# Release Intent — Kinetic

**Owner:** @unclenate
**Last updated:** 2026-05-16 (v0.5 section added; v0 preserved as historical record)

This project ships two distinct hackathon releases against the same repo:

- **v0** — 1-day track, submitted 2026-05-16. Frozen.
- **v0.5** — 5-day track, target 2026-05-21. Active.

---

## v0.5 — 5-day-track Release Intent *(active)*

### Target Outcome

After this release, a judge can connect a Google account, a Microsoft 365
account, and a GitHub identity in under five minutes. Calendar events,
file activity, and code activity from the operator's *real* life turn into
Proof-of-Skill cards automatically — each tagged with a life *domain* and an
*activity type*. The judge sees a Proof Feed that contains only the user's
professional activity, with the structural guarantee that nothing personal,
family, parenting, or financial can accidentally appear there. The judge
should feel: *"this is built for real life, not just career theater."*

### Feature Maturity

**This release:** **Late prototype / pre-alpha.** Single seeded operator
user, but with real OAuth, real persistence, real refresh tokens, and a
real privacy contract. Production OAuth verification is deferred, so users
other than the operator would see Google/Microsoft's "unverified app"
screens — acceptable for a hackathon demo running on the operator's own
account.

### Scope of This Release

The Must-tier items from [`requirements.md`](./requirements.md) — FR-001
through FR-006, FR-009 through FR-014, FR-017 through FR-021. Specifically:

- Real Google + Microsoft OAuth, encrypted refresh-token storage
- GitHub PAT-optional harvester, Microsoft Calendar harvester, Google Drive
  Activity harvester, OneDrive harvester
- Two-dimensional categorization (domain × activity_type) with the privacy
  gate on non-business shares
- Supabase persistence; feed view with domain filter tabs
- Updated regression set (≥20 fixtures, ≥2 per domain) with measurement
  recorded in shared observations

User stories covered: US-001 through US-013.

### What Is Not in This Release

- Multi-tenant Supabase Auth signup flow (v1)
- Voice memo capture + transcription (v1 Should)
- Native iOS / Android packaging
- Edit-after-generate (regenerate-only path)
- Family / parenting / financial first-class UIs
- Slack / Teams ingestion
- Meeting transcript ingestion
- Inbound mail body reading
- Production OAuth verification (lifts unverified-app warning)

### Success Signals

| Signal | How measured | Target |
|--------|--------------|--------|
| Judge can connect Google + Microsoft + GitHub from the UI | Live demo stopwatch | <5 min total |
| All four named harvesters produce ≥1 schema-valid card during the demo | Pre-demo dry run | 4/4 |
| Server restart during dry run preserves all stored cards + tokens | Stop/start pre-demo | All present |
| Domain classification correctness on 20-fixture regression | Manual review | ≥95% |
| Schema validity on the same regression | `node src/regression.mjs` | ≥90% |
| Privacy audit: 0 non-business cards public | `node tools/privacy-audit.mjs` | 0 |
| Public Proof link loads in a fresh browser | Demo phone + private window | <3s |
| Judges advance Kinetic in the 5-day track | Posted result | Yes |

### Release Checklist Reference

`docs/ops/demo-runbook.md` will be updated in M11 with the v0.5 connect-
OAuth → harvest → share flow plus the fallback ladder for the new
failure modes (token refresh failure, Supabase outage, provider 429).

---

## v0 — 1-day-track Release Intent *(historical, shipped 2026-05-16)*

### Target Outcome

After this release, a judge can take a chaotic input from their own day and
walk away with a polished, shareable Proof-of-Skill card in under 30
seconds.

### Feature Maturity

Prototype. Single-user demo mode, no auth, in-memory store, sample inputs
pre-seeded as fallback.

### Scope of This Release

Must-tier items FR-001 through FR-005 of v0 requirements (capture screen,
LLM call, Proof card render, admin task list, public share link).

### What Was Not in This Release

Auth, voice transcription, feed view, regenerate, native apps, GitHub /
Slack integration, analytics. (All now in v0.5 scope or explicitly
deferred.)

### Success Signals (final, recorded)

| Signal | Target | Actual |
|--------|--------|--------|
| Judge-handed input produces a usable Proof card on first try | ≥4 of 5 demo runs | ✅ Live demo executed via Chrome |
| End-to-end capture → rendered card latency | ≤15s p95 | ✅ 4ms (mock), ~5–7s (Claude / Gemini) |
| LLM structured output schema validity | ≥9 of 10 | ✅ 10/10 (mock + Claude) |
| Public share link loads in fresh browser | <3s | ✅ Verified |

See [`SUBMISSION.md`](../../SUBMISSION.md) for the full v0 submission record.
