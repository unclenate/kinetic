// web/public/app.js
// Shared client script. Handles both:
//   - the capture page (presence of #text + #submit elements)
//   - the public share page (presence of pre-injected globals CARD + TASKS)

const $ = (sel) => document.querySelector(sel);

const SAMPLE = {
  text:
    "Finally got the webhook working after fighting with the API headers for three hours, ready for staging.",
  caption:
    "Screenshot of a 401 Unauthorized response in a terminal, then a passing curl response in the next pane.",
};

let currentCardId = null;
let currentDomain = null;
let pendingShareId = null;
const DOMAIN_LABELS = { business: "Business", personal: "Personal", family: "Family", financial: "Financial", parenting: "Parenting" };

function isCapturePage() { return !!document.getElementById("submit"); }
function isProofPage()   { return typeof window.CARD !== "undefined" && window.CARD; }

// ---------- shared renderers ----------

function renderProofCard(card) {
  const tags = (card.tech_tags || [])
    .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
    .join("");
  const timeStat =
    card.time_to_resolution_minutes != null
      ? `<div>Time<strong>${formatMinutes(card.time_to_resolution_minutes)}</strong></div>`
      : "";
  const impactStat = card.impact_metric
    ? `<div>Impact<strong>${escapeHtml(card.impact_metric)}</strong></div>`
    : "";
  return `
    <div class="banner theme-${escapeAttr(card.visual_theme)}">
      <div class="meta-row">
        <span class="meta-pill domain-pill">${escapeHtml(card.domain)}</span>
        <span class="meta-pill">${escapeHtml(card.activity_type)}</span>
        <span>${escapeHtml(card.visual_theme)}</span>
      </div>
      <h3>${escapeHtml(card.title)}</h3>
      <p class="summary">${escapeHtml(card.summary)}</p>
    </div>
    <div class="body">
      <p class="narrative">${escapeHtml(card.narrative)}</p>
      ${(timeStat || impactStat) ? `<div class="stats">${timeStat}${impactStat}</div>` : ""}
      ${tags ? `<div class="tags">${tags}</div>` : ""}
    </div>
  `;
}

function renderAdminTasks(tasks) {
  const inner =
    !tasks || tasks.length === 0
      ? `<p class="empty">No admin tasks extracted from this capture.</p>`
      : `<ul class="task-list">${tasks.map((t) => `
          <li>
            <span class="status-pill ${escapeAttr(t.status)}">${escapeHtml(t.status)}</span>
            <span>${escapeHtml(t.title)}</span>
          </li>`).join("")}</ul>`;
  return `<h2>Admin tasks</h2>${inner}`;
}

// ---------- capture page ----------

async function initCapture() {
  try {
    const h = await fetch("/health").then((r) => r.json());
    $("#provider-pill").textContent = `provider: ${h.provider}`;
    const storePill = $("#store-pill");
    if (storePill) storePill.textContent = `store: ${h.backend}`;
  } catch {
    $("#provider-pill").textContent = "provider: ?";
  }
  $("#sample").addEventListener("click", () => {
    $("#text").value = SAMPLE.text;
    $("#caption").value = SAMPLE.caption;
  });
  $("#submit").addEventListener("click", onSubmit);
  $("#share").addEventListener("click", () => requestShare(currentCardId, currentDomain));

  // Share-confirmation modal (privacy gate for non-business cards)
  $("#share-confirm").addEventListener("click", confirmShare);
  $("#share-cancel").addEventListener("click", closeShareModal);

  // Feed domain filter tabs
  document.querySelectorAll("#domain-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#domain-tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      applyDomainFilter(btn.dataset.domain);
    });
  });

  initConnections();
  loadFeed();

  // Harvest panel: tab switching + handlers
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const which = btn.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.classList.toggle("hidden", p.dataset.panel !== which);
      });
    });
  });
  $("#gh-harvest").addEventListener("click", () => onHarvest("github"));
  $("#cal-harvest").addEventListener("click", () => onHarvest("calendar"));
  $("#gcal-harvest").addEventListener("click", () => onHarvest("gcal"));
  $("#fathom-harvest").addEventListener("click", () => onHarvest("fathom"));
}

function setHarvestStatus(msg, cls = "") {
  const el = $("#harvest-status");
  el.textContent = msg;
  el.className = `status ${cls}`;
  el.classList.toggle("hidden", !msg);
}

