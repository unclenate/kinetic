// src/harvesters/gmail_sent.mjs
// Gmail "sent items" harvester. Lists recently sent messages and converts each
// into the canonical Kinetic capture shape (+ provider_domain_hint, ADR-0003).
//
// Endpoints:
//   GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent newer_than:1d
//   GET https://gmail.googleapis.com/gmail/v1/users/me/messages/{id}?format=metadata
//        &metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date
// We request `format=metadata` only — subject + recipients + date, never body
// content — to minimize the data Kinetic reads from the user's mailbox.
// Auth: an OAuth 2.0 bearer token with the gmail.readonly (or .metadata) scope.

import { combineHints, domainOf } from "./domain-hint.mjs";

const _node = globalThis.process;
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * @param {{ accessToken?: string, max?: number, query?: string }} opts
 * @returns {Promise<Array<{ source_id, text, image_caption, occurred_at, provider_domain_hint }>>}
 */
export async function harvest(opts = {}) {
  const accessToken = opts.accessToken || _node.env.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "gmail_sent harvester: a Google access token is required " +
      "(gmail.readonly scope). Pass `accessToken` or set GOOGLE_ACCESS_TOKEN."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 5, 1), 25);
  const query = opts.query || "in:sent newer_than:1d";
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  const listUrl = `${GMAIL_BASE}/messages?${new URLSearchParams({ q: query, maxResults: String(max) })}`;
  const listRes = await fetch(listUrl, { headers });
  if (!listRes.ok) {
    const body = await listRes.text().catch(() => "");
    if (listRes.status === 401) throw new Error("gmail_sent 401: access token invalid or expired.");
    if (listRes.status === 403) throw new Error(`gmail_sent 403: missing gmail.readonly scope. (${body.slice(0, 200)})`);
    throw new Error(`gmail_sent ${listRes.status}: ${body.slice(0, 300)}`);
  }
  const list = await listRes.json();
  const ids = (Array.isArray(list.messages) ? list.messages : []).map((m) => m.id).filter(Boolean).slice(0, max);

  const items = [];
  for (const id of ids) {
    const metaUrl = `${GMAIL_BASE}/messages/${encodeURIComponent(id)}?` +
      "format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date";
    const res = await fetch(metaUrl, { headers });
    if (!res.ok) continue; // skip individual fetch failures; partial harvest is fine
    const msg = await res.json();
    const item = mapMessage(msg);
    if (item) items.push(item);
  }
  return items;
}

/** Map one Gmail message (format=metadata) to a capture. Exported for tests. */
export function mapMessage(msg) {
  if (!msg) return null;
  const headers = Object.fromEntries(
    (msg.payload?.headers || []).map((h) => [String(h.name).toLowerCase(), h.value])
  );
  const subject = (headers.subject || "(no subject)").trim();
  const to = headers.to || "";
  const recipientNames = to.split(",").map((r) => cleanName(r)).filter(Boolean).slice(0, 3).join(", ");
  const snippet = (msg.snippet || "").replace(/\s+/g, " ").trim().slice(0, 200);

  const occurred_at = msg.internalDate
    ? new Date(Number(msg.internalDate)).toISOString()
    : toIso(headers.date);

  const parts = [`Sent email: "${subject}"`];
  if (recipientNames) parts.push(`to ${recipientNames}`);
  let text = parts.join(" ") + ".";
  if (snippet) text += ` ${snippet}`;

  const addresses = to.split(",").map((r) => domainOf(r) && r).filter(Boolean);

  return {
    source_id: `gmail-${msg.id || slug(subject)}`,
    text,
    image_caption: "",
    occurred_at,
    provider_domain_hint: combineHints(addresses, `${subject} ${snippet}`),
  };
}

function cleanName(raw) {
  const s = String(raw).trim();
  const named = s.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  if (named) return named[1].trim();
  return s.replace(/[<>]/g, "").trim();
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "msg";
}

function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
