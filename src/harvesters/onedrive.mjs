// src/harvesters/onedrive.mjs
// Microsoft OneDrive / SharePoint file-activity harvester. Pulls the user's
// recently used files and converts each into the canonical Kinetic capture
// shape (+ provider_domain_hint, ADR-0003).
//
// Endpoint: GET https://graph.microsoft.com/v1.0/me/drive/recent
// Auth: an OAuth 2.0 bearer token with the Files.Read.All scope.
//   v0.5 accepts the token per-request (body) or via MS_ACCESS_TOKEN.
//   M7 replaces this with stored, refreshed tokens behind the same contract.

import { hintFromKeywords } from "./domain-hint.mjs";

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
      "onedrive harvester: a Microsoft Graph access token is required " +
      "(Files.Read.All scope). Pass `accessToken` or set MS_ACCESS_TOKEN."
    );
  }
  const max = Math.min(Math.max(Number(opts.max) || 10, 1), 50);
  const url = `${GRAPH_BASE}/me/drive/recent?$top=${max}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("onedrive 401: access token invalid or expired.");
    if (res.status === 403) throw new Error(`onedrive 403: missing Files.Read.All scope. (${body.slice(0, 200)})`);
    throw new Error(`onedrive ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const files = Array.isArray(json.value) ? json.value : [];
  return files.slice(0, max).map(mapItem).filter(Boolean);
}

/** Map one Graph driveItem to a capture. Exported for offline tests. */
export function mapItem(item) {
  if (!item || !item.name) return null;
  const name = String(item.name);
  const occurred_at = toIso(item.lastModifiedDateTime || item.fileSystemInfo?.lastModifiedDateTime);
  const kind = item.folder ? "folder" : friendlyKind(item.file?.mimeType);
  const where = item.parentReference?.path
    ? String(item.parentReference.path).replace(/^\/drive\/root:?/, "").replace(/^\/+/, "") || null
    : null;

  const parts = [`OneDrive ${kind}: "${name}".`];
  if (where) parts.push(`In: ${where}.`);
  parts.push("Recently modified.");

  // Personal-vs-work signal: a "personal" driveType, or non-work keywords in
  // the path/name, nudges the hint away from the business default.
  const hintText = `${name} ${where || ""} ${item.parentReference?.driveType === "personal" ? "personal" : ""}`;

  return {
    source_id: `onedrive-${item.id || slug(name)}`,
    text: parts.join(" "),
    image_caption: "",
    occurred_at,
    provider_domain_hint: hintFromKeywords(hintText),
  };
}

function friendlyKind(mimeType) {
  if (!mimeType) return "file";
  if (mimeType.includes("word") || mimeType.includes("document")) return "document";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "presentation";
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
