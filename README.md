# psu-hackathon — Kinetic (AutoPortfolio)

> An AI "black box" for your professional life: drop messy work artifacts in,
> get organized admin tasks **and** a shareable Proof-of-Skill card out.

**Stage:** Discovery → Build (PSU Hackathon v0)
**Owner:** @unclenate
**Hackathon submission target:** 2026-05-19

---

## Where the project lives

| | Path |
|---|---|
| Concept (raw) | [`docs/discovery/inbox/`](docs/discovery/inbox/) |
| Intake questionnaire | [`docs/discovery/intake-questionnaire.md`](docs/discovery/intake-questionnaire.md) |
| Problem statement | [`docs/product/problem-statement.md`](docs/product/problem-statement.md) |
| Personas | [`docs/product/personas.md`](docs/product/personas.md) |
| Requirements | [`docs/product/requirements.md`](docs/product/requirements.md) |
| MVP scope | [`docs/discovery/mvp-scope.md`](docs/discovery/mvp-scope.md) |
| Release intent (v0) | [`docs/product/release-intent.md`](docs/product/release-intent.md) |
| Scope plan | [`docs/project/scope-plan.md`](docs/project/scope-plan.md) |
| Milestones | [`docs/project/milestones.md`](docs/project/milestones.md) |
| Change log | [`docs/project/change-log.md`](docs/project/change-log.md) |
| ADR-0001 (stack + composition) | [`docs/adr/ADR-0001-stack-and-composition.md`](docs/adr/ADR-0001-stack-and-composition.md) |
| Harness manifest | [`harness.manifest.yaml`](harness.manifest.yaml) |
| Governance platform (submodule) | [`.harness/`](.harness/) |

---

## Stack (v0)

- **Frontend:** Next.js (App Router) + TypeScript, deployed as a PWA on Vercel
- **Backend:** Supabase (Postgres + Auth + Storage) + thin orchestration layer
- **LLM:** Gemini (structured outputs) primary, Claude fallback

Rationale: [ADR-0001](docs/adr/ADR-0001-stack-and-composition.md).

---

## Next milestone

**M1 — LLM contract working** (target 2026-05-17): a fixed prompt + JSON schema returns
schema-valid `{admin_tasks[], proof_card{}}` on ≥9 of 10 fixed regression inputs.

See [`docs/project/milestones.md`](docs/project/milestones.md) for the full milestone
ladder through hackathon submission.
