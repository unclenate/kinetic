# Design: Categorization feedback & finetuning loop (sub-project 2)

**Date:** 2026-06-04
**Author:** @unclenate (with Claude)
**Status:** Approved (operator directive: "move forward methodically") — building Phase 1
**Related:** ADR-0003 (domain × activity_type), ADR-0006 (privacy routing + encryption),
the routing spec `2026-06-04`/`2026-06-03-llm-provider-routing-design.md`.

---

## Goal

Let the operator **finetune categorization and routing** for their own mixed
business/personal data — **actively** (correct a card) and **passively** (the system
learns from corrections). The metadata hint is noisy on a mailbox that mixes work and
personal; corrections turn that noise into per-user accuracy over time.

## Why now

The operator is testing with a persona address that sees a mix of business and personal
captures, so the heuristic domain hint mis-classifies often. Without a correction path,
every mistake is permanent and the privacy routing inherits the error.

## What's already in place (Phase C)

`proof_cards` has `predicted_domain` (the LLM's output), `domain` (authoritative),
`domain_hint` (pre-LLM), `origin` (sender/source id), `residency`, and `needs_review`.
**The correction signal is `domain ≠ predicted_domain`** — no new table required for
Phase 1.

## Phases

### Phase 1 — Active correction (this build)

The primitive everything else depends on: the operator can recategorize a card.

- **Store:** `store.recategorizeCard(id, newDomain)` on both backends.
  - Sets the authoritative `domain = newDomain` (inside the stored `output.proof_card`
    too) and `needs_review = false`. **Keeps `predicted_domain`** (the model's original
    guess) as the training signal.
  - **Re-aligns encryption** if sensitivity flips: business→non-business encrypts the
    stored `output`; non-business→business decrypts it. (Sensitivity for persistence =
    `domain !== "business"`; residency is fixed at capture time, so a recategorization
    that makes a card business may leave it encrypted if it was *routed* local — we keep
    it encrypted in that case, i.e. encrypt when `newDomain !== business` OR the row was
    already local-routed. Simpler and privacy-safe: **encrypt iff `newDomain !== business`**
    for the recategorized state, matching the public-eligibility gate.)
  - Returns the updated record.
- **Server:** `POST /api/cards/:id/recategorize` body `{ domain }`. Validates `domain`
  against the closed enum (`business|personal|family|financial|parenting`). 404 on
  unknown card; 400 on bad domain. Returns the updated card.
- **UI:** a small domain `<select>` on each feed card; changing it POSTs the
  recategorization and reloads the feed (the privacy chip + filters update). (Phase 1b —
  may land in the same build if cheap.)
- **Privacy invariant preserved:** after recategorization, a now-business card can be
  made public; a now-sensitive card is encrypted and not public-eligible. The
  privacy-audit (`auditEncryption`) still holds.

### Phase 2 — Passive learning (later, own plan)

Uses the accumulated corrections (`domain ≠ predicted_domain`, keyed by `origin`):

- **Per-sender/source map:** when corrections consistently re-label a sender/source,
  record a learned mapping that the router/hint consults first (closes the
  hint-misclassification residual for known senders).
- **Few-shot prompt augmentation:** inject recent corrections as examples into the
  classification prompt so the LLM adapts to the operator's labeling.
- **Fine-tuning export:** emit the corrections as a dataset (`predicted` → `corrected`)
  for an optional fine-tune (OpenAI fine-tune or a local LoRA on Ollama).

### Active-prompt review (later)

Surface `needs_review = true` cards (uncertain `unknown` hints) for one-tap confirmation.

## Non-goals (this build)

- No learning logic yet (Phase 2). Phase 1 only captures corrections via the existing
  `domain`/`predicted_domain` divergence.
- No new table — the divergence is the dataset. A `corrections` audit table can come with
  Phase 2 if richer provenance is needed.
- No fine-tuning.

## Testing

- `store.recategorizeCard`: memory (domain updated, encrypted flag flips, predicted_domain
  preserved); supabase request-building (PATCH sets domain/needs_review; encryption flip
  reads + re-writes output_enc/output). Stubbed `fetch`.
- Server endpoint: bad domain → 400; unknown id → 404; valid → updated card (verify via a
  live or stubbed round-trip).
- Privacy-audit still green after a business→personal recategorization.

## Rollout

Phase 1 is a small, self-contained increment on `main` via a feature branch. No migration
(columns exist). Recorded in the change-log; ADR-0006 already covers the routing/encryption
basis this builds on.
