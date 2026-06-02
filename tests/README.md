# Tests — Kinetic Regression (M8: domain × activity_type)

The regression set is the LLM-contract quality gate. It measures how often the
selected provider produces schema-valid `{admin_tasks[], proof_card{}}` output
**and** assigns the correct life `domain` for a fixed, hand-curated set of
capture inputs.

The set was 10 single-axis inputs at M1; M8 (ADR-0003) grows it to 20 inputs
spanning two axes — `domain` (business / personal / family / financial /
parenting) and `activity_type` (the v0 `category`, renamed).

---

## What's here

| File | Purpose |
|------|---------|
| `regression-inputs.jsonl` | Twenty fixed captures, each with `expected_domain` + `expected_activity_type` |
| `fixtures/` | Reserved for static expected-shape fixtures (currently empty; mock provider self-validates) |

---

## Coverage of the 20 inputs

| ID | Scenario | Domain | Activity |
|----|----------|--------|----------|
| reg-01 | Bug fix (webhook 401 — canonical demo) | `business` | `fix` |
| reg-02 | Feature ship (revenue dashboard to prod) | `business` | `build` |
| reg-03 | Design review (billing auto-renew) | `business` | `design` |
| reg-04 | Customer discovery call | `business` | `collab` |
| reg-05 | Learning capture (PQ / FAISS paper) | `business` | `learning` |
| reg-06 | Refactor (auth middleware extraction) | `business` | `build` |
| reg-07 | Debugging dead-end (flaky test) | `business` | `research` |
| reg-08 | Infra migration (Postgres 13 → 16) | `business` | `infra` |
| reg-09 | Mentoring / pairing session | `business` | `collab` |
| reg-10 | **Low-signal canary** ("stuff today was hard") | `business` | `other` |
| reg-11 | Annual physical / bloodwork | `personal` | `other` |
| reg-12 | Pottery class | `personal` | `learning` |
| reg-13 | First 10k run | `personal` | `other` |
| reg-14 | Anniversary dinner planning | `family` | `other` |
| reg-15 | Fixed a broken sprinkler valve | `family` | `fix` |
| reg-16 | Filed taxes | `financial` | `other` |
| reg-17 | Rebalanced the 401k | `financial` | `decision` |
| reg-18 | Helped a child with homework | `parenting` | `collab` |
| reg-19 | Child's pediatric checkup | `parenting` | `other` |
| reg-20 | Coached kids' soccer practice | `parenting` | `collab` |

**reg-10 is the canary.** If a provider produces a confident, technology-tagged
Proof card from "stuff today was hard," it is hallucinating and we should
tighten the anti-fabrication rules in `prompts/capture-to-output.md`.

**The non-business rows are the privacy canary.** A capture like reg-15 ("fixed
the broken sprinkler") shares `activity_type: fix` with the professional reg-01,
but must classify as `domain: family`, not `business` — that distinction is what
keeps a household chore off the public Proof Feed.

---

## How to run

```bash
# Mock provider (default; no API keys, deterministic)
node src/regression.mjs

# Validator self-test (proves the validator catches bad output)
node src/validate.mjs --selftest

# Real providers (require API keys in .env.local or shell env)
KINETIC_PROVIDER=gemini node src/regression.mjs
KINETIC_PROVIDER=claude node src/regression.mjs
```

---

## Exit criteria

- **M8 gate:** for the chosen provider, **≥90%** of outputs schema-valid against
  `schemas/kinetic-output.schema.json` **AND ≥95%** with the correct `domain`.
- **Soft signal (not a gate):** `activity_type` match rate. Useful for catching
  prompt-tuning regressions, but the mock's keyword classifier intentionally
  trails the hand labels on a couple of relational captures (e.g. "helped my
  daughter"), so do not treat it as a hard number for the mock.

---

## When a regression run fails

1. Look at the first failing input — failures often cluster on one prompt weakness.
2. Try a prompt tweak first; do **not** weaken the schema to make a failing run pass.
3. If a regression input itself is broken (typo, unrealistic), fix the input and
   note it in `docs/knowledge/shared-observations.md`.
4. A wrong `domain` on a `business → non-business` direction is the low-stakes
   miss; a `non-business → business` miss is the dangerous one (false-publish
   risk) and should be treated as a P0 per ADR-0003.
5. If a provider is consistently below the gate after two iterations, switch the
   default provider per ADR-0001 (Gemini ↔ Claude) and capture the swap as a
   change-log entry.
