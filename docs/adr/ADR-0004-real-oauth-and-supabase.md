# ADR-0004: Real OAuth + Supabase persistence for v0.5

**Status:** Accepted
**Date:** 2026-05-16
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** [ADR-0002](./ADR-0002-five-day-track-scope-expansion.md)

---

## Context

v0 shipped two intentional shortcuts justified by the 1-day timebox:

1. **OAuth Playground access tokens.** `src/harvesters/gcal.mjs` requires
   the operator to paste a `ya29.` token into the UI. Tokens last ~1 hour
   and are obtained through Google's OAuth Playground, which uses
   Google's own client ID under the hood. No refresh, no real consent
   screen on our side, no programmatic re-auth.
2. **In-memory persistence.** `web/server.mjs` stores cards in a JS `Map`
   that vaporizes on restart.

The 5-day v0.5 track (ADR-0002) needs harvesters for Google Drive
Activity, OneDrive, Microsoft Graph Calendar, Gmail, and Outlook. All of
those require real OAuth — there is no playground for Drive Activity, and
Microsoft has no equivalent shortcut at all. v0.5 also needs to survive a
server restart during multi-day demoing.

## Decision

Replace both shortcuts in M7 of the v0.5 build:

### OAuth

Build a single OAuth coordinator (`src/oauth/`) with provider-specific
modules. Both Google and Microsoft use the standard authorization-code
flow with PKCE.

**Google (Cloud Console project: TBD-created-by-operator)**
- OAuth client type: Web application
- Authorized redirect URI: `http://localhost:5173/oauth/google/callback`
  (development); add the production URI later
- Scopes:
  - `openid email profile`
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/drive.activity.readonly`
  - `https://www.googleapis.com/auth/drive.metadata.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly`
- Refresh tokens: requested via `access_type=offline&prompt=consent`

**Microsoft (Azure App Registration: TBD-created-by-operator)**
- App type: Single tenant for the operator's account; can switch to
  multi-tenant before public launch
- Redirect URI: `http://localhost:5173/oauth/microsoft/callback`
- Microsoft Graph delegated permissions:
  - `User.Read`
  - `Calendars.Read`
  - `Files.Read.All`
  - `Mail.Read`
  - `offline_access`

**GitHub (Personal Access Token for v0.5)**
- Already works unauth for public events; v0.5 adds optional PAT input
  in the UI so private-repo events become visible. Fine-grained PAT,
  `Contents:Read` + `Metadata:Read` + `Pull requests:Read`.

**Token storage**
- Tokens go into Supabase table `oauth_tokens` (schema below).
- `access_token` and `refresh_token` are encrypted with AES-256-GCM
  using a key from `KINETIC_TOKEN_ENCRYPTION_KEY` env var. The DB sees
  ciphertext only.
- Refresh happens lazily on harvest call: if the cached access token is
  within 60s of expiry, refresh before the API call. Failed refresh
  surfaces as a "reconnect" prompt in the UI.

### Persistence (Supabase)

The operator has created a Supabase project. Required `.env.local`
entries:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
KINETIC_TOKEN_ENCRYPTION_KEY=<32-byte base64>
```

Server-side code uses the service role key. The client never sees keys
directly — all DB access is mediated by `web/server.mjs`.

**Initial schema (v0.5)**

```sql
create table users (
  id           uuid primary key default gen_random_uuid(),
  email        text unique not null,
  created_at   timestamptz not null default now()
);

