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

async function main() {
  const { createStore } = await import("../src/db/store.mjs");
  const store = createStore();
  const cards = await store.listCards();
  const report = auditPublicCards(cards);

  console.log(`\nKinetic privacy audit`);
  console.log(`  backend:      ${store.backend}`);
  console.log(`  total cards:  ${cards.length}`);
  console.log(`  public cards: ${report.publicCount}`);
  if (store.backend === "memory") {
    console.log(`  note: in-memory backend is per-process — set SUPABASE_URL to audit persisted data.`);
  }
  if (report.ok) {
    console.log(`\n✓ All public cards are domain=business. Privacy gate intact.`);
    process.exit(0);
  }
  console.log(`\n✗ ${report.violations.length} public card(s) are NOT business — privacy violation:`);
  for (const v of report.violations) console.log(`   - ${v.id}: domain=${v.domain}`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("privacy-audit failed:", e); process.exit(2); });
}
