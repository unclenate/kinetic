# Requirements — Kinetic

**Project:** [`docs/product/problem-statement.md`](./problem-statement.md)
**Growth stage:** v0 prototype shipped (1-day track) → v0.5 expanded MVP (5-day track, target 2026-05-21)
**Intake source:** [`docs/discovery/intake-questionnaire.md`](../discovery/intake-questionnaire.md)
**MVP scope:** [`docs/discovery/mvp-scope.md`](../discovery/mvp-scope.md)
**Owner:** @unclenate
**Last updated:** 2026-05-16 (v0.5 refresh)

Priority tiers (v0.5 baseline; v0 history preserved in the change log):

- **Must** — required for v0.5 submission to deliver value; in MVP scope
- **Should** — high value but can ship without; target v1 / post-hackathon
- **Later** — acknowledged and deferred; explicitly out of scope for v0.5

---

## User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| US-001 | mid-career engineer (Maya) | drop a screenshot + a short note about what I just did | I don't have to write about my own work | Must |
| US-002 | mid-career engineer | get a clean admin task and a polished Proof card from one capture | I get both organization and shareable evidence in one motion | Must |
| US-003 | mid-career engineer | generate a public link to a Proof card | I can send it to a manager, recruiter, or client | Must |
| US-004 | recipient (Devon) | open a shared link on any browser and see a credible Proof card | I can form an opinion in <90s | Must |
| US-005 | mid-career engineer | scroll a feed of my own captured Proof cards | I see my progression over time | **Must** *(v0.5; was Should)* |
| US-006 | mid-career engineer | dictate a voice memo on capture | I don't have to type on mobile | Should |
| US-007 | mid-career engineer | regenerate a Proof card if the first pass is off-tone | I'm not stuck with a bad first draft | Should |
| US-008 | mid-career engineer | connect Google and Microsoft 365 once and not have to reconnect during the week | sources keep producing captures without me babysitting tokens | **Must** *(v0.5)* |
| US-009 | mid-career engineer | connect GitHub (public or private via PAT) so my commits and PRs become capture seeds | I capture work I forgot to log | **Must** *(v0.5; was Later)* |
| US-010 | mid-career engineer | see my Drive / OneDrive file activity become Proof cards | design docs and decks I made get captured without typing | **Must** *(v0.5)* |
| US-011 | mid-career engineer | have every capture tagged with both a `domain` (business / personal / family / financial / parenting) and an `activity_type` | Kinetic respects the wedge — my parenting block never lands on a recruiter's screen | **Must** *(v0.5)* |
| US-012 | mid-career engineer | only see business cards on my public Proof Feed by default, with an explicit per-card opt-in for other domains | I trust the privacy gate enough to leave Kinetic connected to everything | **Must** *(v0.5)* |
| US-013 | mid-career engineer | filter my private feed by domain | I can check my parenting log or my financial log separately | Should |
| US-014 | mid-career engineer | draft a Slack/email status update from my admin tasks | I get something to send my manager | Later |
| US-015 | mid-career engineer | have meeting recordings / transcripts (Zoom, Meet, Teams) ingested as captures | conversations I had become evidence too | Later |

---

## Functional Requirements

