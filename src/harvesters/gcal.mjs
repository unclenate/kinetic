// src/harvesters/gcal.mjs
// Real Google Calendar harvester. Pulls recent events from the user's primary
// calendar via Calendar API v3 and converts each event into the canonical
// Kinetic capture shape.
//
// Auth: an OAuth 2.0 access token with the `calendar.readonly` scope.
// For the hackathon demo this is sourced from Google's OAuth Playground:
//   https://developers.google.com/oauthplayground
// Token lasts ~1h. It is passed per-request in the body, or via the
// GOOGLE_ACCESS_TOKEN env var as a fallback.
//
// Production wiring would replace the playground-token shortcut with a real
// OAuth flow (GCP project + consent screen + refresh-token storage). The
// `harvest()` contract stays identical.

const _node = globalThis.process;
const API_BASE = "https://www.googleapis.com/calendar/v3";

/**
 * @param {{ accessToken?: string, calendarId?: string, sinceHours?: number, untilHours?: number, max?: number }} opts
 * @returns {Promise<Array<{ source_id: string, text: string, image_caption: string, occurred_at: string|null }>>}
 */
export async function harvest(opts = {}) {
  const accessToken = opts.accessToken || _node.env.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "gcal harvester: access token is required. Paste one in the UI or set GOOGLE_ACCESS_TOKEN. " +
      "Get a token from https://developers.google.com/oauthplayground (Calendar API v3 → calendar.readonly)."
    );
  }
  if (accessToken.startsWith("4/")) {
    throw new Error(
      "gcal harvester: this looks like an authorization code (starts with '4/'), not an access token. " +
      "In OAuth Playground, click 'Exchange authorization code for tokens' and use the access_token (starts with 'ya29.')."
    );
  }
  const calendarId = opts.calendarId || "primary";
  const max = Math.min(Math.max(Number(opts.max) || 10, 1), 50);

  // Default window: last 48h to next 24h. Captures recent activity plus
  // imminent meetings that should land on the admin list.
  const sinceHours = Number(opts.sinceHours) || 48;
  const untilHours = Number(opts.untilHours) || 24;
  const now = Date.now();
  const timeMin = new Date(now - sinceHours * 3600 * 1000).toISOString();
  const timeMax = new Date(now + untilHours * 3600 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(max),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const url = `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("gcal 401: access token invalid or expired (tokens last ~1h). Get a fresh one from OAuth Playground.");
    }
    if (res.status === 403) {
      throw new Error(`gcal 403: missing scope. Token must include calendar.readonly. (${body.slice(0, 200)})`);
    }
    throw new Error(`gcal ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const events = Array.isArray(json.items) ? json.items : [];

  const items = [];
  for (const ev of events) {
    const item = mapEvent(ev);
    if (item) items.push(item);
  }
  return items;
}

function mapEvent(ev) {
  if (!ev || ev.status === "cancelled") return null;
  const title = (ev.summary || "Untitled event").trim();
  const start = ev.start?.dateTime || ev.start?.date || null;
  const end = ev.end?.dateTime || ev.end?.date || null;
  const occurred_at = start ? new Date(start).toISOString() : null;

  // Build a concise text block: title + duration + attendees + first chunk
  // of the description. Concise so the LLM has signal but isn't drowning in
  // boilerplate meeting bodies.
  const parts = [];
  parts.push(`Calendar event: "${title}".`);
  const dur = durationMinutes(start, end);
  if (dur != null) parts.push(`Duration: ${dur} min.`);
  const attendees = (ev.attendees || []).filter((a) => !a.self);
  if (attendees.length > 0) {
    const names = attendees.map((a) => a.displayName || a.email).filter(Boolean).slice(0, 5);
    if (names.length) parts.push(`With: ${names.join(", ")}${attendees.length > names.length ? " and others" : ""}.`);
  }
  if (ev.location) parts.push(`Location: ${String(ev.location).slice(0, 80)}.`);
  if (ev.description) {
    const desc = String(ev.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    if (desc) parts.push(`Notes: ${desc}`);
  }

  return {
    source_id: `gcal-${ev.id || ev.iCalUID || Math.random().toString(36).slice(2, 10)}`,
    text: parts.join(" "),
    image_caption: "",
    occurred_at,
  };
}

function durationMinutes(start, end) {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  const m = Math.round((e - s) / 60000);
  return m > 0 && m < 24 * 60 ? m : null;
}
