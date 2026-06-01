# ADR-0003: Two-dimensional categorization — domain × activity_type

**Status:** Accepted
**Date:** 2026-05-16
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** [ADR-0002](./ADR-0002-five-day-track-scope-expansion.md)

---

## Context

v0's LLM output contract had one classification field, `category`, drawn
from a closed enum of *activity types* — `build`, `fix`, `design`,
`decision`, `learning`, `collab`, `infra`, `research`, `other`. That field
works fine when the input space is "professional work."

The v0.5 expansion (ADR-0002) widens the input space to the operator's
whole life. We now need to distinguish "fixed a build issue" (a
professional `fix`) from "fixed the broken sprinkler" (a household `fix`).

Two questions need answering:

1. **Single enum or two?**
2. **What domain values are in the enum?**

## Decision

Two parallel, independent enums on every `proof_card`.

### Field 1 — `activity_type` (rename from `category`)

Unchanged value set from v0. The closed enum:

```
build | fix | design | decision | learning | collab | infra | research | other
```

The rename is the only change. Keeping `category` would have been
ambiguous once `domain` arrives — "category of what?" Renaming forces
clarity.

### Field 2 — `domain` (NEW, required)

Closed enum, exactly one per capture:

| Value | Definition |
|-------|------------|
| `business` | Work that contributes to the user's professional standing — code shipped, customer calls, designs, decisions, learning that supports the career, infrastructure / tooling work. **Default-shareable on the public Proof Feed.** |
| `personal` | Health, hobbies, friends, self-development outside career. Doctor visits. Reading non-career material. |
| `family` | Household, partner, extended family, vacations. Anniversaries. Non-child family logistics. |
| `parenting` | Specifically child-related — school, homework, child's medical, child's activities, parent–child time. |
| `financial` | Taxes, bills, investments, household financial management. May overlap with `personal` or `family`; LLM picks the most specific. |

The `domain` field is required. There is no `null` or "unknown" value —
the LLM must pick the best fit. If signal is genuinely ambiguous, the
prompt's anti-fabrication rules apply: keep the Proof card honest about
limited evidence, but still pick the most likely domain.

### Privacy contract derived from `domain`

| Domain | Default `is_public` eligible | User can override per card |
|--------|------------------------------|------------------------------|
| `business`  | Yes | Can mark private |
| `personal`  | **No** | Can opt-in publicly |
| `family`    | **No** | Can opt-in publicly |
| `parenting` | **No** | Can opt-in publicly |
| `financial` | **No** | Can opt-in publicly |

For non-business cards, the "Share publicly" UI shows an extra confirmation
step naming the domain ("This is a personal capture. Sharing it makes it
visible to anyone with the link. Continue?") before generating a public URL.

This implements the operator-persona privacy concern from
[`personas.md`](../product/personas.md): *"Shared cards inadvertently
exposing confidential client / employer detail"* extended to family /
financial detail.

## Consequences

### Positive

- Single-field classifications stay simple to render: a small pill for
  `domain` next to the existing pill for `activity_type`.
- The domain filter on the feed (`All / Business / Personal / Family /
  Financial / Parenting`) becomes a one-line WHERE clause once we move to
  Supabase.
- The wedge ("Kinetic is for professional advancement") is structurally
  enforced — non-business captures cannot accidentally end up on the
  share surface.
- Future product surfaces (a parenting log, a financial tracker) get
  their data for free once the classifier runs across years of captures.

### Negative

- The LLM now makes two classifications per capture. Slight latency
  increase (negligible — single token completion). Slight prompt-length
  increase.
- Five domain values isn't a perfect partition. `financial` can overlap
  with `family` (paying the mortgage), and `parenting` overlaps with
  `family`. We resolve by instructing the LLM to pick the most specific
  applicable label, with `parenting` more specific than `family`, and
  `financial` more specific than either when money is the dominant verb.

### Watch

- **Misclassification rate.** Sample 100 captures per week post-launch
  and track domain-correctness. >5% wrong on `business → personal` (false
  publication risk) is a P0 incident.
- **Drift toward "other".** If `activity_type: other` rate exceeds 20%,
  the type enum is incomplete and we add values.
- **Trust regression on first wrong-domain share.** A single
  `personal`-tagged item appearing publicly will be remembered. The
  per-card confirmation step is a hard requirement, not a Should.

## Schema delta (effective M8)

```diff
 "proof_card": {
   "required": [
     "id", "title", "summary", "tech_tags",
-    "category", "visual_theme",
+    "domain", "activity_type", "visual_theme",
     "narrative", "time_to_resolution_minutes", "impact_metric"
   ],
   "properties": {
+    "domain": {
+      "type": "string",
+      "enum": ["business", "personal", "family", "financial", "parenting"]
+    },
-    "category": {
+    "activity_type": {
       "type": "string",
       "enum": ["build", "fix", "design", "decision",
                "learning", "collab", "infra", "research", "other"]
     }
   }
 }
```

The mock provider, prompt template, regression set, validator, and UI all
update in lockstep in M8. Regression set grows to include at least 2
captures per domain (10 new fixtures, totaling 20 in the M8 regression
set).

## Alternatives Considered

### Combined enum (`business-build`, `parenting-collab`, …)

- One classification, no field-count growth.
- Rejected: 5 × 9 = 45 values. LLM accuracy degrades on long closed
  enums. Filter logic also needs string parsing.

### Free-text domain

- Maximum flexibility; user-defined domains.
- Rejected: open-text classification kills the privacy gate. We need a
  closed set so the "is this safe to publish" rule is deterministic.

### `is_professional: bool` instead of a 5-way enum

- Simplest possible privacy gate.
- Rejected: doesn't seed the personal-utility growth surfaces the
  product owner wants. Information loss is permanent.
