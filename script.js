/* ============================================================
   RACE LOOKUP — script.js
   - Fetches data once, stores in memory
   - Client-side filtering with 300ms debounce
   ============================================================ */

const API_URL = "https://script.google.com/macros/s/AKfycbywRibheim1k0dzQtcdGScRBLRgGliSpwdLz4C8pBEa7vIDAHv9djpjr7iohJbPzqr_/exec";

// Helper to bypass cache on refresh
function fetchWithCache(useCache = true) {
  const url = useCache ? API_URL : API_URL + "?noCache=true";
  return fetch(url);
}

// ── STATE ─────────────────────────────────────────────────────
let allParticipants = [];
let globalStats     = null;
let debounceTimer   = null;

// ── DOM REFS ──────────────────────────────────────────────────
const searchInput   = document.getElementById("searchInput");
const clearBtn      = document.getElementById("clearBtn");
const searchHint    = document.getElementById("searchHint");
const totalBadge    = document.getElementById("totalBadge");
const resultsGrid   = document.getElementById("resultsGrid");
const stateLoading  = document.getElementById("stateLoading");
const stateError    = document.getElementById("stateError");
const stateEmpty    = document.getElementById("stateEmpty");
const errorMsg      = document.getElementById("errorMsg");
const retryBtn      = document.getElementById("retryBtn");
const emptyTerm     = document.getElementById("emptyTerm");
const statsSection  = document.getElementById("statsSection");
const distanceList  = document.getElementById("distanceList");
const shirtList     = document.getElementById("shirtList");
const refreshBtn    = document.getElementById("refreshBtn");

// ── FETCH ─────────────────────────────────────────────────────
async function loadData(skipCache = false) {
  showState("loading");

  try {
    const res  = await fetchWithCache(!skipCache);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    if (json.error) throw new Error(json.error);

    allParticipants = json.participants || [];
    globalStats     = json.stats        || null;

    // Update total badge
    totalBadge.textContent = `${allParticipants.length.toLocaleString()} RUNNERS`;
    totalBadge.classList.add("loaded");

    // Render stats permanently
    if (globalStats) renderStats(globalStats);
    statsSection.classList.remove("hidden");

    showState("idle");
    renderResults(""); // show nothing until user types

  } catch (err) {
    errorMsg.textContent = `Could not load data: ${err.message}`;
    showState("error");
  }
}

// ── SEARCH / FILTER ───────────────────────────────────────────
function handleSearch(raw) {
  const query = raw.trim();

  clearBtn.classList.toggle("visible", query.length > 0);

  if (!query) {
    resultsGrid.innerHTML = "";
    searchHint.textContent = `${allParticipants.length.toLocaleString()} runners loaded`;
    showState("idle");
    return;
  }

  const lower   = query.toLowerCase();
  const matched = allParticipants.filter(p =>
    // Search covers the full combined name (first + last).
    // Because the backend already joins them into p.name,
    // searching "dela Cruz" or "Juan dela" both work here.
    p.name.toLowerCase().includes(lower)
  );

  if (matched.length === 0) {
    resultsGrid.innerHTML = "";
    emptyTerm.textContent = `"${query}"`;
    showState("empty");
    return;
  }

  showState("idle");
  searchHint.textContent = `${matched.length} match${matched.length !== 1 ? "es" : ""} found`;
  renderResults(query, matched);
}

function debounceSearch(raw) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => handleSearch(raw), 300);
}

