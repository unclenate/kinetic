# Design: Passive learning — counterparty→domain map (sub-project 2, Phase 2a)

**Date:** 2026-06-05
**Author:** @unclenate (with Claude)
**Status:** Approved (operator directive: "move forward methodically")
**Related:** the Phase 1 design `2026-06-04-categorization-feedback-design.md` (§ Phase 2),
ADR-0003 (domain × activity_type), ADR-0006 (privacy routing + encryption).

---

## Goal

Make the operator's corrections *teach the system*. After Phase 1, every operator
recategorization leaves a durable signal on the card: the authoritative `domain` differs
from `predicted_domain`. Phase 2a turns that accumulating signal into a **learned
counterparty→domain map** that pre-seeds the classification hint for future captures from
the same counterparty — closing the heuristic's residual error on the operator's mixed
business/personal mailbox.

## Why this slice first

The Phase 1 spec listed three Phase 2 parts (per-sender map, few-shot prompt augmentation,
fine-tune export). The per-sender map is built first because it is the only one that is
both **immediately useful** and **privacy-safe with no migration**:

- **Few-shot augmentation** would inject corrected captures' *text* into the classification
  prompt. For a cloud provider that re-exposes potentially-sensitive content off-box — a
  privacy regression. Deferred until it can be scoped to local providers only.
- **Fine-tune export** is read-only and safe but delivers no improvement until the operator
  actually runs a fine-tune. Lower leverage now.
- **Per-counterparty map** stores only labels (a domain string → a domain category), never
  capture content, and improves classification on the very next harvest.

## The learning key (the one real design decision)

Phase 1 stores `origin = item.source_id`, which is **unique per capture** (a message id, an
event id) — useless as a learning key. The recurring signal that actually discriminates a
mixed mailbox is the **counterparty**: who the operator is corresponding with.

`gmail_sent` / `outlook_sent` already resolve recipient domains and pass them to
`combineHints`. We surface the primary counterparty domain on the capture and persist it, so
corrections can be grouped by it.

- **Email sources** (`gmail_sent`, `outlook_sent`): key = primary recipient **domain**
  (e.g. `acme.com`), lowercased. This is where the operator's mixed-mailbox pain lives.
- **Non-email sources** (`github`, `fathom`, `gcal`, `gdrive`, …): key = the harvester
  **source name** (e.g. `fathom`). Coarser, but these sources tend to a single domain
  ("all my Fathom meetings are business"), so a source-level prior is still useful.
- **No usable key** → no learned hint; fall through to the existing heuristic.

The key is namespaced to avoid collisions: `mail:acme.com` vs `source:fathom`.

## Architecture

A new pure module `src/learning/sender-map.mjs` — no I/O, fully offline-testable:

- `counterpartyKey(card)` → derives the namespaced key from a stored card's `source`
  (`source.counterparty` for email, else `source.name`), or `null`.
- `buildLearnedMap(cards, { minVotes = 2 } = {})` → from the **corrected** cards (those
  where `predicted_domain` exists and `domain !== predicted_domain`), tally
  `key → {domain: votes}`. Emit `key → domain` only when the top domain has `>= minVotes`
  and a **strict plurality** (no tie). Ambiguous/under-supported keys are omitted — a single
  stray correction never flips the prior.
- `learnedHint(map, key)` → `map[key] || "unknown"`.

Capture plumbing (minimal): `gmail_sent.mjs` / `outlook_sent.mjs` add `counterparty` (the
primary recipient domain) to each returned item. The server persists it into the existing
`source` JSON as `source.counterparty` — **no schema migration** (the column is JSON).

Store support: a narrow `store.getCorrections()` returns only the learning dataset —
`[{ domain, predicted_domain, source }]` for rows where `predicted_domain` is set and
`domain !== predicted_domain`. It deliberately does **not** read `output`/`output_enc`, so
learning never decrypts sensitive card content (unlike `listCards`). Supabase selects just
those three columns; memory returns `[]` until `predicted_domain` is mirrored there (the
no-op cold path noted under Error handling).

Server integration (`web/server.mjs`): once per harvest batch, build the learned map from
`store.getCorrections()`. For each item, resolve the effective hint with this precedence:

```
explicit per-request override  >  learnedHint(map, key)  >  provider_domain_hint (heuristic)  >  "unknown"
```

