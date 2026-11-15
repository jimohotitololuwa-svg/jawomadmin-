/* ==========================================================
   JAWOM Workforce - Admin dashboard
   Uses the same Apps Script Web App as the form.
   ========================================================== */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzFusRSzLl8H16vVtsPUbILiYZwCbuxhi7lpwCJQcAqAvhvvUlt8EdJpJZZ42TXHuKThg/exec";

const PAGE_SIZE = 100;          // rows shown at a time
const MIN_LOADER_MS = 1200;     // keep the rolling logo visible briefly
const TOKEN_KEY = "jawomAdminToken";
const PHONE_HEADERS = ["Phone Number", "WhatsApp Number"];

const $ = (id) => document.getElementById(id);

const loginView = $("loginView");
const dashView = $("dashView");
const loginForm = $("loginForm");
const passwordInput = $("password");
const loginError = $("loginError");
const loginBtn = $("loginBtn");
const dashError = $("dashError");
const loadingOverlay = $("loadingOverlay");
const loadingText = $("loadingText");
const tableHead = $("tableHead");
const tableBody = $("tableBody");
const emptyMsg = $("emptyMsg");
const moreBtn = $("moreBtn");
const searchInput = $("search");
const unitFilter = $("unitFilter");

let token = "";
let headers = [];
let rows = [];
let filtered = [];
let shown = PAGE_SIZE;

/* ---------- Helpers ---------- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function store(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* storage blocked: the person just signs in again after a refresh */ }
}
function recall() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}

function showLoader(text) {
  loadingText.textContent = text;
  loadingOverlay.hidden = false;
}
function hideLoader() { loadingOverlay.hidden = true; }

async function api(payload) {
  // text/plain keeps this a "simple" request, so no CORS preflight is needed
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error("NOT_JSON"); }
  return data;
}

function friendlyError(err) {
  if (err.message === "NOT_JSON") return "The database link is not public or the URL is wrong. Check the Apps Script deployment settings.";
  if (err.message === "Failed to fetch") return "Could not reach the database. Check your internet connection and try again.";
  return err.message;
}

/* Logo fallback (if logo.png is missing) */
document.querySelectorAll("[data-logo]").forEach((img) => {
  img.addEventListener("error", () => {
    const fallback = document.createElement("span");
    fallback.className = "logo-missing " + img.className;
    fallback.textContent = "J";
    fallback.style.width = fallback.style.height = "56px";
    img.replaceWith(fallback);
  });
});

/* ---------- Views ---------- */
function toLogin(message) {
  token = "";
  store("");
  rows = [];
  dashView.hidden = true;
  loginView.hidden = false;
  passwordInput.value = "";
  loginError.textContent = message || "";
  loginError.hidden = !message;
  passwordInput.focus();
}

function toDashboard() {
  loginView.hidden = true;
  dashView.hidden = false;
}

/* ---------- Sign in / out ---------- */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;

  const password = passwordInput.value;
  if (!password) {
    loginError.textContent = "Enter the admin password.";
    loginError.hidden = false;
    return;
  }

  loginBtn.disabled = true;
  showLoader("Signing in…");
  try {
    const [data] = await Promise.all([api({ action: "adminLogin", password }), wait(MIN_LOADER_MS)]);
    if (!data.success) {
      hideLoader();
      loginError.textContent = data.message || "Sign in failed.";
      loginError.hidden = false;
      return;
    }
    token = data.token;
    store(token);
    passwordInput.value = "";
    toDashboard();
    await loadData(true);
  } catch (err) {
    hideLoader();
    loginError.textContent = friendlyError(err);
    loginError.hidden = false;
    console.error(err);
  } finally {
    loginBtn.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  const t = token;
  toLogin("");
  try { await api({ action: "adminLogout", token: t }); } catch (e) { /* already signed out locally */ }
});

$("refreshBtn").addEventListener("click", () => loadData(true));

/* ---------- Load data ---------- */
async function loadData(withLoader) {
  dashError.hidden = true;
  if (withLoader) showLoader("Loading entries…");
  try {
    const [data] = await Promise.all([
      api({ action: "adminList", token }),
      withLoader ? wait(MIN_LOADER_MS) : Promise.resolve()
    ]);

    if (!data.success) {
      hideLoader();
      if (data.message === "SESSION_EXPIRED") return toLogin("Your session has expired. Please sign in again.");
      dashError.textContent = data.message || "Could not load entries.";
      dashError.hidden = false;
      return;
    }

    headers = data.headers;
    rows = data.rows;
    buildHead();
    buildFilters();
    shown = PAGE_SIZE;
    render();
    $("updated").textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (err) {
    dashError.textContent = friendlyError(err);
    dashError.hidden = false;
    console.error(err);
  } finally {
    hideLoader();
  }
}

/* ---------- Table ---------- */
function buildHead() {
  tableHead.innerHTML = "";
  const tr = document.createElement("tr");
  ["#"].concat(headers).forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    if (i === 0) th.className = "num-col";
    tr.appendChild(th);
  });
  tableHead.appendChild(tr);
}

