// src/harvesters/mscal.mjs
// Microsoft Graph Calendar harvester. Pulls recent/upcoming events from the
// user's default calendar and converts each into the canonical Kinetic capture
// shape (+ provider_domain_hint, ADR-0003).
//
// Endpoint: GET https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=..&endDateTime=..
//   (calendarView expands recurring events within a window, like gcal's
//    singleEvents=true.)
// Auth: an OAuth 2.0 bearer access token with the Calendars.Read scope.
//   For v0.5 the token is passed per-request (body) or via MS_ACCESS_TOKEN.
//   M7 replaces this with stored, refreshed tokens behind the same contract.

import { combineHints } from "./domain-hint.mjs";

const _node = globalThis.process;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * @param {{ accessToken?: string, sinceHours?: number, untilHours?: number, max?: number }} opts
 * @returns {Promise<Array<{ source_id, text, image_caption, occurred_at, provider_domain_hint }>>}
 */
export async function harvest(opts = {}) {
  const accessToken = opts.accessToken || _node.env.MS_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "mscal harvester: a Microsoft Graph access token is required " +
      "(Calendars.Read scope). Pass `accessToken` or set MS_ACCESS_TOKEN."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 10, 1), 50);
  const sinceHours = Number(opts.sinceHours) || 48;
  const untilHours = Number(opts.untilHours) || 24;
  const now = Date.now();
  const startDateTime = new Date(now - sinceHours * 3600 * 1000).toISOString();
  const endDateTime = new Date(now + untilHours * 3600 * 1000).toISOString();

  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $orderby: "start/dateTime",
    $top: String(max),
    $select: "id,subject,bodyPreview,start,end,location,organizer,attendees",
  });
  const url = `${GRAPH_BASE}/me/calendarView?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("mscal 401: access token invalid or expired.");
    if (res.status === 403) throw new Error(`mscal 403: missing Calendars.Read scope. (${body.slice(0, 200)})`);
    throw new Error(`mscal ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const events = Array.isArray(json.value) ? json.value : [];
  return events.map(mapEvent).filter(Boolean);
}

/** Map one Graph event object to a capture. Exported for offline tests. */
export function mapEvent(ev) {
  if (!ev) return null;
  const subject = (ev.subject || "Untitled event").trim();
  const startRaw = ev.start?.dateTime || ev.start?.date || null;
  const endRaw = ev.end?.dateTime || ev.end?.date || null;
  const occurred_at = toIso(startRaw);

  const parts = [`Calendar event: "${subject}".`];
  const dur = durationMinutes(startRaw, endRaw);
  if (dur != null) parts.push(`Duration: ${dur} min.`);
  const attendees = (ev.attendees || [])
    .map((a) => a?.emailAddress?.name || a?.emailAddress?.address)
    .filter(Boolean)
    .slice(0, 5);
  if (attendees.length) parts.push(`With: ${attendees.join(", ")}.`);
  if (ev.location?.displayName) parts.push(`Location: ${String(ev.location.displayName).slice(0, 80)}.`);
  if (ev.bodyPreview) {
    const desc = String(ev.bodyPreview).replace(/\s+/g, " ").trim().slice(0, 240);
    if (desc) parts.push(`Notes: ${desc}`);
  }

  const addresses = [
    ev.organizer?.emailAddress?.address,
    ...(ev.attendees || []).map((a) => a?.emailAddress?.address),
  ].filter(Boolean);

  return {
    source_id: `mscal-${ev.id || Math.random().toString(36).slice(2, 10)}`,
    text: parts.join(" "),
    image_caption: "",
    occurred_at,
    provider_domain_hint: combineHints(addresses, `${subject} ${ev.bodyPreview || ""}`),
  };
}

// Graph returns naive UTC datetimes with up to 7 fractional digits and no
// trailing 'Z' (e.g. "2026-06-01T17:00:00.0000000"). Normalize to a parseable
// ISO string: clamp sub-second to milliseconds and assume UTC when no zone.
function parseMs(raw) {
  if (!raw) return NaN;
  let s = String(raw).trim().replace(/(\.\d{3})\d+/, "$1");
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  return Date.parse(s);
}

function toIso(raw) {
  const t = parseMs(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function durationMinutes(start, end) {
  const s = parseMs(start);
  const e = parseMs(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const m = Math.round((e - s) / 60000);
  return m > 0 && m < 24 * 60 ? m : null;
}
