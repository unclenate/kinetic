# MVP Scope — Kinetic Hackathon Build

**Project:** [`docs/product/problem-statement.md`](../product/problem-statement.md)
**Growth stage:** prototype (PSU hackathon)
**Intake source:** [`docs/discovery/intake-questionnaire.md`](./intake-questionnaire.md)
**Owner:** @unclenate
**Last updated:** 2026-05-16

---

## MVP Definition

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
| [ADR-0001](../adr/ADR-0001-stack-and-composition.md) | Stack and initial composition (Node/TS + Supabase + Gemini; new-product-discovery composition for week 1) |

---

## Scope Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2026-05-16 | Initial MVP scope drafted from concept doc | Discovery distillation | @unclenate |
