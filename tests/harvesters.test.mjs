// tests/harvesters.test.mjs
// Offline, zero-dependency tests for the M9 signal harvesters.
//
// The harvesters call the global `fetch`. These tests stub `globalThis.fetch`
// with synthetic API responses shaped like the real providers, so the full
// harvest() path (auth checks, request building, response mapping, domain
// hinting) is exercised without any network or credentials. Live verification
// against real accounts is a separate M9 step once OAuth (M7) lands.
//
// Run: node tests/harvesters.test.mjs

import assert from "node:assert/strict";

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`✗ ${name}\n    ${e.message}`);
  }
}

/** Run `fn` with `globalThis.fetch` replaced by `stub`, then restore. */
async function withFetch(stub, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

/** Build a minimal fetch Response stand-in carrying `obj` as JSON. */
function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  };
}

const DOMAINS = new Set(["business", "personal", "family", "financial", "parenting", "unknown"]);

/** Assert the canonical capture shape (+ M9 domain hint) on one item. */
function assertCaptureShape(item, sourcePrefix) {
  assert.ok(item, "item is present");
  assert.equal(typeof item.source_id, "string");
  assert.ok(item.source_id.startsWith(sourcePrefix), `source_id starts with ${sourcePrefix} (got ${item.source_id})`);
  assert.equal(typeof item.text, "string");
  assert.ok(item.text.trim().length > 0, "text is non-empty");
  assert.equal(typeof item.image_caption, "string");
  assert.ok(item.occurred_at === null || typeof item.occurred_at === "string", "occurred_at is string|null");
  assert.ok(DOMAINS.has(item.provider_domain_hint), `provider_domain_hint is a valid domain (got ${item.provider_domain_hint})`);
}

// ---------------------------------------------------------------------------
// mscal — Microsoft Graph Calendar (GET /me/calendar/events)
// ---------------------------------------------------------------------------

await test("mscal: requires an access token", async () => {
  const { harvest } = await import("../src/harvesters/mscal.mjs");
  await assert.rejects(() => harvest({}), /token/i);
});

await test("mscal: maps a calendar event to a capture", async () => {
  const { harvest } = await import("../src/harvesters/mscal.mjs");
  const graph = {
    value: [
      {
        id: "AAMkAGI1",
        subject: "Quarterly roadmap sync",
        bodyPreview: "Walk through Q3 priorities and staffing.",
        start: { dateTime: "2026-06-01T17:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-06-01T18:00:00.0000000", timeZone: "UTC" },
        location: { displayName: "Conf Room 4" },
        organizer: { emailAddress: { name: "Dana", address: "dana@acme.com" } },
        attendees: [{ emailAddress: { name: "Lee", address: "lee@acme.com" }, type: "required" }],
      },
    ],
  };
  const items = await withFetch(async () => jsonResponse(graph), () => harvest({ accessToken: "tok" }));
  assert.equal(items.length, 1);
  assertCaptureShape(items[0], "mscal-");
  assert.match(items[0].text, /Quarterly roadmap sync/);
  assert.equal(items[0].occurred_at, "2026-06-01T17:00:00.000Z");
  assert.equal(items[0].provider_domain_hint, "business");
});

await test("mscal: personal-keyword subject hints personal", async () => {
  const { harvest } = await import("../src/harvesters/mscal.mjs");
  const graph = { value: [{ id: "x", subject: "Dentist appointment", start: { dateTime: "2026-06-01T09:00:00Z" }, end: { dateTime: "2026-06-01T09:30:00Z" } }] };
  const items = await withFetch(async () => jsonResponse(graph), () => harvest({ accessToken: "tok" }));
  assert.equal(items[0].provider_domain_hint, "personal");
});

// ---------------------------------------------------------------------------
// gdrive — Google Drive Activity API (POST activity:query)
// ---------------------------------------------------------------------------

await test("gdrive: requires an access token", async () => {
  const { harvest } = await import("../src/harvesters/gdrive.mjs");
  await assert.rejects(() => harvest({}), /token/i);
});

await test("gdrive: maps a drive activity to a capture", async () => {
  const { harvest } = await import("../src/harvesters/gdrive.mjs");
  const activityResp = {
    activities: [
      {
        primaryActionDetail: { edit: {} },
        timestamp: "2026-05-30T14:00:00Z",
        actors: [{ user: { knownUser: { isCurrentUser: true } } }],
        targets: [{ driveItem: { name: "items/abc", title: "Q3 Launch Plan.docx", mimeType: "application/vnd.google-apps.document" } }],
      },
    ],
  };
  const items = await withFetch(async () => jsonResponse(activityResp), () => harvest({ accessToken: "tok" }));
  assert.equal(items.length, 1);
  assertCaptureShape(items[0], "gdrive-");
  assert.match(items[0].text, /Q3 Launch Plan\.docx/);
  assert.match(items[0].text, /edit/i);
  assert.equal(items[0].occurred_at, "2026-05-30T14:00:00.000Z");
});

