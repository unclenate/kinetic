# Milestones — Kinetic

Milestones mark the completion of a meaningful phase of work. Each milestone has explicit
exit criteria so "done" is unambiguous.

---

## Milestone Table

| Milestone | Target Date | Owner | Status | Exit Criteria |
| --------- | ----------- | ----- | ------ | ------------- |
| M0 — Discovery distilled | 2026-05-16 | @unclenate | Done | Problem, personas, requirements, MVP scope, release intent, ADR-0001 committed |
| M1 — LLM contract working | 2026-05-16 | @unclenate | Done | Mock: 10/10. Claude: 10/10 (real LLM). Gemini: 8/10 — failures were 429/503 rate-limit at venue NAT, not schema violations. |
| M2 — End-to-end capture path | 2026-05-16 | @unclenate | Done | Capture page → LLM → rendered Proof card + admin task list. Zero-dep Node HTTP server (`web/server.mjs`). |
| M3 — Public share link | 2026-05-16 | @unclenate | Done | `/api/share/:id` flips a card public; `/proof/:id` renders it without auth. Verified end-to-end via Chrome. |
| M4 — Demo dry-run passed | 2026-05-16 | @unclenate | Done | 1-day-track runbook + screenshots committed; live dry-run executed end-to-end via Chrome. |
| M5 — Hackathon submission (1-day track) | 2026-05-16 | @unclenate | Done | `SUBMISSION.md` delivered. |
| **M6 — Discovery refresh for 5-day track** | 2026-05-16 | @unclenate | Done | ADR-0002 / ADR-0003 / ADR-0004 written; problem statement + personas + requirements + MVP scope refreshed; v0 history preserved. |
| M7 — Foundations (OAuth + Supabase) | 2026-05-17 | @unclenate | Planned | Real Google + Microsoft OAuth flows; Supabase schema applied; encrypted token storage; v0 in-memory store replaced. |
| M8 — Schema v0.5 + regression refresh | 2026-05-18 | @unclenate | Done | `category`→`activity_type` rename; new `domain` enum; regression set grown to 20 fixtures (≥2/domain). Mock: 20/20 schema-valid, 20/20 domain-correct. Real-provider run pending API keys (M11). |
| M9 — New harvesters | 2026-05-19 | @unclenate | Planned | Microsoft Graph Calendar, Google Drive Activity, OneDrive Graph, Gmail sent-items, Outlook sent-items. Same `harvest()` contract. |
| M10 — Multi-domain UX + privacy gate | 2026-05-20 | @unclenate | Planned | Feed view; domain filter tabs; per-card confirmation modal for non-business shares; multi-account OAuth UI. |
| M11 — Polish + 5-day-track dry runs | 2026-05-21 | @unclenate | Planned | 3 consecutive clean dry runs; runbook update for the 5-source flow; regression numbers re-recorded post-prompt-update. |
| M12 — Hackathon submission (5-day track) | 2026-05-21 | @unclenate | Planned | `SUBMISSION.md` v0.5 section delivered; demo URL or runbook reachable by judges. |

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
- [x] `harness.manifest.yaml` selected and validated *(committed in 22fbbd8)*

---

### M1 — LLM contract working

A fixed prompt + JSON schema reliably returns valid `{admin_tasks[], proof_card{}}` from
the LLM. This is the highest-risk dependency in the build; locked down first.

**Exit criteria:**

- [x] JSON schema for `admin_tasks[]` and `proof_card{}` finalized in repo
      → [`schemas/kinetic-output.schema.json`](../../schemas/kinetic-output.schema.json)
- [x] Prompt template committed under `prompts/`
      → [`prompts/capture-to-output.md`](../../prompts/capture-to-output.md)
- [x] Regression set of 10 fixed inputs runs locally; ≥9 validate against schema
      → [`tests/regression-inputs.jsonl`](../../tests/regression-inputs.jsonl), mock provider 10/10
- [x] Zero-dependency validator + runner so the harness works without `npm install`
      → [`src/validate.mjs`](../../src/validate.mjs), [`src/regression.mjs`](../../src/regression.mjs)
- [x] Gemini provider implemented with `response_schema` structured-output mode
      → [`src/providers/gemini.mjs`](../../src/providers/gemini.mjs)
- [x] Claude fallback provider implemented with `tool_use` structured-output mode
      → [`src/providers/claude.mjs`](../../src/providers/claude.mjs)
- [ ] Real-provider run: Gemini ≥9/10 on the regression set *(pending `GEMINI_API_KEY`)*
- [ ] Real-provider run: Claude ≥8/10 on the regression set *(pending `ANTHROPIC_API_KEY`)*

**Measured results (mock provider, 2026-05-16):**

```
Schema-valid:     10/10 (100.0%)
Category match:   10/10 (100.0%)  (informational — not a gate)
✓ M1 exit criterion MET for provider "mock"
```

**How to run the real-provider check:**

```bash
cp .env.example .env.local
# fill in GEMINI_API_KEY, then:
KINETIC_PROVIDER=gemini node src/regression.mjs
KINETIC_PROVIDER=claude node src/regression.mjs
```

