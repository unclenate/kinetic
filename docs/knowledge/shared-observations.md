# Shared Observations — Kinetic

Append-only log of notable observations from the build. Per
`platform/profiles/management/knowledge-capture`, this is the raw input that
later gets distilled into `distilled-learnings.md`.

Format: one entry per observation. Date, context, observation, implication.

---

## 2026-05-16 — Mock provider is enough for M1 mechanics; not enough for M1 quality gate

**Context:** M1 build, ~72-minute window. No LLM API keys configured.

**Observation:** A deterministic mock LLM provider (keyword + regex heuristics)
produces 10/10 schema-valid outputs on the regression set, and 10/10 category-
match after one regex-ordering fix. This proves the harness mechanics — schema,
prompt template, validator, runner — work end-to-end without any external
dependency.

**Implication:** The M1 exit criterion ("≥9/10 schema-valid") is now demonstrably
met for the *mock* provider. The real-LLM measurement is gated only on API
keys. When keys land, run `KINETIC_PROVIDER=gemini node src/regression.mjs` and
`KINETIC_PROVIDER=claude node src/regression.mjs`. If either provider scores
<9/10, capture failure modes here and iterate on the prompt before touching the
schema.

---

## 2026-05-16 — Initial regex ordering bug surfaced via category-match telemetry

**Context:** First regression run.