// ---------------------------------------------------------------------------
// onedrive — Microsoft Graph (GET /me/drive/recent)
// ---------------------------------------------------------------------------

await test("onedrive: requires an access token", async () => {
  const { harvest } = await import("../src/harvesters/onedrive.mjs");
  await assert.rejects(() => harvest({}), /token/i);
});

await test("onedrive: maps a recent file to a capture", async () => {
  const { harvest } = await import("../src/harvesters/onedrive.mjs");
  const graph = {
    value: [
      {
        id: "01ABC",
        name: "Budget FY26.xlsx",
        lastModifiedDateTime: "2026-05-29T11:30:00Z",
        webUrl: "https://contoso-my.sharepoint.com/...",
        file: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        parentReference: { driveType: "business", path: "/drive/root:/Finance" },
      },
    ],
  };
  const items = await withFetch(async () => jsonResponse(graph), () => harvest({ accessToken: "tok" }));
  assert.equal(items.length, 1);
  assertCaptureShape(items[0], "onedrive-");
  assert.match(items[0].text, /Budget FY26\.xlsx/);
  assert.equal(items[0].occurred_at, "2026-05-29T11:30:00.000Z");
});

// ---------------------------------------------------------------------------
// gmail_sent — Gmail API (users.messages.list q=in:sent + messages.get metadata)
// ---------------------------------------------------------------------------

await test("gmail_sent: requires an access token", async () => {
  const { harvest } = await import("../src/harvesters/gmail_sent.mjs");
  await assert.rejects(() => harvest({}), /token/i);
});

await test("gmail_sent: lists then fetches metadata, maps to a capture", async () => {
  const { harvest } = await import("../src/harvesters/gmail_sent.mjs");
  const list = { messages: [{ id: "m1", threadId: "t1" }], resultSizeEstimate: 1 };
  const message = {
    id: "m1",
    threadId: "t1",
    labelIds: ["SENT"],
    snippet: "Sending over the signed SOW for the pilot.",
    internalDate: "1748789400000", // epoch ms
    payload: {
      headers: [
        { name: "To", value: "Procurement <procurement@bigcorp.com>" },
        { name: "Subject", value: "Signed SOW — pilot kickoff" },
        { name: "Date", value: "Mon, 01 Jun 2026 12:30:00 +0000" },
      ],
    },
  };
  const stub = async (url) => (/\/messages\/[^/?]+\?/.test(url) ? jsonResponse(message) : jsonResponse(list));
  const items = await withFetch(stub, () => harvest({ accessToken: "tok" }));
  assert.equal(items.length, 1);
  assertCaptureShape(items[0], "gmail-");
  assert.match(items[0].text, /Signed SOW/);
  assert.equal(items[0].provider_domain_hint, "business"); // corp recipient
});

await test("gmail_sent: free-mail recipient hints personal", async () => {
  const { harvest } = await import("../src/harvesters/gmail_sent.mjs");
  const list = { messages: [{ id: "m2" }] };
  const message = {
    id: "m2",
    internalDate: "1748789400000",
    snippet: "see you saturday",
    payload: { headers: [{ name: "To", value: "mom@gmail.com" }, { name: "Subject", value: "dinner sat" }] },
  };
  const stub = async (url) => (/\/messages\/[^/?]+\?/.test(url) ? jsonResponse(message) : jsonResponse(list));
  const items = await withFetch(stub, () => harvest({ accessToken: "tok" }));
  assert.equal(items[0].provider_domain_hint, "personal");
});

// ---------------------------------------------------------------------------
// outlook_sent — Microsoft Graph (GET /me/mailFolders/sentitems/messages)
// ---------------------------------------------------------------------------

await test("outlook_sent: requires an access token", async () => {
  const { harvest } = await import("../src/harvesters/outlook_sent.mjs");
  await assert.rejects(() => harvest({}), /token/i);
});

await test("outlook_sent: maps a sent message to a capture", async () => {
  const { harvest } = await import("../src/harvesters/outlook_sent.mjs");
  const graph = {
    value: [
      {
        id: "AAMk-msg",
        subject: "Re: contract redlines",
        bodyPreview: "Attached the redlined contract for your review.",
        sentDateTime: "2026-05-31T16:45:00Z",
        toRecipients: [{ emailAddress: { name: "Counsel", address: "counsel@partnerfirm.com" } }],
      },
    ],
  };
  const items = await withFetch(async () => jsonResponse(graph), () => harvest({ accessToken: "tok" }));
  assert.equal(items.length, 1);
  assertCaptureShape(items[0], "outlook-");
  assert.match(items[0].text, /contract redlines/);
  assert.equal(items[0].occurred_at, "2026-05-31T16:45:00.000Z");
  assert.equal(items[0].provider_domain_hint, "business");
});

