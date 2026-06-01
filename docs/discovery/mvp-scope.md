# MVP Scope — Kinetic

**Project:** [`docs/product/problem-statement.md`](../product/problem-statement.md)
**Growth stage:** v0 shipped (1-day track, 2026-05-16) → v0.5 in build (5-day track, target 2026-05-21)
**Intake source:** [`docs/discovery/intake-questionnaire.md`](./intake-questionnaire.md)
**Owner:** @unclenate
**Last updated:** 2026-05-16 (added v0.5 section; v0 section preserved as historical record)

---

## v0.5 MVP Definition *(active — 5-day track)*

A single-operator web app where a connected Google account, Microsoft 365
account, and GitHub identity automatically produce Proof-of-Skill cards
from calendar events, file activity, and code activity — each tagged with
a life *domain* (business / personal / family / financial / parenting) and
an *activity type* (build / fix / design / …). The public Proof Feed shows
only business cards; non-business cards are private and require an explicit
per-card confirmation before they can be shared.

## v0.5 In Scope

| Feature | Rationale | Acceptance signal |
|---------|-----------|-------------------|
| Real Google OAuth (GCP project, consent screen, encrypted refresh tokens) | Required to harvest Calendar / Drive / Gmail-sent | Connect → consent → first harvest in <60s; tokens survive server restart |
| Real Microsoft OAuth (Azure App Reg, Graph permissions) | Required for Outlook Cal + OneDrive + Mail | Same acceptance as Google |
| GitHub harvester upgrade: optional PAT for private repos | Captures private-repo activity | Private commits/PRs appear when PAT supplied |
| Microsoft Graph Calendar harvester | Mirror of `gcal` for Outlook side | Returns events; same shape as `gcal` |
| Google Drive Activity harvester | File create/edit/comment events become captures | Top 5 most-recent activities harvested and rendered |
| OneDrive / SharePoint Graph harvester | Same shape; Microsoft side | Top 5 activities harvested |
| Gmail sent-items harvester (subject + recipients + timestamp) | Outbound mail as evidence of customer/team comms | Returns last 24h of sent messages, metadata only |
| Outlook sent-items harvester (Graph) | Same shape; Microsoft side | Returns last 24h |
| LLM contract gains `domain` enum; `category` renamed `activity_type` | Two-dimensional classification (ADR-0003) | Schema regression ≥90% valid on 20+ fixtures (≥2/domain) |
| Privacy gate on public sharing | Domain `business` is default-shareable; others require explicit confirmation modal | UI modal cannot be skipped; modal names the domain |
| Supabase persistence: users, oauth_tokens, captures, proof_cards | Survives restart; ADR-0004 schema applied | Stop/start server; counts match |
| Encrypted-at-rest OAuth refresh tokens (AES-256-GCM) | Production-grade baseline from day 1 | DB rows show ciphertext |
| Feed view with domain filter tabs | See progression by domain | Filter switches in <100ms |
| Demo runbook update + 5-source live dry run | Submission requires a runnable artifact | Three consecutive clean dry runs end-to-end |

## v0.5 Explicitly Out of Scope

| Feature | Why deferred | When to revisit |
|---------|-------------|----------------|
| Real multi-tenant Supabase Auth signup flow | v0.5 ships with a single seeded operator user | Post-hackathon |
| Voice memo capture + transcription | Should-tier; not core to the cross-domain story | v1 |
| Native iOS / Android packaging | PWA covers all demo needs | After 100 alpha users |
| Editable Proof cards (free-text edit after generation) | Regenerate-only is enough | Early access |
| Family / parenting / financial first-class UIs | Domain classification seeds these; full surfaces are growth features | v1+ |
| Slack / Teams chat ingestion | Requires workspace admin; non-solo installable | v1+ |
| Meeting transcript ingestion (Zoom / Meet / Teams recordings) | Provider variability + PII story | v1+ |
| Production OAuth verification (removes "unverified app" warning) | Operator's own account is fine for demo | Pre-public-launch |
| Inbound mail body reading | Privacy-heavier than sent-metadata; not needed for v0.5 evidence story | v1+ |
| Analytics on shared link views | Cuttable | v1 |
| Verification / cryptographic attestation of proofs | Trust feature, premature | v2+ |

## v0.5 Success Criteria

