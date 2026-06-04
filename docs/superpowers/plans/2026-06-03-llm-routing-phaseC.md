# LLM Routing — Phase C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Encrypt sensitive Proof cards at rest in Supabase (AES-256-GCM), so a capture routed/classified as non-business is stored as ciphertext the cloud DB cannot read — closing the privacy-by-design loop (local inference + on-device-readable-only storage).

**Architecture:** The store gains an encryption seam: `saveCard({..., sensitive})` encrypts `output` into an `output_enc` text column and sets `encrypted = true` (leaving `output` null) when the capture is sensitive; reads decrypt transparently. Sensitivity for persistence = `finalDomain !== "business" OR residency === "local"`. Reuses `src/oauth/crypto.mjs` (`KINETIC_TOKEN_ENCRYPTION_KEY`). A schema migration adds the ciphertext + feedback-readiness columns. `tools/privacy-audit.mjs` gains an invariant: every persisted sensitive card is encrypted. Recorded as ADR-0006.

**Tech Stack:** Zero-dependency Node ESM, global `fetch`. Supabase migration applied via the Supabase MCP `apply_migration` (**Tier 4 — environment-altering; requires operator authorization**). Tests stub `globalThis.fetch` (M7 store-test pattern).

**Spec:** `docs/superpowers/specs/2026-06-03-llm-provider-routing-design.md` §5 + "Feedback readiness". Builds on Phase A/B (`router`, `decision.residency`, `decision.sensitive`).

---

### Task 1: Schema migration + db/schema.sql + ADR-0006

**Files:**
- Apply: Supabase migration (MCP)
- Modify: `db/schema.sql`
- Create: `docs/adr/ADR-0006-privacy-by-design-routing-and-encryption.md`

- [ ] **Step 1 (Tier 4 — confirm with operator): apply the migration**

Apply via Supabase MCP `apply_migration` (project `wdjktkfeqaainzartztx`, name `phase_c_at_rest_encryption`):
```sql
alter table proof_cards add column if not exists output_enc       text;
alter table proof_cards add column if not exists encrypted        boolean not null default false;
alter table proof_cards alter column output drop not null;
alter table proof_cards add column if not exists domain_hint      text;
alter table proof_cards add column if not exists predicted_domain text;
alter table proof_cards add column if not exists residency        text;
alter table proof_cards add column if not exists origin           text;
alter table proof_cards add column if not exists needs_review     boolean not null default false;
alter table captures   add column if not exists raw_text_enc      text;
alter table captures   add column if not exists encrypted         boolean not null default false;
alter table captures   alter column raw_text drop not null;
```
Verify with `list_tables` (verbose) that the columns exist; run `get_advisors` (security) — expect no new warnings.

- [ ] **Step 2: Mirror the columns in `db/schema.sql`** (source of truth)

In `proof_cards`, add after `output jsonb not null` → change to `output jsonb` (nullable) and add:
```sql
  output_enc     text,                 -- AES-256-GCM ciphertext of `output` when encrypted
  encrypted      boolean not null default false,
  domain_hint    text,                 -- pre-LLM routing hint (feedback signal)
  predicted_domain text,               -- LLM's domain output (feedback signal)
  residency      text,                 -- 'local' | 'cloud' where inference ran
  origin         text,                 -- sender/source identifier (feedback signal)
  needs_review   boolean not null default false,
```
In `captures`, change `raw_text text not null` → `raw_text text` and add `raw_text_enc text,` and `encrypted boolean not null default false,`.

- [ ] **Step 3: Write ADR-0006**

