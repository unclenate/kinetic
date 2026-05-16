# ADR-0001: Stack and Initial Composition for Kinetic

**Status:** Accepted
**Date:** 2026-05-16
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** Discovery distillation of `docs/discovery/inbox/` concept doc

## Context

Kinetic is being built as a PSU hackathon entry (~72h build window) that needs to evolve
into a real product after the event. Two stack decisions need to be made up front:

1. **What stack and vendors do we commit to for v0?**
2. **Which harness composition do we mount, given that v0 is a prototype but the project
   is intended to mature?**

The seed concept doc proposed Flutter/React Native + Supabase + Gemini. The intake
questionnaire (§8) refined the runtime preference to TypeScript and the front-end to a
mobile-first PWA rather than a native packaging.

Constraints shaping the decision:
- Hackathon timebox: cannot afford yak-shaving native build toolchains.
- LLM structured output is the highest-risk dependency; vendor choice matters.
- The harness's `new-product-discovery` composition disables required-artifact
  validations, which fits a fast-moving discovery phase but should be swapped out before
  alpha hardening.

## Decision

**Stack (v0):**
- **Frontend:** Next.js (App Router) + TypeScript, deployed as a PWA on Vercel.
- **Backend:** Supabase (Postgres + Auth + Storage) with a thin orchestration layer in
  Supabase Edge Functions (or a small Node/TS route handler on Vercel) to call the LLM.
- **LLM:** Gemini API (structured outputs) as primary; Anthropic Claude as fallback for
  schema-validity dry runs and demo-day resilience.

**Composition (v0):**
- Mount `platform/compositions/new-product-discovery.yaml` as `harness.manifest.yaml`
  for the hackathon week. This deliberately disables `required-artifacts` validation so
  we can ship without artifact-completeness failures while the build is in motion.

**Composition (post-hackathon, P3):**
- Migrate to `platform/compositions/node-web-saas-postgres.yaml` and add a Supabase
  domain module (or capture the gap as a follow-up if no such module exists yet).
- This will re-enable required-artifact validation against the artifacts authored in M0.

## Consequences

### Positive

- TypeScript across the stack reduces context-switch overhead for a solo build.
- Supabase removes auth, DB, and storage friction; one vendor relationship through alpha.
- Next.js PWA satisfies the mobile-first demo requirement without native toolchains.
- `new-product-discovery` composition lets us commit early artifacts without failing
  validators while content stabilizes.

### Negative

- Vendor lock-in to Supabase and Gemini for v0. Acceptable at prototype tier; revisit
  before scaling.
- PWA capture (camera, voice) has more friction than native on iOS; acceptable for v0.
- Disabling `required-artifacts` validation removes a safety net. We compensate by
  authoring the artifacts manually in M0 and committing the migration to a full
  composition in P3.

### Watch

- Gemini structured-output reliability on multimodal inputs. If <95% schema-valid on the
  regression set, swap Claude to primary.
- Cost drift on LLM calls per capture. If average call cost exceeds $0.02 per capture
  during alpha, switch to a cheaper model tier or summarize inputs first.
- Whether a Supabase domain module exists in `auto-harness` at P3 time. If not, capture
  the gap and propose one upstream.

## Alternatives Considered

### Flutter + Firebase

- Cross-platform with native feel; tightly integrated with Google Cloud (including
  Gemini).
- Rejected for hackathon: Flutter build pipeline is heavier than the demo needs, and
  Firebase pulls us into a second vendor relationship without enough payoff for v0.

### React Native + Supabase

- Native mobile feel; same backend.
- Rejected for hackathon timebox: RN setup, signing, and TestFlight friction will eat
  demo prep time. A PWA gives us the same demo affordance with no setup.

### Self-hosted backend (Node + Postgres)

- Maximum control; no vendor lock-in.
- Rejected: ops cost is wrong shape for a hackathon. Supabase is the rational v0 trade.

### Mount a full composition (`node-web-saas-postgres`) immediately

- Forces artifact discipline from day one.
- Rejected for v0: required-artifact validation will fail intermittently while content
  is being authored, distracting from the build. Migration to a full composition is
  explicitly scheduled as a P3 entry.
