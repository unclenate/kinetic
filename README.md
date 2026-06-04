# Kinetic (AutoPortfolio)

> An AI "black box" for your professional life: drop in a messy work artifact —
> a note, a screenshot caption, a harvested signal — and get back an organized
> **admin task** *and* a polished, shareable **Proof-of-Skill card**.

**Stage:** v0.5 — alpha (post 5-day-track build)
**Owner:** @unclenate (Nate DiNiro)
**License:** UNLICENSED (private)

Kinetic runs every capture through a strict LLM JSON contract and classifies it on
two axes — a life **domain** (`business`, `personal`, `family`, `financial`,
`parenting`) and an **activity type** (`build`, `fix`, `design`, …). Only
`business` cards are eligible for the public Proof feed — the **privacy gate**.

## Privacy by design

Kinetic's defining capability: **sensitive captures stay on your machine.** When
routing is enabled, a capture the metadata flags as non-business is processed by a
**local** LLM (Ollama) and stored **encrypted at rest** (AES-256-GCM) in the
database — the cloud sees only ciphertext. Business captures use a cloud model.
Two server-side gates enforce it: *fail-closed* (a sensitive capture never falls
back to the cloud) and *cloud-acknowledgment* (sending a sensitive capture to a
cloud model requires explicit consent). See
[ADR-0006](docs/adr/ADR-0006-privacy-by-design-routing-and-encryption.md).

## Quickstart

Zero `npm install`. Zero API keys required for the default demo. Node ≥ 18, pure ESM.

```bash
npm test                 # full suite: validator + regression + harvesters + oauth + store + m10 + providers + router
node web/server.mjs      # run the demo locally on http://localhost:5173 (mock provider, in-memory)
```

Run the LLM-contract regression against a real or local provider:

```bash
cp .env.example .env.local        # fill in keys / set OLLAMA_MODEL as needed
set -a; . ./.env.local; set +a
KINETIC_PROVIDER=claude node src/regression.mjs   # or: gemini | openai | ollama | mock
```

Enable privacy-aware routing (local for sensitive, cloud for business):

```bash
KINETIC_PROVIDER=auto node web/server.mjs         # needs Ollama running + a cloud key
```

## What's built

This is an **alpha**; the docs mark "built" vs "planned" explicitly.

- **Zero-dependency Node ESM.** No build step, no npm runtime deps. A single HTTP
  server (`web/server.mjs`) serves the UI (`web/public/`) and JSON APIs.
- **Strict LLM contract.** `schemas/kinetic-output.schema.json` + `src/validate.mjs`
  (the authoritative output gate) + a zero-dep regression harness.
- **Pluggable LLM providers** behind a registry (`src/providers/`): `mock`,
  `claude`, `gemini`, local `ollama`, `openai` — with privacy-aware routing.
- **Persistence.** Supabase Postgres (live) via a PostgREST client, with an
  in-memory fallback so the demo runs with zero infrastructure.
- **Real OAuth.** Authorization-code + PKCE (Google live; Microsoft planned) with
  OAuth tokens encrypted at rest.
- **Eight signal harvesters** (`src/harvesters/`): GitHub, Google Calendar/Drive/
  Gmail, Microsoft Calendar/OneDrive/Outlook, and a pasted-text seam.

## Documentation

The full engineering and governance documentation is organized as a navigable book.

- **Start with the [documentation reading guide](docs/README.md)** — a goal-based
  index and the accessibility statement.
- **[Table of contents](SUMMARY.md)** — the complete navigation.
- Jump straight to the [Architecture Overview](docs/architecture/overview.md), the
  [Decision Records](docs/adr/ADR-0001-stack-and-composition.md), the
  [Milestones](docs/project/milestones.md), or the
  [Test Strategy](docs/testing/test-strategy.md).

Governance is enforced by the [auto-harness](https://github.com/unclenate/auto-harness)
platform mounted at [`.harness/`](.harness/); see [`HARNESS.md`](HARNESS.md) and
[`AGENTS.md`](AGENTS.md) for the rules of the project.

## Project status

All planned milestones (M0–M12) and the privacy-by-design provider work (Phases
A–C) have shipped. Current detail and history live in
[Milestones](docs/project/milestones.md) and the
[Change Log](docs/project/change-log.md).
