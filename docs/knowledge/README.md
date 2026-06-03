<!--
Copyright 2026 Nate DiNiro <UncleNate@gmail.com>
SPDX-License-Identifier: MIT OR Apache-2.0
Part of auto-harness — see LICENSE-MIT and LICENSE-APACHE at repository root.
-->

# Kinetic — Knowledge Capture

**Version:** 1.0 | **Owner:** @unclenate | **Last Updated:** 2026-06-03

This directory is the project's durable, shared, reviewable surface for
institutional knowledge produced by participants — human and agent alike.
Kinetic is at **alpha** maturity: most of what lives here is build-time
learning from the v0 (1-day) and v0.5 (5-day) hackathon tracks, not yet
production operating experience. Treat the lessons as field-tested-in-a-demo,
not battle-tested-in-prod.

Three files compose it:

- `README.md` — policies and structure for this project's knowledge capture
- `shared-observations.md` — append-only structured observations (the raw log)
- `distilled-learnings.md` — curated longitudinal synthesis (durable lessons)

The two content files play distinct roles. `shared-observations.md` is the
**raw, append-only journal**: entries are written as they are noticed and are
never edited or deleted, so git history stays an honest record. `distilled-learnings.md`
is the **periodically curated digest**: durable lessons are lifted out of the
raw log, rewritten, merged, and superseded over time as understanding matures.

Agents read this README on each heartbeat to know how to behave when
contributing. Humans update this README to tune the signal/noise levers
as the project evolves.

---

## Observation Structure (FOUNDATIONAL)

**Choice:** Freeform prose with light dated headers
**Locked:** 2026-06-03 via team convention (no ADR yet — see note below)

Observations in `shared-observations.md` MUST follow this structure. Changes
to this choice require an ADR because the structure shapes all downstream
processing (distillation, escalation, review).

The existing log uses a **freeform-prose** variant: each entry opens with a
dated `## <date> — <title>` header (e.g. `## 2026-06-02 — M8: schema v0.5
migration`) and is organized by labelled paragraphs
(**Context**, **Observation**, **Implication**, and often **Action** /
**Decision**). This matched the pace of the hackathon builds — fast to write
mid-build, rich enough to distil from. No ADR has yet locked this; promoting
the choice to a formal ADR (and deciding whether to adopt the stricter
Structured Template below) is a recommended next-review item now that the
project has crossed into multi-milestone v0.5 work.

Available choices and their templates:

### Structured Template (recommended)

Each observation uses four required fields:

```markdown
### [Observation title]

- **Context:** What situation or project activity prompted this observation?
- **Observation:** What was noticed? Specific and factual.
- **Implication:** What does this suggest — for the project, team, or harness?
- **Confidence:** low | medium | high
- **Severity:** informational | governance-relevant | architectural | risk-bearing
- **Contributed by:** agent name or @handle, 2026-06-03
```

### Freeform prose

Each observation is a dated paragraph with contributor name. No required
fields. Easy to write, harder to synthesize. **This is the current choice**
(with the added convention of a dated `##` header and labelled paragraphs).

### Severity-prefixed findings

Each observation is an O-N row (O-1, O-2, etc.) with severity (C/H/M/L),
description, implication, status (Open / Acknowledged / Distilled /
Superseded). Most structured; most bureaucratic.

---

## Write Policy (ADJUSTABLE)

**Current mode:** autonomous
**Last changed:** 2026-06-03
**Rationale:** Through the v0 and v0.5 hackathon tracks the sole contributor
was @unclenate (with agent assistance) building under tight timeboxes, so
appending observations inline during the build was the right tradeoff —
capture speed mattered more than noise control, and the single-author context
kept noise naturally low. As the team grows past one, reconsider moving to
`heartbeat-only` to keep the signal-to-noise ratio healthy.

Options:

- **autonomous** — Any agent may append to `shared-observations.md` at any
  time during normal work or heartbeats. Fastest capture; highest noise risk.
- **heartbeat-only** — Agents may only append during the Knowledge
  Contribution step of their heartbeat, after dreaming has distilled their
  daily logs. Paced and reflective. Recommended default.
- **draft-to-promote** — Agents draft observations in their own daily
  memory; a human reviewer promotes entries to `shared-observations.md`.
  Highest quality; requires active curation.

Change this value when the signal-to-noise ratio warrants it. Note the
change and its rationale in the metadata above. The change itself is
governance-relevant and should produce an entry in `shared-observations.md`.

---

## Distillation Cadence (ADJUSTABLE)

**Agent drafts distilled learnings:** per-milestone (after each M-numbered milestone lands)
**Team review sessions:** at each hackathon-track boundary, or weekly once continuous development resumes
**Next scheduled review:** 2026-06-10

Agents autonomously draft proposed distilled learnings on the draft cadence.
Humans and agents review together on the review cadence, curating drafts
into `distilled-learnings.md`. The review session is also when the Write
Policy is reconsidered if needed. At alpha, the milestone cadence is
deliberate: each milestone (M7–M12 are in flight) has tended to produce at
least one durable lesson worth lifting out of the raw log.

---

## Escalation Table

When an agent appends to `shared-observations.md`, the severity of the
observation determines what else the agent must update in the same
commit. The harness enforces the floor (daily memory pointer); the agent's
judgment handles the higher tiers.

| Severity | Floor (always) | Additional (by severity) |
|---|---|---|
| informational | Daily memory file | — |
| governance-relevant | Daily memory file | Revision tracker entry |
| architectural | Daily memory file | Revision tracker + new ADR draft |
| risk-bearing | Daily memory file | Revision tracker + ADR + risk register entry |

All escalations are drafts for human review. Agents do not commit these
changes without direction.

For a concrete example of the architectural tier in practice: the
two-dimensional categorization observation (2026-06-02) rode alongside
ADR-0003 and a `docs/project/change-log.md` entry; the OAuth/Supabase
persistence work (2026-06-02) rode alongside ADR-0004. Risk-bearing items —
such as the ambiguous-domain-defaults-to-`business` privacy-gate watch item —
remain flagged in the raw log for revisit before any non-explicit publish
path ships.

---

## References

- Module definition: `platform/profiles/management/knowledge-capture/module.yaml`
- Workflow pattern: `platform/workflow/knowledge-capture-pattern.md`
- Related modules: `management/project-standard` (revision tracker),
  `delivery/production-saas` (risk register)
- Project change log: [`docs/project/change-log.md`](../project/change-log.md)
- ADR directory: [`docs/adr/`](../adr/)
