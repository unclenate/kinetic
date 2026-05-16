# Project Intake Questionnaire — Kinetic (AutoPortfolio)

**Status:** Draft v0 — distilled from raw concept doc in `docs/discovery/inbox/`
**Owner:** @unclenate
**Last updated:** 2026-05-16

Source material:
- `docs/discovery/inbox/The App Concept: "AutoPortfolio" (or "Ki.md`

This was filled in solo-interview mode from a single seed concept document. Probes
that were not addressed in source material are flagged `[TBD]` rather than guessed.

---

## Section 1 — Project Identity

**1.1 Working title**
Kinetic *(working name; "AutoPortfolio" is an alternate)*

**1.2 One-sentence description**
This is a mobile-first AI capture app that helps working professionals turn messy daily
work artifacts (screenshots, voice memos, commit logs, notes) into both organized admin
tasks and shareable "Proof of Skill" cards — without sitting down to write a resume.

**1.3 Primary goal for this phase**
- **Hackathon (≤72h):** Win the PSU hackathon with a live "magic demo" that takes a
  chaotic input and produces a clean admin task + a polished Proof-of-Skill card,
  ending in a shareable public link.
- **90-day goal:** Functional alpha with 25–50 friendly users running daily capture,
  enough usage data to validate the "documentation fatigue" hypothesis.
- **6-month goal:** Public beta with a shared "Kinetic Proof Feed" as the primary
  viral growth surface.

**1.4 Production URL or target domain**
TBD. Hackathon demo URL only.

---

## Section 2 — Problem and Opportunity

**2.1 What problem are you solving?**
Professionals constantly produce evidence of their skills — debugging sessions, shipped
features, customer wins, learned techniques — but the work of *documenting* that evidence
(resumes, LinkedIn updates, portfolio entries, status reports) is high-friction and
typically only happens during job hunts or performance reviews, far from when the work
happened. By then, context is lost and the artifacts are vague.

**Current workaround:** Manual resume / LinkedIn / portfolio updates, often weeks or
months delayed. Some use Notion, journals, or "brag docs." Most rely on memory.

**What's broken about it:** It's a writing task disconnected from the moment of work.
The friction (open a doc, summarize what you did, edit for tone) is higher than the
perceived near-term reward, so it doesn't happen.

**2.2 Why is this worth building now?**
- Generative AI with structured outputs (Gemini, Claude) now reliably converts unstructured
  multimodal input → typed JSON, which is the core enabling primitive.
- Mobile capture (voice + screenshot + camera) is universal and free.
- Short-form vertical feed UX is the dominant attention pattern; "Proof feeds" can borrow
  this format for career content.

**2.3 What happens if this doesn't get built?**
Nice-to-have, not must-have for individuals. But the **growth flywheel** (every shared
proof link is a landing page for new users) makes the cost of *not building it* the
absence of a category-defining product in a space where "LinkedIn but for evidence,
not credentials" is underserved.

**2.4 Have you seen this attempted before?**
[TBD — competitive scan deferred. Adjacent: LinkedIn, Polywork, Read.cv, brag-doc
templates, Loom (for video evidence). None combine capture + structured AI + viral
public feed in one loop.]

---

## Section 3 — Users and Stakeholders

**3.1 Primary users**
Mid-career software engineers and adjacent technical knowledge workers (designers, PMs,
data folks) who:
- Ship visible work frequently (code, designs, decks, tickets)
- Care about career mobility (promotion, job change, freelancing, founding)
- Currently don't maintain their portfolio / resume / LinkedIn between job hunts

**What they need:** A low-friction way to capture daily evidence of skill, then have
something useful and shareable come out of it.

**What frustrates them today:** Resume / portfolio updates feel like rewriting your
identity from scratch every time. Status updates to managers feel performative. No
durable record of "what I actually did."

**3.2 Secondary users / operators**
- **Recipients of shared proof links** — managers, clients, recruiters — passive viewers
  who become candidate users.
- **Operator (the builder, @unclenate)** — needs visibility into feed content quality and
  AI output drift.

**3.3 Stakeholders**
- Hackathon judges (immediate)
- Future investors / advisors (later)

**3.4 Who is explicitly NOT the audience?**
- Active job-seekers who want a traditional resume builder — different format, different
  expectations.
- Non-technical workers whose evidence isn't easily machine-readable (e.g., physical
  trades) — possible later, not v1.
- Enterprise HR / performance-review tooling — different buyer, different compliance
  surface.

---

## Section 4 — Starting Point

- [x] **Raw idea** — single concept doc; no UI artifacts yet
- [ ] Informal requirements
- [ ] Mockup or prototype
- [ ] Wireframes or design system
- [ ] Detailed written spec
- [ ] Existing codebase
- [ ] Existing deployed product