| ID | Requirement | Acceptance Criteria | Priority | Notes |
|----|-------------|---------------------|----------|-------|
| FR-001 | Capture screen accepts text + image upload | User can attach one image and type/paste text, then submit | Must | US-001 |
| FR-002 | LLM processing produces structured `{admin_tasks[], proof_card{}}` JSON | Output validates against a JSON schema 95%+ of the time on a fixed test set of 10 inputs | Must | Gemini structured output; Claude fallback |
| FR-003 | Proof card renders with title, summary, tech tags, time-to-resolution, visual style | Each field is populated for any valid LLM output; placeholders never visible to user | Must | Demo must look polished |
| FR-004 | Admin task list renders below the Proof card | Tasks shown with status pill (default "Done" if completed work was described) | Must | US-002 |
| FR-005 | "Share" action generates a public URL for a Proof card | Loading URL in private browser shows the card; no auth required | Must | US-003, US-004 |
| FR-006 | Feed view lists user's captured Proof cards in reverse-chronological order | List loads in <2s for ≤200 cards | **Must** *(v0.5)* | US-005 |
| FR-007 | Voice memo upload + transcription on capture | Audio file is transcribed to text and included in LLM input; raw audio not retained after transcription | Should | US-006 |
| FR-008 | "Regenerate" button on a Proof card calls the LLM again with the same source input | New output replaces previous card; previous version is kept in history | Should | US-007 |
| FR-009 | Real OAuth: connect Google account end-to-end (consent screen → tokens stored encrypted → harvester uses stored token, refreshes automatically) | Operator can disconnect and reconnect via UI; tokens persisted across server restarts | **Must** *(v0.5)* | US-008; ADR-0004 |
| FR-010 | Real OAuth: connect Microsoft 365 account end-to-end (Azure App Reg → consent → encrypted token storage → auto-refresh) | Same acceptance as FR-009, for Microsoft Graph | **Must** *(v0.5)* | US-008; ADR-0004 |
| FR-011 | GitHub harvester accepts an optional fine-grained PAT for private-repo events | When PAT supplied, harvest returns private-repo events; when absent, behaves like v0 (public only) | **Must** *(v0.5)* | US-009 |
| FR-012 | Microsoft Graph Calendar harvester pulls events from primary Outlook calendar | Same shape as `gcal`; default 48h-back / 24h-ahead window | **Must** *(v0.5)* | US-008 |
| FR-013 | Google Drive Activity harvester pulls recent file activity (create/edit/comment) | Returns events with file name, action verb, timestamp; metadata-only, no file content read | **Must** *(v0.5)* | US-010 |
| FR-014 | OneDrive / SharePoint harvester via Graph pulls recent file activity | Same shape as gdrive harvester | **Must** *(v0.5)* | US-010 |
| FR-015 | Gmail "sent items" harvester pulls outbound email metadata (subject, to, when, snippet) | Returns events; never reads inbound mail; never includes full body | Should *(v0.5; full body Later)* | — |
| FR-016 | Outlook sent-items harvester via Graph | Same shape as gmail-sent harvester | Should *(v0.5)* | — |
| FR-017 | LLM contract extended with `domain` enum (`business`/`personal`/`family`/`financial`/`parenting`); `category` renamed to `activity_type` | Schema regression on 20+ fixtures (≥2/domain) returns ≥90% schema-valid for the chosen provider | **Must** *(v0.5)* | US-011; ADR-0003 |
| FR-018 | Public share URL is only generated when `domain == "business"`; non-business cards require explicit per-card confirmation step before public link generation | UI shows confirmation modal naming the domain for non-business shares; modal cannot be skipped | **Must** *(v0.5)* | US-012; ADR-0003 |
| FR-019 | Feed view supports a domain filter (`All` / `Business` / `Personal` / `Family` / `Financial` / `Parenting`) | Tab click filters the rendered cards in <100ms | Should *(v0.5)* | US-013 |
| FR-020 | Supabase persistence for users, oauth_tokens, captures, proof_cards | Schema applied; server restart preserves all cards; RLS policies enforce per-user read | **Must** *(v0.5)* | ADR-0004 |
| FR-021 | OAuth refresh tokens encrypted at rest (AES-256-GCM) | DB rows show ciphertext; encryption key sourced from `KINETIC_TOKEN_ENCRYPTION_KEY` env | **Must** *(v0.5)* | ADR-0004 |
| FR-022 | Generate a Slack-formatted status update from a day's admin tasks | Copy-to-clipboard works on web and mobile | Later | US-014 |
| FR-023 | Ingest Zoom / Meet / Teams meeting transcripts | Provider-specific; deferred — not in v0.5 | Later | US-015 |

---

## Out of Scope for This Version

