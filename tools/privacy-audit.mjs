// tools/privacy-audit.mjs
// Privacy gate enforcement check (ADR-0003): every PUBLIC Proof card must have
// domain == "business". A public non-business card is a trust incident.
//
// As a library:  import { auditPublicCards } from "tools/privacy-audit.mjs"
// As a CLI:       node tools/privacy-audit.mjs
//   Audits the live persistence backend. Against the in-memory backend this is
//   a fresh, empty process (0 public cards) — run it against the Supabase
//   backend (SUPABASE_URL set) for a meaningful audit of persisted data.
//   Exits non-zero if any violation is found.

/**
 * @param {Array<{ id?: string, isPublic?: boolean, output?: any }>} cards
 * @returns {{ ok: boolean, publicCount: number, violations: Array<{id, domain}> }}
 */
export function auditPublicCards(cards) {
  const publicCards = (cards || []).filter((c) => c && c.isPublic);
  const violations = publicCards
    .map((c) => ({ id: c.id, domain: c.output?.proof_card?.domain }))
    .filter((c) => c.domain !== "business");
  return { ok: violations.length === 0, publicCount: publicCards.length, violations };
}

/**
 * Privacy-by-design invariant (ADR-0006): every persisted SENSITIVE (non-business)
 * card must be encrypted at rest. A sensitive card stored in plaintext is a leak.
 * @param {Array<{ id?: string, encrypted?: boolean, output?: any }>} cards
 * @returns {{ ok: boolean, sensitiveCount: number, violations: Array<{id, domain}> }}
 */
export function auditEncryption(cards) {
  const sensitive = (cards || []).filter((c) => c && c.output?.proof_card?.domain !== "business");
  const violations = sensitive
    .filter((c) => !c.encrypted)
    .map((c) => ({ id: c.id, domain: c.output?.proof_card?.domain }));
  return { ok: violations.length === 0, sensitiveCount: sensitive.length, violations };
}

async function main() {
  const { createStore } = await import("../src/db/store.mjs");
  const store = createStore();
  const cards = await store.listCards();
  const pub = auditPublicCards(cards);
  const enc = auditEncryption(cards);

  console.log(`\nKinetic privacy audit`);
  console.log(`  backend:        ${store.backend}`);
  console.log(`  total cards:    ${cards.length}`);
  console.log(`  public cards:   ${pub.publicCount}`);
  console.log(`  sensitive cards:${enc.sensitiveCount}`);
  if (store.backend === "memory") {
    console.log(`  note: in-memory backend is per-process — set SUPABASE_URL to audit persisted data.`);
  }

  if (!pub.ok) {
    console.log(`\n✗ ${pub.violations.length} public card(s) are NOT business — privacy-gate violation:`);
    for (const v of pub.violations) console.log(`   - ${v.id}: domain=${v.domain}`);
  }
  if (!enc.ok) {
    console.log(`\n✗ ${enc.violations.length} sensitive card(s) are NOT encrypted at rest — residency violation:`);
    for (const v of enc.violations) console.log(`   - ${v.id}: domain=${v.domain}`);
  }
  if (pub.ok && enc.ok) {
    console.log(`\n✓ Public cards are domain=business AND sensitive cards are encrypted. Privacy intact.`);
    process.exit(0);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("privacy-audit failed:", e); process.exit(2); });
}
