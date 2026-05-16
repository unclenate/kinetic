# Problem Statement — Kinetic

**Intake source:** [`docs/discovery/intake-questionnaire.md`](../discovery/intake-questionnaire.md) §2–3
**Owner:** @unclenate
**Last updated:** 2026-05-16

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

If capturing daily proof of work becomes as low-friction as taking a screenshot or
leaving a 10-second voice note, then:

- A continuously up-to-date "career truth layer" exists by default, not as a separate
  writing project.
- Promotion conversations, client updates, and job searches start from real evidence
  rather than retroactive narrative.
- Each shared proof becomes a viral artifact that introduces the product to new users
  in a high-trust context (someone they know sent it).

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
| Hackathon timebox (~72h) for v0 | PSU hackathon schedule |
| Live demo must survive flaky conference Wi-Fi | Demo risk management |
| No retention of raw audio after transcription; no PII beyond user email | Privacy hygiene |
| Solo build for hackathon (1 engineer) | Team size |
| LLM vendor dependency (Gemini primary, Claude fallback) | External API |
