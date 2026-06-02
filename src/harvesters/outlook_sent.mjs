// src/harvesters/outlook_sent.mjs
// Outlook "sent items" harvester. Lists recently sent messages via Microsoft
// Graph and converts each into the canonical Kinetic capture shape
// (+ provider_domain_hint, ADR-0003).
//
// Endpoint: GET https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages
//   ?$top=N&$orderby=sentDateTime desc
//   &$select=id,subject,sentDateTime,bodyPreview,toRecipients
// Auth: an OAuth 2.0 bearer token with the Mail.Read scope.

import { combineHints } from "./domain-hint.mjs";

const _node = globalThis.process;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * @param {{ accessToken?: string, max?: number }} opts
 * @returns {Promise<Array<{ source_id, text, image_caption, occurred_at, provider_domain_hint }>>}
 */
export async function harvest(opts = {}) {
  const accessToken = opts.accessToken || _node.env.MS_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "outlook_sent harvester: a Microsoft Graph access token is required " +
      "(Mail.Read scope). Pass `accessToken` or set MS_ACCESS_TOKEN."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 5, 1), 25);
  const params = new URLSearchParams({
    $top: String(max),
    $orderby: "sentDateTime desc",
    $select: "id,subject,sentDateTime,bodyPreview,toRecipients",
  });
  const url = `${GRAPH_BASE}/me/mailFolders/sentitems/messages?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("outlook_sent 401: access token invalid or expired.");
    if (res.status === 403) throw new Error(`outlook_sent 403: missing Mail.Read scope. (${body.slice(0, 200)})`);
    throw new Error(`outlook_sent ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const messages = Array.isArray(json.value) ? json.value : [];
  return messages.slice(0, max).map(mapMessage).filter(Boolean);
}

/** Map one Graph sent message to a capture. Exported for offline tests. */
export function mapMessage(msg) {
  if (!msg) return null;
  const subject = (msg.subject || "(no subject)").trim();
  const recipients = (msg.toRecipients || [])
    .map((r) => r?.emailAddress)
    .filter(Boolean);
  const names = recipients.map((e) => e.name || e.address).filter(Boolean).slice(0, 3).join(", ");
  const snippet = (msg.bodyPreview || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const occurred_at = toIso(msg.sentDateTime);

  const parts = [`Sent email: "${subject}"`];
  if (names) parts.push(`to ${names}`);
  let text = parts.join(" ") + ".";
  if (snippet) text += ` ${snippet}`;

  const addresses = recipients.map((e) => e.address).filter(Boolean);

  return {
    source_id: `outlook-${msg.id || slug(subject)}`,
    text,
    image_caption: "",
    occurred_at,
    provider_domain_hint: combineHints(addresses, `${subject} ${snippet}`),
  };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "msg";
}

function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
