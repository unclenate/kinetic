# Project Change Log

This log records material changes to project scope, plan, timeline, or technical
direction. It is not a git commit log — it captures *decisions and their rationale*.

---

## Log

| Date | Type | Change | Reason | Owner | ADR |
| ---- | ---- | ------ | ------ | ----- | --- |
| 2026-05-16 | Scope | Initial scope captured: hackathon v0 = single-user demo, image+text capture, public share link | Distillation of `docs/discovery/inbox/` concept doc | @unclenate | — |
| 2026-05-16 | Technical | Stack selected: Node/TS + Supabase + Gemini (Claude fallback); composition starts as `new-product-discovery`, will migrate after hackathon | Hackathon timebox; need rapid iteration without tripping required-artifact validations | @unclenate | ADR-0001 |
| 2026-05-16 | Scope | Voice memo capture moved from Must to Should tier for v0 | Demo can land without it; image+text covers the magic moment | @unclenate | — |
| 2026-05-16 | Scope | Auth deferred for v0; single hardcoded demo user | Demo-time risk; auth flow is the wrong place to spend hackathon hours | @unclenate | — |

---

## What Belongs Here

Add an entry when:
- A requirement is added, removed, or significantly changed
- A milestone is moved or dropped
- An architectural decision changes direction
- A feature is explicitly deferred to a future release
- A third-party dependency changes (vendor, API, integration)

Do NOT add entries for routine code changes, minor doc fixes, or bug fixes that
don't change scope or direction.

---

## Reference

| Resource | Path |
| -------- | ---- |
| Requirements | [`docs/product/requirements.md`](../product/requirements.md) |
| MVP scope | [`docs/discovery/mvp-scope.md`](../discovery/mvp-scope.md) |
| ADR directory | [`docs/adr/`](../adr/) |
| Milestones | [`docs/project/milestones.md`](./milestones.md) |
