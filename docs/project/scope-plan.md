# Scope Plan — Kinetic

The scope plan defines what this project is responsible for delivering, the phases of
delivery, the team, and the constraints. It is the reference for deciding whether a new
request is in-scope or a change request.

---

## Project Summary

| Field | Value |
| ----- | ----- |
| Project | Kinetic (AutoPortfolio) |
| Owner | @unclenate |
| Sponsor | Self (PSU Hackathon entry) |
| Start date | 2026-05-16 |
| Target completion (v0) | 2026-05-19 *(hackathon submission)* |
| Current phase | Discovery → Build |

---

## In Scope

- A single-user, web-based capture flow (image + text) that produces a structured
  `{admin_tasks[], proof_card{}}` payload via LLM (Gemini primary, Claude fallback).
- A polished Proof-card render that looks shareable.
- A public-link share surface (no auth required to view).
- A pre-seeded set of demo inputs for fallback during live demo.
- The minimal Supabase schema, storage bucket, and Edge Function needed to back the
  above.

---

## Out of Scope

- User authentication / multi-tenant data — deferred to post-hackathon week 1.
- Voice memo capture and transcription — deferred to v1 Should tier.
- Native iOS / Android packaging — deferred to post-100-alpha-users milestone.
- Team / organization mode — owned by a later consumer-validated phase.
- GitHub / Slack integrations — Later tier; not in any phase prior to v1.
- Performance-review / HR enterprise features — different product entirely.

---

## Phases

| Phase | Goal | Owner | Exit Criteria | Target Date |
| ----- | ---- | ----- | ------------- | ----------- |
| P0 — Discovery | Capture concept, distill artifacts, pick composition | @unclenate | Problem, personas, requirements, MVP scope, release intent, ADR-0001 committed | 2026-05-16 |
| P1 — Build (hackathon) | Ship v0 demo | @unclenate | All Must-tier FRs work end-to-end on the demo device | 2026-05-19 |
| P2 — Hackathon judging | Demo + feedback capture | @unclenate | Judges have seen the demo; feedback logged in `docs/knowledge/shared-observations.md` | 2026-05-20 |
| P3 — Alpha hardening | Migrate to full composition, add auth, feed view, regenerate | @unclenate | 5–25 friendly alpha users active | +30 days post-hackathon |

---

## Team and Responsibilities

| Role | Name / Team | Responsibilities |
| ---- | ----------- | ---------------- |
| Project owner | @unclenate | Final scope decisions; stakeholder communication; demo |
| Tech lead | @unclenate | Architecture; LLM prompt + schema; UI |
| Delivery lead | @unclenate | Milestone tracking; demo dry-run discipline |

Solo build through hackathon. Roles separated here so the discipline survives a team
addition later.

---

## Constraints

- **Timeline** — Hardline: PSU hackathon submission window (closes 2026-05-19).
- **Budget** — LLM API spend during hackathon: ≤$25. Supabase free tier only.
- **Compliance** — No PII beyond user email; no raw audio retained after transcription
  (if voice ships later).
- **Integration** — Gemini API + Supabase are first-class dependencies; both must be
  operational on demo day.
- **Team** — Solo through P2.

---

## Assumptions

- Gemini structured outputs will produce schema-valid JSON ≥95% of the time for our
  fixed prompt + schema. If not, fall back to Claude.
- Conference Wi-Fi is unreliable; demo must tolerate one retry and have pre-seeded
  fallback inputs.
- A single image + text input is enough material for the LLM to produce a credible
  Proof card. If demo dry runs disprove this, raise minimum input requirement.

---

## Reference

| Resource | Path |
| -------- | ---- |
| Requirements | [`docs/product/requirements.md`](../product/requirements.md) |
| MVP scope | [`docs/discovery/mvp-scope.md`](../discovery/mvp-scope.md) |
| Milestones | [`docs/project/milestones.md`](./milestones.md) |
| Change log | [`docs/project/change-log.md`](./change-log.md) |
| ADR-0001 | [`docs/adr/ADR-0001-stack-and-composition.md`](../adr/ADR-0001-stack-and-composition.md) |
