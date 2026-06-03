<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Kinetic — Distilled Learnings

**Version:** 1.0 | **Owner:** @unclenate | **Last Updated:** 2026-06-03

Curated longitudinal synthesis of what this project has learned. Drafted
periodically by agents from `shared-observations.md`, reviewed by the
team, promoted here when accepted as durable institutional knowledge.

Unlike `shared-observations.md` (append-only), this file is curated. Entries
are rewritten, merged, superseded, or retired as the team's understanding
matures. Git history is the durable record of what was once believed.

**Maturity caveat (alpha):** every lesson below was learned during the v0
(1-day) and v0.5 (5-day) hackathon tracks. They are validated against demos,
offline test harnesses, and a handful of live API calls — not against
production traffic, multiple users, or sustained operation. Confidence is
noted per entry where it matters.

---

## Principles

_Durable truths about how this project works. Each entry cites the
observations that led to it._

### A mock provider proves mechanics; only a real LLM proves the quality gate

A deterministic mock provider (keyword + regex heuristics) is invaluable for
proving the *harness mechanics* — schema, prompt template, validator, runner —
end-to-end with zero network and zero credentials. It is **not** a substitute
for the real quality gate. The mock can score 20/20 because the same author
wrote the fixtures and the classifier; that number is partly circular. The
meaningful measurement is Claude/Gemini against the same fixtures, and that
remains unmeasured for the v0.5 two-dimensional contract (gated on API keys,
the M11 task). Trust the mock for "does the pipeline run," not for "is the
classification good."

**Derived from:** shared-observations.md § "Mock provider is enough for M1
mechanics; not enough for M1 quality gate" (2026-05-16), § "M8: schema v0.5
migration" (2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** high

### Privacy-by-design is a lifecycle, not a single inference choice

Keeping classification permissive-by-default and inference local is only the
first layer. Real privacy needs the *whole lifecycle*: encryption at rest
(AES-256-GCM token encryption, `iv‖tag‖ciphertext`), tamper-detection (GCM
auth tags), metadata-only reads where bodies aren't needed (`gmail_sent` uses
`format=metadata`, never message bodies), short-lived non-persisted tokens,
and an enforced gate at the publish boundary (the un-skippable
share-confirmation modal + `tools/privacy-audit.mjs` that exits non-zero on
any public non-business card). The watch item — an ambiguous capture
defaulting to `business` (the public-eligible side) — proves the point: a
single default is safe only because the *rest* of the lifecycle (cards default
`is_public:false`, sharing is explicit) holds it up. Revisit before any
auto-publish/bulk-share path ships.

