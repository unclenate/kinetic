# Design: Pluggable LLM providers + privacy-by-design routing

**Date:** 2026-06-03
**Author:** @unclenate (with Claude)
**Status:** Approved — proceeding to implementation plan (sub-project 1 of 2)
**Related:** ADR-0003 (domain × activity_type), ADR-0004 (OAuth + Supabase),
M9 `provider_domain_hint`. Will be recorded as **ADR-0005** on implementation.

---

## Goal

Make the LLM layer pluggable (local **Ollama** + **OpenAI** alongside the
existing Claude/Gemini/mock) and route each capture to a provider by
**privacy-aware rules**, while genuinely satisfying **Privacy by Design**
(Cavoukian's 7 principles / GDPR Art. 25 "data protection by design and by
default"). Captures the metadata flags as sensitive are processed locally and
stored encrypted; the operator can still override per request.

This is a platform expansion beyond the v0.5 hackathon scope — the product
owner wants Kinetic usable for utilities beyond the initial career-proof case,
and "I control which LLMs run and where" is the enabling capability.

## Non-goals (YAGNI)

- No routing-rule DSL/config file — just the sensitive/business split + override.
- Only Ollama + OpenAI added now (Claude/Gemini refit; others are ~40-line
  modules later).
- No separate local datastore — sensitive data is encrypted in Supabase
  (chosen over a second store backend).
- No multi-account work here (tracked separately).
- **No feedback/finetuning logic here** — this build only *captures the signals*
  (predicted vs hint, source, sender, residency, needs_review). The active/passive
  correction + learning loop is **sub-project 2** with its own spec.

## Privacy-by-Design conformance

| Principle | How this design satisfies it |
|---|---|
| 1. Proactive / preventative | Fail-closed: a sensitive capture is never sent to the cloud as a fallback when local is down. |
| 2. Privacy as the **default** | Sensitive **or uncertain/unknown** `domain_hint` routes to **local**. Only an explicit `business` hint goes cloud. |
| 3. Embedded into design | Routing + at-rest encryption live in the process pipeline and store layer, not bolted on. |
| 4. Full functionality (positive-sum) | Local inference loses no features; business still gets the stronger cloud model. |
| 5. End-to-end / full lifecycle | Sensitive `raw_text` + `output` stored as AES-256-GCM ciphertext; cloud DB sees only ciphertext. |
| 6. Visibility / transparency | Each result reports `residency` (local/cloud), `provider`, `model`; privacy-audit asserts the invariants. |
| 7. User-centric | Per-request override; sending a sensitive capture to cloud requires explicit acknowledgment. |

## Architecture

### 1. Provider registry — `src/providers/registry.mjs`
- `getProvider(name)` → module; `listProviders()`; `isAvailable(name)` (Ollama
  reachable / API key present); `residencyOf(name)` → `"local" | "cloud"`
  (ollama=local; openai/claude/gemini=cloud; mock=local).
- **Unified interface:** every provider exports
  `async process(input, opts) → { admin_tasks, proof_card }` (schema-valid).
  `opts = { model? }`.

### 2. Providers — `src/providers/*.mjs`
- `mock.mjs` (existing) — accepts `(input, opts)`, ignores opts.
- `claude.mjs`, `gemini.mjs` (refit) — accept `opts.model`.
- `openai.mjs` (new) — Chat Completions, `response_format:
  { type: "json_schema", json_schema: { name, schema: projectStrict(SCHEMA), strict: true } }`.
  Env: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- `ollama.mjs` (new) — `POST {OLLAMA_BASE_URL}/api/chat`, `stream:false`,
  `format: projectStrict(SCHEMA)` (Ollama structured outputs). Env:
  `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL`.
- Shared concerns:
  - Prompt from `prompts/capture-to-output.md` with the schema inlined.
  - `validate()` (existing) is the **authoritative** gate.
  - **One retry** on invalid output, re-prompting with the validation errors,
    so a weaker local model can converge.
- `src/providers/schema-project.mjs` — `projectStrict(schema)` returns a
  structured-output-safe projection: keep `type/enum/required/properties/
  additionalProperties/items`; drop `pattern/minLength/maxLength/minimum/
  maximum/format`. The full schema still validates the *result*.

### 3. Router — `src/providers/router.mjs`
`resolve({ source, domainHint, override }) → { provider, model, residency }`

Precedence (first match wins):
1. **Override** — `override.provider` (+ `override.model`) from the request body
   / UI. A sensitive capture (pinned-local or sensitive/unknown hint) sent to a
   **cloud** provider via override requires `acknowledge_cloud: true`.
2. **Source pin** — if `source` is in the always-local set → **local**. Pins a
   known-personal source (e.g. a personal mailbox the operator marks personal)
   to local regardless of hint. Config: `KINETIC_LOCAL_SOURCES` (comma list of
   source names); later, a connected account flagged "personal" pins its
   harvests. Closes the hint-misclassification gap for sources you trust to be
   personal.
3. **Routing rule** (privacy-as-default):
   - `domainHint ∈ {personal, family, financial, parenting}` → local provider.
   - `domainHint === "unknown"` (no positive signal) → **local** (private default).
   - `domainHint === "business"` (a *positive* business signal) → cloud provider.
4. **Defaults:** `KINETIC_LOCAL_PROVIDER` (default `ollama`),
   `KINETIC_CLOUD_PROVIDER` (default `claude`). `KINETIC_DEFAULT_PROVIDER`
   (default `mock`) is used by the regression harness and when neither
   local nor cloud is configured.

`residency` is `residencyOf(chosen provider)`.

**Hint refinement (required for privacy-as-default).** Today `domain-hint.mjs`
defaults to `"business"` when no keyword/email signal matches — but "no sensitive
signal" is *uncertain*, not *confirmed business*. To make uncertain→local real,
`hintFromKeywords` / `combineHints` gain a third value `"unknown"` returned when
there is no positive signal (an org email domain is still a positive `business`
signal; bare absence of personal keywords is `unknown`). This is **routing-only**
and does not change the LLM's final `domain` classification (which still defaults
to `business` per the 2026-06-02 operator decision). The stored
`provider_domain_hint` on harvested items adopts the same `unknown` value.

