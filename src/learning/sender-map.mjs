// src/learning/sender-map.mjs
// Passive learning (feedback sub-project, Phase 2a): turn operator corrections
// into a learned counterparty -> domain map that pre-seeds the classification
// hint for future captures from the same counterparty.
//
// Pure + offline. The map holds only labels (an email domain or a harvester
// name -> a domain category) — never capture content — so it carries no
// privacy weight (ADR-0006). See docs/superpowers/specs/2026-06-05-passive-
// learning-design.md.

/**
 * Derive a stable, namespaced learning key from a card/item's `source`.
 * Email sources expose a `counterparty` (the primary recipient domain) — the
 * recurring signal that discriminates a mixed business/personal mailbox.
 * Non-email sources fall back to the harvester `name` (a coarser source-level
 * prior). Returns null when neither is present (no learnable key).
 * @param {{ source?: { counterparty?: string, name?: string } }} card
 * @returns {string|null}
 */
export function counterpartyKey(card) {
  const src = card?.source;
  if (!src) return null;
  if (src.counterparty) return `mail:${String(src.counterparty).toLowerCase()}`;
  if (src.name) return `source:${String(src.name).toLowerCase()}`;
  return null;
}

/**
 * Build the learned map from correction rows. A correction is a row the operator
 * relabeled, i.e. `domain !== predicted_domain`. For each learning key we tally
 * votes per corrected `domain` and emit `key -> domain` only when the top domain
 * has `>= minVotes` AND a strict plurality (no tie) — so one stray correction
 * never flips a prior.
 * @param {Array<{ domain?: string, predicted_domain?: string, source?: object }>} rows
 * @param {{ minVotes?: number }} [opts]
 * @returns {Record<string,string>}
 */
export function buildLearnedMap(rows, { minVotes = 2 } = {}) {
  const tally = new Map(); // key -> Map<domain, votes>
  for (const row of rows || []) {
    if (!row || !row.predicted_domain || row.domain === row.predicted_domain) continue; // not a correction
    const key = counterpartyKey(row);
    if (!key) continue;
    const votes = tally.get(key) || new Map();
    votes.set(row.domain, (votes.get(row.domain) || 0) + 1);
    tally.set(key, votes);
  }

  const map = {};
  for (const [key, votes] of tally) {
    let top = null, topN = 0, tie = false;
    for (const [domain, n] of votes) {
      if (n > topN) { top = domain; topN = n; tie = false; }
      else if (n === topN) { tie = true; }
    }
    if (top && topN >= minVotes && !tie) map[key] = top;
  }
  return map;
}

/**
 * Look a key up in the learned map. Returns "unknown" on miss so callers can
 * treat it like any other (soft) domain hint.
 * @param {Record<string,string>} map
 * @param {string|null} key
 * @returns {string}
 */
export function learnedHint(map, key) {
  return (key && map && map[key]) || "unknown";
}

/**
 * Resolve the effective pre-LLM domain hint for a harvest item by merging the
 * learned map with the harvester's heuristic guess. Precedence:
 *   learned mapping (if known) > item.provider_domain_hint > "unknown".
 * Explicit per-request / operator provider overrides win later, at routing —
 * this only improves the soft hint handed to the router (routing only this
 * slice; seeding the LLM classifier with the learned prior is Phase 2b).
 * @param {Record<string,string>} map
 * @param {{ counterparty?: string, name?: string, provider_domain_hint?: string }} item
 * @returns {string}
 */
export function effectiveHint(map, item = {}) {
  const learned = learnedHint(map, counterpartyKey({ source: { counterparty: item.counterparty, name: item.name } }));
  if (learned !== "unknown") return learned;
  return item.provider_domain_hint || "unknown";
}

const DOMAINS = new Set(["business", "personal", "family", "financial", "parenting"]);

/**
 * The classifier prior (Phase 2b) for a harvest item: the learned domain for
 * this item's counterparty, or "unknown". Unlike {@link effectiveHint} it does
 * NOT fall back to the heuristic `provider_domain_hint` — only an operator-
 * confirmed correction is trustworthy enough to seed the LLM's classification
 * (the raw heuristic is the noise the corrections exist to fix).
 * @param {Record<string,string>} map
 * @param {{ counterparty?: string, name?: string }} item
 * @returns {string}
 */
export function learnedPrior(map, item = {}) {
  return learnedHint(map, counterpartyKey({ source: { counterparty: item.counterparty, name: item.name } }));
}

/**
 * Render the `{{DOMAIN_PRIOR}}` prompt fragment for a learned prior. Returns ""
 * for an unknown/missing/invalid domain so the prompt is byte-identical to the
 * no-prior case (preserves regression determinism). When a valid domain is
 * given, returns a single soft-prior line the classifier may override on content.
 * @param {string|undefined} domain
 * @returns {string}
 */
export function domainPriorLine(domain) {
  if (!DOMAINS.has(domain)) return "";
  return `learned_domain_prior: ${domain}  (a soft prior learned from the operator's past corrections for this counterparty — honor it when the content is ambiguous; the content wins when it clearly indicates a different domain)`;
}
