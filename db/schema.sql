-- db/schema.sql
-- Kinetic v0.5 (M7) Supabase schema. Run in the Supabase SQL editor.
-- Derived from ADR-0004, with two intentional, documented deviations:
--   1. *_enc columns are `text` (base64 AES-256-GCM blobs) instead of `bytea`.
--      Reason: base64 text round-trips through PostgREST cleanly without bytea
--      hex-encoding friction. No security difference — the bytes are encrypted
--      before they reach the column either way.
--   2. proof_cards carries a single `slug text unique` used for BOTH the
--      internal card id and the public URL, gated by `is_public`. ADR's
--      `public_slug` (only-when-public) is folded into this. Keeps the server's
--      short-id URL model identical between the in-memory and Supabase backends.

create extension if not exists "pgcrypto";

create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz not null default now()
);

-- Seeded demo user for v0.5 (full Supabase Auth is post-v0.5). Matches the
-- default KINETIC_DEMO_USER_ID in src/oauth/token-store.mjs.
insert into users (id, email)
values ('00000000-0000-0000-0000-000000000001', 'demo@kinetic.local')
on conflict (id) do nothing;

create table if not exists oauth_tokens (
  user_id            uuid not null references users(id) on delete cascade,
  provider           text not null check (provider in ('google','microsoft','github')),
  access_token_enc   text not null,        -- base64 AES-256-GCM
  refresh_token_enc  text,                 -- base64 AES-256-GCM (nullable)
  expires_at         timestamptz,
  scopes             text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists captures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete cascade,
  source        text not null,             -- 'github','gcal','gdrive','onedrive','outlook_sent','manual',...
  source_id     text,                      -- upstream id (e.g. calendar event id)
  raw_text      text not null,
  image_caption text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists proof_cards (
  id             uuid primary key default gen_random_uuid(),
  capture_id     uuid references captures(id) on delete cascade,  -- nullable: typed captures may skip the captures row in v0.5
  user_id        uuid references users(id) on delete cascade,
  slug           text unique not null,     -- short id used by /proof/:slug and /api/cards/:slug
  output         jsonb not null,           -- full LLM payload, schema-validated server-side
  domain         text not null,            -- denormalized for fast filtering
  activity_type  text not null,
  provider       text,                     -- LLM provider that generated the card
  source         jsonb,                    -- harvester provenance, when applicable
  is_public      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists proof_cards_user_domain_idx on proof_cards(user_id, domain, created_at desc);
create index if not exists proof_cards_public_slug_idx on proof_cards(slug) where is_public;

-- Row Level Security ------------------------------------------------------
-- The server uses the service role key, which bypasses RLS. These policies
-- matter once anon/auth'd client access is added (post-v0.5). The one that
-- matters now: public read of a Proof card ONLY when is_public = true.
alter table users        enable row level security;
alter table oauth_tokens enable row level security;
alter table captures     enable row level security;
alter table proof_cards  enable row level security;

drop policy if exists proof_cards_public_read on proof_cards;
create policy proof_cards_public_read
  on proof_cards for select
  using (is_public = true);