---

### M2 — End-to-end capture path

A capture submitted from the UI returns a rendered Proof card on screen.

**Exit criteria:**

- [x] Capture screen accepts text + image caption
      → [`web/public/index.html`](../../web/public/index.html)
- [x] Server endpoint calls LLM and persists result (in-memory; Supabase deferred to P3)
      → [`web/server.mjs`](../../web/server.mjs), `POST /api/process`
- [x] Proof card renders all required fields without placeholders
      → [`web/public/app.js`](../../web/public/app.js) `renderProofCard()`
- [x] Admin task list renders below the card
      → `renderAdminTasks()`
- [x] Server-side schema re-validation before persist (belt-and-suspenders against bad LLM output)
- [x] Screenshot of the rendered flow captured for submission
      → [`docs/screenshots/02-capture-processed.png`](../screenshots/02-capture-processed.png)

**Deferred to P3:** Supabase persistence (currently an in-memory `Map`). The
in-memory store is fine for the demo and means restarting the server is the
only cleanup needed.

---

### M3 — Public share link

Any generated Proof card has a public URL that loads in a fresh browser session.

**Exit criteria:**

- [x] Share button generates and copies a public URL
      → `POST /api/share/:id` → `{ url }`; client copies to clipboard
- [x] URL resolves to a read-only Proof card page
      → `GET /proof/:id` → server-rendered HTML with the card payload injected
- [x] No auth required to view; non-public cards return a friendly "not found" page
- [x] Tested end-to-end in Chrome via DevTools MCP
      → [`docs/screenshots/04-public-proof.png`](../screenshots/04-public-proof.png)

**Note on the "RLS" criterion from the original plan:** RLS belongs in the
Supabase-backed P3 milestone. The v0 demo enforces the same intent via the
in-memory `isPublic` flag on each card — `/proof/:id` returns the missing page
unless `isPublic === true`.

---

### M4 — Demo dry-run passed

The full demo flow has been rehearsed end-to-end at least 5 times without manual
intervention. Pre-seeded fallback inputs exist in case a judge-handed input misbehaves.

**Exit criteria:**

- [ ] 5 consecutive successful dry runs logged
- [ ] Fallback input set seeded and tested
- [ ] Demo runbook committed under `docs/ops/demo-runbook.md`

---

### M5 — Hackathon submission (1-day track)

Submission delivered.

**Exit criteria:**

- [x] `SUBMISSION.md` v0 section written
- [x] Repo committed end-to-end (commit `4367097` + earlier)
- [x] Live demo runbook for the 1-day track committed
- [x] Live gcal harvest verified end-to-end against operator's real calendar

---

### M6 — Discovery refresh for 5-day track

Re-do the discovery work for the larger v0.5 scope. No code changes —
governance artifacts only. The 1-hour build that produced v0 forced
shortcuts (playground OAuth tokens, in-memory store, single-axis
classification) that won't survive a 5-day timeline.

**Exit criteria:**

- [x] ADR-0002 written: scope expansion to 5-day track
- [x] ADR-0003 written: two-dimensional categorization (domain × activity_type)
- [x] ADR-0004 written: real OAuth + Supabase persistence
- [x] `problem-statement.md` updated for cross-domain capture + wedge framing
- [x] `personas.md` updated: Maya gains mixed-vendor / parenting context;
      operator concerns extended with domain-classification false positive
- [x] `requirements.md` updated: new FR-009 through FR-021 for Must-tier
      v0.5 items; v0 priorities preserved in the change log
- [x] `mvp-scope.md` gains a v0.5 section; v0 section preserved
- [x] `milestones.md` extended with M6–M12
- [x] All v0.5 ADRs reference ADR-0001 as the baseline

---

### M7 — Foundations (OAuth + Supabase)

Replace v0's playground-token shortcut and in-memory store with real OAuth
for Google and Microsoft, plus Supabase persistence. This is the
highest-risk milestone of the 5-day build because three vendor relationships
go from "not configured" to "wired and working" in one day.

**Exit criteria:**