### 4. Fail-closed enforcement (process pipeline)
A capture is **sensitive** when `domainHint !== "business"` (i.e. routed local).
- If sensitive and the resolved local provider `isAvailable()` is false →
  **do not fall back to cloud**. Return `503 { error: "local provider
  unavailable", held: true }`. The capture is not processed or persisted.
- An explicit override to a cloud provider bypasses fail-closed **only** with
  acknowledgment (below).
- Business + cloud provider unavailable → `503` (no silent mock fallback).

### 5. Encrypted-at-rest for sensitive persistence (store layer)
Reuse `src/oauth/crypto.mjs` (AES-256-GCM, `KINETIC_TOKEN_ENCRYPTION_KEY`).

**Sensitivity for persistence** = `finalDomain !== "business"` **OR**
`residency === "local"`. This conservative union means: anything the LLM
classifies as non-business is encrypted, *and* anything that was routed locally
(sensitive/unknown hint) is encrypted even if the local model ultimately tagged
it `business`. The basis is the **final** LLM `domain` (authoritative) widened by
residency, not the pre-LLM hint alone.

- On save, if the capture is sensitive (per the rule above):
  store `output` and `raw_text` as **ciphertext** in new `*_enc` columns; the
  plaintext `output` jsonb / `raw_text` columns are `null`; set
  `encrypted = true`. Denormalized `domain`, `activity_type`, `created_at`,
  `is_public`, `slug` stay in clear (needed for filtering; non-identifying).
- On read, the server decrypts (it holds the key) for display to the operator.
  The cloud DB only ever stores ciphertext for sensitive content.
