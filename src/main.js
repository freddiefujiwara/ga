import "./style.css";
import { CONFIG } from "./config.js";
import { decodeJwtPayload } from "./auth.js";
import { THEME_KEY, resolveTheme, nextTheme, applyTheme } from "./theme.js";
import {
  fetchReport,
  validateShareToken,
  shareAction,
  totalsOf,
  dailySeries,
  dimensionRanking,
  fetchArticleTitles,
  pageDisplay,
} from "./api.js";
import { buildLineChartSvg, tooltipText } from "./chart.js";
import {
  parseShareToken,
  buildShareUrl,
  shareSecondsLeft,
  formatShareRemaining,
  formatShareExpiry,
} from "./share.js";
import { isStagingBuild, showStagingBanner } from "./staging-banner.js";

if (isStagingBuild()) {
  showStagingBanner();
}

const gateEl = document.getElementById("gate");
const dashboardEl = document.getElementById("dashboard");
const expiredEl = document.getElementById("share-expired");
const accountEl = document.getElementById("account");
const logoutBtn = document.getElementById("logout");
const themeBtn = document.getElementById("theme-toggle");
const gateErrorEl = document.getElementById("gate-error");
const shareCardEl = document.getElementById("share-card");
const shareIssuedEl = document.getElementById("share-issued");
const shareIssueRowEl = document.getElementById("share-issue-row");
const shareIssueBtn = document.getElementById("share-issue");
const shareReissueBtn = document.getElementById("share-reissue");
const shareRevokeBtn = document.getElementById("share-revoke");
const shareCopyBtn = document.getElementById("share-copy");
const shareUrlEl = document.getElementById("share-url");
const shareRemainingEl = document.getElementById("share-remaining");
const shareExpiresEl = document.getElementById("share-expires");
const shareStatusEl = document.getElementById("share-status");

let idToken = null;
// Set when the page was opened via a temporary access link (#share=…).
let shareToken = null;
let shareExpiresAt = null;

let theme = resolveTheme(localStorage.getItem(THEME_KEY));
applyTheme(document.documentElement, themeBtn, theme);

themeBtn.addEventListener("click", () => {
  theme = nextTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(document.documentElement, themeBtn, theme);
});

const auth = () => ({ idToken, shareToken });

function showGate() {
  gateEl.hidden = false;
  dashboardEl.hidden = true;
  expiredEl.hidden = true;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
}

function showExpired() {
  gateEl.hidden = true;
  dashboardEl.hidden = true;
  expiredEl.hidden = false;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
}

async function loadDashboard() {
  // Article titles come from the blog RSS feed; fetched in parallel
  // and never allowed to block (or break) the numbers.
  const titlesPromise = fetchArticleTitles(CONFIG.BLOG_RSS_URL);
  const [totals, daily, pages, sources] = await Promise.all([
    fetchReport(CONFIG.GAS_ENDPOINT, auth(), { dimensions: "" }),
    fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
      dimensions: "date",
      metrics: "screenPageViews",
      limit: 40,
    }),
    fetchReport(CONFIG.GAS_ENDPOINT, auth(), { limit: 10 }),
    fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
      dimensions: "sessionDefaultChannelGroup",
      limit: 8,
    }),
  ]);
  if (!totals.ok) {
    if (shareToken) {
      showExpired();
    } else {
      gateErrorEl.textContent = totals.error || "データを取得できませんでした";
      showGate();
    }
    return false;
  }
  const t = totalsOf(totals);
  document.getElementById("total-views").textContent = t.views.toLocaleString();
  document.getElementById("total-users").textContent = t.users.toLocaleString();
  document.getElementById("total-sessions").textContent =
    t.sessions.toLocaleString();
  document.getElementById("daily-chart").innerHTML = buildLineChartSvg(
    dailySeries(daily),
  );
  wireChartTooltip();
  const renderRanking = (elId, response, limit) => {
    const list = document.getElementById(elId);
    list.innerHTML = "";
    for (const item of dimensionRanking(response, limit)) {
      const li = document.createElement("li");
      li.textContent = item.name;
      const span = document.createElement("span");
      span.className = "rank-value";
      span.textContent = item.views.toLocaleString();
      li.appendChild(span);
      list.appendChild(li);
    }
  };
  // Page rows show the article title (from the blog RSS) and link to
  // the page itself, opening in a new tab.
  const titles = await titlesPromise;
  const pageList = document.getElementById("top-pages");
  pageList.innerHTML = "";
  for (const item of dimensionRanking(pages, 10)) {
    const display = pageDisplay(item.name, titles, CONFIG.SITE_ORIGIN);
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = display.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = display.label;
    li.appendChild(link);
    const span = document.createElement("span");
    span.className = "rank-value";
    span.textContent = item.views.toLocaleString();
    li.appendChild(span);
    pageList.appendChild(li);
  }
  renderRanking("top-sources", sources, 8);
  gateEl.hidden = true;
  expiredEl.hidden = true;
  dashboardEl.hidden = false;
  logoutBtn.hidden = !idToken;
  shareCardEl.hidden = !idToken;
  return true;
}

