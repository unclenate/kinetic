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

### Out of scope for v0.5 (5-day track)

- Multi-tenant Supabase Auth signup flow — v0.5 ships with a single seeded operator user.
- Voice memo capture and transcription — Should-tier; not on the 5-day path.
- Native iOS / Android packaging — PWA covers all demo needs.
- Editable Proof cards (free-text edit after generation).
- Slack / Teams chat ingestion (workspace-admin required).
- Meeting transcript ingestion (Zoom / Meet / Teams recordings).
- Production OAuth verification (removes the "unverified app" warning) — operator's own account is fine.
- First-class UIs for family / parenting / financial domains beyond the filter tab.

### Out of scope for the product entirely (or deferred indefinitely)

- Performance-review / HR enterprise features — different product.
- Team / organization mode at v0.5 — distracts from consumer flywheel.

---

## Phases

| Phase | Goal | Owner | Exit Criteria | Target Date |
| ----- | ---- | ----- | ------------- | ----------- |
| P0 — Discovery (v0) | Capture concept, distill artifacts, pick composition | @unclenate | Problem, personas, requirements, MVP scope, release intent, ADR-0001 committed | 2026-05-16 ✅ |
| P1 — Build v0 (1-day track) | Ship v0 demo | @unclenate | All v0 Must-tier FRs work end-to-end on the demo device | 2026-05-16 ✅ |
| P2 — v0 submission | 1-day track submission delivered | @unclenate | `SUBMISSION.md` delivered | 2026-05-16 ✅ |
| **P3 — Discovery refresh (v0.5)** | New ADRs, refreshed product docs for 5-day track | @unclenate | ADR-0002/0003/0004 + refreshed problem/personas/requirements/MVP scope committed | 2026-05-16 ✅ (M6) |
| P4 — Foundations (v0.5) | Real OAuth (Google + Microsoft) + Supabase persistence | @unclenate | M7 exit criteria met | 2026-05-17 |
| P5 — Schema + harvesters (v0.5) | Domain field + 5 new harvesters | @unclenate | M8 + M9 exit criteria met | 2026-05-19 |
| P6 — UX + polish (v0.5) | Multi-domain feed, privacy gate, dry runs | @unclenate | M10 + M11 exit criteria met | 2026-05-20 |
| P7 — v0.5 submission | 5-day track submission delivered | @unclenate | M12 exit criteria met | 2026-05-21 |
| P8 — Alpha hardening (post-hackathon) | Real Supabase Auth multi-tenant; native packaging; OAuth verification | @unclenate | 5–25 friendly alpha users active | +30 days post-2026-05-21 |

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