Create `docs/adr/ADR-0006-privacy-by-design-routing-and-encryption.md` (model on ADR-0005's format: Status Accepted, Date 2026-06-03, Author/Reviewers @unclenate). Summarize: pluggable providers (Phase A); privacy-aware routing on pre-LLM signals with fail-closed + cloud-ack (Phase B); at-rest AES-256-GCM encryption of sensitive rows (Phase C). State the Privacy-by-Design conformance (the 7-principle table from the spec), the accepted residual risk (hint-misclassification → cloud inference; closed by source-pin / feedback / two-pass), and the deferred items (feedback loop = sub-project 2; two-pass = Phase D). Reference the spec.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql docs/adr/ADR-0006-privacy-by-design-routing-and-encryption.md
git commit -m "feat(privacy): Phase C schema — encryption + feedback-readiness columns (ADR-0006)"
```

---

### Task 2: Store encrypts sensitive cards at rest

**Files:**
- Modify: `src/db/store.mjs`
- Test: `tests/store.test.mjs` (append)

- [ ] **Step 1: Write the failing tests**

In `tests/store.test.mjs`, insert before the final summary lines:

```js
await test("supabase store: a sensitive card is stored encrypted (ciphertext, no plaintext output)", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { createStore } = await import("../src/db/store.mjs?phaseC1");
  const store = createStore();
  let body;
  const stub = async (_url, opts) => { body = JSON.parse(opts.body); return jsonResponse([body], 201); };
  await withFetch(stub, () => store.saveCard({ output: card("personal"), provider: "ollama", sensitive: true, hint: "personal", residency: "local" }));
  assert.equal(body.encrypted, true);
  assert.ok(body.output_enc && typeof body.output_enc === "string", "output_enc ciphertext present");
  assert.ok(body.output == null, "plaintext output column is null when encrypted");
  assert.ok(!JSON.stringify(body.output_enc).includes("proof_card"), "ciphertext does not contain plaintext json");
  assert.equal(body.domain, "personal"); // denormalized clear column for filtering
  assert.equal(body.residency, "local");
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

await test("supabase store: getCard decrypts an encrypted row", async () => {
  process.env.KINETIC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { encryptToken } = await import("../src/oauth/crypto.mjs");
  const { createStore } = await import("../src/db/store.mjs?phaseC2");
  const store = createStore();
  const out = card("financial");
  const row = { slug: "abc", output: null, output_enc: encryptToken(JSON.stringify(out)), encrypted: true, domain: "financial", is_public: false, created_at: "2026-06-03T00:00:00Z" };
  const rec = await withFetch(async () => jsonResponse([row]), () => store.getCard("abc"));
  assert.equal(rec.output.proof_card.domain, "financial", "decrypted output recovered");
  assert.equal(rec.encrypted, true);
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

await test("supabase store: a business card stays plaintext", async () => {
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  const { createStore } = await import("../src/db/store.mjs?phaseC3");
  const store = createStore();
  let body;
  const stub = async (_url, opts) => { body = JSON.parse(opts.body); return jsonResponse([body], 201); };
  await withFetch(stub, () => store.saveCard({ output: card("business"), provider: "claude", sensitive: false, hint: "business", residency: "cloud" }));
  assert.equal(body.encrypted, false);
  assert.ok(body.output && body.output.proof_card, "plaintext output present");
  assert.ok(body.output_enc == null);
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

await test("memory store: tracks the encrypted flag for sensitive cards", async () => {
  delete process.env.SUPABASE_URL;
  const { createStore } = await import("../src/db/store.mjs?phaseC4");
  const store = createStore();
  const { id } = await store.saveCard({ output: card("personal"), provider: "ollama", sensitive: true });
  const rec = await store.getCard(id);
  assert.equal(rec.encrypted, true);
  assert.equal(rec.output.proof_card.domain, "personal"); // memory holds plaintext in-process
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/store.test.mjs`
Expected: FAIL — `saveCard` ignores `sensitive`; no `output_enc`/`encrypted` in the body; `getCard` returns `rec.encrypted` undefined.

- [ ] **Step 3: Implement the store changes**

In `src/db/store.mjs`:

Add an import at top:
```js
import { encryptToken, decryptToken } from "../oauth/crypto.mjs";
```

Update the interface comment's `saveCard` signature to:
`saveCard({ output, provider, source, sensitive, hint, residency, origin })`.

**Memory backend `saveCard`** — replace its body with:
```js
    async saveCard({ output, provider, source, sensitive }) {
      const id = shortId();
      applyIds(output, id);
      cards.set(id, { output, createdAt: new Date().toISOString(), isPublic: false, provider, source: source || null, encrypted: !!sensitive });
      return { id, output };
    },
```
(Memory is the zero-infra demo; it holds plaintext in-process but mirrors the `encrypted` flag so the privacy audit and feed see it.)

**Supabase backend** — update `mapRow` to decrypt and expose the flag:
```js
  function mapRow(row) {
    if (!row) return null;
    const output = row.encrypted && row.output_enc
      ? JSON.parse(decryptToken(row.output_enc))
      : row.output;
    return {
      output,
      createdAt: row.created_at,
      isPublic: !!row.is_public,
      provider: row.provider || null,
      source: row.source || null,
      encrypted: !!row.encrypted,
    };
  }
```
and replace its `saveCard` with:
```js
    async saveCard({ output, provider, source, sensitive, hint, residency, origin }) {
      const id = shortId();
      applyIds(output, id);
      const row = {
        slug: id,
        domain: output.proof_card.domain,
        activity_type: output.proof_card.activity_type,
        is_public: false,
        provider: provider || null,
        source: source || null,
        domain_hint: hint || null,
        predicted_domain: output.proof_card.domain,
        residency: residency || null,
        origin: origin || null,
        needs_review: hint === "unknown",
      };
      if (sensitive) {
        row.output_enc = encryptToken(JSON.stringify(output));
        row.encrypted = true;
      } else {
        row.output = output;
        row.encrypted = false;
      }
      await supabase.insert("proof_cards", row);
      return { id, output };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/store.test.mjs`
Expected: PASS — all store tests green (10 prior + 4 new = 14).

- [ ] **Step 5: Commit**

```bash
git add src/db/store.mjs tests/store.test.mjs
git commit -m "feat(privacy): encrypt sensitive proof cards at rest (decrypt on read)"
```

---

### Task 3: Server marks sensitivity + passes feedback fields

**Files:**
- Modify: `web/server.mjs` (handleProcess + handleHarvest saveCard calls)

- [ ] **Step 1: Update `handleProcess`'s saveCard**

Find:
```js
  const { id, output: stored } = await store.saveCard({ output, provider: decision.provider });
```
replace with:
```js
  const persistSensitive = output.proof_card.domain !== "business" || decision.residency === "local";
  const { id, output: stored } = await store.saveCard({ output, provider: decision.provider, sensitive: persistSensitive, hint: domainHint, residency: decision.residency });
```

- [ ] **Step 2: Update `handleHarvest`'s saveCard**

Find the harvest `store.saveCard({ output, provider: decision.provider, source: {...} })` call and add the sensitivity + feedback fields:
```js
    const persistSensitive = output.proof_card.domain !== "business" || decision.residency === "local";
    const { id, output: stored } = await store.saveCard({
      output,
      provider: decision.provider,
      sensitive: persistSensitive,
      hint: domainHint,
      residency: decision.residency,
      origin: item.source_id || null,
      source: { name: sourceName, source_id: item.source_id, occurred_at: item.occurred_at || null, domain_hint: item.provider_domain_hint || null },
    });
```

- [ ] **Step 3: Verify (live Supabase round-trip + plaintext check)**

With `.env.local` sourced (Supabase configured) and routing on, persist a sensitive capture, then confirm the DB row is ciphertext but the API decrypts it:
```bash
set -a; . ./.env.local; set +a
KINETIC_PROVIDER=auto KINETIC_LOCAL_PROVIDER=mock PORT=5215 node web/server.mjs &
sleep 1
ID=$(curl -s -X POST localhost:5215/api/process -H 'content-type: application/json' -d '{"text":"took my son to his pediatric checkup"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.error("residency:",j.residency,"domain:",j.output.proof_card.domain);console.log(j.id)})')
echo "card id: $ID"
curl -s "localhost:5215/api/cards/$ID" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("API getCard decrypted domain:",j.output.proof_card.domain,"encrypted:",j.encrypted)}'
kill %1
```
Then verify the DB stores ciphertext (Supabase MCP `execute_sql`):
`select slug, encrypted, (output is null) as output_null, left(output_enc,24) as enc_preview, domain, residency from proof_cards where slug = '<ID>';`
Expected: `encrypted=true`, `output_null=true`, `enc_preview` is base64 (not JSON), `domain=parenting`/`personal`, `residency=local`. Clean up the probe row afterward (`delete from proof_cards where slug='<ID>'`).

- [ ] **Step 4: Commit**

```bash
git add web/server.mjs
git commit -m "feat(privacy): server marks sensitivity + feedback fields on persist"
```

---

### Task 4: Privacy-audit asserts the encryption invariant

**Files:**
- Modify: `tools/privacy-audit.mjs`
- Test: `tests/m10.test.mjs` (append)

- [ ] **Step 1: Write the failing test**

In `tests/m10.test.mjs`, insert before the final summary lines:

```js
await test("privacy audit: flags a sensitive (non-business) card stored unencrypted", async () => {
  const { auditEncryption } = await import("../tools/privacy-audit.mjs");
  const cards = [
    { id: "a", encrypted: true,  output: card("personal") },   // ok
    { id: "b", encrypted: false, output: card("financial") },  // VIOLATION (sensitive, plaintext)
    { id: "c", encrypted: false, output: card("business") },   // ok (business may be plaintext)
  ];
  const report = auditEncryption(cards);
  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((v) => v.id), ["b"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/m10.test.mjs`
Expected: FAIL — `auditEncryption` is not exported.

- [ ] **Step 3: Implement `auditEncryption`**

In `tools/privacy-audit.mjs`, add (and export):
```js
/**
 * Every persisted SENSITIVE (non-business) card must be encrypted at rest.
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
```
Then extend the CLI `main()` to also run `auditEncryption(cards)` and print/exit-nonzero on violations (alongside the existing public-card audit). Keep the existing `auditPublicCards` behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/m10.test.mjs`
Expected: PASS — all m10 tests green.

- [ ] **Step 5: Commit**

```bash
git add tools/privacy-audit.mjs tests/m10.test.mjs
git commit -m "feat(privacy): privacy-audit asserts sensitive cards are encrypted at rest"
```

---

### Task 5: UI residency chip on feed cards

**Files:**
- Modify: `web/public/app.js` (feed item render)
- Modify: `web/public/style.css`

- [ ] **Step 1: Add a residency chip to feed items**

In `web/public/app.js`, the `renderFeedItem(c)` function builds each feed card. The feed payload from `/api/cards` includes `c.output` but not residency directly; surface the persisted `encrypted` flag instead as the privacy indicator. In `handleCardList` (server) the feed already maps fields — add `encrypted: !!c.encrypted` to that map (server change) and in `renderFeedItem` prepend a chip:
```js
  const privacy = c.encrypted ? `<span class="chip lock">🔒 on-device</span>` : `<span class="chip cloud">☁ cloud</span>`;
```
and include `${privacy}` in the `feed-item-actions` markup.

(Server: in `handleCardList`'s `feed.map`, add `encrypted: !!c.encrypted,` to the per-card object.)

- [ ] **Step 2: Style the chip**

In `web/public/style.css` append:
```css
.feed-item .chip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.feed-item .chip.lock { color: var(--accent); border-color: var(--accent); }
.feed-item .chip.cloud { color: var(--muted); }
```

- [ ] **Step 3: Verify statically + smoke**

Run: `node --check web/public/app.js` (parses). Then a server smoke confirming `/api/cards` returns `encrypted` per card:
```bash
PORT=5215 node web/server.mjs & sleep 1
curl -s -X POST localhost:5215/api/process -H 'content-type: application/json' -d '{"text":"shipped the dashboard"}' >/dev/null
curl -s localhost:5215/api/cards | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("feed[0] has encrypted field:", "encrypted" in (j.cards[0]||{}))})'
kill %1
```
Expected: `feed[0] has encrypted field: true`.

- [ ] **Step 4: Commit**

```bash
git add web/public/app.js web/public/style.css web/server.mjs
git commit -m "feat(privacy): residency chip on feed cards (on-device vs cloud)"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/project/change-log.md`, `docs/knowledge/shared-observations.md`, `docs/architecture/overview.md`, `docs/security/risk-register.md`, `docs/database/migration-readiness.md`

- [ ] **Step 1:** change-log: add a Phase C row (at-rest encryption of sensitive rows; ADR-0006 now Accepted).
- [ ] **Step 2:** shared-observations: append a Phase C entry (encryption basis = finalDomain≠business OR residency=local; cloud DB sees ciphertext; memory mirrors the flag; privacy-audit invariant).
- [ ] **Step 3:** architecture/overview: mark at-rest encryption **built**; update the providers/persistence rows; note ADR-0006 Accepted.
- [ ] **Step 4:** risk-register: update R-007/secrets and add/adjust the key-loss risk to note encrypted card content is also unrecoverable on key loss.
- [ ] **Step 5:** migration-readiness: record the `phase_c_at_rest_encryption` migration.
- [ ] **Step 6:** Run the validator chain (`validate-companions`, `validate-placeholders`) — both exit 0. Commit.

```bash
git add docs/
git commit -m "docs(privacy): Phase C change-log, observations, architecture, risk, migration"
```

---

## Self-Review notes

- **Spec coverage (§5 + feedback-readiness + audit):** encryption columns + migration (Task 1); encrypt-on-write/decrypt-on-read with sensitivity = finalDomain≠business OR residency=local (Task 2); server marks it + feedback fields (Task 3); privacy-audit invariant (Task 4); residency UI chip (Task 5); ADR-0006 + docs (Tasks 1,6).
- **Backward-compat:** business cards stay plaintext (public-eligible); memory backend holds plaintext + mirrors the flag (zero-infra demo); a missing `KINETIC_TOKEN_ENCRYPTION_KEY` only matters when Supabase is configured AND a sensitive card is saved (then `encryptToken` throws — surfaced as a 502, not silent).
- **Tier 4:** the migration mutates the shared Supabase project — confirm operator authorization before Step 1 of Task 1.
- **Type consistency:** `saveCard({ output, provider, source, sensitive, hint, residency, origin })`; `mapRow` returns `{ output, createdAt, isPublic, provider, source, encrypted }`; `auditEncryption(cards) -> { ok, sensitiveCount, violations }`.

## Next
- **Sub-project 2** — categorization feedback/finetuning loop (own spec; the columns are now in place).
- **Phase D (optional)** — two-pass classify-then-route (`KINETIC_TWO_PASS`).