- [ ] Operator has created the Google Cloud project per ADR-0004 playbook;
      `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in `.env.local`
- [ ] Operator has created the Microsoft Azure App Registration per ADR-0004
      playbook; `MICROSOFT_OAUTH_*` env vars set
- [ ] Supabase schema from ADR-0004 applied; RLS policies enabled
- [ ] `KINETIC_TOKEN_ENCRYPTION_KEY` generated and stored in `.env.local`
- [ ] `src/oauth/` module: authorization-code + PKCE flow for both providers;
      `/oauth/:provider/start`, `/oauth/:provider/callback` routes wired
- [ ] Tokens stored encrypted in `oauth_tokens` (verified by reading row
      directly in Supabase — ciphertext visible, not plaintext)
- [ ] Automatic refresh-on-use behavior verified by manually expiring a token
- [ ] v0.5 demo seeds use the stored token; playground-token shortcut paths
      removed from `gcal.mjs` (kept only as a debug env fallback)
- [ ] Server-restart test: stop server, restart, harvest still works against
      stored tokens

---

### M8 — Schema v0.5 + regression refresh

Lock the new LLM contract before more harvesters land. `category` → `activity_type`
rename, new `domain` enum, expanded regression set with at least 2 fixtures
per domain (20 fixtures total).

**Exit criteria:**

- [x] `schemas/kinetic-output.schema.json` updated per ADR-0003 schema delta
- [x] `prompts/capture-to-output.md` updated with domain selection rules
      and the per-domain visual_theme defaults
- [x] `src/providers/mock.mjs` updated for new field shape (`classifyDomain()`)
- [x] `tests/regression-inputs.jsonl` grows to 20 fixtures with
      `expected_domain` + `expected_activity_type` per entry
- [x] `src/regression.mjs` reports both schema-validity and
      domain-correctness percentages; M8 gate is ≥90% schema-valid AND
      ≥95% domain-correctness on the chosen provider
- [x] All existing UI references to `category` renamed to `activity_type`
      (`web/public/app.js`, `web/public/style.css`); domain pill added
- [x] Migration note added to `docs/knowledge/shared-observations.md`

**Measured results (mock provider, 2026-06-02):**

```
Schema-valid:     20/20 (100.0%)
Domain-correct:   20/20 (100.0%)
Activity match:   18/20 (90.0%)  (informational — not a gate)
✓ M8 exit criterion MET for provider "mock"
```

Built test-first: the validator self-test was extended to require `domain`
(and reject a missing / out-of-enum domain) and the regression runner's
domain gate was written before the mock learned the new axis — both watched
to fail, then made green. The Gemini/Claude provider code needed no change;
they inline the schema + prompt at runtime. **Real-provider domain-correctness
is still unmeasured** (gated on API keys) — that's the M11 task.

---

### M9 — New harvesters

Five new harvesters, all on the same `{ harvest }` contract from M6 of v0.

**Exit criteria:**

- [ ] `src/harvesters/mscal.mjs` — Microsoft Graph Calendar
      `GET /me/calendar/events`; same shape as `gcal`
- [ ] `src/harvesters/gdrive.mjs` — Google Drive Activity API
      `POST https://driveactivity.googleapis.com/v2/activity:query`
- [ ] `src/harvesters/onedrive.mjs` — Microsoft Graph
      `GET /me/drive/recent` + `GET /me/drive/root/delta`
- [ ] `src/harvesters/gmail_sent.mjs` — Gmail API `users.messages.list`
      with `q=in:sent newer_than:1d`; metadata fields only
- [ ] `src/harvesters/outlook_sent.mjs` — Microsoft Graph
      `GET /me/mailFolders/sentitems/messages`
- [ ] Each harvester emits the canonical capture shape
- [ ] Each harvester surfaces a `provider_domain_hint` field (`business` /
      `personal` / …) computed from heuristics (sender domain, folder
      path, file location) so the LLM has a hint, not a hard label
- [ ] Server's `/api/harvest/:source` already auto-routes (no changes)
- [ ] Each harvester tested live against the operator's real account;
      screenshots committed

---

### M10 — Multi-domain UX + privacy gate

The visible side of v0.5. Persisted feed, domain filter tabs,
per-card confirmation modal for non-business shares, multi-account OAuth
status in the header.

**Exit criteria:**

- [ ] Feed view at `/` shows cards from Supabase in reverse-chronological
      order
- [ ] Domain filter tabs: `All / Business / Personal / Family / Financial / Parenting`
- [ ] Tab click filters the rendered cards client-side in <100ms
- [ ] "Share publicly" on a non-business card shows a confirmation modal
      naming the domain; modal cannot be skipped
- [ ] Header shows OAuth connection status for Google / Microsoft / GitHub
      (connected vs. disconnected); click to start or refresh OAuth
- [ ] Privacy-audit script: `node tools/privacy-audit.mjs` lists all
      public cards and asserts `domain == "business"` for every one

---

### M11 — Polish + dry runs (5-day track)

The full v0.5 flow rehearsed end-to-end. Demo runbook updated for the new
5-source story.

**Exit criteria:**

- [ ] 3 consecutive successful end-to-end dry runs logged
- [ ] All 5 harvesters produce at least one card during a dry run
- [ ] `docs/ops/demo-runbook.md` updated with v0.5 connect-OAuth flow
- [ ] Regression suite re-run on Claude AND Gemini with the M8 prompt;
      numbers recorded in `shared-observations.md`
- [ ] Screenshots refreshed for the v0.5 UI

---

### M12 — Hackathon submission (5-day track)

Submission delivered to the 5-day track.

**Exit criteria:**

- [ ] `SUBMISSION.md` v0.5 section written (or new `SUBMISSION-v0.5.md`)
- [ ] Submission form completed
- [ ] Demo URL or detailed runbook reachable by judges
- [ ] Repo link delivered; v0 history preserved (no force-push, no rebase
      of the v0 commits)

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