- Business cards are **not** encrypted (they're public-eligible by design).
- Memory backend mirrors the flag for parity but holds plaintext in-process.

Schema delta (applied via Supabase MCP `apply_migration`):
```sql
alter table proof_cards add column if not exists output_enc text;
alter table proof_cards add column if not exists encrypted boolean not null default false;
alter table proof_cards alter column output drop not null;
alter table captures   add column if not exists raw_text_enc text;
alter table captures   add column if not exists encrypted boolean not null default false;
alter table captures   alter column raw_text drop not null;
```

### 6. Transparency / residency
- `/api/process` and `/api/harvest` responses include
  `{ provider, model, residency }` per card.
- UI: a small residency chip on each feed card (`🔒 local` / `☁ cloud`).
- `tools/privacy-audit.mjs` extends to also assert: **every sensitive
  (non-business) persisted card has `encrypted = true`** (no plaintext sensitive
  content in cloud), in addition to the existing public⇒business check.

### 7. User-centric override
- Request body `{ provider, model }` overrides routing.
- If an override would send a **sensitive** capture to a **cloud** provider, the
  request must include `acknowledge_cloud: true`; otherwise `400 { error:
  "sensitive capture to cloud requires acknowledgment" }`. The UI surfaces a
  warning modal (reusing the share-confirmation pattern).

### 8. Config (`.env.example` additions)
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
KINETIC_LOCAL_PROVIDER=ollama
KINETIC_CLOUD_PROVIDER=claude
KINETIC_DEFAULT_PROVIDER=mock
KINETIC_LOCAL_SOURCES=          # comma list of sources always routed local
KINETIC_TWO_PASS=false          # Phase D: classify locally first, then route
```

### 9. Integration points
- `web/server.mjs`
  - `handleProcess`: `domainHint = hintFromKeywords(text)`; `router.resolve(...)`
    with body override; enforce fail-closed + override-ack; `provider.process`;
    persist (encrypt if sensitive); respond with residency.
  - `handleHarvest`: per item, `domainHint = item.provider_domain_hint`; same
    resolve → process → persist.
  - Startup no longer binds a single provider; the registry resolves per call.
- `src/regression.mjs`: route through the registry; `KINETIC_PROVIDER` still
  selects a single provider (incl. `ollama`/`openai`) for measurement.
- `src/db/store.mjs`: `saveCard` / `getCard` / `listCards` honor the
  `encrypted` flag (encrypt on write, decrypt on read) for both backends.

## Data flow
```
capture
  → domainHint (pre-LLM: hintFromKeywords or harvester hint)
  → router.resolve({source, domainHint, override}) → {provider, model, residency}
  → [fail-closed check; override-ack check]
  → provider.process(input, {model})  → validate() (retry once)
  → store.saveCard(..., {sensitive})   → encrypt output/raw_text if sensitive
  → respond { id, provider, model, residency }
```

## Feedback readiness (forward-compatibility for sub-project 2)

The categorization-feedback / finetuning loop is **sub-project 2** (its own
spec). It will let the operator correct routing/categorization **actively**
(confirm/recategorize an uncertain card) and **passively** (the system learns —
per-sender maps, few-shot prompt augmentation, eventually fine-tuning). This is
essential for a mixed business/personal persona mailbox where hints are noisy.

To avoid a later migration, **this build persists the learning signals** on each
card so corrections have something to learn from:
- `predicted_domain` (the LLM's output domain), `domain_hint` (pre-LLM),
  `source`, `residency`, and `sender` / origin identifier when available
  (e.g. the email `from`/`to` domain for mail sources).
- A nullable `needs_review boolean` (set when hint was `unknown`) so the UI can
  surface uncertain captures for active confirmation.

Schema additions for forward-compat (small, additive):
```sql
alter table proof_cards add column if not exists domain_hint    text;
alter table proof_cards add column if not exists predicted_domain text;
alter table proof_cards add column if not exists residency      text;
alter table proof_cards add column if not exists origin         text;  -- sender/source id
alter table proof_cards add column if not exists needs_review   boolean not null default false;
```
Sub-project 2 then adds the `corrections` table, the recategorize endpoint +
UI, the learned per-sender map, and the prompt few-shot/fine-tune pipeline.
**No feedback logic is built in this sub-project** — only the data capture.

## Testing strategy
**Offline (no network / stubbed `fetch` / pure):**
- `router.resolve` precedence + privacy-as-default + residency.
- `projectStrict` drops unsupported keywords, keeps shape.
- `openai` / `ollama` request-building + response-parse + retry-on-invalid (stubbed fetch).
- store: sensitive save writes ciphertext (no plaintext in the row), read round-trips.
- fail-closed: sensitive + local unavailable → held, not sent to cloud.
- override-ack: sensitive→cloud without ack rejected; with ack allowed.
- privacy-audit: flags a sensitive card persisted unencrypted.

**Live:**
- Ollama against the operator's local stack — real end-to-end capture.
- OpenAI if `OPENAI_API_KEY` is set.

## Rollout / milestone
- New milestone **M13 — Pluggable providers + privacy-by-design routing**;
  record **ADR-0005** summarizing the routing + at-rest-encryption decision.
- Schema migration applied to the live Supabase project via MCP.
- `.env.example`, `db/schema.sql`, milestones, change-log, shared-observations updated.

## Open questions / risks
- **Key management:** sensitive-data encryption reuses
  `KINETIC_TOKEN_ENCRYPTION_KEY`. A lost key makes sensitive cards unreadable.
  Acceptable for v0.5; production wants a managed key + rotation. (Documented.)
- **Local model quality:** small Ollama models may need the retry; if they
  still fail schema validation, that capture errors (sensitive → not sent to
  cloud). Surface clearly.
- **Feed for encrypted cards:** the operator-facing server decrypts for display;
  there is no anon/public access to sensitive cards (they're never public).
- **Residual risk of hint-based routing (mitigated, with a planned closer):**
  routing decides *before* the LLM runs, on a heuristic hint. A genuinely
  sensitive capture that the hint mis-reads as `business` would be sent to the
  **cloud** model for inference. Mitigations in this build: hint errs toward
  `unknown`→local on absence of signal; **source-pinning** forces trusted-personal
  sources to local regardless of hint; the **feedback loop** (sub-project 2)
  learns per-sender corrections so a mixed mailbox converges. **Two-pass**
  (classify locally first, then route the full generation) is the definitive
  closer and is a **planned optional addition (Phase D)** — enabled by a config
  flag for users who want the strongest guarantee at the cost of an extra local
  call on business captures.
- **Scope / phasing:** this spec is **sub-project 1** of two (sub-project 2 =
  categorization-feedback/finetuning loop, separate spec). Plan phases:
  - **A** — registry + unified interface + Ollama/OpenAI + schema-project + regression.
  - **B** — router (override → source-pin → hint-rule → default) + fail-closed +
    residency + override-ack.
  - **C** — at-rest encryption + schema migration (incl. feedback-readiness
    columns) + privacy-audit extension + UI residency chip.
  - **D** (optional) — two-pass classify-then-route behind `KINETIC_TWO_PASS`.
  Each phase is independently testable; Phase A is verifiable live against the
  operator's local Ollama.