// ---------------------------------------------------------------------------
// github — events API returns a REDUCED pull_request (no title/body/html_url).
// The harvester must not emit "undefined", and should enrich the title via a
// best-effort follow-up fetch to the PR's api url.
// ---------------------------------------------------------------------------

function recentIso() { return new Date(Date.now() - 3600 * 1000).toISOString(); }

await test("github: reduced PullRequestEvent never emits 'undefined'", async () => {
  const { harvest } = await import("../src/harvesters/github.mjs");
  const events = [{
    id: "E1", type: "PullRequestEvent", created_at: recentIso(),
    repo: { name: "unclenate/auto-harness" },
    payload: {
      action: "opened", number: 94,
      pull_request: { url: "https://api.github.com/repos/unclenate/auto-harness/pulls/94", id: 1, number: 94, head: {}, base: {} },
    },
  }];
  // events list ok; PR-detail enrichment fetch fails → base text only, no title
  const stub = async (url) => (url.includes("/events/public") ? jsonResponse(events) : jsonResponse({}, 404));
  const items = await withFetch(stub, () => harvest({ username: "unclenate", max: 5 }));
  assert.equal(items.length, 1);
  assert.ok(!/undefined/.test(items[0].text), `no 'undefined' in text (got: ${items[0].text})`);
  assert.match(items[0].text, /unclenate\/auto-harness#94/);
});

await test("github: PR event enriches the title via a follow-up fetch", async () => {
  const { harvest } = await import("../src/harvesters/github.mjs");
  const events = [{
    id: "E2", type: "PullRequestEvent", created_at: recentIso(),
    repo: { name: "o/r" },
    payload: {
      action: "opened", number: 7,
      pull_request: { url: "https://api.github.com/repos/o/r/pulls/7", number: 7, head: {}, base: {} },
    },
  }];
  const stub = async (url) => (url.includes("/events/public")
    ? jsonResponse(events)
    : jsonResponse({ title: "Add retry with backoff", body: "Makes the client resilient." }));
  const items = await withFetch(stub, () => harvest({ username: "o", max: 5 }));
  assert.match(items[0].text, /Add retry with backoff/);
  assert.ok(!/undefined/.test(items[0].text));
});

// ---------------------------------------------------------------------------
// fathom — Fathom.video meeting assistant (X-Api-Key; summary + action items)
// ---------------------------------------------------------------------------

await test("fathom: requires an api key", async () => {
  const { harvest } = await import("../src/harvesters/fathom.mjs");
  await assert.rejects(() => harvest({}), /api key|FATHOM_API_KEY/i);
});

await test("fathom: maps a meeting (summary + action items) to a capture", async () => {
  const { harvest } = await import("../src/harvesters/fathom.mjs");
  const resp = {
    items: [
      {
        recording_id: 698179885,
        meeting_title: "EG AI | Fortify & ARMEXA discussion",
        url: "https://fathom.video/calls/698179885",
        recording_start_time: "2026-06-03T23:31:26Z",
        recorded_by: { name: "Nathan DiNiro", email: "nate@fullgv.com" },
        calendar_invitees: [{ name: "Jeremy", email: "jeremy@armexa.com", is_external: true }],
        default_summary: { template_name: "general", markdown_formatted: "## Meeting Purpose\nAlign on EGAI strategy.\n## Key Takeaways\n- Discovery, not a pitch." },
        action_items: [{ description: "Draft Friday agenda; send to Jeremy", assignee: { name: "Nathan DiNiro" } }],
      },
    ],
    next_cursor: null,
  };
  let captured;
  const stub = async (url, opts) => { captured = { url, headers: opts.headers }; return jsonResponse(resp); };
  const items = await withFetch(stub, () => harvest({ apiKey: "fk_test", max: 5 }));
  assert.equal(items.length, 1);
  assert.match(captured.url, /api\.fathom\.ai\/external\/v1\/meetings/);
  assert.equal(captured.headers["X-Api-Key"], "fk_test");
  assertCaptureShape(items[0], "fathom-");
  assert.match(items[0].text, /EG AI/);
  assert.match(items[0].text, /Align on EGAI strategy/);          // summary flows in
  assert.match(items[0].text, /Draft Friday agenda/);             // action item flows in
  assert.equal(items[0].occurred_at, "2026-06-03T23:31:26.000Z");
});

// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
