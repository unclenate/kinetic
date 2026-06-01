# Problem Statement — Kinetic

**Intake source:** [`docs/discovery/intake-questionnaire.md`](../discovery/intake-questionnaire.md) §2–3
**Owner:** @unclenate
**Last updated:** 2026-05-16 (v0.5 refresh for the 5-day track)
**Supersedes:** v0 version (committed in 22fbbd8); see ADR-0002.

---

## Problem

Working professionals continually generate evidence of their skills — debugging
breakthroughs, shipped features, customer wins, designs, decisions — but the act of
*documenting that evidence* is a high-friction writing task disconnected from the
moment of work.

As a result:
- Resumes, LinkedIn, and portfolios are stale or written defensively during job hunts.
- Performance reviews lean on memory and vibes.
- Status updates feel performative and aren't reusable.

The work happens. The proof gets lost.

---

## Value Proposition

If capturing daily proof of work becomes as low-friction as connecting a calendar
or pasting a GitHub username, then:

- A continuously up-to-date "career truth layer" exists by default, not as a separate
  writing project.
- Promotion conversations, client updates, and job searches start from real evidence
  rather than retroactive narrative.
- Each shared proof becomes a viral artifact that introduces the product to new users
  in a high-trust context (someone they know sent it).

**Important wedge clarification (v0.5):** Kinetic ingests signals from across
the user's life — Google Calendar, Microsoft 365, Google Drive, OneDrive,
GitHub, mail — *not just* their professional artifacts. Cross-domain capture
makes the daily-use story credible (one app sees all of your day).

But the **public-facing product, the share surface, and the marketing
narrative all stay professional**. Non-business captures (`personal`,
`family`, `parenting`, `financial`) are private utility for the user and
seed eventual feature surfaces — they do not appear on the shared Proof
Feed. The domain classification is the structural enforcement of this
wedge; see [ADR-0003](../adr/ADR-0003-two-dimensional-categorization.md).

---

## Users and Personas

| Persona | Role / context | Primary need |
|---------|---------------|-------------|
| Primary | Mid-career software engineer / technical knowledge worker | Frictionless way to document daily work that produces shareable career evidence |
| Secondary | Manager, client, or recruiter receiving a shared "Proof Feed" link | Quickly verify what someone actually built / achieved |
| Out of scope | Active job-seekers wanting a traditional resume builder | Different format and expectations |
| Out of scope | Non-technical workers without machine-readable evidence | Capture pipeline does not yet support their primary artifacts |
| Out of scope | Enterprise HR / performance-review buyers | Different buyer, different compliance surface |

Full persona detail: [`docs/product/personas.md`](./personas.md).

---

## Why Now

- **Multimodal LLMs with structured outputs** (Gemini, Claude) now reliably convert
  messy text + image + audio into typed JSON — the core enabling primitive of this
  product. Two years ago this required a brittle pipeline of separate models.
- **Mobile capture is universal** — every target user has voice, camera, and screenshot
  on the device they already work from.
- **Short-form vertical feed UX is the dominant attention pattern**; the "Proof Feed"
  borrows that format for professional content in a way LinkedIn cannot.

---

## Opportunity Hypothesis

If we build **a mobile-first AI capture app that turns chaotic daily work artifacts
into organized admin tasks plus polished Proof-of-Skill cards** for **mid-career
technical knowledge workers**, then **daily capture rate per active user will reach
≥1 capture/weekday within 30 days of signup, and ≥10% of generated Proof cards will
be shared externally**.

If neither signal materializes after a 50-user friendly alpha, the documentation-fatigue
hypothesis is wrong and the loop needs to be rethought.

---

## Known Constraints

| Constraint | Source |
|------------|--------|
| 5-day timebox for v0.5 (submission 2026-05-21) | 5-day hackathon track |
| Live demo must survive flaky conference Wi-Fi | Demo risk management |
| No retention of raw audio after transcription; no PII beyond user email | Privacy hygiene |
| Encrypted-at-rest OAuth refresh tokens; no plaintext token logging | Security baseline for real OAuth (ADR-0004) |
| Non-business captures are never public by default; per-card opt-in required | Privacy contract from ADR-0003 |
| Solo build (1 engineer) | Team size |
| LLM vendor dependency (Gemini primary, Claude fallback) | External API |
| Supabase free-tier limits (500MB DB, 1GB storage) | Vendor tier |
| Google + Microsoft OAuth consent screens "unverified" until reviewed | Demo runs on operator's own account; production exposure waits |