async function onHarvest(source) {
  let body;
  if (source === "github") {
    const username = $("#gh-username").value.trim();
    if (!username) { setHarvestStatus("Enter a GitHub username.", "err"); return; }
    body = { username, max: 5, process_max: 3 };
    $("#gh-harvest").disabled = true;
  } else if (source === "gcal") {
    const accessToken = $("#gcal-token").value.trim();
    if (!accessToken) { setHarvestStatus("Paste a Google access token (ya29…).", "err"); return; }
    if (accessToken.startsWith("4/")) {
      setHarvestStatus("That looks like an auth code. Click 'Exchange authorization code for tokens' in OAuth Playground first, then paste the access_token (starts with 'ya29.').", "err");
      return;
    }
    body = { accessToken, max: 10, process_max: 3 };
    $("#gcal-harvest").disabled = true;
  } else if (source === "fathom") {
    const apiKey = $("#fathom-key").value.trim();
    if (!apiKey) { setHarvestStatus("Paste your Fathom API key (Settings → API Access).", "err"); return; }
    body = { apiKey, max: 10, process_max: 3 };
    $("#fathom-harvest").disabled = true;
  } else {
    const text = $("#cal-text").value.trim();
    if (!text) { setHarvestStatus("Paste at least one calendar line.", "err"); return; }
    body = { text, process_max: 3 };
    $("#cal-harvest").disabled = true;
  }
  setHarvestStatus(`Harvesting from ${source}…`);
  $("#harvest-results").innerHTML = "";

  try {
    const res = await fetch(`/api/harvest/${source}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setHarvestStatus(`Harvest failed: ${json.error || res.status}${json.detail ? " — " + json.detail : ""}`, "err");
      return;
    }
    setHarvestStatus(
      `✓ Harvested ${json.harvested} signal${json.harvested === 1 ? "" : "s"} from ${source}; generated ${json.processed} Proof card${json.processed === 1 ? "" : "s"}`,
      "ok"
    );
    renderHarvestResults(json);
    loadFeed();
  } catch (e) {
    setHarvestStatus(`Network error: ${e.message}`, "err");
  } finally {
    $("#gh-harvest").disabled = false;
    $("#cal-harvest").disabled = false;
    $("#gcal-harvest").disabled = false;
    $("#fathom-harvest").disabled = false;
  }
}

function renderHarvestResults(json) {
  const container = $("#harvest-results");
  container.innerHTML = "";
  // Show generated cards (already validated by server)
  for (const r of json.cards) {
    if (r.error) {
      const div = document.createElement("div");
      div.className = "card harvest-error";
      div.innerHTML = `<p class="muted">Skipped <code>${escapeHtml(r.source_id)}</code>: ${escapeHtml(r.error)}</p>`;
      container.appendChild(div);
      continue;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = `<div class="card proof-card harvest-proof" data-card-id="${escapeAttr(r.id)}">${renderProofCard(r.output.proof_card)}</div>`;
    container.appendChild(wrap.firstElementChild);
  }
  // List remaining un-processed raw signals so the user sees what's there
  const unprocessed = json.items.slice(json.cards.length);
  if (unprocessed.length) {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `<h2>Not processed yet (${unprocessed.length})</h2>
      <ul class="raw-list">${unprocessed.map((it) => `<li>${escapeHtml(it.text.slice(0, 200))}</li>`).join("")}</ul>`;
    container.appendChild(div);
  }
}

function setStatus(msg, cls = "") {
  const el = $("#status");
  el.textContent = msg;
  el.className = `status ${cls}`;
  el.classList.toggle("hidden", !msg);
}

async function onSubmit() {
  const text = $("#text").value.trim();
  const caption = $("#caption").value.trim();
  if (!text) {
    setStatus("Need at least a few words about what just happened.", "err");
    return;
  }
  $("#submit").disabled = true;
  setStatus("Processing…");
  const t0 = performance.now();
  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, image_caption: caption }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatus(`Provider error: ${json.error}${json.detail ? " — " + json.detail : ""}`, "err");
      return;
    }
    const elapsed = Math.round(performance.now() - t0);
    setStatus(`✓ Generated in ${elapsed}ms via ${json.provider}`, "ok");
    currentCardId = json.id;
    currentDomain = json.output.proof_card.domain;
    $("#proof").innerHTML = renderProofCard(json.output.proof_card);
    $("#admin").innerHTML = renderAdminTasks(json.output.admin_tasks);
    $("#result").classList.remove("hidden");
    const shareUrl = $("#share-url");
    shareUrl.textContent = "";
    shareUrl.removeAttribute("href");
    $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
    loadFeed();
  } catch (e) {
    setStatus(`Network error: ${e.message}`, "err");
  } finally {
    $("#submit").disabled = false;
  }
}

// Privacy gate (ADR-0003): non-business cards must pass through an explicit,
// un-skippable confirmation modal naming the domain before going public.
function requestShare(id, domain) {
  if (!id) return;
  if (domain && domain !== "business") {
    pendingShareId = id;
    const label = DOMAIN_LABELS[domain] || domain;
    $("#share-modal-body").textContent =
      `This is a ${label.toLowerCase()} capture, not a business one. Sharing makes it ` +
      `visible to anyone with the link. Kinetic's public feed is meant for professional ` +
      `proof — continue anyway?`;
    $("#share-modal").classList.remove("hidden");
    return;
  }
  doShare(id);
}

function closeShareModal() {
  pendingShareId = null;
  $("#share-modal").classList.add("hidden");
}

function confirmShare() {
  const id = pendingShareId;
  closeShareModal();
  if (id) doShare(id);
}

async function doShare(id) {
  try {
    const res = await fetch(`/api/share/${id}`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setStatus(`Share failed: ${json.error}`, "err");
      return;
    }
    if (id === currentCardId) {
      const shareUrl = $("#share-url");
      shareUrl.textContent = json.url;
      shareUrl.href = json.url;
    }
    try {
      await navigator.clipboard.writeText(json.url);
      setStatus("✓ Public link copied to clipboard", "ok");
    } catch {
      setStatus("✓ Public link generated", "ok");
    }
    loadFeed();
  } catch (e) {
    setStatus(`Share failed: ${e.message}`, "err");
  }
}

// ---------- connections header ----------

async function initConnections() {
  const el = $("#connections");
  if (!el) return;
  let data;
  try {
    data = await fetch("/api/connections").then((r) => r.json());
  } catch {
    el.innerHTML = "";
    return;
  }
  const providers = data.providers || {};
  const order = ["google", "microsoft", "github"];
  el.innerHTML = order.map((name) => {
    const p = providers[name] || {};
    if (!p.configured) {
      return `<span class="conn-chip off" title="not configured">${escapeHtml(name)} · off</span>`;
    }
    if (p.connected) {
      return `<span class="conn-chip on">${escapeHtml(name)} · connected</span>`;
    }
    if (name === "github") {
      return `<span class="conn-chip">${escapeHtml(name)} · public</span>`;
    }
    return `<a class="conn-chip connect" href="/oauth/${escapeAttr(name)}/start">${escapeHtml(name)} · connect →</a>`;
  }).join("");
}

// ---------- proof feed ----------

async function loadFeed() {
  const feed = $("#feed");
  if (!feed) return;
  let data;
  try {
    data = await fetch("/api/cards").then((r) => r.json());
  } catch {
    return;
  }
  const cards = data.cards || [];
  $("#feed-empty").classList.toggle("hidden", cards.length > 0);
  feed.innerHTML = cards.map(renderFeedItem).join("");
  // Wire per-card share buttons.
  feed.querySelectorAll("[data-share-id]").forEach((btn) => {
    btn.addEventListener("click", () => requestShare(btn.dataset.shareId, btn.dataset.shareDomain));
  });
  // Re-apply the active filter to the freshly rendered list.
  const active = document.querySelector("#domain-tabs .tab.active");
  applyDomainFilter(active ? active.dataset.domain : "all");
}

function renderFeedItem(c) {
  const shareBtn = c.isPublic
    ? `<span class="feed-public">● public</span>`
    : `<button class="ghost small" type="button" data-share-id="${escapeAttr(c.id)}" data-share-domain="${escapeAttr(c.domain)}">Share →</button>`;
  // Privacy residency indicator: encrypted (sensitive) cards were kept on-device.
  const privacy = c.encrypted
    ? `<span class="chip lock" title="Sensitive — processed on-device and encrypted at rest">🔒 on-device</span>`
    : `<span class="chip cloud" title="Business — eligible for cloud processing and the public feed">☁ cloud-ok</span>`;
  return `<div class="feed-item" data-domain="${escapeAttr(c.domain)}">
    <div class="card proof-card">${renderProofCard(c.output.proof_card)}</div>
    <div class="feed-item-actions">${privacy}${shareBtn}</div>
  </div>`;
}

function applyDomainFilter(domain) {
  document.querySelectorAll("#feed .feed-item").forEach((item) => {
    const show = domain === "all" || item.dataset.domain === domain;
    item.classList.toggle("hidden", !show);
  });
}

// ---------- proof share page ----------

function initProof() {
  $("#proof").innerHTML = renderProofCard(window.CARD);
  $("#admin").innerHTML = renderAdminTasks(window.TASKS);
}

// ---------- utils ----------

function formatMinutes(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return String(s).replace(/[^a-z0-9_-]/gi, "");
}

// ---------- bootstrap ----------

if (isProofPage()) initProof();
else if (isCapturePage()) initCapture();
