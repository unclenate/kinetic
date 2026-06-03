<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Architecture Overview

Kinetic (working title AutoPortfolio) is an alpha-maturity, medium-criticality
project. This overview describes what is actually built today versus what is
planned. Where a component is not yet implemented, it is marked **planned**.

**Owner:** @unclenate (Nate DiNiro)
**Last updated:** 2026-06-03

## System Summary

Kinetic turns messy work artifacts (calendar events, GitHub activity, documents,
sent mail) into two outputs: (1) actionable **admin tasks** and (2) a shareable
**Proof-of-Skill card**. Every artifact is run through a strict LLM JSON contract
(`schemas/kinetic-output.schema.json`) and the result is validated server-side
before it is persisted.

Each card is classified on two axes: a **domain** (`business`, `personal`,
`family`, `financial`, `parenting`) and an **activity_type** (`build`, `fix`,
`design`, `decision`, `learning`, `collab`, `infra`, `research`, `other`). A
privacy gate makes only `domain=business` cards eligible to be made public; any
attempt to share a non-business card requires passing an un-skippable
confirmation modal.

The system is a single zero-dependency Node ESM application (Node >= 18, no build
step, no npm runtime dependencies). It runs **locally only** today
(`node web/server.mjs`, `PORT` defaults to 5173). The primary user is the
individual operator producing proof cards from their own work; the public surface
is the read-only `/proof/:id` page for shared cards.

**Operating boundaries (current):** single seeded demo user (full Supabase Auth
is post-v0.5); local-only deployment; Supabase service-role key used server-side,
which bypasses Row Level Security. Vercel hosting is **planned, not built**.

## Major Components

| Component | Responsibility | Owner | Notes |
|-----------|----------------|-------|-------|
| HTTP server (`web/server.mjs`) | Single Node `http` server; serves static `web/public/` + JSON APIs; orchestrates process/harvest/share/OAuth | @unclenate | Routes: `/api/process`, `/api/harvest/:source`, `/api/share/:id`, `/proof/:id`, `/api/cards`, `/api/cards/:id`, `/api/connections`, `/oauth/:provider/start`, `/oauth/:provider/callback`, `/health` |
| LLM contract + validator (`schemas/kinetic-output.schema.json`, `src/validate.mjs`) | Defines and enforces the strict output JSON shape; validates every card before persist | @unclenate | Built; zero-dep regression harness in `src/regression.mjs` |
| LLM providers (`src/providers/`) | Produce schema-conformant output from artifact text | @unclenate | `mock` (deterministic default), `claude` (Anthropic tool_use), `gemini` (response_schema) built; `ollama`, `openai` **planned** |
| Harvesters (`src/harvesters/`) | Pull artifacts from signal sources on a common `harvest()` contract | @unclenate | `github`, `gcal`, `calendar` built and verified; `gdrive`, `onedrive`, `mscal`, `gmail_sent`, `outlook_sent` present (Microsoft-side providers gated by planned OAuth) |
| Persistence store (`src/db/store.mjs`) | Pluggable card persistence behind one interface | @unclenate | In-memory backend by default; Supabase backend when `SUPABASE_URL` is set |
| Supabase client (`src/db/supabase.mjs`) | Minimal PostgREST-over-`fetch` client (no SDK) | @unclenate | Service-role key only; never sent to client |
| OAuth subsystem (`src/oauth/`) | Authorization-code + PKCE flow, token persistence, refresh-on-use | @unclenate | Google **live**; Microsoft **planned** |
| Token crypto (`src/oauth/crypto.mjs`) | AES-256-GCM encrypt/decrypt of OAuth tokens at rest | @unclenate | Key from `KINETIC_TOKEN_ENCRYPTION_KEY` (32 bytes, base64) |
| Static web UI (`web/public/`) | Capture form, results, public proof page, share confirmation modal | @unclenate | Plain HTML/CSS/JS, no framework/build |

## Interaction Boundaries

- **Capture request boundary:** `POST /api/process` accepts artifact text (and
  optional `image_caption`), invokes the selected provider, validates the output
  against the schema, then persists via the store. Provider is chosen by
  `KINETIC_PROVIDER` (default `mock`).