**Asset links:** `docs/discovery/inbox/The App Concept: "AutoPortfolio" (or "Ki.md`

**4.2 Existing systems or integrations**

| System | Integration type | Required or optional |
|--------|-----------------|---------------------|
| Gemini API (structured outputs) | LLM provider | Required (v0) |
| Supabase (auth + Postgres + storage) | BaaS | Required (v0) |
| Apple / Google sign-in | OAuth | Optional (v0); required by v1 |
| Git providers (GitHub) | OAuth + webhook for commit ingest | Later |
| Slack | Outbound (draft team updates) | Later |

---

## Section 5 — Requirements Calibration

**5.1 What must exist for the MVP to be useful?**
1. Capture a raw input (text + image + optional voice memo) from a mobile screen.
2. Process it through an LLM with structured output → `{admin_tasks[], proof_card{}}`.
3. Display the resulting Proof card in a feed view.
4. Generate a public shareable link for any Proof card.

**5.2 What would make it great but isn't essential?**
1. Voice transcription (vs. text only) on capture.
2. Auto-tagging of technologies from screenshot OCR.
3. TikTok-style vertical scroll feed (vs. simple list view).
4. Slack/email draft from admin tasks.
5. Auth + user accounts (single-user demo is fine for hackathon).

**5.3 Explicitly out of scope for now**
1. Git provider integrations.
2. Team / enterprise mode.
3. Editing flow after AI generation (regenerate-only in v0).
4. Analytics on shared link views.
5. Native iOS/Android packaging (web PWA is enough for the demo).

**5.4 Non-negotiable constraints**

| Constraint | Source / reason |
|------------|----------------|
| Hackathon timebox (~72h) | Submission deadline |
| Live demo must work offline-resilient if conference Wi-Fi flakes | Demo risk |
| No PII beyond user email; no recorded audio retained after transcription | Privacy hygiene |

**5.5 How will you know the MVP is done?**
A judge can hand the demo phone a chaotic input (messy screenshot + voice note about a
problem they just solved), tap "Process," and within ~15s see (a) an admin task and
(b) a polished Proof card with a one-click public share link that loads in their browser.

---

## Section 6 — Scale and Growth Expectations

**6.1 Users at launch** ~5 (hackathon demo + builder + friends)
**6.2 Users at scale** 10K daily active in 2 years would feel like success

**6.3 Data growth expectations**
~1–5 captures per user per day, each averaging ~500KB (one image + JSON metadata).
Manageable on Supabase free tier through alpha.

---

## Section 7 — Delivery Posture

**7.1 Team size** 1 (solo hackathon build)
**7.2 Maturity tier** Prototype → MVP
**7.3 Production posture** Demo / prototype. Not production-SaaS until post-hackathon.
**7.4 Throwaway?** No — intended to evolve into a real product, but the hackathon build
itself is allowed to be scrappy.

---

## Section 8 — Stack and Architecture Signals

**8.1 Language / runtime preferences**
- TypeScript primary.
- Supabase (Postgres + Auth + Storage) as backend.
- Gemini API for LLM (structured outputs); Claude as fallback.

**8.2 Hosting**
- Web frontend on Vercel.
- Supabase-hosted backend.

**8.3 Architecture flavor**
- Web app (PWA-capable) for hackathon. Native wrapper later.
- Backend: thin API layer (Supabase Edge Functions or a small Node/TS service) to
  orchestrate LLM calls and persist results.

---

## Composition Signals Summary

| Signal | Answer | Candidate module |
|--------|--------|-----------------|
| Web UI? | Yes, mobile-first PWA | `architectures/web-app` |
| Backend API? | Thin orchestration layer | (folded into web-app) |
| Relational data? | Yes (Postgres via Supabase) | `data/relational-postgres` |
| File / media storage? | Yes (images, optional audio) | `data/object-storage` |
| Stack? | Node + TypeScript | `stacks/node-typescript` |
| Backend-as-a-service? | Supabase | `domains/supabase` |
| LLM-heavy? | Yes — structured outputs core to product | `domains/ai-structured-outputs` *(may not exist; track as known gap)* |
| Delivery posture | Hackathon prototype, evolving to MVP | `delivery/prototype` for now |

**Initial composition decision:**
Start with `compositions/new-product-discovery.yaml` for the hackathon week so we can
ship without tripping required-artifact validations, then migrate to a fuller composition
(closest match today: `node-web-saas-postgres.yaml` plus a Supabase domain module) right
after the hackathon. See **ADR-0001**.