| Criterion | How to measure |
|-----------|---------------|
| Operator can connect Google, Microsoft, and GitHub from the UI in under 5 min total | Live demo stopwatch |
| All four named harvesters (GitHub, Google Cal, Microsoft Cal, Drive *or* OneDrive) produce ≥1 schema-valid Proof card | Pre-demo dry run |
| Server restart preserves all stored cards and tokens | Stop/start cycle pre-demo |
| Domain classification on the 20-fixture regression: ≥95% match to expected labels | Manual review |
| Non-business cards: 0 accidental public shares (privacy gate effective) | Manual audit of all generated cards' `is_public` before demo |
| End-to-end latency on the canonical demo input ≤15s | Manual stopwatch |

---

## v0 MVP Definition *(historical — 1-day track, submitted 2026-05-16)*

A single-user web app where one capture (image + text) becomes one admin task and one
shareable Proof-of-Skill card, demoable end-to-end in under 30 seconds.

---

## In Scope for MVP

| Feature | Rationale | Acceptance signal |
|---------|-----------|-------------------|
| Capture screen: image + text input | Core input surface; required for any value | Image visible, text submitted, request fires |
| LLM call with structured output → `{admin_tasks[], proof_card{}}` | The "magic" of the product | JSON validates against schema |
| Proof card render with title, summary, tech tags, time-to-resolution | The visible "wow" output | Card looks polished for any valid LLM response |
| Admin task render with default "Done" pill | Demonstrates the "two sides" of the magic mirror | Tasks visible below card |
| One-click public share link | Closes the demo loop; sets up the growth flywheel | Anonymous browser loads card |
| Single-user demo mode (no auth) | Auth flow is risk; demo can be one hardcoded user | Capture persists across page reload |

---

## Explicitly Out of Scope

| Feature | Why deferred | When to revisit |
|---------|-------------|----------------|
| User auth (OAuth) | Time risk; single-user demo is sufficient | First post-hackathon week |
| Voice memo capture + transcription | Nice-to-have; image+text covers the demo input | Should-tier in v1 |
| Native iOS / Android apps | PWA covers demo and alpha needs | After 100 alpha users |
| Editable Proof cards (free-text edit) | Regenerate-only is enough | Early access |
| Feed UI with infinite scroll | A simple list view suffices for demo | v1 |
| Team / org mode | Different surface; distracts | After consumer validation |
| GitHub / Slack integrations | Out of hackathon scope | Later tier |
| Analytics on shared link views | Cuttable | v1 |
| Verification / attestation of proofs | Trust feature, premature | v2+ |

---

## Success Criteria

| Criterion | How to measure |
|-----------|---------------|
| A judge can hand the demo a chaotic input and see a Proof card within 15s | Live demo stopwatch |
| The generated Proof card looks like something Maya would actually share | Subjective judge reaction; "wow" or "I want this" |
| The share link works in a private browser window on the judge's phone | Demonstrated live |
| LLM structured output is schema-valid on ≥9 of 10 test inputs in dry run | Pre-demo regression run |

---

## Linked Requirements

Requirements document: [`docs/product/requirements.md`](../product/requirements.md)

Must-priority items in `requirements.md` that are NOT in this MVP (deferred Must items
require explicit justification):

| Requirement ID | Reason deferred |
|---------------|----------------|
| *(none — all Must items are in MVP scope)* | |

---

## Linked Early ADRs

| ADR | Decision captured |
|-----|------------------|
| [ADR-0001](../adr/ADR-0001-stack-and-composition.md) | Stack and initial composition (Node/TS + Supabase + Gemini; new-product-discovery composition for v0) |
| [ADR-0002](../adr/ADR-0002-five-day-track-scope-expansion.md) | v0.5 5-day-track scope: real OAuth, Supabase, cross-domain capture |
| [ADR-0003](../adr/ADR-0003-two-dimensional-categorization.md) | Domain × activity_type LLM contract; privacy gate from domain |
| [ADR-0004](../adr/ADR-0004-real-oauth-and-supabase.md) | Real OAuth (Google + Microsoft) + Supabase persistence + encrypted refresh tokens |

---

## Scope Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2026-05-16 | Initial MVP scope drafted from concept doc | Discovery distillation | @unclenate |
| 2026-05-16 | v0.5 section added: real OAuth (Google + Microsoft), Microsoft Graph + Drive + OneDrive + sent-mail harvesters, two-dimensional categorization with privacy gate, Supabase persistence. v0 section preserved as historical record. | 5-day-track scope expansion (ADR-0002, ADR-0003, ADR-0004) | @unclenate |