// "Others: Cleaning Team" counts as "Others"
function unitGroup(value) {
  const v = String(value || "").trim();
  return v.toLowerCase().startsWith("others") ? "Others" : v || "(blank)";
}

const unitIdx = () => headers.indexOf("Present Unit");

function buildFilters() {
  const counts = {};
  rows.forEach((r) => {
    const g = unitGroup(r[unitIdx()]);
    counts[g] = (counts[g] || 0) + 1;
  });

  const groups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

  // Dropdown (keep the current choice if it still exists)
  const previous = unitFilter.value;
  unitFilter.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "All present units";
  unitFilter.appendChild(all);
  groups.forEach((g) => {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = `${g} (${counts[g]})`;
    unitFilter.appendChild(o);
  });
  unitFilter.value = groups.includes(previous) ? previous : "";

  // Chips
  const chips = $("unitChips");
  chips.innerHTML = "";
  groups.forEach((g) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.group = g;
    b.append(g);
    const n = document.createElement("b");
    n.textContent = counts[g];
    b.appendChild(n);
    b.addEventListener("click", () => {
      unitFilter.value = unitFilter.value === g ? "" : g;
      shown = PAGE_SIZE;
      render();
    });
    chips.appendChild(b);
  });

  $("totalCount").textContent = rows.length;
}

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  const group = unitFilter.value;
  const ui = unitIdx();

  filtered = rows.filter((r) => {
    if (group && unitGroup(r[ui]) !== group) return false;
    if (q && !r.join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  applyFilters();

  // Highlight the active chip
  document.querySelectorAll(".chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.group === unitFilter.value);
  });

  tableBody.innerHTML = "";
  const visible = filtered.slice(0, shown);

  visible.forEach((r, i) => {
    const tr = document.createElement("tr");

    const n = document.createElement("td");
    n.className = "num-col";
    n.textContent = i + 1;
    tr.appendChild(n);

    r.forEach((cell, c) => {
      const td = document.createElement("td");
      td.textContent = cell; // textContent (never innerHTML) so submitted text cannot run as code
      if (c === 0 || PHONE_HEADERS.includes(headers[c])) td.className = "nowrap";
      tr.appendChild(td);
    });

    tableBody.appendChild(tr);
  });

  emptyMsg.hidden = filtered.length > 0;
  emptyMsg.textContent = rows.length ? "No entries match your search." : "No entries yet.";
  moreBtn.hidden = filtered.length <= shown;
  moreBtn.textContent = `Show more (${filtered.length - shown} left)`;

  $("resultCount").textContent =
    filtered.length === rows.length
      ? `${rows.length} entries`
      : `${filtered.length} of ${rows.length} entries`;
}

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { shown = PAGE_SIZE; render(); }, 150);
});
unitFilter.addEventListener("change", () => { shown = PAGE_SIZE; render(); });
moreBtn.addEventListener("click", () => { shown += PAGE_SIZE; render(); });

/* ---------- Export CSV (exports everything that matches the current search/filter) ---------- */
$("exportBtn").addEventListener("click", () => {
  if (!filtered.length) return;

  const phoneCols = headers.reduce((acc, h, i) => (PHONE_HEADERS.includes(h) ? acc.concat(i) : acc), []);

  const cell = (value, colIndex) => {
    let v = String(value == null ? "" : value).replace(/"/g, '""');
    // ="0803..." makes Excel keep the leading zero on phone numbers
    if (phoneCols.includes(colIndex) && v) return `="${v}"`;
    return `"${v}"`;
  };

  const lines = [headers.map((h, i) => cell(h, -1)).join(",")]
    .concat(filtered.map((r) => r.map((v, i) => cell(v, i)).join(",")));

  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `jawom-workforce-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- Start ---------- */
(async function init() {
  const saved = recall();
  if (saved) {
    token = saved;
    toDashboard();
    await loadData(true);
  } else {
    toLogin("");
  }
})();
