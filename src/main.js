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
  pageRanking,
  fetchSnsDetail,
  fetchSnsHistory,
  snsHistoryRows,
  snsHistorySeries,
  formatCount,
  formatSeconds,
  formatJstDateTime,
  formatJstDate,
  snsOverview,
  snsInteractions,
  demographicsBars,
  topDemographics,
  sortMedia,
  captionHead,
  mediaTypeLabel,
  youtubeVideos,
  youtubeTotals,
  snsErrorNotes,
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
    // Fetch well past the top 10: the same article can be split
    // across two page paths, and the rows are merged before ranking.
    fetchReport(CONFIG.GAS_ENDPOINT, auth(), { limit: 250 }),
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
  // the page itself, opening in a new tab. Split article paths are
  // merged into a single row by pageRanking.
  const titles = await titlesPromise;
  const pageList = document.getElementById("top-pages");
  pageList.innerHTML = "";
  for (const item of pageRanking(pages, titles, CONFIG.SITE_ORIGIN, 10)) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.label;
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
  // The SNS section loads on its own: a failure there must not take
  // the GA dashboard down with it.
  loadSns();
  loadSnsHistory();
  return true;
}

// --- SNS section ---

const snsStatusEl = document.getElementById("sns-status");
const snsBodyEl = document.getElementById("sns-body");

let snsMediaRows = [];
// The media table starts sorted by views, most-watched first.
let snsSort = { key: "views", dir: "desc" };
let snsSortWired = false;

function fillTotalBoxes(elId, items) {
  const wrap = document.getElementById(elId);
  wrap.innerHTML = "";
  for (const item of items) {
    const box = document.createElement("div");
    box.className = "total-box";
    const label = document.createElement("div");
    label.className = "total-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "total-value";
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    wrap.appendChild(box);
  }
}

function fillDemoRanking(elId, items) {
  const list = document.getElementById(elId);
  list.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    list.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item.name;
    const span = document.createElement("span");
    span.className = "rank-value";
    span.textContent = formatCount(item.value);
    li.appendChild(span);
    list.appendChild(li);
  }
}

function renderMediaTable() {
  const tbody = document.getElementById("sns-media-body");
  tbody.innerHTML = "";
  const rows = sortMedia(snsMediaRows, snsSort.key, snsSort.dir);
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 11;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const numCell = (value, format = formatCount) => {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = format(value);
    return td;
  };
  for (const media of rows) {
    const tr = document.createElement("tr");
    const dateTd = document.createElement("td");
    dateTd.className = "nowrap";
    dateTd.textContent = formatJstDateTime(media.posted_at);
    tr.appendChild(dateTd);
    const captionTd = document.createElement("td");
    captionTd.className = "caption-cell";
    captionTd.textContent = captionHead(media.caption);
    tr.appendChild(captionTd);
    const typeTd = document.createElement("td");
    typeTd.className = "nowrap";
    typeTd.textContent = mediaTypeLabel(media.type);
    tr.appendChild(typeTd);
    tr.appendChild(numCell(media.views));
    tr.appendChild(numCell(media.reach));
    tr.appendChild(numCell(media.likes));
    tr.appendChild(numCell(media.comments));
    tr.appendChild(numCell(media.shares));
    tr.appendChild(numCell(media.saves));
    tr.appendChild(numCell(media.avg_watch_sec, formatSeconds));
    const linkTd = document.createElement("td");
    if (media.permalink) {
      const link = document.createElement("a");
      link.href = media.permalink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "開く";
      linkTd.appendChild(link);
    } else {
      linkTd.textContent = "—";
    }
    tr.appendChild(linkTd);
    tbody.appendChild(tr);
  }
  document
    .querySelectorAll("#sns-media-table th.sortable")
    .forEach((th) => {
      const active = th.dataset.sortKey === snsSort.key;
      th.textContent =
        th.dataset.label + (active ? (snsSort.dir === "desc" ? " ↓" : " ↑") : "");
    });
}

