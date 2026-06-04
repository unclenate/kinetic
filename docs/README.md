# Kinetic documentation — reading guide

This is the engineering and governance documentation for **Kinetic (AutoPortfolio)**.
It is organised as a navigable book (see the table of contents in the sidebar, generated
from [`SUMMARY.md`](../SUMMARY.md)). If you are reading on GitHub, every link below is a
plain relative link and works the same way.

## Start here, by goal

Pick the entry point that matches what you need:

- **"What is Kinetic and how does it work?"** → [Architecture Overview](architecture/overview.md),
  then the [Problem Statement](product/problem-statement.md) and [Personas](product/personas.md).
- **"Why was it built this way?"** → the [Decision Records (ADRs)](adr/ADR-0001-stack-and-composition.md)
  in order, and the [design specs](superpowers/specs/2026-06-03-llm-provider-routing-design.md).
- **"How do I run, test, or release it?"** → [Test Strategy](testing/test-strategy.md),
  [Environment Inventory](ops/environment-inventory.md), and the
  [Release](ops/release-checklist.md) / [Rollback](ops/rollback-checklist.md) checklists.
- **"What are the rules for changing it?"** → [Operating Principles](operating-principles.md),
  the [Agent Operating Manual](../AGENTS.md), and [Harness Governance](../HARNESS.md).
- **"What's the current status and history?"** → [Milestones](project/milestones.md),
  [Change Log](project/change-log.md), and the [Knowledge base](knowledge/README.md).

## How the docs are organised

| Section | Contents |
|---------|----------|
| **Governance & Agents** | The rules of the project: operating principles, the agent contract, harness governance. |
| **Product** | Why Kinetic exists: problem, personas, requirements, release intent. |
| **Project** | Plan and history: scope, milestones, change log, dependency log, revision tracker, review log. |
| **Architecture** | How it is built: system overview, database/migration readiness. |
| **Security** | The risk register. |
| **Operations** | Environments, release/rollback checklists, demo runbook. |
| **Testing** | Test strategy and coverage thresholds. |
| **Decision Records** | One ADR per significant architectural decision. |
| **Design Specs & Plans** | The detailed designs and implementation plans behind recent work. |
| **Knowledge Base** | Append-only observations and the distilled, durable learnings. |
| **Discovery (archive)** | Early framing kept for history. |

## Accessibility statement

These docs are written to be accessible to read on the web and on GitHub:

- **Descriptive headings in order.** Each page starts with a single `#` title and uses
  nested headings without skipping levels, so screen-reader and outline navigation work.
- **Meaningful link text.** Links describe their destination (e.g. "Risk Register"),
  never "click here" or a bare URL.
- **Plain-language summary first.** Every page opens with a short, jargon-light statement
  of what it covers before the detail.
- **No meaning conveyed by colour alone.** Status and severity are always stated in text
  (e.g. "High", "Open") in addition to any visual styling.
- **Alt text for images.** Any embedded image uses descriptive alt text. (The reference
  screenshots in `docs/screenshots/` are linked, not embedded, and described in the text
  that links them.)
- **Tables have header rows** and are kept narrow enough to read without horizontal
  scrolling where practical.

If you find a documentation accessibility issue, note it in the
[Revision Tracker](project/revision-tracker.md) or raise it with the owner
(@unclenate, nate@bdits.io).

## Conventions

- Dates are written as absolute ISO dates (for example `2026-06-04`), never "yesterday".
- Code, file paths, and identifiers are in `monospace`.
- "Built" vs "planned" is stated explicitly; this is an **alpha** project and the docs say
  so where something is not yet live.