**Derived from:** shared-observations.md § "M7: OAuth + Supabase scaffolded
offline" (2026-06-02), § "M9: five harvesters built and tested offline"
(2026-06-02), § "M10: multi-domain feed + privacy gate" (2026-06-02), §
"M8: schema v0.5 migration" (2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** medium (gate logic verified in tests and statically; live DOM
block and persistent-store audit not yet browser/Supabase-verified)

---

## Patterns

_Repeatable patterns we've seen work (or fail). These guide future choices._

### Zero-dependency Node ESM (`.mjs`) removed all install friction

Shipping the M1 harness as plain Node ESM with **zero dependencies** meant
`node src/regression.mjs` ran on first invocation with no `npm install` step —
no network, no `tsc`, no tooling cycle. In a 72-minute build window that
plausibly saved 5–10 minutes, and it has kept the test loop instant ever
since (`npm test` = selftest + regression + harvesters). The cost is deferred,
not free: a TypeScript migration is logged as a P3 follow-up, and the `.mjs`
files are small (~600 lines at M1) so the types are recoverable.

**Derived from:** shared-observations.md § "Zero-dep `.mjs` was the right call
for the 72-min window" (2026-05-16)
**Promoted:** 2026-06-03 after review
**Confidence:** high

### `additionalProperties: false` makes schema renames self-policing

When `proof_card` carries `additionalProperties: false`, renaming a field
(`category` → `activity_type`) is automatically enforced: any output still
emitting the old key is *rejected* by the validator, so a half-migrated
provider can't silently pass. The same constraint let the validator self-test
assert that a missing `domain` and an out-of-enum `domain` are both rejected.
Strict schemas turn refactors into compiler-like guarantees.

**Derived from:** shared-observations.md § "M8: schema v0.5 migration
(`category` → `domain` × `activity_type`)" (2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** high

### Stub `globalThis.fetch` to test the full network path offline

Because the harvesters and OAuth/DB code call the global `fetch`, stubbing
`globalThis.fetch` with synthetic provider-shaped JSON exercises the *real*
code path — auth guard, request construction, response mapping, domain
hinting, token encrypt/decrypt, refresh-on-use — with zero network and zero
credentials. This was the maximum confidence achievable without accounts:
12/12 green on harvesters, 18 offline tests on OAuth + store, with the network
boundary as the only thing faked. Branch the stub on request URL to drive
multi-step flows (e.g. a full refresh cycle: select → token endpoint →
re-upsert), and assert security properties directly (ciphertext does not
contain the plaintext; a tampered ciphertext fails GCM auth).

**Derived from:** shared-observations.md § "M9: five harvesters built and
tested offline" (2026-06-02), § "M7: OAuth + Supabase scaffolded offline"
(2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** high (offline); the mappers are built against *documented*
response shapes, so the first live harvest per source is a verification step,
not a formality

### Soft signals find real bugs for free — keep them even when ungated

Category-match was only an *informational* signal in the regression output,
yet it caught a real classification bug (`fix` regex matched "fail" before
`collab` matched "customer") that would have been embarrassing in the demo.
Ungated telemetry alongside the hard gate is free defect-detection; keep it
forever rather than deleting it once the gate is green.

**Derived from:** shared-observations.md § "Initial regex ordering bug
surfaced via category-match telemetry" (2026-05-16)
**Promoted:** 2026-06-03 after review
**Confidence:** high

### A pure-module `harvest()` contract makes capture sources drop-in

Every signal source — GitHub public events, Google Calendar v3, pasted text,
and the five M9 Graph/Google harvesters — is a pure module emitting the same
canonical shape (`{ source_id, text, image_caption, occurred_at }`, plus an
optional soft `provider_domain_hint`). The schema, prompt, validator, and UI
rendering are all source-agnostic, so adding a source is "write the auth flow
+ a `harvest()` function," not a special case. This contract has now absorbed
public-no-auth, OAuth-protected, and text-seam sources without downstream
change.

**Derived from:** shared-observations.md § "Signal harvesters: GitHub real,
Calendar via text seam" (2026-05-16), § "Google Calendar harvester: real API,
OAuth-Playground access token" (2026-05-16), § "Live gcal harvest verified
end-to-end via the UI" (2026-05-16), § "M9: five harvesters built and tested
offline" (2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** high

---

## Anti-patterns

_Things we've tried that didn't work, and why. Preserving these prevents
repeat failures._

### Don't trust a third-party list endpoint to carry full objects

The GitHub events API (`/users/:user/events/public`) returns *reduced* PR
objects — notably no PR title. Rendering directly from the list payload yields
thin, title-less cards. The fix is to enrich via a follow-up fetch of the full
resource. Generalize: list/feed endpoints frequently return a summarized
projection; verify the fields you need are actually present and plan an
enrichment fetch when they aren't. (This also surfaced naive-datetime hazards
elsewhere — Graph returns naive UTC with up to 7 fractional digits and no `Z`,
which `Date.parse` handles unreliably; `mscal` clamps to ms and appends `Z`.)

**Derived from:** shared-observations.md § "Signal harvesters: GitHub real,
Calendar via text seam" (2026-05-16), § "M9: five harvesters built and tested
offline" (2026-06-02)
**Promoted:** 2026-06-03 after review
**Confidence:** medium (GitHub reduced-object behavior confirmed in build;
generalization is provisional)

### Don't read environment-shaped failures as contract failures

Gemini's 8/10 on the M1 real-LLM run looked like a quality miss but was two
HTTP 429/503s caused by the hackathon venue's shared-IP NAT exceeding the
free-tier rate limit — not schema violations (every call that *responded* was
100% schema-valid). Reading that as "the contract is weak" would have wrongly
triggered prompt/schema churn. Lesson: separate "blocked by environment" from
"blocked by contract," add retry-with-backoff for the former, and re-measure
on a representative network before drawing conclusions.

**Derived from:** shared-observations.md § "Real-LLM regression numbers
(hackathon venue, shared-IP NAT)" (2026-05-16)
**Promoted:** 2026-06-03 after review
**Confidence:** high

---

## Decisions in Force

_Strategic or operational decisions that remain active. When a decision is
superseded, it moves to the Supersession Log below rather than being deleted._

- **Regression gate = ≥90% schema-valid AND ≥95% domain-correct;**
  `activity_type` match stays informational. Domain is the gated axis because
  it drives the privacy gate. (shared-observations.md § "M8", 2026-06-02)
- **Ambiguous-domain default = `business`** (the public-eligible side).
  Operator decision, 2026-06-02; safe only under the current explicit-share
  model. Flagged to revisit before any auto-publish/bulk-share path.
  (shared-observations.md § "M8", 2026-06-02; change-log 2026-06-02)
- **Demo provider order: Claude primary at the venue, mock fallback;**
  Gemini-primary stance stands for production once off shared-IP NAT.
  (shared-observations.md § "Real-LLM regression numbers", 2026-05-16)
- **Schema/prompt are inlined at runtime by the Gemini/Claude providers,** so
  contract changes (e.g. the v0.5 two-dimensional migration) require no
  provider-code change — they adapt automatically. (shared-observations.md §
  "M8", 2026-06-02)
- **The first live run per integration is a verification step, not a
  formality.** Harvester mappers, the Supabase store round-trip, real consent
  screens, and refresh against a genuinely expired token are all live-only
  checks still pending operator credentials (M7-live). (shared-observations.md
  §§ "M7", "M9", "M10", 2026-06-02)

---

## Supersession Log

_Prior distilled learnings that were revised, reversed, or retired. Keep
the original text and the reason for the change. This is the longitudinal
record of how the team's thinking evolved._

- **2026-06-02 — "OAuth Playground access token is the calendar strategy"
  (v0) → superseded by ADR-0004 real OAuth + PKCE for v0.5.** The short-lived
  (~1h, never persisted) playground token was the right call for a 1-hour demo
  but wrong for a 5-day track; v0.5 replaces it with a full authorization-code
  + PKCE flow and encrypted refresh-token storage. Original reasoning preserved
  in shared-observations.md § "Google Calendar harvester: real API,
  OAuth-Playground access token" (2026-05-16).

---

## Review Metadata

- **Last team review:** 2026-06-03
- **Next scheduled review:** 2026-06-10
- **Current Write Policy:** autonomous (for context on how observations enter the pipeline)
- **Observation count since last review:** 13 (full backlog distilled in this first pass)
