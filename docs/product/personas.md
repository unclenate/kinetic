# User Personas — Kinetic

**Project:** [`docs/product/problem-statement.md`](./problem-statement.md)
**Intake source:** [`docs/discovery/intake-questionnaire.md`](../discovery/intake-questionnaire.md) §3
**Owner:** @unclenate
**Last updated:** 2026-05-16 (v0.5 refresh — cross-domain context added)

---

## Primary Persona — "Maya, the Mid-Career Engineer (+parent)"

**Role / context:** Senior software engineer, 6–10 years experience, at a Series B–C
startup or mid-sized tech company. Ships code most days, leads design reviews, mentors
juniors, occasionally talks to customers. **Lives a mixed-vendor work day** —
Google Workspace at home, Microsoft 365 at the office, GitHub for code,
Slack/Teams for chat. Off-hours she's juggling kids' homework blocks, family
logistics, and the household financial running list.

**Goals:**

- Be recognized and rewarded for what she actually contributes.
- Move toward staff/principal track *or* keep optionality open for a founding-team move.
- Spend zero meaningful time "managing her career" outside of the work itself.

**Frustrations:**

- Last LinkedIn update was 14 months ago. Resume is older than that.
- Promotion packets feel like reconstructing memory from Slack archeology.
- "Brag docs" in Notion always start strong, then die after week two.
- Recruiters keep pinging her with roles that don't match what she's actually been doing.
- Her work life isn't on one platform. Half her meetings are on Google Cal,
  half on Outlook; design docs live in Drive *and* OneDrive depending on the
  client. Career-tracking tools assume a single-vendor stack she doesn't have.
- The same calendar that has her customer call also has "Pickup Aiden from
  soccer." She doesn't want a productivity tool that pulls everything into a
  career feed; she wants it to *know the difference*.

**Success criteria for this product:**

- Captures something on most workdays without consciously "doing portfolio work."
- Has a shareable link she'd actually send to a manager or recruiter.
- The thing the AI writes sounds like her enough that she doesn't need to rewrite it.
- Connects Google + Microsoft + GitHub in under 5 minutes total, never has
  to reconnect during a typical week.
- **Trusts the privacy gate completely.** Sees on day one that the parenting
  and family captures never appear on her public Proof Feed. Confidence in
  the domain classification is what turns Kinetic from "a career app I'm
  cautious about" into "the app I keep on for everything."

**Quoted voice:**

> "I'll have shipped three meaningful things this quarter and not be able to name any
> of them in standup three weeks later. I need something that just remembers for me."

---

## Secondary Persona — "Devon, the Recipient"

**Role / context:** Engineering manager, hiring manager, or client receiving a shared
"Proof Feed" link from a candidate, direct report, or contractor.

**Goals:**

- Quickly verify what the sender actually did — beyond bullet points.
- Form a credible opinion in under 90 seconds.

**Relationship to primary persona:** Devon is a passive consumer of what Maya produces.
He becomes a candidate Kinetic user when he realizes he wants the same artifact for
himself.

**Success criteria:**

- The shared link loads instantly, looks credible, and shows substance (technologies,
  metrics, context) — not just a slogan.
- He can imagine using it himself within the first session.

---

## Operator / Admin Persona — "@unclenate, the Builder"

**Role:** Sole maintainer through hackathon and alpha.

**Responsibilities:**

- Monitor AI output quality (drift, hallucinated tech tags, off-tone copy).
- Observe capture-to-share funnel and intervene when it stalls.
- Maintain feed safety (no PII leakage in shared cards).

**Concerns:**

- AI fabricating skills the user didn't actually demonstrate (credibility kill).
- Shared cards inadvertently exposing confidential client / employer detail.
- **Domain-classification false positive** — a `personal`, `family`, or
  `parenting` capture mis-labeled `business` ending up on a public Proof
  Feed. The per-card confirmation step (ADR-0003) is a hard requirement
  from this concern.
- OAuth refresh-token loss or leak (encrypted at rest per ADR-0004).
- Cost drift on LLM calls per user (more sources = more calls).

---

## Out-of-Scope Personas

| Persona | Why out of scope |
|---------|----------------|
| Active job-seekers wanting a polished resume builder | Different artifact (one-page resume) and different success criteria; bolted onto Kinetic later, not v1 |
| Non-technical workers whose evidence isn't easily captured digitally (trades, in-person service) | Capture pipeline (screenshots, code, commit logs) does not match their primary work artifacts |
| Enterprise HR or performance-review buyers | Different buyer, different compliance and integration surface (SSO, audit, retention policies); would distort the consumer-flywheel loop |
| Students / new grads with little shipped work | Not enough raw capture material yet; Kinetic depends on a steady stream of real artifacts |

---

## Persona Change Log

| Date | Change | Reason | Owner |
|------|--------|--------|-------|
| 2026-05-16 | Initial personas drafted from concept doc | Discovery distillation | @unclenate |
| 2026-05-16 | v0.5 refresh: Maya gains mixed-vendor / parenting context; operator concerns extended to include domain-classification false positives | 5-day-track scope expansion (ADR-0002) | @unclenate |
