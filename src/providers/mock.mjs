// src/providers/mock.mjs
// Deterministic, zero-secret mock provider for Kinetic.
// Produces schema-valid output by simple keyword + heuristic mapping over the
// user's text. Used by `npm run regression` so the harness mechanics can be
// verified without any LLM API key.

import { createHash } from "node:crypto";
import { DOMAINS } from "../learning/sender-map.mjs";

const TECH_LEXICON = [
  // keyword          tag
  ["webhook",         "webhooks"],
  ["api",             "api-integration"],
  ["header",          "http-auth"],
  ["curl",            "curl"],
  ["stripe",          "stripe"],
  ["dashboard",       "dashboards"],
  ["billing",         "billing"],
  ["auto-renew",      "billing"],
  ["faiss",           "faiss"],
  ["product quantization", "vector-search"],
  ["embedding",       "embeddings"],
  ["postgres",        "postgresql"],
  ["replication",     "replication"],
  ["express",         "expressjs"],
  ["middleware",      "middleware"],
  ["monolith",        "architecture"],
  ["async",           "async-patterns"],
  ["promise",         "javascript"],
  ["checkout",        "checkout"],
  ["flaky",           "test-reliability"],
  ["ci",              "ci-cd"],
  ["staging",         "release-mgmt"],
  ["prod",            "release-mgmt"],
];

const CATEGORY_HINTS = [
  // Order matters — first match wins. Collab/design/research/infra are tested
  // before fix so phrases like "failure mode" (in a customer-facing collab
  // capture) aren't accidentally classified as a bug fix.
  [/paired|mentor|customer|discovery call|review with/i, "collab"],
  [/design review|whiteboard|architect/i,           "design"],
  [/spent .* hours.*couldn|chasing|investigat/i,    "research"],
  [/migrat|infra|replication|cutover/i,             "infra"],
  [/fix|bug|debug|broken|\b401\b|\bfail(ed|ing)?\b/i, "fix"],
  [/ship|shipped|launch|deploy(?!.*staging)/i,      "build"],
  [/refactor|extract|cleanup|reorganiz/i,           "build"],
  [/decision|decided|chose|opted/i,                 "decision"],
  [/read|paper|studied|learn|understand/i,          "learning"],
];

// Domain classification (ADR-0003). Order encodes the specificity rule:
// financial (money is the dominant verb) > parenting > family > personal,
// with `business` as the default when no life-domain signal is present.
const DOMAIN_HINTS = [
  [/\btax(es)?\b|\b401k\b|mortgage|\binvoice\b|\bbudget\b|refinanc|insurance|\bbank\b|investment|\bbonds?\b|index fund|rebalanc|\bbill\b|expense/i, "financial"],
  [/\b(son|daughter|kid|kids|child|children|toddler)\b|homework|pediatric|\bschool\b|daycare|soccer practice|parent-teacher|\bPTA\b/i, "parenting"],
  [/anniversary|sprinkler|backyard|hardware store|\brestaurant\b|\bsitter\b|\bwife\b|\bhusband\b|\bpartner\b|\bspouse\b|household|\bvacation\b|\blawn\b|grocer|in-laws/i, "family"],
  [/\bphysical\b|bloodwork|\bclinic\b|\bdoctor\b|\bdentist\b|\bgym\b|deadlift|pottery class|\bran my\b|\b10k\b|\bnovel\b|workout|therapy|\bhike\b/i, "personal"],
];

const THEME_FOR_CATEGORY = {
  fix: "midnight",
  build: "neon",
  design: "graphite",
  decision: "graphite",
  collab: "warm",
  learning: "ocean",
  infra: "graphite",
  research: "ocean",
  other: "graphite",
};

/**
 * Generate a deterministic short id from a seed.
 * @param {string} prefix
 * @param {string} seed
 */
function id(prefix, seed) {
  const h = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  return `${prefix}_${h}`;
}

/**
 * Classify the capture into one of the schema's activity types.
 */
function classify(text) {
  for (const [re, cat] of CATEGORY_HINTS) {
    if (re.test(text)) return cat;
  }
  return "other";
}

/**
 * Classify the capture into one of the schema's life domains (ADR-0003).
 * Defaults to `business` when no non-work signal is present — Kinetic is a
 * professional-first tool, so an unsignaled capture is treated as work.
 * (Ambiguous-default safety is tracked in shared-observations.md.)
 */
// Returns the positively-matched domain, or null when the text carries no
// non-business signal. The null lets `process` slot a learned prior (Phase 2b)
// into the gap before falling back to the `business` default — so no-prior
// behavior is unchanged (null -> business) and regression stays deterministic.
function classifyDomain(text) {
  for (const [re, domain] of DOMAIN_HINTS) {
    if (re.test(text)) return domain;
  }
  return null;
}


