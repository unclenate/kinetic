# ADR-0006: Privacy-by-design LLM routing + at-rest encryption

**Status:** Accepted
**Date:** 2026-06-03
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** Spec `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md`

---

## Context

Kinetic captures span the operator's whole life (business, personal, family,
financial, parenting). The product owner wants Kinetic usable beyond the initial
career-proof case, and to control "which LLMs run and where" — explicitly under a
**Privacy by Design** bar (Cavoukian's 7 principles; GDPR Art. 25). The LLM layer
was a single provider selected by `KINETIC_PROVIDER`. Sending a personal capture
to a cloud LLM, and storing it in cloud Postgres as plaintext, is the opposite of
privacy-by-design.

## Decision

Make the LLM layer pluggable and route each capture by privacy-aware rules, with
sensitive content processed locally and stored encrypted. Delivered in three
phases.

### Phase A — pluggable providers
A provider **registry** (`src/providers/registry.mjs`) behind a unified
`process(input, opts)` contract: `mock`, `claude`, `gemini`, plus local **`ollama`**
and **`openai`**. `runProvider` validates output and retries once. `residencyOf`
classifies each provider `local` (ollama, mock) or `cloud` (openai, claude, gemini).

### Phase B — privacy-aware routing
`src/providers/router.mjs` `resolve({source, domainHint, override})` chooses the
provider per capture on **pre-LLM** signals (the `domain` comes out of the LLM, so
routing cannot use it):

- Precedence: explicit override → source-pin (`KINETIC_LOCAL_SOURCES`) → hint-rule → default.
- Hint-rule: a positive `business` signal → cloud; sensitive (`personal/family/
  financial/parenting`) or `unknown` (no positive signal) → **local**. `domain-hint`
  gained an `unknown` value so "uncertain → local" (privacy as the default) is real.
- Two server-side gates, both pre-network: **fail-closed** (sensitive + local
  provider unavailable → 503, never falls back to cloud) and **cloud-ack**
  (a sensitive capture overridden to a cloud provider without `acknowledge_cloud`
  → 400). A per-request override carries its own ack and never inherits the
  operator's forced-provider ack.
- Routing is opt-in via `KINETIC_PROVIDER=auto`; a concrete value forces that
  provider (default `mock` = the zero-setup demo).

### Phase C — at-rest encryption
Sensitive Proof cards are stored **encrypted** in Supabase (AES-256-GCM, reusing
`src/oauth/crypto.mjs` + `KINETIC_TOKEN_ENCRYPTION_KEY`). Sensitivity for
persistence = `finalDomain !== "business" OR residency === "local"` (the
authoritative final domain, widened by where inference ran). The `output` jsonb is
replaced by `output_enc` ciphertext with `encrypted = true`; the cloud DB sees
only ciphertext, and the server decrypts on read. Business cards stay plaintext
(they are public-eligible by design). Schema migration `phase_c_at_rest_encryption`
also adds feedback-readiness columns (`domain_hint`, `predicted_domain`,
`residency`, `origin`, `needs_review`) so the future feedback loop has data.
`tools/privacy-audit.mjs` asserts the invariant: every persisted sensitive card is
encrypted.

## Privacy-by-Design conformance

| Principle | How this satisfies it |
|---|---|
| 1. Proactive / preventative | Fail-closed: sensitive captures never fall back to the cloud when local is down. |
| 2. Privacy as the **default** | Sensitive **and** `unknown` (no-signal) route local; only a positive `business` signal goes cloud. |
| 3. Embedded into design | Routing + at-rest encryption live in the process pipeline and store layer, not bolted on. |
| 4. Full functionality (positive-sum) | Local inference loses no features; business still gets the stronger cloud model. |
| 5. End-to-end / full lifecycle | Sensitive `output` stored as AES-256-GCM ciphertext; the cloud DB sees only ciphertext. |
| 6. Visibility / transparency | Responses report `provider`/`residency`; the feed shows an on-device vs cloud chip; the privacy-audit asserts the invariants. |
| 7. User-centric | Per-request override; a sensitive capture to cloud requires explicit acknowledgment. |

## Consequences

### Positive
- Personal/sensitive captures are processed on-device and stored unreadable by the
  cloud DB — a genuine data-residency posture, not just a UI gate.
- The feedback-readiness columns let sub-project 2 (categorization feedback /
  finetuning) learn without a later migration.

### Negative / Watch
- **Residual risk (accepted):** routing decides before the LLM, on a heuristic
  hint. A sensitive capture mis-hinted as `business` reaches the cloud model for
  inference (at-rest encryption still applies once the LLM classifies it
  non-business). Closed only by source-pinning, the feedback loop, or Phase D
  two-pass. Documented in `docs/knowledge/shared-observations.md`.
- **Key-loss:** a lost `KINETIC_TOKEN_ENCRYPTION_KEY` now makes both OAuth tokens
  **and** encrypted card content permanently unreadable. Tracked in
  `docs/security/risk-register.md` (R-001).
- Small local models (e.g. Ollama 3B) are slow and may need the validate-retry; a
  persistent schema failure surfaces as an error (the sensitive capture is not sent
  to the cloud).

## Alternatives Considered
- **Local store for sensitive captures** (SQLite/JSON on disk), Supabase for
  business. Rejected: a second store backend + feed-merge for marginal benefit over
  encrypting in Supabase (the cloud sees ciphertext either way).
- **Drop sensitive raw content entirely** (store only metadata). Rejected: loses the
  personal Proof cards the operator wants.
- **Two-pass classify-then-route** as the default. Deferred to optional **Phase D**
  (`KINETIC_TWO_PASS`): doubles local calls for business captures; the hint +
  source-pin + feedback path is sufficient for now.

## Deferred
- **Sub-project 2** — categorization feedback / finetuning loop (own spec; columns now in place).
- **Phase D** — two-pass classify-then-route behind `KINETIC_TWO_PASS`.

## References
- [ADR-0003](./ADR-0003-two-dimensional-categorization.md) — domain × activity_type
- [ADR-0004](./ADR-0004-real-oauth-and-supabase.md) — OAuth + Supabase + token crypto
- `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md` — full design
- `src/providers/{registry,router,ollama,openai,schema-project}.mjs`, `src/db/store.mjs`
