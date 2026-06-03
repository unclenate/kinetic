// src/harvesters/github.mjs
// Pull recent public events for a GitHub user, convert each meaningful event
// into a Kinetic capture shape ({ text, image_caption }).
//
// No auth required for public events. Rate limit is 60 req/hour per IP for
// unauthenticated callers; one harvest call is one request, so the demo is
// well inside that budget.
//
// Returns at most `max` items, sorted newest first.

const _node = globalThis.process;
const API_BASE = "https://api.github.com";

/**
 * @param {{ username: string, max?: number, sinceHours?: number }} opts
 * @returns {Promise<Array<{ source_id: string, text: string, image_caption: string, occurred_at: string }>>}
 */
export async function harvest({ username, max = 5, sinceHours = 168 }) {
  if (!username || typeof username !== "string") {
    throw new Error("github harvester: `username` is required");
  }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "kinetic-demo" };
  const token = _node.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE}/users/${encodeURIComponent(username)}/events/public?per_page=30`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`github ${res.status}: ${body.slice(0, 300)}`);
  }
  const events = await res.json();

  const cutoff = Date.now() - sinceHours * 3600 * 1000;
  const items = [];
  for (const ev of events) {
    if (Date.parse(ev.created_at) < cutoff) continue;
    const item = mapEvent(ev);
    if (item) items.push(item);
    if (items.length >= max) break;
  }

  // The events feed strips PR objects down to {url,id,number,head,base} — no
  // title/body. Enrich PR items best-effort from the full PR object. Any
  // failure (rate limit, network) keeps the reliable base text.
  for (const item of items) {
    const enrich = item._enrich;
    delete item._enrich;
    if (!enrich || !enrich.apiUrl) continue;
    try {
      const d = await fetch(enrich.apiUrl, { headers });
      if (!d.ok) continue;
      const pr = await d.json();
      if (pr && pr.title) {
        const body = pr.body ? ` ${String(pr.body).replace(/\s+/g, " ").trim().slice(0, 280)}` : "";
        item.text = `${capitalize(enrich.action)} pull request ${enrich.repo}#${enrich.number}: "${pr.title}".${body}`.trim();
      }
    } catch { /* keep base text */ }
  }
  return items;
}

function mapEvent(ev) {
  const repo = ev?.repo?.name || "unknown/repo";
  const when = ev.created_at;
  switch (ev.type) {
    case "PushEvent": {
      const commits = (ev.payload?.commits || []).slice(0, 3);
      if (commits.length === 0) return null;
      const messages = commits.map((c) => `- ${c.message.split("\n")[0]}`).join("\n");
      const branch = ev.payload?.ref?.replace("refs/heads/", "") || "main";
      return {
        source_id: `gh-push-${ev.id}`,
        text: `Pushed ${commits.length} commit(s) to ${repo}@${branch}:\n${messages}`,
        image_caption: "",
        occurred_at: when,
      };
    }
    case "PullRequestEvent": {
      // The events feed's pull_request is reduced (no title/body/html_url).
      // Build a reliable base from action + repo + number; harvest() enriches
      // the title best-effort from pr.url.
      const pr = ev.payload?.pull_request;
      const action = ev.payload?.action || "updated";
      const number = ev.payload?.number ?? pr?.number;
      if (!number) return null;
      return {
        source_id: `gh-pr-${ev.id}`,
        text: `${capitalize(action)} pull request ${repo}#${number}.`,
        image_caption: `PR https://github.com/${repo}/pull/${number}`,
        occurred_at: when,
        _enrich: { apiUrl: pr?.url, repo, number, action },
      };
    }
    case "PullRequestReviewEvent": {
      const pr = ev.payload?.pull_request;
      const number = pr?.number ?? ev.payload?.number;
      if (!number) return null;
      return {
        source_id: `gh-review-${ev.id}`,
        text: `Reviewed pull request ${repo}#${number}.`,
        image_caption: `PR https://github.com/${repo}/pull/${number}`,
        occurred_at: when,
        _enrich: { apiUrl: pr?.url, repo, number, action: "reviewed" },
      };
    }
    case "IssuesEvent": {
      const issue = ev.payload?.issue;
      const action = ev.payload?.action || "updated";
      if (!issue) return null;
      return {
        source_id: `gh-issue-${ev.id}`,
        text: `${capitalize(action)} issue in ${repo}: "${issue.title}". ${issue.body ? issue.body.slice(0, 200) : ""}`.trim(),
        image_caption: "",
        occurred_at: when,
      };
    }
    case "CreateEvent": {
      const refType = ev.payload?.ref_type;
      const ref = ev.payload?.ref;
      if (!refType) return null;
      return {
        source_id: `gh-create-${ev.id}`,
        text: `Created ${refType}${ref ? ` "${ref}"` : ""} in ${repo}.`,
        image_caption: "",
        occurred_at: when,
      };
    }
    default:
      return null;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