create table oauth_tokens (
  user_id            uuid not null references users(id) on delete cascade,
  provider           text not null check (provider in ('google','microsoft','github')),
  access_token_enc   bytea not null,
  refresh_token_enc  bytea,
  expires_at         timestamptz,
  scopes             text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

create table captures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  source        text not null,        -- 'github','gcal','gdrive','onedrive','outlook','manual',...
  source_id     text,                 -- the upstream id (e.g., calendar event id)
  raw_text      text not null,
  image_caption text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table proof_cards (
  id              uuid primary key default gen_random_uuid(),
  capture_id      uuid not null references captures(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  output          jsonb not null,     -- the full LLM-output payload, schema-validated server-side
  domain          text not null,      -- denormalized for fast filter
  activity_type   text not null,
  is_public       boolean not null default false,
  public_slug     text unique,        -- generated when made public
  created_at      timestamptz not null default now()
);

create index proof_cards_user_domain_idx on proof_cards(user_id, domain, created_at desc);
create index proof_cards_public_slug_idx on proof_cards(public_slug) where is_public;
```

RLS policies:
- `users`: a user can read their own row only.
- `oauth_tokens`: a user can read their own rows only; service role reads all.
- `captures`, `proof_cards`: a user can read their own rows only;
  service role reads all; **public read of `proof_cards` is allowed
  only when `is_public = true`**.

For v0.5 the demo user is a fixed seeded row; full Supabase Auth is a
post-v0.5 follow-up.

## Consequences

### Positive

- Real OAuth means real harvesters. Drive Activity, OneDrive, Mail —
  all unblocked.
- Token refresh is the only thing standing between "ran the demo on
  Monday" and "ran the demo on Friday." Refresh logic ships day 2 so
  the rest of the week doesn't have demo-token panics.
- Encrypted-at-rest token storage matches a reasonable production
  posture from day 1 — no later migration.
- Persistence means the demo can show "look at my Proof Feed across the
  last three days" instead of just "look at this one card I just
  generated."

### Negative

- Two OAuth client configurations + a Supabase project add three places
  where a credential mistake breaks the demo. Mitigated by a
  one-line-per-secret `.env.local` + a `make doctor` health-check
  script in M7.
- Encryption key management. A lost `KINETIC_TOKEN_ENCRYPTION_KEY`
  means all refresh tokens are dead. For v0.5 the key lives in
  `.env.local` only; production will use a secret manager.

### Watch

- **Supabase free-tier limits.** 500 MB DB, 1 GB storage, 50K monthly
  active users. We're well inside that for the demo. Track row counts.
- **OAuth consent screen review.** Google and Microsoft both unverify
  apps until reviewed. Demo runs on the operator's own account, which
  bypasses the warning. Production exposure waits for verification.
- **Refresh-token rotation.** Google and Microsoft both rotate refresh
  tokens on use under some policies. Code must persist the new refresh
  token if returned, not assume immutability.

## Migration from v0

- `src/harvesters/gcal.mjs` already accepts a `GOOGLE_ACCESS_TOKEN`
  fallback. v0.5 keeps that path as a debug shortcut; the primary code
  path becomes "load from `oauth_tokens` row, refresh if needed."
- The in-memory `Map` in `web/server.mjs` gets replaced by Supabase
  queries in a single M7 commit. The HTTP interface is unchanged.

## Operator setup playbook

Three things the operator must do before M7 code can run:

1. **Google Cloud project**
   - https://console.cloud.google.com/projectcreate
   - Enable APIs: Google Calendar API, Google Drive API, Google Drive Activity API, Gmail API
   - Configure OAuth consent screen (External; testing mode is fine for v0.5)
   - Create OAuth 2.0 Client ID (Web application); add the redirect URI
     `http://localhost:5173/oauth/google/callback`
   - Capture: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

2. **Microsoft Azure App Registration**
   - https://portal.azure.com → App registrations → New registration
   - Redirect URI: Web → `http://localhost:5173/oauth/microsoft/callback`
   - API permissions (delegated): `User.Read`, `Calendars.Read`,
     `Files.Read.All`, `Mail.Read`, `offline_access`
   - Grant admin consent if available; otherwise interactive consent
     works for the operator's own account
   - Generate a client secret
   - Capture: `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`,
     `MICROSOFT_OAUTH_TENANT_ID`

3. **Supabase**
   - https://supabase.com/dashboard/new (operator has already created)
   - Run the schema above in the SQL editor
   - Capture: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`

Then generate a token encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

and stash as `KINETIC_TOKEN_ENCRYPTION_KEY` in `.env.local`.

## Alternatives Considered

### Reuse OAuth Playground style for all providers

- Cheapest path; no client registration.
- Rejected: only Google has a playground. Microsoft has no equivalent.
  Drive Activity has no playground at all.

### SQLite-on-disk for v0.5 persistence; migrate to Supabase post-hackathon

- Simpler ops; no third vendor relationship in v0.5.
- Rejected: ADR-0001's P3 already names Supabase. Doing SQLite first
  means doing Supabase second. Avoid double migration.

### One OAuth provider only (Google), skip Microsoft for the 5-day track

- Cuts a day off the build.
- Rejected: the product owner specifically wants Outlook + OneDrive.
  Half the demo "what's in my work life right now" is on Microsoft for
  many enterprise users.
