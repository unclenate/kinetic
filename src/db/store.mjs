// src/db/store.mjs
// Pluggable persistence for Proof cards. `createStore()` returns the Supabase
// backend when SUPABASE_URL is configured, else an in-memory backend so the
// demo runs with zero infrastructure (the v0 behavior). The HTTP server talks
// only to this interface, never to a Map or to Supabase directly.
//
// Interface:
//   store.backend                       -> "memory" | "supabase"
//   store.saveCard({ output, provider, source }) -> { id, output }
//   store.getCard(id)                    -> record | null
//   store.shareCard(id)                  -> record | null
//
// `record` shape: { output, createdAt, isPublic, provider?, source? }
// saveCard owns the id namespace: it assigns the short card id and rewrites the
// proof_card / admin_task ids so every backend is consistent.

import { randomBytes } from "node:crypto";
import * as supabase from "./supabase.mjs";
import { encryptToken, decryptToken } from "../oauth/crypto.mjs";

function shortId() { return randomBytes(4).toString("hex"); }

/** Stamp server-controlled ids onto the LLM output. Mutates and returns it. */
function applyIds(output, cardId) {
  output.proof_card.id = `proof_${cardId}`;
  output.admin_tasks = (output.admin_tasks || []).map((t, i) => ({ ...t, id: `task_${cardId}${i.toString(16)}` }));
  return output;
}

// ---------------------------------------------------------------------------
// in-memory backend (default)
// ---------------------------------------------------------------------------

function createMemoryStore() {
  const cards = new Map();
  return {
    backend: "memory",
    get size() { return cards.size; },
    async saveCard({ output, provider, source, sensitive }) {
      const id = shortId();
      applyIds(output, id);
      // Memory is the zero-infra demo: it holds plaintext in-process but mirrors
      // the `encrypted` flag so the privacy audit and feed see it.
      cards.set(id, { output, createdAt: new Date().toISOString(), isPublic: false, provider, source: source || null, encrypted: !!sensitive });
      return { id, output };
    },
    async getCard(id) {
      return cards.get(id) || null;
    },
    async shareCard(id) {
      const rec = cards.get(id);
      if (!rec) return null;
      rec.isPublic = true;
      return rec;
    },
    async listCards() {
      // Newest-first: reverse the Map's insertion order.
      return [...cards.entries()].reverse().map(([id, rec]) => ({ id, ...rec }));
    },
  };
}

// ---------------------------------------------------------------------------
// supabase backend (PostgREST). Built request-correct; integration-verified
// live at M7-live (no offline DB to test the round-trip against).
// ---------------------------------------------------------------------------

function createSupabaseStore() {
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
  return {
    backend: "supabase",
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
    async getCard(id) {
      const row = await supabase.selectOne("proof_cards", `slug=eq.${encodeURIComponent(id)}`);
      return mapRow(row);
    },
    async shareCard(id) {
      const rows = await supabase.update("proof_cards", `slug=eq.${encodeURIComponent(id)}`, { is_public: true });
      return mapRow(Array.isArray(rows) ? rows[0] : rows);
    },
    async listCards({ limit = 200 } = {}) {
      const rows = await supabase.select("proof_cards", `order=created_at.desc&limit=${limit}`);
      return rows.map((row) => ({ id: row.slug, ...mapRow(row) }));
    },
  };
}

/** Choose a backend based on configuration. */
export function createStore() {
  return supabase.isConfigured() ? createSupabaseStore() : createMemoryStore();
}
