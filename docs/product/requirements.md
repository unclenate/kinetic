# Requirements — Kinetic

**Project:** [`docs/product/problem-statement.md`](./problem-statement.md)
**Growth stage:** prototype (hackathon) → early-access
**Intake source:** [`docs/discovery/intake-questionnaire.md`](../discovery/intake-questionnaire.md)
**MVP scope:** [`docs/discovery/mvp-scope.md`](../discovery/mvp-scope.md)
**Owner:** @unclenate
**Last updated:** 2026-05-16

Priority tiers:
- **Must** — required for the hackathon demo to deliver value; in MVP scope
- **Should** — high value but can ship without; target post-hackathon v1
- **Later** — acknowledged and deferred; explicitly out of scope now

---

## User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|------------|----------|
| US-001 | mid-career engineer (Maya) | drop a screenshot + a short note about what I just did | I don't have to write about my own work | Must |
| US-002 | mid-career engineer | get a clean admin task and a polished Proof card from one capture | I get both organization and shareable evidence in one motion | Must |
| US-003 | mid-career engineer | generate a public link to a Proof card | I can send it to a manager, recruiter, or client | Must |
| US-004 | recipient (Devon) | open a shared link on any browser and see a credible Proof card | I can form an opinion in <90s | Must |
| US-005 | mid-career engineer | scroll a feed of my own captured Proof cards | I see my progression over time | Should |
| US-006 | mid-career engineer | dictate a voice memo on capture | I don't have to type on mobile | Should |
| US-007 | mid-career engineer | regenerate a Proof card if the first pass is off-tone | I'm not stuck with a bad first draft | Should |
| US-008 | mid-career engineer | sign in with Google / Apple | my captures persist across devices | Should |
| US-009 | mid-career engineer | connect GitHub so commits become capture seeds | I capture work I forgot to log | Later |
| US-010 | mid-career engineer | draft a Slack/email status update from my admin tasks | I get something to send my manager | Later |

---

## Functional Requirements

| ID | Requirement | Acceptance Criteria | Priority | Notes |
|----|-------------|---------------------|----------|-------|
| FR-001 | Capture screen accepts text + image upload | User can attach one image and type/paste text, then submit | Must | US-001 |
| FR-002 | LLM processing produces structured `{admin_tasks[], proof_card{}}` JSON | Output validates against a JSON schema 95%+ of the time on a fixed test set of 10 inputs | Must | Gemini structured output; Claude fallback |
| FR-003 | Proof card renders with title, summary, tech tags, time-to-resolution, visual style | Each field is populated for any valid LLM output; placeholders never visible to user | Must | Demo must look polished |
| FR-004 | Admin task list renders below the Proof card | Tasks shown with status pill (default "Done" if completed work was described) | Must | US-002 |
| FR-005 | "Share" action generates a public URL for a Proof card | Loading URL in private browser shows the card; no auth required | Must | US-003, US-004 |
| FR-006 | Feed view lists user's captured Proof cards in reverse-chronological order | List loads in <2s for ≤50 cards | Should | US-005 |
| FR-007 | Voice memo upload + transcription on capture | Audio file is transcribed to text and included in LLM input; raw audio not retained after transcription | Should | US-006; privacy constraint |
| FR-008 | "Regenerate" button on a Proof card calls the LLM again with the same source input | New output replaces previous card; previous version is kept in history | Should | US-007 |
| FR-009 | OAuth sign-in (Google or Apple) | Supabase Auth flow completes; user row created | Should | US-008 |
| FR-010 | GitHub integration: commits within last 24h appear as capture suggestions | Suggested captures appear in the inbox UI | Later | US-009 |
| FR-011 | Generate a Slack-formatted status update from a day's admin tasks | Copy-to-clipboard works on web and mobile | Later | US-010 |

---

## Out of Scope for This Version

| Feature | Reason deferred | When to revisit |
|---------|----------------|----------------|
| Native iOS / Android apps | PWA is sufficient for demo and alpha | After 100 active alpha users |
| Editing flow after AI generation (free-text edit of Proof card) | Adds UI scope; regenerate-only is enough for v0 | Early access |
| Team / organization mode | Different surface area; distracts from consumer loop | After consumer flywheel validated |
| Analytics on shared link views | Important but cuttable for hackathon | v1 |
| Multi-language LLM output | English-only is fine for hackathon audience | v1+ |
| Verification / cryptographic attestation of proofs | Trust feature, premature without distribution | v2+ |

---

## Quality Expectations

| Area | Expectation | Notes |
|------|-------------|-------|
| Performance | Capture → rendered Proof card in ≤15s on conference Wi-Fi | Demo-critical |
| Reliability | Best-effort; no SLA at prototype stage | OK to manually restart server |
| Security | No credentials in client; LLM API keys server-side only; Supabase RLS on user data | Even at prototype, do not regress here |
| Privacy | Raw audio not retained after transcription; shared cards expose only fields the user submitted | Stated in `personas.md` operator concerns |
| Accessibility | Best-effort; basic semantic HTML + keyboard nav | Not WCAG-AA at hackathon |
| Browser support | Modern evergreen (Chrome, Safari, Edge) on mobile + desktop | iOS Safari is the primary demo target |

---

## Success Metrics

Hackathon-scoped (judging window):

| Metric | Target | Measurement method |
|--------|--------|-------------------|
| Live demo: chaotic input → shareable card | Works on first try with a judge-provided input | Observed in demo |
| LLM output validates against schema | 95%+ on the 10-input regression set | Pre-demo dry run |
| End-to-end latency on capture → card | ≤15s p95 on demo network | Manual stopwatch over 5 runs |

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
| 2026-05-16 | Initial requirements drafted from concept doc | Discovery distillation | @unclenate |