- **Harvest boundary:** `POST /api/harvest/:source` invokes a harvester's
  `harvest()` contract, which returns items shaped as
  `{ source_id, text, image_caption, occurred_at, provider_domain_hint }`; each
  item is then processed through the same provider + validate + persist path.
- **Sharing / privacy boundary:** `POST /api/share/:id` flips a card to public
  (`is_public = true`). The privacy gate (domain-based eligibility plus the
  non-business confirmation modal) governs what may cross this boundary.
- **Public read boundary:** `GET /proof/:id` serves a read-only card page with no
  auth; this is the only public-facing data surface.
- **OAuth boundary:** `/oauth/:provider/start` begins an authorization-code+PKCE
  handshake; `/oauth/:provider/callback` exchanges the code and persists
  encrypted tokens. Short-TTL handshake state is held in process memory.
- **Persistence boundary:** all user-data access is mediated by `src/db/store.mjs`
  → `src/db/supabase.mjs` (PostgREST). When `SUPABASE_URL` is unset, an in-memory
  fallback is used so the demo runs with zero infrastructure.
- **Trust boundary:** the Supabase service-role key and
  `KINETIC_TOKEN_ENCRYPTION_KEY` live server-side only and are never emitted to
  the browser.

## External Dependencies

| Dependency | Purpose | Trust Boundary | Owner |
|------------|---------|----------------|-------|
| Supabase (project ref `wdjktkfeqaainzartztx`, us-east-1, Postgres 17) | Postgres persistence via PostgREST; OAuth token storage | Server-side service-role key; bypasses RLS | @unclenate |
| Anthropic (Claude) | LLM provider via `tool_use` | Server-side API key | @unclenate |
| Google (Gemini + Calendar/Drive/Gmail OAuth) | LLM provider (Gemini `response_schema`); harvest source via OAuth (**live**) | Server-side API key + per-user OAuth tokens (encrypted at rest) | @unclenate |
| GitHub (public events) | Harvest source (no auth required) | Public, unauthenticated API | @unclenate |
| Microsoft Graph | Harvest source (Calendar/OneDrive/Outlook) — **planned** | Per-user OAuth tokens (planned) | @unclenate |
| Ollama | Local LLM provider — **planned** | Local host | @unclenate |
| OpenAI | LLM provider — **planned** | Server-side API key (planned) | @unclenate |
| Vercel | Hosting/deploy — **planned, not built** | N/A today | @unclenate |

## Operational Constraints

- **Alpha maturity.** Built and working end-to-end: capture → process → validate
  → persist → share → public proof page; mock/claude/gemini providers; github,
  gcal and calendar harvesters; Google OAuth (live) with encrypted token storage
  and refresh-on-use. Planned/not-yet-live: Microsoft OAuth and its harvesters,
  ollama/openai providers, Vercel deployment, full Supabase Auth.
- **Zero-dependency / no build step.** No npm runtime dependencies and no
  bundler. Any new capability must be implementable with the Node standard
  library or a clearly-scoped ADR.
- **Single demo user.** Persistence assumes one seeded demo user
  (`KINETIC_DEMO_USER_ID`, default `00000000-0000-0000-0000-000000000001`).
  Multi-user access control depends on Supabase Auth + RLS, which is post-v0.5.
- **RLS is bypassed in practice.** The server uses the service-role key, so RLS
  policies in `db/schema.sql` are not enforced for server traffic today; they
  become load-bearing only when anon/authenticated client access is added.
- **Key-loss risk.** A lost `KINETIC_TOKEN_ENCRYPTION_KEY` makes all stored
  OAuth tokens permanently unreadable; users would need to reconnect every
  provider. The key must be backed up out-of-band.
- **Local-only today.** The server binds `PORT` (default 5173) and is intended to
  be run locally; there is no production hosting yet.
- **Schema migrations are MCP-driven.** There is no local migration CLI;
  migrations are applied to Supabase via the Supabase MCP `apply_migration`. See
  `docs/database/migration-readiness.md`.

## Governance

Architecture decisions are recorded as ADRs in `docs/adr/`:
ADR-0001 (stack + composition), ADR-0002 (five-day scope expansion),
ADR-0003 (two-dimensional categorization), ADR-0004 (real OAuth + Supabase),
ADR-0005 (harness composition advance). Schema source of truth is
`db/schema.sql`.