function extractTags(text) {
  const lower = text.toLowerCase();
  const tags = [];
  for (const [kw, tag] of TECH_LEXICON) {
    if (lower.includes(kw) && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 8);
}

function extractMinutes(text) {
  // "three hours" / "90 minutes" / "two hours" / "40 minutes"
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const hourMatch =
    text.match(/(\d+)\s*hours?/i) ||
    (() => {
      const m = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+hours?/i);
      return m ? [m[0], String(words[m[1].toLowerCase()])] : null;
    })();
  if (hourMatch) return parseInt(hourMatch[1], 10) * 60;

  const minMatch = text.match(/(\d+)\s*(?:-\s*)?(?:minute|min)/i);
  if (minMatch) return parseInt(minMatch[1], 10);

  return null;
}

function summarize(text, maxLen = 220) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1).trimEnd() + "…";
}

function titleFromText(text, category) {
  // Very small heuristic — use the first clause / sentence, capped.
  const first = text.split(/[.!?\n]/)[0].trim();
  if (first.length >= 4 && first.length <= 70) {
    return capitalize(first);
  }
  const fallback = {
    fix: "Bug fix & remediation",
    build: "Shipped work",
    design: "Design review",
    decision: "Decision recorded",
    collab: "Collaboration session",
    learning: "Learning capture",
    infra: "Infrastructure change",
    research: "Investigation log",
    other: "Daily capture",
  };
  return fallback[category] || "Daily capture";
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The mock provider entry point. Returns a schema-valid object for any input.
 *
 * @param {{ text: string, image_caption?: string }} input
 * @returns {Promise<{ admin_tasks: any[], proof_card: any }>}
 */
export async function process(input, _opts = {}) {
  const text = (input.text || "").trim();
  const caption = (input.image_caption || "").trim();
  const seed = `${text}|${caption}`;
  const category = classify(text + " " + caption);
  // Content match wins; else a learned prior (Phase 2b); else the business default.
  const prior = DOMAINS.has(input.domain_hint) ? input.domain_hint : "business";
  const domain = classifyDomain(text + " " + caption) || prior;
  const tags = extractTags(text + " " + caption);
  const minutes = extractMinutes(text);
  const theme = THEME_FOR_CATEGORY[category] || "graphite";
  const lowSignal = text.length < 30;

  const proofId = id("proof", seed);
  const taskId = id("task", seed + "-task");

  const tasks = [];
  if (/staging|next week|tomorrow|next tuesday|prod/i.test(text)) {
    tasks.push({
      id: taskId,
      title: capitalize(suggestNextStep(text, category)),
      status: "todo",
      due: null,
      source: "Inferred from capture phrasing.",
    });
  } else if (/shipped|done|deployed|landed|got it/i.test(text)) {
    tasks.push({
      id: taskId,
      title: capitalize(suggestNextStep(text, category)),
      status: "done",
      due: null,
      source: "Completion phrasing in capture.",
    });
  }

  const summary = lowSignal
    ? `Limited capture today: ${summarize(text, 120)}`
    : summarize(text, 220);

  const narrative = lowSignal
    ? `Limited capture today. Details thin. Original note: "${text}". Logged so the day is not lost; revisit when more context is available.`
    : buildNarrative(text, caption, category);

  return {
    admin_tasks: tasks,
    proof_card: {
      id: proofId,
      title: titleFromText(text, category),
      summary,
      tech_tags: tags,
      time_to_resolution_minutes: minutes,
      impact_metric: null, // mock never invents impact — matches anti-fabrication rule
      domain,
      activity_type: category,
      visual_theme: theme,
      narrative,
    },
  };
}

function suggestNextStep(text, category) {
  if (/staging/i.test(text)) return "Promote to staging";
  if (/prod next/i.test(text)) return "Cut over to production";
  if (/follow-up|sending a follow/i.test(text)) return "Send follow-up";
  if (/next week/i.test(text)) return "Schedule follow-up next week";
  if (/shipped|deployed/i.test(text)) return "Announce ship in team channel";
  if (category === "collab") return "Log session notes";
  return "Capture next action";
}

function buildNarrative(text, caption, category) {
  const lead = {
    fix: "Diagnosed and resolved an issue.",
    build: "Shipped a piece of work.",
    design: "Worked through a design decision.",
    decision: "Recorded a meaningful decision.",
    collab: "Collaborated with another person.",
    learning: "Absorbed new material.",
    infra: "Made an infrastructure change.",
    research: "Investigated a problem.",
    other: "Logged a moment from the workday.",
  }[category] || "Logged a moment from the workday.";

  const captionLine = caption ? ` Visual context: ${caption}` : "";
  return `${lead} ${text}${captionLine}`.trim();
}