// --- Daily chart tooltip (hover on PC, tap on touch) ---

const chartTooltipEl = document.getElementById("chart-tooltip");

function showChartTooltip(pointEl) {
  chartTooltipEl.textContent = tooltipText({
    date: pointEl.dataset.date,
    views: pointEl.dataset.views,
  });
  const rect = pointEl.getBoundingClientRect();
  chartTooltipEl.style.left = `${rect.left + rect.width / 2}px`;
  chartTooltipEl.style.top = `${rect.top}px`;
  chartTooltipEl.hidden = false;
}

function hideChartTooltip() {
  chartTooltipEl.hidden = true;
}

let chartTooltipWired = false;

function wireChartTooltip() {
  if (chartTooltipWired) {
    return;
  }
  chartTooltipWired = true;
  const chart = document.getElementById("daily-chart");
  const onPoint = (event) => {
    const pointEl = event.target.closest(".chart-point");
    if (pointEl) {
      showChartTooltip(pointEl);
    } else if (event.type === "pointerdown") {
      hideChartTooltip();
    }
  };
  chart.addEventListener("pointermove", onPoint);
  chart.addEventListener("pointerdown", onPoint);
  chart.addEventListener("pointerleave", hideChartTooltip);
}

function onSignedIn(credential) {
  idToken = credential;
  try {
    const payload = decodeJwtPayload(credential);
    accountEl.textContent = payload.email ? `${payload.email} でログイン中` : "";
  } catch {
    accountEl.textContent = "";
  }
  loadDashboard();
}

function initGoogleSignIn() {
  if (!window.google || !window.google.accounts) {
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  window.google.accounts.id.initialize({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    callback: (response) => onSignedIn(response.credential),
  });
  window.google.accounts.id.renderButton(document.getElementById("signin"), {
    theme: "outline",
    size: "large",
  });
}

logoutBtn.addEventListener("click", () => {
  idToken = null;
  if (window.google && window.google.accounts) {
    window.google.accounts.id.disableAutoSelect();
  }
  accountEl.textContent = "";
  showGate();
});

// --- Temporary share link card (owner only, same as the other apps) ---

function showIssuedShare(url, expiresAt) {
  shareUrlEl.value = url;
  shareExpiresEl.textContent = formatShareExpiry(expiresAt);
  shareRemainingEl.textContent = formatShareRemaining(
    shareSecondsLeft(expiresAt, Date.now()),
  );
  shareIssuedEl.hidden = false;
  shareIssueRowEl.hidden = true;
}

async function issueShare() {
  shareStatusEl.textContent = "発行しています…";
  try {
    const result = await shareAction(CONFIG.GAS_ENDPOINT, idToken, "issue_share");
    if (!result.ok) {
      shareStatusEl.textContent = result.error || "発行できませんでした";
      return;
    }
    const base = window.location.origin + window.location.pathname;
    showIssuedShare(buildShareUrl(base, result.share_token), result.expires_at);
    shareStatusEl.textContent = "";
  } catch {
    shareStatusEl.textContent = "発行できませんでした";
  }
}

shareIssueBtn.addEventListener("click", issueShare);
shareReissueBtn.addEventListener("click", issueShare);
shareRevokeBtn.addEventListener("click", async () => {
  try {
    await shareAction(CONFIG.GAS_ENDPOINT, idToken, "revoke_share");
  } catch {
    // Even if the call fails, hide the issued URL; the status line says so.
  }
  shareIssuedEl.hidden = true;
  shareIssueRowEl.hidden = false;
  shareStatusEl.textContent = "無効化しました";
});
shareCopyBtn.addEventListener("click", async () => {
  shareUrlEl.select();
  try {
    await navigator.clipboard.writeText(shareUrlEl.value);
    shareStatusEl.textContent = "コピーしました";
  } catch {
    document.execCommand("copy");
  }
});

// Entry point: a share link skips sign-in entirely.
const hashToken = parseShareToken(window.location.hash);
if (hashToken) {
  shareToken = hashToken;
  validateShareToken(CONFIG.GAS_ENDPOINT, shareToken)
    .then((result) => {
      if (result.ok) {
        shareExpiresAt = result._share ? result._share.expires_at : null;
        loadDashboard();
      } else {
        showExpired();
      }
    })
    .catch(() => showExpired());
} else {
  // Probe the bridge once on load, like the other apps do. A 401 just
  // means "sign in"; if the bridge ever answers anonymously, go
  // straight to the dashboard.
  fetchReport(CONFIG.GAS_ENDPOINT, {}, { dimensions: "" })
    .then((result) => {
      if (result.ok) {
        loadDashboard();
      } else {
        showGate();
        initGoogleSignIn();
      }
    })
    .catch(() => {
      showGate();
      initGoogleSignIn();
    });
}
