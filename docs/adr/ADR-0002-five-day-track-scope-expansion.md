# ADR-0002: Scope expansion to the 5-day hackathon track

**Status:** Accepted
**Date:** 2026-05-16
**Author:** @unclenate
**Reviewers:** @unclenate
**Context source:** Conversation 2026-05-16, post-v0 submission

---

## Context

The 1-day hackathon submission (Kinetic v0) shipped on 2026-05-16 — see
[`SUBMISSION.md`](../../SUBMISSION.md) and the M0–M5 milestone block in
[`milestones.md`](../project/milestones.md). The same project is being
submitted to a separate **5-day track** of the same event with a deadline
of **2026-05-21**. This gives us five working days from the v0 submission
to ship a significantly larger surface.

The product owner wants:

1. **More signal sources.** Beyond GitHub + Google Calendar:
   - Microsoft 365 Calendar (Outlook / Graph)
   - Google Drive file activity
   - OneDrive / SharePoint file activity
   - Outbound email metadata (Gmail + Outlook)
   - Meeting notes / call recordings (via whichever provider exposes them)
2. **Cross-domain categorization.** Captures should be tagged by life
   *domain*: business, personal, family, financial, parenting.
3. **Professional wedge preserved.** Even though the harvest surface now
   spans the user's whole life, the public Proof Feed and the shared
   marketing surface stay professional. Non-business captures are private
   utility for the user.

This is a P3-shaped expansion (per ADR-0001) arriving early because the
5-day track justifies the investment now rather than post-hackathon.

## Decision

Spin up a new **v0.5** release within the same repository, scoped to the
5-day track, with explicit non-v0 milestones (M6–M12). v0 stays frozen as
the 1-day submission record.

The v0.5 expansion covers:

- **Real OAuth** for Google and Microsoft (replacing the OAuth Playground
  shortcut from ADR-0001). Details in ADR-0004.
- **Supabase persistence** (replacing the in-memory store from M2/M3).
  Same ADR-0004.
- **Two-dimensional categorization** (domain × activity_type) baked into
  the LLM contract. Details in ADR-0003.
- **Additional harvesters**: Microsoft Graph Calendar, Google Drive
  Activity, OneDrive activity, Gmail sent-items, Outlook sent-items.
- **Multi-domain UX**: domain filter tabs on the feed, privacy default
  rule that only `domain: "business"` cards are eligible for the public
  share surface.

## Consequences

### Positive

- Five days is enough to do real OAuth properly. The playground-token
  shortcut was right for an hour, wrong for a week.
- Cross-domain capture turns Kinetic into a daily-use product, not just
  a career-update tool. The retention story strengthens dramatically.
- The categorization gate enforces the wedge: domain classification
  prevents non-business captures from leaking onto a public Proof Feed
  by accident.
- v0.5's harvesters all flow through the same `harvest()` contract
  defined in M6 of the v0 build. No architectural break.

### Negative

- OAuth flows for two separate providers eat a meaningful chunk of day 2.
  Mitigation: write a single OAuth-coordinator module that both providers
  plug into; reuse the same refresh-token storage shape.
- Supabase introduces a third vendor relationship (Anthropic, Google,
  Microsoft, plus Supabase, plus Vercel for deploy). Acceptable for
  alpha; revisit before scale.
- Multi-domain UI doubles design surface area. We mitigate by shipping a
  single-tab "Business" view first and only expose other domains in the
  filter once the schema lands cleanly.

### Watch

- **Token leakage:** real refresh tokens are long-lived. Encrypt at rest
  in Supabase; never log; rotate the encryption key periodically.
- **Domain classification accuracy:** if Claude/Gemini miscategorize even
  5% of captures, a single "Personal" item on a shared feed is a trust
  incident. We add a per-card visibility override and a "what's about to
  be public" review step before the first share.
- **Scope creep across domains.** Family/parenting/financial are
  acknowledged but explicitly Later-tier for feature work. They exist
  in v0.5 only as classification targets, not as first-class product
  surfaces.

## Alternatives Considered

### Stay on v0 architecture and just bolt on Microsoft + Drive

- Cheap; ships fast.
- Rejected: in-memory storage + playground tokens + single-dimension
  categorization stack up to a fragile demo. A 5-day track invites real
  judging — judges can ask "what happens when I restart your server?"
  and we need a real answer.

### Defer Supabase to post-hackathon; use a local SQLite file

- Simpler ops; no third vendor.
- Rejected: ADR-0001 already committed to Supabase as the P3 target.
  Going SQLite-first means a second migration later. Five days is enough
  to do Supabase once.

### Single-dimension categorization with "professional" / "non-professional"

- Simpler schema; one binary classification.
- Rejected: doesn't give us the personal-utility growth story (financial
  tracker, parenting log) the product owner wants as feature seeds.
- Five domain values is small enough for the LLM to pick reliably and
  big enough to anchor future features.

## Migration

- v0 cards in the in-memory store are lost on restart anyway — no data
  migration needed.
- The schema rename (`category` → `activity_type`) is a one-shot edit
  in M8. Regression set updated in the same commit.
- Existing harvesters (`github`, `gcal`, `calendar`) stay functional
  through the v0.5 build; they just gain optional `domain` hinting.

## References

- [ADR-0001](./ADR-0001-stack-and-composition.md) — Stack baseline
- [ADR-0003](./ADR-0003-two-dimensional-categorization.md) — Domain × type
- [ADR-0004](./ADR-0004-real-oauth-and-supabase.md) — OAuth + persistence
- [`docs/project/milestones.md`](../project/milestones.md) — M6–M12 detail
