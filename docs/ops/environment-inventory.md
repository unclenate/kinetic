<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Environment Inventory — Kinetic (AutoPortfolio)

> Owner: @unclenate (Nate DiNiro)
> Last updated: 2026-06-03

This document records every environment in the system, what runs where, how credentials
are managed, and who has access. Without this, incident response starts with archaeology.

Honest state (alpha): there is exactly **one** runtime environment today — local
development. There is **no staging and no production deployment**. A hosted deploy
(Vercel) is planned but not provisioned. The Staging/Production rows below are kept as
planned placeholders and are explicitly marked "not provisioned".

---

## Environments

### Local Development

| Property | Value |
|----------|-------|
| Purpose | Individual developer workflow — the only live environment today |
| URL / Access | `http://localhost:5173` (`PORT=5173`), started with `node web/server.mjs` |
| Data | Real data persisted to the shared Supabase project `wdjktkfeqaainzartztx` when `SUPABASE_URL` is set; otherwise an in-memory store (data lost on restart) |
| Credentials | Local `.env.local` (gitignored; copied from `.env.example`) |
| Who has access | @unclenate (single operator) |

### Staging

| Property | Value |
|----------|-------|
| Purpose | Pre-production validation |
| URL / Access | Not provisioned — no staging environment exists |
| Data | Not provisioned |
| Credentials | Not provisioned |
| Who has access | Not provisioned |
| Deployed via | Not provisioned (Vercel planned) |

### Production

| Property | Value |
|----------|-------|
| Purpose | Live user-facing environment |
| URL / Access | Not provisioned — no production deployment exists (Vercel planned) |
| Data | Not provisioned (would be the Supabase project once promoted) |
| Credentials | Not provisioned |
| Who has access | Not provisioned |
| Deployed via | Not provisioned (Vercel planned) |

---

## Credential Management

All secrets live in a single gitignored `.env.local` on the developer machine. **There is
no secret manager today** — rotation is manual and ad hoc. `.env.example` (tracked) is the
empty template.

| Credential type | Storage method | Rotation schedule | Owner |
|----------------|---------------|-------------------|-------|
| Database (Supabase service-role key, `SUPABASE_SERVICE_ROLE_KEY`) | `.env.local` plaintext; server-side only, never sent to client | Manual / on suspected exposure via Supabase dashboard | @unclenate |
| Token encryption key (`KINETIC_TOKEN_ENCRYPTION_KEY`, AES-256-GCM 32-byte base64) | `.env.local` plaintext; no backup beyond developer's own copy | None — rotating invalidates all stored OAuth tokens (re-OAuth required) | @unclenate |
| API keys (Anthropic `ANTHROPIC_API_KEY`, Gemini `GEMINI_API_KEY`; OpenAI pending) | `.env.local` plaintext | Manual via each provider console | @unclenate |
| OAuth client secrets (Google `GOOGLE_OAUTH_CLIENT_SECRET` live; Microsoft `MICROSOFT_OAUTH_CLIENT_SECRET` pending) | `.env.local` plaintext | Manual via Google Cloud Console / Azure Portal | @unclenate |
| Deployment secrets | None — no deploy pipeline exists yet | N/A | @unclenate |

OAuth user tokens themselves are stored encrypted (AES-256-GCM) at rest in the
`oauth_tokens` table, with lazy refresh-on-use.

---

## Environment Parity

| Dimension | Local | Staging | Production |
|-----------|-------|---------|------------|
| Database engine | Supabase Postgres 17 (project `wdjktkfeqaainzartztx`, us-east-1) via PostgREST, or in-memory fallback | Not provisioned | Not provisioned |
| Runtime version | Node >= 18, zero-dependency ESM (`.mjs`), no build step | Not provisioned | Not provisioned |
| Feature flags | None (provider selected by `KINETIC_PROVIDER` env: mock/claude/gemini) | Not provisioned | Not provisioned |
| External services | Real Google OAuth + live LLM when keys present; `mock` provider for offline | Not provisioned | Not provisioned |

---

## Notes

- Today, "local" and "shared backing DB" overlap: local dev writes to the single shared
  Supabase project `wdjktkfeqaainzartztx`. There is no separate staging/prod database —
  changes against this project affect the only persisted dataset.
- Add or remove environment rows as needed. When a Vercel deployment is provisioned, update
  the Staging/Production rows and the Credential Management table in the same change.
- This file is a companion rule target — changes to deployment automation require this
  file to be updated in the same PR.
