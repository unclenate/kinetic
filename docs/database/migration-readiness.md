<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Migration Readiness — Kinetic (AutoPortfolio)

> Owner: @unclenate (Nate DiNiro)
> Last updated: 2026-06-03

This document records the team's migration discipline: how migrations are authored,
reviewed, tested, and rolled back. It is a required artifact for any project using
the `relational-postgres` data module.

> **Maturity note (alpha):** Kinetic is a single-operator, alpha-stage project on
> one Supabase project (ref `wdjktkfeqaainzartztx`, us-east-1, Postgres 17). There
> is **no local migration CLI** and there are no separate staging/production
> Postgres instances yet. Schema changes are applied directly to the one remote
> project via the Supabase MCP `apply_migration` tool. `db/schema.sql` is the
> human-readable source of truth and is written to be idempotent
> (`create ... if not exists`, `insert ... on conflict do nothing`).

---

## Migration Tooling

| Property | Value |
|----------|-------|
| Migration framework | Supabase MCP `apply_migration` (no local migration CLI; no node/npm tooling — project is zero-dependency) |
| Migration directory | `db/` (canonical schema in `db/schema.sql`; applied SQL is recorded by Supabase's migration history) |
| Run command (up) | Supabase MCP `apply_migration` with the SQL statement(s); ad-hoc reads/checks via `execute_sql` |
| Run command (down) | None automated — there is no down/rollback tool. Reversal is a hand-written compensating migration applied via `apply_migration` |
| Status command | Supabase MCP `list_migrations` (and `list_tables` to confirm applied state) |

---

## Migration Discipline

### Authoring Rules

- New schema is added to `db/schema.sql` first (idempotent form), then applied via
  `apply_migration` so the file and the live project stay in sync.
- Every migration should have a corresponding compensating (down) migration
  written by hand; there is no automated rollback.
- Migrations are backward-compatible unless explicitly flagged and reviewed.
- Data migrations (backfills, transforms) are kept separate from schema
  migrations.
- No destructive operations (`DROP TABLE`, `DROP COLUMN`) without an ADR.
- **Documented deviations from ADR-0004** are intentional and must be preserved
  by any migration touching these tables:
  - `*_enc` columns are `text` (base64 of the AES-256-GCM blob), **not** `bytea`
    — chosen so ciphertext round-trips cleanly through PostgREST.
  - `proof_cards` uses a single `slug text unique` for both the internal card id
    and the public URL (gated by `is_public`), instead of ADR-0004's separate
    `public_slug`.
  - `proof_cards.capture_id` is **nullable** (typed captures may skip the
    `captures` row in v0.5).

### Review Requirements

- All migrations require code review before merge.
- Destructive or data-altering migrations require @unclenate sign-off (sole owner
  on this alpha project).
- Migrations that affect indexes on large tables require performance review.
  Current indexes: `proof_cards_user_domain_idx` on
  `(user_id, domain, created_at desc)` and the partial
  `proof_cards_public_slug_idx` on `(slug) where is_public`.
- Any change to RLS policies is security-sensitive: the
  `proof_cards_public_read` policy (`select` where `is_public = true`) is the one
  policy that becomes load-bearing once non-service-role client access is added.

### Testing

- The server's in-memory store backend lets the full capture → persist → share
  path be exercised with **zero database**, so application logic is validated
  before any migration is applied.
- Up migrations are validated by applying them to the single Supabase project and
  confirming with `list_tables` / `execute_sql`. There is currently **no copy of
  production schema** to test against, and **no automated down migration** to
  test — this is an acknowledged alpha gap.
- Migration test command: none yet (no migration test harness exists). The
  closest automated check is the LLM-contract regression suite:
  `node src/regression.mjs`.

---

## Rollback Policy

| Scenario | Action |
|----------|--------|
| Schema migration failed mid-apply | Inspect with `list_tables` / `execute_sql`; because `db/schema.sql` is idempotent, re-applying the corrected statements is generally safe |
| Schema migration succeeded but app broken | Apply a hand-written compensating migration via `apply_migration`; revert the corresponding `db/schema.sql` change |
| Data migration produced incorrect results | Execute a corrective migration via `apply_migration` and document it in an incident note |
| Irreversible migration (acknowledged) | Must be flagged in the PR, approved by @unclenate, and carry a forward-fix plan (there is no automated down path) |

---

## Environment-Specific Notes

| Environment | Migration policy |
|-------------|-----------------|
| Local | No local Postgres/migration CLI. App runs against the in-memory store by default; set `SUPABASE_URL` to target the shared project. Schema is read from `db/schema.sql` |
| Staging | None today — there is no separate staging Postgres instance (alpha) |
| Production | The single Supabase project doubles as the live environment. Migrations are applied via Supabase MCP `apply_migration` with @unclenate authorization; back up `KINETIC_TOKEN_ENCRYPTION_KEY` out-of-band, since losing it makes stored OAuth tokens unrecoverable |

---

## Companion Rule

Changes to the migration directory (`db/`, primarily `db/schema.sql`) trigger a
companion rule requiring this file to also be updated in the same PR. This ensures
migration documentation stays current with the actual schema, including the
documented deviations from ADR-0004.