**Observation:** reg-04 ("customer call ... they have the exact failure mode
we built for") classified as `fix` instead of `collab`. The `fix` regex matched
the substring "fail" before the `collab` regex matched "customer". One regex
re-order fixed it.

**Implication:** Even though category-match is informational (not a gate), it
surfaced a real classification bug that would have been embarrassing in the
demo. Keep category-match as a soft signal in the regression output forever —
it's free defect-detection.

---

## 2026-05-16 — Zero-dep `.mjs` was the right call for the 72-min window

**Context:** ADR-0001 commits the project to TypeScript across the stack.

**Observation:** Shipping the M1 harness as plain Node ESM (`.mjs`) with zero
dependencies meant `node src/regression.mjs` worked on first run with no
`npm install` step. An `npm install` cycle (network + tsc + tooling) would
plausibly have eaten 5–10 minutes that the build window did not have.

**Implication:** Mark a follow-up to migrate `src/` to TypeScript in P3 once
the hackathon submission is locked. The `.mjs` files are small (~600 lines
total) and the types are easy to recover. Logged as a follow-up in
`docs/project/change-log.md` 2026-05-16 entry.

---

## 2026-05-16 — Real-LLM regression numbers (hackathon venue, shared-IP NAT)

**Context:** API keys configured (`.env.local`, gitignored). Regression executed
on the hackathon venue network, which shares an outbound IP across many
attendees and triggers provider rate limits that are not representative of a
production deployment.

**Observation:**

| Provider | Schema-valid | Category match | Notes |
|----------|--------------|----------------|-------|
| `mock`   | 10/10        | 10/10          | Deterministic, no network |
| `claude` (`claude-sonnet-4-5`) | **10/10** | **10/10** | 4–7s per call; structured output via `tool_use` |
| `gemini` (`gemini-2.5-flash`)  | 8/10      | 8/10       | 2 failures were HTTP 429 / 503 — NOT schema violations. Of calls that succeeded, schema validity was 100%. |

**Implication:**
- The schema and prompt are sound. Both real LLMs that responded produced
  schema-valid output on every attempt.
- Gemini's failures are infrastructure-shaped (rate-limit + transient 503),
  triggered by venue NAT putting hundreds of hackathon attendees on the same
  outbound IP and exceeding the 5-req/min free-tier limit. A retry-with-backoff
  layer has been added (`src/providers/gemini.mjs`) and will absorb this on a
  normal network.
- For the demo we will run with `KINETIC_PROVIDER=claude` as the primary at
  the venue and fall back to `mock` if Anthropic also rate-limits the shared IP.
  ADR-0001's Gemini-primary stance stands for production.

**Action:**
- Treat the Gemini 8/10 as "blocked by environment, not by contract."
- Do not block M1 exit on it. Re-measure on a non-venue network post-hackathon
  and update this entry with the production-network number.

---

## 2026-05-16 — Signal harvesters: GitHub real, Calendar via text seam

**Context:** ~20-minute window before submission, after M2/M3. Question: can
we ingest captures from real signal sources (GitHub, Google/Outlook Calendar)
instead of only typed input?

**Observation:**

- **GitHub** works with zero OAuth — the public events endpoint
  (`/users/:user/events/public`) returns push / PR / review / issue / create
  events without auth. Rate limit is 60 req/hr per IP unauthenticated, which
  is plenty for a single harvest call. Optional `GITHUB_TOKEN` env var lifts
  the limit to 5000/hr. **Shipped** as `src/harvesters/github.mjs`.

- **Google Calendar / Outlook** both require OAuth + client registration +
  consent screen. **Not feasible** to ship cleanly in 20 minutes. Instead,
  shipped `src/harvesters/calendar.mjs` that accepts pasted text lines — same
  `{ harvest }` contract, same downstream pipeline. Real OAuth integrations
  can be added later as drop-in modules behind the same interface.

**Implication:**
- The architecture supports multi-source capture: harvesters are pure
  modules that emit `{ source_id, text, image_caption, occurred_at }`, which
  the server then loops through the existing LLM provider. No special-casing.
- Adding Google/Outlook later is a "write the OAuth flow + a `harvest()`
  function" job; the schema, prompt, validator, and UI rendering are already
  source-agnostic.
- Demo-day note: GitHub harvest worked against `torvalds` from the venue and
  produced a real Proof card from a real public event. Calendar harvester
  produces three cards from three pasted lines.

**Action:** Captured the OAuth follow-ups under "What's next" in
`SUBMISSION.md`. ADR-0001 follow-ups now include "Google Calendar harvester
(OAuth)" and "Microsoft Graph harvester (OAuth)" alongside the existing
P3 Supabase / TypeScript migration items.

---

## 2026-05-16 — Google Calendar harvester: real API, OAuth-Playground access token

**Context:** After shipping the GitHub-live + pasted-calendar-text harvesters,
we wanted real Google Calendar reads in the demo without the cost of a full
OAuth integration (GCP project + consent screen + verification + refresh-
token storage).

**Observation:** Google's OAuth Playground (developers.google.com/oauthplayground)
issues a short-lived (~1h) access token for any scope a developer is willing
to consent to in their own Google account. That's enough to power a hackathon
demo against the user's own calendar via the real Calendar API v3 endpoint
`GET /calendars/primary/events`.

**Decision:** Ship `src/harvesters/gcal.mjs` as a real Calendar API caller
that accepts an access token via the POST body (`accessToken`) or the
`GOOGLE_ACCESS_TOKEN` env var. The token is short-lived and never persisted.
Production wiring will replace this with a full OAuth flow but keep the same
`harvest()` contract.

**Implication:**
- The "Google / Outlook OAuth modules are next" claim from the previous
  observation is now half-shipped: Google is in, Outlook (Microsoft Graph)
  remains a follow-up.
- We now have three concrete harvesters proving the contract:
  - `github`   real public-API
  - `gcal`     real OAuth-protected API (playground token)
  - `calendar` text-paste seam (always-on fallback)
- Token-leak surface area is low: tokens are submitted per-request in the
  POST body, never logged by the server, and expire automatically inside an
  hour.

**Action:**
- Removed "Google Calendar harvester (OAuth)" from the "What's next" list
  in `SUBMISSION.md`.
- Added "Refresh-token storage + full OAuth flow (replace playground-token
  shortcut)" as a P3 item in its place.

---

## 2026-05-16 — Live gcal harvest verified end-to-end via the UI

**Context:** After shipping `src/harvesters/gcal.mjs`, ran it against the
operator's real Google Calendar with a fresh OAuth-Playground access token.

**Observation:**

- Calendar API returned 6 real events in the default 48h-back/24h-ahead window.
- Server processed the top 3 through Gemini (free-tier capacity available).
- Three schema-valid Proof cards generated:

