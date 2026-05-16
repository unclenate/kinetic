# Release Intent — Kinetic v0 (Hackathon Demo)

**Release:** v0 — PSU Hackathon Demo
**Growth stage:** Prototype
**Owner:** @unclenate
**Last updated:** 2026-05-16

---

## Target Outcome

After this release, a judge — or anyone we hand the demo to — can take a chaotic
input from their own day and walk away with a polished, shareable Proof-of-Skill card
in under 30 seconds. They should feel "I want this for myself" within that one
interaction.

---

## Feature Maturity

| Tier | Meaning |
|------|---------|
| Prototype | Throwaway or internal only; not suitable for real user data |
| Beta / Early Access | Real users, known rough edges; feedback is the primary goal |
| v1 / GA | Production-ready; support and reliability expectations apply |
| Internal-only | Audience is the team or company; external-facing polish not required |

**This release:** **Prototype.** Single-user demo mode, no auth, server may be manually
restarted if it hiccups, sample inputs pre-seeded so the demo can fall back if a judge's
live input misbehaves. No real user data, no retention guarantees, no SLA.

---

## Scope of This Release

Only the Must-tier items from [`requirements.md`](./requirements.md):

- **FR-001** Capture screen accepts text + image
- **FR-002** LLM call returns structured `{admin_tasks[], proof_card{}}` JSON
- **FR-003** Proof card renders polished (title, summary, tags, time-to-resolution, visual style)
- **FR-004** Admin task list renders below the card
- **FR-005** "Share" generates a public URL viewable without auth

User stories covered: US-001 through US-004.

---

## What Is Not in This Release

- Auth / multi-user (single demo user only)
- Voice transcription
- Feed view (a simple list of past captures is fine; not a TikTok-style feed)
- Regenerate
- Native mobile apps
- GitHub or Slack integration
- Analytics on shared link views

These appear in [`requirements.md`](./requirements.md) under Should or Later tiers, or
in [`mvp-scope.md`](../discovery/mvp-scope.md) under Explicitly Out of Scope.

---

## Success Signals

| Signal | How measured | Target |
|--------|-------------|--------|
| Judge-handed input produces a usable Proof card on first try | Live demo observation | Works in ≥4 of 5 demo runs |
| End-to-end capture → rendered card latency | Stopwatch during dry runs | ≤15s p95 |
| LLM structured output schema validity | Pre-demo run against 10 fixed inputs | ≥9 of 10 valid |
| Public share link loads in a fresh browser | Demo phone + private window | Loads in ≤3s |
| Judges advance Kinetic to a later judging round | Posted result | Yes |

---

## Release Checklist Reference

Not applicable for a prototype-tier hackathon demo. Pre-demo dry-run checklist will live
in `docs/ops/demo-runbook.md` if/when it's authored.
