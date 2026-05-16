# Milestones — Kinetic

Milestones mark the completion of a meaningful phase of work. Each milestone has explicit
exit criteria so "done" is unambiguous.

---

## Milestone Table

| Milestone | Target Date | Owner | Status | Exit Criteria |
| --------- | ----------- | ----- | ------ | ------------- |
| M0 — Discovery distilled | 2026-05-16 | @unclenate | Active | Problem, personas, requirements, MVP scope, release intent, ADR-0001 committed |
| M1 — LLM contract working | 2026-05-17 | @unclenate | Planned | Gemini call produces schema-valid `{admin_tasks[], proof_card{}}` on ≥9/10 fixed inputs |
| M2 — End-to-end capture path | 2026-05-18 | @unclenate | Planned | Capture screen → LLM → rendered Proof card on the demo device |
| M3 — Public share link | 2026-05-18 | @unclenate | Planned | Anonymous browser loads any generated Proof card via shared URL |
| M4 — Demo dry-run passed | 2026-05-19 | @unclenate | Planned | 5 consecutive dry runs without manual intervention |
| M5 — Hackathon submission | 2026-05-19 | @unclenate | Planned | Submission form complete; demo URL + repo link delivered |

**Status definitions:**
- **Planned** — Scheduled; work has not started
- **Active** — Work in progress; currently on track
- **Done** — All exit criteria met and verified
- **Slipped** — Target date passed; add a revised target and reason

---

## Milestone Detail

### M0 — Discovery distilled

Raw concept doc has been distilled into the governance artifacts the harness requires
to act as a working memory for the build. Future contributors (or AI agents) can read
the artifacts and understand scope, audience, and constraints without re-reading the
seed doc.

**Exit criteria:**

- [x] `docs/product/problem-statement.md` committed
- [x] `docs/product/personas.md` committed
- [x] `docs/product/requirements.md` committed
- [x] `docs/discovery/mvp-scope.md` committed
- [x] `docs/product/release-intent.md` committed
- [x] `docs/project/scope-plan.md` and `docs/project/milestones.md` committed
- [x] `ADR-0001` capturing stack + composition decision committed
- [ ] `harness.manifest.yaml` selected and validated

---

### M1 — LLM contract working

A fixed prompt + JSON schema reliably returns valid `{admin_tasks[], proof_card{}}` from
Gemini. This is the highest-risk dependency in the build; lock it down first.

**Exit criteria:**

- [ ] JSON schema for `admin_tasks[]` and `proof_card{}` finalized in repo
- [ ] Prompt template committed under `prompts/`
- [ ] Regression set of 10 fixed inputs runs locally; ≥9 validate against schema
- [ ] Claude fallback path verified (≥8/10 valid) so demo can survive Gemini outage

---

### M2 — End-to-end capture path

A capture submitted from the UI returns a rendered Proof card on screen. No share link
yet, no polish on edge cases, but the happy path is live.

**Exit criteria:**

- [ ] Capture screen accepts image + text
- [ ] Server endpoint calls LLM and persists result to Supabase
- [ ] Proof card renders all required fields without placeholders
- [ ] Admin task list renders below the card

---

### M3 — Public share link

Any generated Proof card has a public URL that loads in a fresh browser session.

**Exit criteria:**

- [ ] Share button generates and copies a public URL
- [ ] URL resolves to a read-only Proof card page
- [ ] No auth required to view; RLS configured to allow only `is_public = true` rows
- [ ] Tested in a private browser window on iOS Safari

---

### M4 — Demo dry-run passed

The full demo flow has been rehearsed end-to-end at least 5 times without manual
intervention. Pre-seeded fallback inputs exist in case a judge-handed input misbehaves.

**Exit criteria:**

- [ ] 5 consecutive successful dry runs logged
- [ ] Fallback input set seeded and tested
- [ ] Demo runbook committed under `docs/ops/demo-runbook.md`

---

### M5 — Hackathon submission

Submission delivered.

**Exit criteria:**

- [ ] Submission form completed
- [ ] Public demo URL live and reachable from outside the venue network
- [ ] Repo link delivered
- [ ] One-paragraph project summary submitted

---

## Slippage Log

| Milestone | Original Date | Revised Date | Root Cause |
| --------- | ------------- | ------------ | ---------- |
| *(none yet)* | | | |

---

## Reference

| Resource | Path |
| -------- | ---- |
| Scope plan | [`docs/project/scope-plan.md`](./scope-plan.md) |
| Change log | [`docs/project/change-log.md`](./change-log.md) |
| MVP scope | [`docs/discovery/mvp-scope.md`](../discovery/mvp-scope.md) |
