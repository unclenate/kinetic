<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Dependency Log

<!-- Source: platform/profiles/management/project-standard -->
<!-- Update when external dependencies are added, change status, or resolve. -->

This log tracks external dependencies that affect delivery: third-party APIs, vendor
integrations, platform services, shared infrastructure, and cross-team handoffs.
Internal library or package dependencies belong in `package.json`, not here.

A dependency is worth logging when its status, availability, or readiness can block
a milestone or delivery phase.

**Owner:** @unclenate &nbsp;|&nbsp; **Last reviewed:** 2026-06-03 &nbsp;|&nbsp; **Maturity:** alpha &nbsp;|&nbsp; **Criticality:** medium

---

## Runtime package dependencies: NONE

Kinetic is **zero-dependency by design** (ADR-0001). `package.json` declares **no runtime
dependencies and no devDependencies** — there is no `node_modules` to install, no build
step, and no lockfile risk. The only platform requirement is the Node engine:

| Requirement | Constraint | Source |
| ----------- | ---------- | ------ |
| Node.js runtime | `>=18` (ESM, native `fetch`, `node:crypto` AES-256-GCM, `node:test`) | `package.json` `engines.node` |

This invariant is load-bearing: the JSON-schema validator, the test "framework," PKCE,
token crypto, and the Supabase client are all hand-rolled on the Node standard library
precisely to avoid third-party runtime deps. Adding any npm runtime dependency requires an
ADR.

---

## Active Dependencies

External services / vendor APIs the product calls. None are internal-team handoffs; all are
third-party APIs or platform services.

| Dependency | Type | Owner | Status | Impact if Delayed | Target Date | Notes |
| ---------- | ---- | ----- | ------ | ----------------- | ----------- | ----- |
| Anthropic (Claude API) | API | @unclenate | In progress | LLM classification fallback unavailable; lose provider redundancy behind the schema contract | 2026-06-10 | `src/providers/claude.mjs`. Real-provider regression pending an API key — only `mock` is proven against the >=90%/>=95% gate so far. |
| Google Gemini API | API | @unclenate | In progress | Primary live LLM provider unproven against the regression gate | 2026-06-10 | `src/providers/gemini.mjs`. Pending API key for `KINETIC_PROVIDER=gemini` regression run. |
| Google OAuth + Calendar/Drive/Gmail APIs | API | @unclenate | In progress | Live signal harvesting (calendar, drive, sent mail) and real consent flow blocked | 2026-06-10 | OAuth PKCE flow is live for Google; tokens AES-256-GCM encrypted at rest. Harvesters: `gcal.mjs`, `gdrive.mjs`, `gmail_sent.mjs`. End-to-end gcal verified manually. |
| Supabase (Postgres via PostgREST) | Infra | @unclenate | In progress | No durable persistence; falls back to in-memory store (data lost on restart) | 2026-06-10 | `src/db/supabase.mjs` over PostgREST; `src/db/store.mjs` in-memory fallback. Live path verified manually; suite runs against stubbed `fetch`. |
| GitHub public API | API | @unclenate | Resolved (in use) | Loss of GitHub event harvesting (PRs/pushes as captures) | — | `src/harvesters/github.mjs`. Public, unauthenticated events endpoint; PR enrichment via follow-up fetch. Rate-limit exposure on the unauthenticated tier. |
| Fathom.video API | API | @unclenate | Resolved (in use) | Loss of meeting-assistant harvesting (AI summaries + action items → cards + tasks) | — | `src/harvesters/fathom.mjs`. `X-Api-Key` auth (`FATHOM_API_KEY` or per-request), `GET /external/v1/meetings`, 60/min limit. Offline-tested; live needs the operator's API key. First of the meeting-assistant integrations (Granola/Circleback/etc. to follow the same `harvest()` contract). |
| Microsoft Graph (OAuth + Calendar/Outlook/OneDrive) | API | @unclenate | Open (planned) | Microsoft-side harvesting and OAuth not yet wired; harvester stubs exist but no live consent flow | 2026-06-17 | Harvester scaffolds present (`mscal.mjs`, `outlook_sent.mjs`, `onedrive.mjs`) and unit-tested offline; live Graph OAuth is planned, not implemented (ADR-0004). |
| Ollama (local LLM) | Vendor | @unclenate | Resolved (in use) | No offline/local-model provider option | — | `src/providers/ollama.mjs` (Phase A, ADR-0006). The privacy-routing local default; live-verified against a local model. |
| OpenAI API | Vendor | @unclenate | Resolved (built) | Fewer LLM provider options behind the schema contract | — | `src/providers/openai.mjs` (Phase A). JSON-mode; live use pending an `OPENAI_API_KEY`. |

**Type definitions:**

- **Team** — another internal team's deliverable that this project depends on
- **Vendor** — external SaaS, tool, or service that must be provisioned or configured
- **Infra** — infrastructure provisioning (cloud resources, environments, DNS, certs)
- **API** — third-party API that must be available, stable, or quota-approved

---

## Resolved Dependencies

Move entries here when the dependency is fully resolved and no longer a delivery risk.

| Dependency | Type | Resolved Date | Resolution Notes |
| ---------- | ---- | ------------- | ---------------- |
| GitHub public API integration | API | 2026-05-30 | `github.mjs` harvester shipped and unit-tested; pulls captures from public GitHub events with PR title enrichment. Remaining concern is unauthenticated rate limits, tracked as a risk, not a blocker. |

---

## Dependency Health Signals

- **Open > 2 weeks with no progress** — escalate to stakeholder report
- **Blocked** — add to stakeholder report decisions section immediately
- **Target date passed without resolution** — flag as milestone risk
- **Key/credential-gated work (Anthropic, Gemini, Google, Supabase)** — the >=90% schema /
  >=95% domain regression gate cannot be demonstrated on a real provider until keys land;
  treat each unprovisioned key as a milestone risk for the "real provider proven" goal.

---

## Reference

| Resource | Path |
| -------- | ---- |
| Milestones | `docs/project/milestones.md` |
| Change log | `docs/project/change-log.md` |
| Stack & composition decision | `docs/adr/ADR-0001-stack-and-composition.md` |
| Real OAuth + Supabase decision | `docs/adr/ADR-0004-real-oauth-and-supabase.md` |
| Test strategy | `docs/testing/test-strategy.md` |
