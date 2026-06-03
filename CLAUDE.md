# CLAUDE.md

Workspace guidance for Claude Code on **Kinetic (AutoPortfolio)**. The full agent
operating contract is `AGENTS.md`; governance is `HARNESS.md`. Read those for trust
tiers, scope, and stop conditions. This file is the quick orientation.

## What this is

Kinetic turns messy work artifacts into (1) admin tasks and (2) a shareable
Proof-of-Skill card, via a strict LLM JSON contract. Captures are classified on two axes
(`domain` × `activity_type`); only `domain: business` cards are public-eligible (privacy
gate). Signals can be typed or harvested (GitHub, Google Calendar/Drive/Gmail, Microsoft
Graph, …).

## Commands

```bash
npm test                 # full suite: selftest + regression + harvesters + oauth + store + m10 (+ providers)
node web/server.mjs      # run the app locally (PORT default 5173); reads .env.local
node src/regression.mjs  # LLM-contract regression (KINETIC_PROVIDER selects the provider)
```

## Conventions (do not violate without an ADR)

- **Zero runtime dependencies.** Plain Node ESM (`.mjs`), no build step, no npm runtime
  deps. `validate.mjs` is the authoritative output gate.
- **TDD.** Write the failing test, watch it fail, then implement. Tests stub
  `globalThis.fetch` to exercise network paths offline.
- **Secrets only in `.env.local`** (gitignored; template `.env.example`). Never commit or
  print secrets. OAuth tokens are AES-256-GCM encrypted at rest; the Supabase service-role
  key is server-side only.
- **Documentation is part of the change** (see `docs/operating-principles.md` §3): a
  requirements change needs a change-log entry or ADR; an architecture decision needs an
  ADR; a schema change updates `db/schema.sql` + `docs/database/migration-readiness.md`.
- **Governance.** Before committing changes to `docs/`, `harness.manifest.yaml`, or a
  companion-trigger path, run the validator chain (see `HARNESS.md`). Use the
  `harness-governance` skill.

## Trust tiers (reminder)

Default scope is Tier 2 (file edits). **Tier 4 needs explicit human authorization** —
this includes `npm install` and applying a migration to the shared Supabase project
(`apply_migration`). **Tier 5** (deploys, secrets rotation) needs authorization + the
named owner. Do not self-elevate.

## Map

- App: `web/server.mjs`, `web/public/`
- LLM: `src/providers/`, `prompts/`, `schemas/`, `src/validate.mjs`
- Integrations: `src/harvesters/`, `src/oauth/`, `src/db/`, `db/schema.sql`
- Governance/docs: `HARNESS.md`, `AGENTS.md`, `docs/` (product, project, adr, architecture,
  security, ops, testing, knowledge, superpowers)