| # | Title | Category | Theme | Time | Latency |
|---|-------|----------|-------|------|---------|
| 1 | Tax Payment Reminder | other | graphite | — | ~5s |
| 2 | **AI for a Better PDX Build Challenge** | build | neon | 8h 30m | ~7s |
| 3 | Focused Learning Block | learning | ocean | 1h | ~5s |

- Card #2 is meta — it's the hackathon this very project is being submitted
  to. Tags Gemini chose unprompted: `AI, hackathon, civic-tech, Portland`.
- An admin task ("Make Tax Payment", `todo`) was correctly extracted from
  card #1.
- The remaining 3 raw signals (additional homework block, AI Tinkerers
  meetup, Parent check-in) were rendered as un-processed signals in the UI
  per the `process_max` cap.

**Implication:** The full pipeline — real OAuth API → harvester → LLM
contract → schema validation → UI render — works end-to-end against real
user data. The architecture story ("source-agnostic capture, same contract
for every input") is now demonstrated against three live providers:
GitHub public events, Google Calendar v3, and pasted text.

**Action:**
- Live screenshot committed: `docs/screenshots/07-harvest-gcal-live.png`.
- SUBMISSION.md updated with the live-harvest result.
- The recursion ("Kinetic generates a Proof card *for* attending this
  hackathon") is a free demo moment — recommend opening the live UI on
  this exact card during judging.

---

## 2026-06-02 — M8: schema v0.5 migration (`category` → `domain` × `activity_type`)

**Context:** First v0.5 (5-day-track) build milestone landed. ADR-0003's
two-dimensional contract is now in code. Built test-first against the existing
zero-dep harness (`validate.mjs --selftest`, `regression.mjs`).

**Migration summary (what changed and why it's safe):**

- **Schema** (`schemas/kinetic-output.schema.json`): `category` renamed to
  `activity_type`; new **required** `domain` enum
  (`business|personal|family|financial|parenting`). Because `proof_card` has
  `additionalProperties: false`, any output still emitting the old `category`
  key is rejected — the rename is self-policing. The validator self-test now
  asserts a missing `domain` and an out-of-enum `domain` are both rejected.
- **Mock provider** (`src/providers/mock.mjs`): added `classifyDomain()` with
  ordered heuristics (financial → parenting → family → personal → default
  `business`), encoding ADR-0003's specificity rule. Output key renamed.
- **Regression set** grew 10 → **20** fixtures, ≥2 per domain, each carrying
  `expected_domain` + `expected_activity_type` (was `expected_category`).
- **Runner** now gates on **≥90% schema-valid AND ≥95% domain-correct**;
  `activity_type` match stays informational.
- **Prompt, UI** (`app.js` domain + activity pills, `style.css`), and
  `tests/README.md` updated in lockstep. Gemini/Claude provider code needed no
  change — they inline the schema + prompt, so they adapt automatically.

**Measured (mock, 2026-06-02):** Schema-valid 20/20, Domain-correct 20/20,
Activity match 18/20.

**Observation / watch items:**

- The mock's `activity_type` classifier trails the hand labels on two
  *relational* captures — "helped my daughter with homework" and "coached the
  kids' soccer practice" are conceptually `collab` but the keyword mock returns
  `other` ("helped"/"coached" aren't in the lexicon). Left as-is on purpose:
  the fixtures hold the honest label for real-LLM runs; contorting the wording
  to flatter the mock would weaken the test. Domain (the gated axis) is 20/20.
- **Ambiguous-domain default = `business`.** A capture with no life-domain
  signal (e.g. reg-10 "stuff today was hard") defaults to `business`, which is
  the *permissive* side of the privacy gate. The safety net holds today because
  cards are `is_public: false` by default and sharing is an explicit user
  action — but once auto-publish or bulk-share exists, an ambiguous capture
  defaulting to `business` could skip the non-business confirmation step. Decide
  before M10 whether the ambiguous default should flip to a private domain.
- **Real-provider domain-correctness is unmeasured.** The 95% gate has only been
  proven on the deterministic mock (which is partly circular — same author wrote
  the fixtures and the classifier). The meaningful number is Claude/Gemini on
  these 20 fixtures; that run is still gated on API keys and is the M11 task.
