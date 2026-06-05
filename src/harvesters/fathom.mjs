// src/harvesters/fathom.mjs
// Fathom.video meeting-assistant harvester. Pulls recent meetings (AI summary +
// action items) from the Fathom API and converts each into the canonical Kinetic
// capture shape (+ provider_domain_hint). A meeting's action items flow into the
// capture text, so the LLM surfaces them as Kinetic admin tasks.
//
// API: GET https://api.fathom.ai/external/v1/meetings
//   ?include_summary=true&include_action_items=true&created_after=<iso>&cursor=<>
//   Pagination via the response `next_cursor`. Rate limit ~60/min.
// Auth: a Fathom API key in the `X-Api-Key` header (NOT a Bearer token).
//   Create one at https://fathom.video/customize#api-access. Pass it per-request
//   (`apiKey`) or via the FATHOM_API_KEY env var.
//
// This is the first meeting-assistant integration; Granola / Circleback / Fireflies
// can follow the same harvest() contract with their own client.

import { combineHints } from "./domain-hint.mjs";

const _node = globalThis.process;
const API_BASE = "https://api.fathom.ai/external/v1";

/**
 * @param {{ apiKey?: string, max?: number, sinceHours?: number }} opts
 * @returns {Promise<Array<{ source_id, text, image_caption, occurred_at, provider_domain_hint }>>}
 */
export async function harvest(opts = {}) {
  const apiKey = opts.apiKey || _node.env.FATHOM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "fathom harvester: a Fathom API key is required (X-Api-Key). Pass `apiKey` or set " +
      "FATHOM_API_KEY. Create one at https://fathom.video/customize#api-access."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 10, 1), 50);
  const sinceHours = Number(opts.sinceHours) || 720; // default: last 30 days
  const createdAfter = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  const items = [];
  let cursor;
  // Page until we have `max` items or run out of pages.
  for (let page = 0; page < 10 && items.length < max; page++) {
    const params = new URLSearchParams({
      include_summary: "true",
      include_action_items: "true",
      created_after: createdAfter,
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${API_BASE}/meetings?${params}`, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) throw new Error("fathom 401: API key invalid or revoked.");
      if (res.status === 429) throw new Error("fathom 429: rate limited (60/min). Try again shortly.");
      throw new Error(`fathom ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const meetings = Array.isArray(json.items) ? json.items
      : Array.isArray(json.meetings) ? json.meetings
      : Array.isArray(json.results) ? json.results
      : Array.isArray(json) ? json : [];
    for (const m of meetings) {
      const item = mapMeeting(m);
      if (item) items.push(item);
      if (items.length >= max) break;
    }
    cursor = json.next_cursor || json.cursor || null;
    if (!cursor || meetings.length === 0) break;
  }
  return items;
}

/** Map one Fathom meeting object to a capture. Exported for offline tests. */
export function mapMeeting(m) {
  if (!m) return null;
  const title = (m.meeting_title || m.title || "Untitled meeting").trim();
  const id = m.recording_id || m.id || m.recording?.id;
  const url = m.url || m.share_url || m.recording?.url || "";
  const occurred_at = toIso(m.recording_start_time || m.scheduled_start_time || m.created_at);

  const summary = cleanSummary(m.default_summary?.markdown_formatted || m.summary || "").slice(0, 1500);
  const actions = (m.action_items || [])
    .map((a) => {
      const who = a.assignee?.name || a.assignee?.email || (typeof a.assignee === "string" ? a.assignee : "");
      return `- ${String(a.description || a.text || "").trim()}${who ? ` (assigned: ${who})` : ""}`;
    })
    .filter((s) => s.length > 2)
    .slice(0, 12);

  const parts = [`Meeting: "${title}".`];
  if (summary) parts.push(summary);
  if (actions.length) parts.push(`Action items:\n${actions.join("\n")}`);

  const emails = (m.calendar_invitees || []).map((i) => i?.email).filter(Boolean);

  return {
    source_id: `fathom-${id || slug(title)}`,
    text: parts.join("\n"),
    image_caption: url ? `Fathom recording: ${url}` : "",
    occurred_at,
    provider_domain_hint: combineHints(emails, `${title} ${summary}`),
  };
}

// Flatten the AI summary markdown to readable plain text (drop heading hashes and
// bold markers; collapse blank runs) so the LLM gets signal without boilerplate.
function cleanSummary(md) {
  return String(md)
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "meeting";
}

function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