// ── RENDER CARDS ──────────────────────────────────────────────
function renderResults(query, participants = []) {
  // Use DocumentFragment for performance with large sets
  const frag  = document.createDocumentFragment();
  const lower = query.toLowerCase();

  // Cap display at 200 for DOM performance; hint is shown
  const display = participants.slice(0, 200);

  display.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "runner-card";
    card.style.animationDelay = `${Math.min(i * 18, 300)}ms`;

    card.innerHTML = `
      <div class="card-name">${highlightMatch(escHtml(p.name), lower)}</div>
      <div class="card-tags">
        <span class="tag tag-distance">${escHtml(p.distance)}</span>
        <span class="tag tag-gender">${escHtml(p.gender)}</span>
        <span class="tag tag-shirt">SIZE ${escHtml(p.shirtSize)}</span>
        <span class="tag tag-status ${statusClass(p.regStatus)}">${escHtml(p.regStatus)}</span>
      </div>
      <div class="card-team">
        <span class="card-team-dot"></span>
        <span>${escHtml(p.team)}</span>
      </div>
    `;

    /*
    ── HOW TO DISPLAY A NEW FIELD ON THE CARD ────────────────────
    Once you've added the field in Code.gs (e.g. paymentStatus),
    the value arrives in the participant object automatically.
    To show it on the card, just add a line inside card.innerHTML:

        <div class="card-extra">
          <span class="extra-label">Payment:</span>
          <span>${escHtml(p.paymentStatus)}</span>
        </div>

    Or add it as a tag (like regStatus above):

        <span class="tag tag-status">${escHtml(p.paymentStatus)}</span>

    That's all — no other changes needed in the frontend.
    ─────────────────────────────────────────────────────────────
    */

    frag.appendChild(card);
  });

  resultsGrid.innerHTML = "";
  resultsGrid.appendChild(frag);

  if (participants.length > 200) {
    searchHint.textContent =
      `Showing 200 of ${participants.length} matches — refine your search`;
  }
}

function highlightMatch(text, lowerQuery) {
  if (!lowerQuery) return text;
  const idx = text.toLowerCase().indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    text.slice(0, idx) +
    `<mark>${text.slice(idx, idx + lowerQuery.length)}</mark>` +
    text.slice(idx + lowerQuery.length)
  );
}

// Returns a CSS modifier class based on the reg status value.
// Add more cases here as your status values grow.
// e.g. if your sheet has "Confirmed", "Pending", "Cancelled"
function statusClass(status) {
  const s = String(status).toLowerCase();
  if (s.includes("confirm") || s.includes("paid") || s.includes("complete")) return "status-confirmed";
  if (s.includes("pending") || s.includes("process"))                         return "status-pending";
  if (s.includes("cancel"))                                                    return "status-cancelled";
  return "status-default";
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── RENDER STATS ──────────────────────────────────────────────
function renderStats(stats) {
  const total = allParticipants.length || 1;

  // Distance
  renderStatList(distanceList, stats.distances);

  // Shirts
  renderStatList(shirtList, stats.shirts);
}

function renderStatList(el, obj) {
  el.innerHTML = Object.entries(obj).map(([k, v]) => `
    <li>
      <span class="stat-key">${escHtml(k)}</span>
      <span class="stat-val">${v.toLocaleString()}</span>
    </li>
  `).join("");
}

// ── UI STATE MACHINE ──────────────────────────────────────────
function showState(state) {
  stateLoading.classList.add("hidden");
  stateError.classList.add("hidden");
  stateEmpty.classList.add("hidden");

  if (state === "loading") {
    stateLoading.classList.remove("hidden");
    resultsGrid.innerHTML = "";
    searchHint.textContent = "";
  }
  if (state === "error") {
    stateError.classList.remove("hidden");
    resultsGrid.innerHTML = "";
  }
  if (state === "empty") {
    stateEmpty.classList.remove("hidden");
  }
  // "idle" = everything cleared, results may or may not be populated
}

// ── EVENT LISTENERS ───────────────────────────────────────────
searchInput.addEventListener("input", e => debounceSearch(e.target.value));

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.focus();
  handleSearch("");
});

retryBtn.addEventListener("click", loadData);

refreshBtn.addEventListener("click", () => {
  refreshBtn.classList.add("spinning");
  allParticipants = [];
  globalStats = null;
  loadData(true); // true = skip cache
  
  setTimeout(() => refreshBtn.classList.remove("spinning"), 1000);
});

// ── INIT ──────────────────────────────────────────────────────
statsSection.classList.add("hidden");
searchHint.textContent = "Loading runner data…";

loadData();