| Feature | Reason deferred | When to revisit |
|---------|----------------|----------------|
| Native iOS / Android apps | PWA is sufficient for demo and alpha | After 100 active alpha users |
| Editing flow after AI generation (free-text edit of Proof card) | Adds UI scope; regenerate-only is enough | Early access |
| Team / organization mode | Different surface area; distracts from consumer loop | After consumer flywheel validated |
| Analytics on shared link views | Important but cuttable for the hackathon track | v1 |
| Multi-language LLM output | English-only is fine for the hackathon audience | v1+ |
| Verification / cryptographic attestation of proofs | Trust feature, premature without distribution | v2+ |
| Multi-tenant user accounts (real Supabase Auth signup flow) | v0.5 uses a single seeded operator user | Post-hackathon |
| Slack / Teams chat ingestion | Both require workspace-admin involvement; not solo-installable | v1+ |
| Meeting transcript ingestion (Zoom / Meet / Teams recordings) | Provider variability; needs careful PII story | v1+ |
| Production OAuth verification (lifts the "unverified app" warning) | Google / Microsoft review process; not required while operating on the operator's own account | Pre-public-launch |
| Family / parenting / financial feature surfaces (own UIs, separate from the Proof Feed) | Domain classification seeds these; first-class UIs are growth features | v1+ |

---

## Quality Expectations

| Area | Expectation | Notes |
|------|-------------|-------|
| Performance | Manual capture → rendered Proof card in ≤15s on conference Wi-Fi; harvest of N items → N processed cards in ≤N×8s | Demo-critical |
| Reliability | Server restart preserves all stored cards and OAuth tokens; refresh-token failure surfaces a "reconnect" prompt, not a crash | v0.5 needs persistence to survive a 5-day window |
| Security | No credentials in client; LLM + provider API keys server-side only; OAuth refresh tokens AES-256-GCM encrypted at rest; Supabase RLS enforces per-user reads; public read of a Proof card allowed only when `is_public=true` | ADR-0004 baseline |
| Privacy | Raw audio not retained after transcription; non-business cards never public by default; per-card confirmation modal before non-business shares; harvested mail metadata only (no inbound mail reads) | ADR-0003 + ADR-0004 |
| Accessibility | Best-effort; basic semantic HTML + keyboard nav | Not WCAG-AA at hackathon |
| Browser support | Modern evergreen (Chrome, Safari, Edge) on mobile + desktop | iOS Safari is the primary demo target |

---

## Success Metrics

### v0 (1-day track, 2026-05-16) — shipped
- Live demo on judge-provided input ✅
- 10/10 schema-valid on the mock + Claude regression sets ✅
- ≤15s p95 capture→card latency ✅

### v0.5 (5-day track, target 2026-05-21)

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| 4 live signal sources end-to-end (GitHub, Google Cal, Microsoft Cal, Drive *or* OneDrive) | All four produce cards on the demo device | Live demo |
| OAuth flow completes for Google and Microsoft from the UI | <60s from "Connect Google" click to first harvest | Manual stopwatch |
| LLM output validates against the v0.5 schema (with `domain` field) | ≥90% on a 20-input regression set, ≥2 fixtures per domain | Pre-demo dry run |
| Domain classification correctness | ≥95% on the same regression set | Manual review against expected labels |
| Persistence: server restart preserves all cards and tokens | Stop / start server during demo dry-run; counts match | Verified pre-demo |
| Privacy gate: non-business cards never become public without explicit confirmation | Pre-demo audit of all generated cards' `is_public` values | Manual review |

Alpha (post-hackathon, ~30 days):

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| Captures per active user per weekday | ≥1 | Supabase event count / DAU |
| Share rate (cards generating a public link) | ≥10% of cards | URL-generation events / cards |
| Regenerate rate (signal of bad first output) | ≤20% of cards | Regenerate events / cards |

---

## Requirements Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2026-05-16 | v0.5 refresh: promoted US-005 (feed view), US-008 (real OAuth), US-009 (GitHub harvest) to Must; added US-010 to US-013 (Drive/OneDrive harvest, domain tagging, privacy gate, domain filter); added FR-009 to FR-021 (real OAuth, Microsoft/Drive/OneDrive harvesters, domain field, public-share privacy gate, Supabase persistence, token encryption); demoted analytics + native apps + edit-flow + team mode to explicit Later. | 5-day-track scope expansion per ADR-0002, with categorization design from ADR-0003 and persistence/OAuth design from ADR-0004. | @unclenate |
| 2026-05-16 | Initial requirements drafted from concept doc | Discovery distillation | @unclenate |