function wireMediaSort() {
  if (snsSortWired) {
    return;
  }
  snsSortWired = true;
  document
    .querySelectorAll("#sns-media-table th.sortable")
    .forEach((th) => {
      th.dataset.label = th.textContent;
      th.addEventListener("click", () => {
        const key = th.dataset.sortKey;
        if (snsSort.key === key) {
          snsSort = { key, dir: snsSort.dir === "desc" ? "asc" : "desc" };
        } else {
          snsSort = { key, dir: "desc" };
        }
        renderMediaTable();
      });
    });
}

function renderYoutube(detail) {
  fillTotalBoxes("sns-youtube-totals", youtubeTotals(detail));
  const tbody = document.getElementById("sns-youtube-body");
  tbody.innerHTML = "";
  const videos = youtubeVideos(detail);
  if (!videos.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const video of videos) {
    const tr = document.createElement("tr");
    const titleTd = document.createElement("td");
    if (video.url) {
      const link = document.createElement("a");
      link.href = video.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = video.title || "—";
      titleTd.appendChild(link);
    } else {
      titleTd.textContent = video.title || "—";
    }
    tr.appendChild(titleTd);
    const dateTd = document.createElement("td");
    dateTd.className = "nowrap";
    dateTd.textContent = formatJstDate(video.published_at);
    tr.appendChild(dateTd);
    for (const value of [video.views, video.likes, video.comments]) {
      const td = document.createElement("td");
      td.className = "num";
      td.textContent = formatCount(value);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderSns(detail) {
  snsStatusEl.textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  fillTotalBoxes("sns-overview", snsOverview(detail));
  fillTotalBoxes("sns-interactions", snsInteractions(detail));
  const bars = document.getElementById("sns-age-gender");
  bars.innerHTML = "";
  const barRows = demographicsBars(detail);
  if (!barRows.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    bars.appendChild(p);
  }
  for (const row of barRows) {
    const div = document.createElement("div");
    div.className = "demo-bar";
    const label = document.createElement("span");
    label.className = "demo-bar-label";
    label.textContent = row.label;
    const track = document.createElement("div");
    track.className = "demo-bar-track";
    const fill = document.createElement("div");
    fill.className = "demo-bar-fill";
    fill.style.width = `${row.pct}%`;
    track.appendChild(fill);
    const value = document.createElement("span");
    value.className = "demo-bar-value";
    value.textContent = formatCount(row.value);
    div.appendChild(label);
    div.appendChild(track);
    div.appendChild(value);
    bars.appendChild(div);
  }
  const demo = detail?.instagram?.demographics ?? {};
  fillDemoRanking("sns-cities", topDemographics(demo.top_cities));
  fillDemoRanking("sns-countries", topDemographics(demo.top_countries));
  snsMediaRows = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  wireMediaSort();
  renderMediaTable();
  renderYoutube(detail);
  const notes = document.getElementById("sns-notes");
  notes.innerHTML = "";
  for (const note of snsErrorNotes(detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  snsBodyEl.hidden = false;
}

async function loadSns() {
  snsStatusEl.textContent = "読み込み中…";
  snsBodyEl.hidden = true;
  try {
    const detail = await fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth());
    if (!detail || !detail.ok) {
      snsStatusEl.textContent =
        (detail && detail.error) || "SNSデータを取得できませんでした";
      return;
    }
    renderSns(detail);
  } catch {
    snsStatusEl.textContent = "SNSデータを取得できませんでした";
  }
}

// --- SNS trend charts (history rows behind sns_detail) ---

function renderSnsHistory(response) {
  const wrap = document.getElementById("sns-history");
  wrap.innerHTML = "";
  const series = snsHistorySeries(snsHistoryRows(response));
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  for (const item of series) {
    const head = document.createElement("p");
    head.className = "meta";
    head.textContent =
      `${item.label}：最新 ${formatCount(item.latest)}` +
      `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`;
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
    wrap.appendChild(head);
    wrap.appendChild(chart);
  }
}

// The history has its own load: empty or failed just shows the
// empty-state line and never touches the rest of the SNS section.
async function loadSnsHistory() {
  try {
    const response = await fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth());
    renderSnsHistory(response && response.ok ? response : null);
  } catch {
    renderSnsHistory(null);
  }
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
