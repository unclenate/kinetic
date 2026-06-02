// src/harvesters/domain-hint.mjs
// Shared heuristics for computing a `provider_domain_hint` (ADR-0003 domain).
//
// The hint is a SOFT signal, not a hard label: harvesters attach it so a later
// classifier (the LLM, or a privacy pre-screen) has a starting guess derived
// from cheap metadata — recipient domains, file location, subject keywords.
// The authoritative `domain` still comes from the LLM contract. When in doubt
// these helpers default to "business", because Kinetic is professional-first
// and the harvested sources (work mail, work calendar, work drives) skew that
// way. Ambiguous-default safety is tracked in docs/knowledge/shared-observations.md.
//
// The filename uses a hyphen so the server's harvest route regex
// (`/api/harvest/([a-z0-9_]+)`) can never resolve it as a harvester.

// Common consumer / free webmail domains. A message sent only to these is
// more likely personal than work.
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "fastmail.com",
]);

// Keyword signals that a capture is non-work. Ordered loosely by specificity;
// callers that want the resolved domain (not just business/personal) can use
// `hintFromKeywords`.
const KEYWORD_DOMAINS = [
  [/\b(tax(es)?|invoice|mortgage|insurance|401k|budget|payroll|reimburse|expense report)\b/i, "financial"],
  [/\b(kid|kids|child|children|daughter|son|school|homework|daycare|pediatric|parent-teacher|pta)\b/i, "parenting"],
  [/\b(anniversary|vacation|spouse|wife|husband|in-laws|family dinner|grocery|household)\b/i, "family"],
  [/\b(doctor|dentist|clinic|appointment|gym|workout|therapy|birthday|hobby)\b/i, "personal"],
];

/** Extract the lowercased domain from an email address or "Name <addr>" form. */
export function domainOf(email) {
  const m = String(email || "").match(/@([A-Za-z0-9.-]+)/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Hint from a set of email addresses (e.g. recipients). If every resolvable
 * recipient domain is a free-mail provider, guess "personal"; otherwise the
 * presence of any organizational domain suggests work.
 * @param {Array<string>} addresses
 * @returns {"business"|"personal"}
 */
export function hintFromEmailDomains(addresses) {
  const domains = (addresses || []).map(domainOf).filter(Boolean);
  if (domains.length === 0) return "business";
  const allFree = domains.every((d) => FREE_MAIL.has(d));
  return allFree ? "personal" : "business";
}

/**
 * Hint from free text (subject + snippet/body). Returns the most specific
 * non-work domain whose keywords match, else "business".
 * @param {string} text
 * @returns {"business"|"personal"|"family"|"financial"|"parenting"}
 */
export function hintFromKeywords(text) {
  const t = String(text || "");
  for (const [re, domain] of KEYWORD_DOMAINS) {
    if (re.test(t)) return domain;
  }
  return "business";
}

/**
 * Combine an email-domain signal with keyword signals. Keyword wins when it
 * resolves a specific non-business domain (it carries more meaning than the
 * coarse free-mail check); otherwise fall back to the email-domain hint.
 */
export function combineHints(addresses, text) {
  const kw = hintFromKeywords(text);
  if (kw !== "business") return kw;
  return hintFromEmailDomains(addresses);
}