The learned hint feeds `domainHint`, which today drives the **privacy routing decision**
(`resolveRoute`: provider selection + sensitivity/encryption). This directly fixes the
"privacy routing inherits the [misclassification] error" problem called out in the Phase 1
spec — a known business counterparty now routes correctly regardless of the noisy heuristic.
No router change; we only improve the value handed to it.

**Scope boundary (honest):** `domainHint` is *not* currently passed into `runProvider`, so the
learned hint does **not** yet influence the LLM's `domain` classification (the authoritative
label / public-eligibility gate). Seeding the classifier prompt with the learned prior — so
the model itself stops mislabeling a known counterparty, closing the *categorization* loop and
not just the *routing* loop — is **Phase 2b** (it touches the shared prompt template and all
four providers + mock, with regression-determinism risk, so it earns its own TDD slice).

## Data flow

```
operator recategorizes cards  ──>  proof_cards rows where domain != predicted_domain
                                        │
harvest batch starts  ──>  store.getCorrections()  ──>  buildLearnedMap()  ──>  { "mail:acme.com": "business", ... }
                                        │
per item:  counterpartyKey(item-as-card)  ──>  learnedHint(map, key)  ──>  domainHint (if not "unknown")
                                        │
                              resolveRoute(domainHint)  ──>  runProvider  ──>  saveCard(source.counterparty)
                              (routing only this slice; classifier seeding = Phase 2b)
```

The loop closes: a correction on counterparty X biases the next capture to/from X, which (if
right) is no longer mis-routed and needs no correction.

## Privacy

The learned map holds only `{ key → domain-label }` where key is an email **domain** or a
harvester name — no addresses, subjects, or body text. It is derived in-process from rows the
server already reads; nothing new is persisted beyond `source.counterparty` (a bare domain
string). No capture content reaches the map, so no new cloud-egress or at-rest exposure.
ADR-0006's encryption and the public-eligibility gate are untouched.

## Error handling / edge cases

- Memory backend: `predicted_domain` is not stored today, so `buildLearnedMap` simply finds
  no corrections and returns `{}` (no-op). Supabase backend carries `predicted_domain`, so
  learning is live there. (A later increment can mirror `predicted_domain` into memory if we
  want offline learning in tests beyond the unit level.)
- Empty / cold start: no corrections → empty map → behavior identical to today.
- A correction that *agrees* with `predicted_domain` is not a correction and is ignored.
- `minVotes` and a `KINETIC_LEARNING_MIN_VOTES` env override let us tune sensitivity without
  a code change; default 2.

## Testing (TDD)

Unit (`tests/learning.test.mjs`, pure, no network):
- `counterpartyKey`: email card → `mail:<domain>`; non-email → `source:<name>`; missing → null.
- `buildLearnedMap`: 2 agreeing corrections → mapping emitted; 1 correction → omitted
  (under threshold); tie (1 business / 1 personal) → omitted; correction that matches
  `predicted_domain` → ignored; respects `minVotes`.
- `learnedHint`: hit → learned domain; miss → "unknown".

Harvester (`tests/harvesters.test.mjs` additions): `gmail_sent.mapMessage` /
`outlook_sent` emit `counterparty` = primary recipient domain.

Store (`tests/store.test.mjs` additions): `getCorrections` returns only rows where
`domain !== predicted_domain`; supabase request selects `domain,predicted_domain,source`
and never `output_enc` (stubbed `fetch` asserts the query); memory returns `[]`.

Server/integration: a learned mapping overrides the heuristic hint for a matching capture
(stubbed `fetch`); explicit override still beats the learned hint; privacy-audit still green.

## Non-goals (this slice)

- **No classifier-prompt seeding** — the learned prior steers routing only, not the LLM's
  `domain` output. That is Phase 2b (see Scope boundary above).
- No few-shot prompt augmentation; no fine-tune export (later Phase 2 slices).
- No new table and no migration — the divergence is still the dataset; `source.counterparty`
  rides the existing JSON column.
- No UI surface for the learned map yet (a "why was this routed here?" explainer can come
  later). The operator observes the effect through improved auto-classification.

## Rollout

Self-contained increment on `main` via a feature branch. No migration. Recorded in the
change-log; ADR-0006 already covers the routing/encryption basis. Follows the standard
spec → plan → TDD → review → ff-merge → push pipeline.
