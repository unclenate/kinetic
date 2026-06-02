// src/harvesters/gdrive.mjs
// Google Drive Activity harvester. Pulls recent file activity (edits, creates,
// comments, moves, renames) and converts each into the canonical Kinetic
// capture shape (+ provider_domain_hint, ADR-0003).
//
// Endpoint: POST https://driveactivity.googleapis.com/v2/activity:query
//   body: { pageSize, filter: 'time >= "<rfc3339>"' }
// Auth: an OAuth 2.0 bearer token with the drive.activity.readonly scope.
//   v0.5 accepts the token per-request (body) or via GOOGLE_ACCESS_TOKEN.
//   M7 replaces this with stored, refreshed tokens behind the same contract.

import { hintFromKeywords } from "./domain-hint.mjs";

const _node = globalThis.process;
const ACTIVITY_URL = "https://driveactivity.googleapis.com/v2/activity:query";

/**
 * @param {{ accessToken?: string, sinceHours?: number, max?: number }} opts
 * @returns {Promise<Array<{ source_id, text, image_caption, occurred_at, provider_domain_hint }>>}
 */
export async function harvest(opts = {}) {
  const accessToken = opts.accessToken || _node.env.GOOGLE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "gdrive harvester: a Google access token is required " +
      "(drive.activity.readonly scope). Pass `accessToken` or set GOOGLE_ACCESS_TOKEN."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 10, 1), 50);
  const sinceHours = Number(opts.sinceHours) || 168; // default: last 7 days
  const sinceMs = Date.now() - sinceHours * 3600 * 1000;
  const filter = `time >= "${new Date(sinceMs).toISOString()}"`;

  const res = await fetch(ACTIVITY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ pageSize: max, filter }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("gdrive 401: access token invalid or expired.");
    if (res.status === 403) throw new Error(`gdrive 403: missing drive.activity.readonly scope. (${body.slice(0, 200)})`);
    throw new Error(`gdrive ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const activities = Array.isArray(json.activities) ? json.activities : [];
  return activities.slice(0, max).map(mapActivity).filter(Boolean);
}

/** Map one DriveActivity to a capture. Exported for offline tests. */
export function mapActivity(act) {
  if (!act) return null;
  const action = actionVerb(act.primaryActionDetail);
  const target = (act.targets || []).map((t) => t?.driveItem).find(Boolean);
  const title = target?.title || target?.name || "an item";
  const occurred_at = toIso(act.timestamp || act.timeRange?.endTime || act.timeRange?.startTime);

  const kind = friendlyKind(target?.mimeType);
  const text = `Drive activity: ${action} ${kind ? `${kind} ` : ""}"${title}".`;

  // Identifiers in the activity feed aren't stable per-activity; derive a
  // deterministic-ish id from the target name + timestamp.
  const idSeed = `${target?.name || title}-${act.timestamp || act.timeRange?.endTime || ""}`;

  return {
    source_id: `gdrive-${slug(idSeed)}`,
    text,
    image_caption: "",
    occurred_at,
    provider_domain_hint: hintFromKeywords(title),
  };
}

// primaryActionDetail is a oneof; the single present key is the action verb.
function actionVerb(detail) {
  if (!detail || typeof detail !== "object") return "changed";
  const key = Object.keys(detail)[0];
  const map = {
    create: "created", edit: "edited", move: "moved", rename: "renamed",
    delete: "deleted", restore: "restored", comment: "commented on",
    permissionChange: "shared", dlpChange: "changed protection on",
    reference: "referenced", settingsChange: "changed settings on",
    appliedLabelChange: "labeled",
  };
  return map[key] || "changed";
}

function friendlyKind(mimeType) {
  if (!mimeType) return "";
  if (mimeType.includes("document")) return "doc";
  if (mimeType.includes("spreadsheet")) return "sheet";
  if (mimeType.includes("presentation")) return "slide deck";
  if (mimeType.includes("folder")) return "folder";
  if (mimeType.includes("pdf")) return "PDF";
  return "file";
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "item";
}

function toIso(raw) {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
