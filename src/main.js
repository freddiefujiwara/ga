import "./style.css";
import { CONFIG } from "./config.js";
import { decodeJwtPayload } from "./auth.js";
import { THEME_KEY, resolveTheme, nextTheme, applyTheme } from "./theme.js";
import {
  PRIVACY_KEY,
  resolvePrivacy,
  applyPrivacy,
} from "./privacy.js";
import {
  fetchReport,
  validateShareToken,
  shareAction,
  exchangeSession,
  revokeSession,
  totalsOf,
  dailySeries,
  dimensionRanking,
  fetchArticleTitles,
  pageRanking,
  pageSpeedRanking,
  fetchBlogMeta,
  mergeBlogTitles,
  blogArticlesByDate,
  blogGenreStats,
  blogArticleList,
  fetchSnsDetail,
  fetchSnsHistory,
  dataAsOfText,
  snsHistoryRows,
  snsHistorySeries,
  threadsHistorySeries,
  threadsTotals,
  threadsInteractions,
  threadsPosts,
  threadsErrorNotes,
  xHistorySeries,
  xTotals,
  xPosts,
  xErrorNotes,
  overviewKpis,
  topPostsByChannel,
  youtubeHistorySeries,
  articleViewStats,
  formatCount,
  formatSeconds,
  formatJstDateTime,
  formatJstDate,
  snsOverview,
  snsInteractions,
  demographicsPyramid,
  topDemographics,
  sortMedia,
  captionHead,
  mediaTypeLabel,
  youtubeVideos,
  youtubeTotals,
  instagramThumbnailUrl,
  mediaThumbnailShape,
  youtubeThumbnailUrls,
  isPlaceholderThumbnail,
  thumbnailOrientation,
  snsErrorNotes,
  instagramDailyFollowsError,
  followChartDays,
} from "./api.js";
import {
  buildLineChartSvg,
  buildFollowChartSvg,
  formatDateLabel,
  formatDateFull,
} from "./chart.js";
import {
  genreStatsForMedia,
  genreStatsForThreads,
  threadsGenreOptions,
  filterThreadsByGenre,
  genreStatsForX,
  xGenreOptions,
  filterXByGenre,
  filterMediaByPeriod,
  filterMediaByGenre,
  mediaGenreOptions,
  articleGenreOptions,
  filterArticlesByGenre,
  mediaDateRange,
  sortGenreRows,
  formatRate,
} from "./genres.js";
import {
  tabFromHash,
  tabFromPath,
  pathForTab,
  hasTabPart,
  hashWithoutTab,
} from "./tabs.js";
import { channelTreemap, genreTreemap } from "./treemap.js";
import {
  parseShareToken,
  buildShareUrl,
  shareSecondsLeft,
  formatShareRemaining,
  formatShareExpiry,
} from "./share.js";
import {
  bootEntry,
  loadSavedSessionToken,
  saveSessionToken,
  clearSavedSessionToken,
  clearSavedIdToken,
  loadSavedShareToken,
  saveShareToken,
  clearSavedShareToken,
} from "./session.js";
import { isStagingBuild, showStagingBanner } from "./staging-banner.js";
import {
  SECTION_LOADING_TEXT,
  SECTION_FAILED_TEXT,
  setSectionLoading,
  setSectionFailed,
} from "./section-status.js";

if (isStagingBuild()) {
  showStagingBanner();
}

const loadingEl = document.getElementById("boot-loading");
const gateEl = document.getElementById("gate");
const dashboardEl = document.getElementById("dashboard");
const dataAsOfEl = document.getElementById("data-asof");
const expiredEl = document.getElementById("share-expired");
const accountEl = document.getElementById("account");
const logoutBtn = document.getElementById("logout");
const themeBtn = document.getElementById("theme-toggle");
const privacyBtn = document.getElementById("privacy-toggle");
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

let sessionToken = null;
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

// --- Privacy masking (raw counts blur out for screenshots) ---
// Same arrangement as the asset / health apps: the stored
// preference lives in local storage (default off), the toggle
// flips data-private on <html>, and while a temporary share
// link is being viewed the masking is suspended and the toggle
// hidden — a share viewer always sees the numbers, and the
// stored preference itself is never rewritten by a visit.
let privacy = resolvePrivacy(localStorage.getItem(PRIVACY_KEY));

// Whether the entry session's kind is settled yet. Until boot
// lands on one of the gate / expired / dashboard screens, the
// toggle stays hidden (it starts hidden in the markup too):
// a share link's session is only known once validation comes
// back, and showing the button during loading — then taking
// it away — flashed it on screen for share viewers.
let sessionSettled = false;

// Whether masking is in effect right now: the preference is on
// and no share session is suspending it.
const maskingOn = () => privacy && !shareToken;

// Treemap tiles repeat their figures in the native title
// tooltip, which CSS cannot blur; while masking is on the tile
// renderers leave the title off, and this sweep handles the
// tiles already on screen when the toggle flips.
function suspendTileTitles(on) {
  for (const el of document.querySelectorAll(".treemap-tile")) {
    if (on) {
      if (el.title) {
        el.dataset.privacyTitle = el.title;
        el.removeAttribute("title");
      }
    } else if (el.dataset.privacyTitle) {
      el.title = el.dataset.privacyTitle;
      delete el.dataset.privacyTitle;
    }
  }
}

function renderPrivacy() {
  applyPrivacy(
    document.documentElement,
    privacyBtn,
    privacy,
    Boolean(shareToken),
  );
  privacyBtn.hidden = !sessionSettled || Boolean(shareToken);
  suspendTileTitles(maskingOn());
}

privacyBtn.addEventListener("click", () => {
  privacy = !privacy;
  localStorage.setItem(PRIVACY_KEY, privacy ? "on" : "off");
  renderPrivacy();
});
renderPrivacy();

// A raw count as a masking-ready span: figures the renderers
// splice into a line of text ride in one of these, so the
// privacy CSS (which blurs .amount-value) reaches them too.
// A figure the owner already publishes elsewhere (the top
// page's follower counts) passes isPublic and also takes
// .is-public, so masking leaves it readable like the
// percentages.
function countSpan(value, isPublic = false) {
  const span = document.createElement("span");
  span.className = "amount-value" + (isPublic ? " is-public" : "");
  span.textContent = formatCount(value);
  return span;
}

// The total-box value classes: every value is a raw count and
// takes .amount-value, except a percentage （割合） and the
// items flagged public (figures already published on the top
// page), which also take .is-public so they stay readable
// while masking — the asset / health exemption.
function totalValueClass(item) {
  const isPercent =
    typeof item.value === "string" && item.value.trim().endsWith("%");
  const isPublic = isPercent || item.public === true;
  return "total-value amount-value" + (isPublic ? " is-public" : "");
}

const auth = () => ({ sessionToken, shareToken });

// --- Dashboard tabs ---
// The selected tab lives in the URL path ("/social/instagram").
// APP_BASE is the Vite build's base: "/social/" in production,
// "/social/staging/" in the staging build. Deep links arrive via
// the 404.html rewrite and the index.html restore (see tabs.js).
// Links issued before the path form carry the tab in the hash
// ("#tab=…"); those still open the named tab and are rewritten
// into the path form. Switching tabs uses replaceState (no extra
// history entries, no scroll jump).

const APP_BASE = import.meta.env.BASE_URL;

const tabButtons = [...document.querySelectorAll("#tabs .tab-button")];
const tabPanels = {
  overview: document.getElementById("tab-overview"),
  instagram: document.getElementById("tab-instagram"),
  blog: document.getElementById("tab-blog"),
  youtube: document.getElementById("tab-youtube"),
  threads: document.getElementById("tab-threads"),
  x: document.getElementById("tab-x"),
};

function activateTab(tabId, updateUrl = true) {
  for (const btn of tabButtons) {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  }
  for (const [id, panel] of Object.entries(tabPanels)) {
    panel.hidden = id !== tabId;
  }
  if (updateUrl) {
    // The tab moves into the path; the hash keeps only what it
    // still owns (the share token). The query string is passed
    // through untouched.
    const next =
      pathForTab(APP_BASE, tabId) +
      window.location.search +
      hashWithoutTab(window.location.hash);
    const current =
      window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }
}

// The path is the canonical tab address; the legacy hash form is
// consulted only when the path is the app root itself.
function initialTab() {
  return (
    tabFromPath(window.location.pathname, APP_BASE) ??
    tabFromHash(window.location.hash)
  );
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
}
window.addEventListener("hashchange", () => {
  // Only a legacy "tab=" part arriving via the hash needs a
  // reaction: activate the named tab, which also rewrites the
  // URL into the path form. Hash changes without a tab part
  // (share-token bookkeeping) leave the selection alone.
  if (hasTabPart(window.location.hash)) {
    activateTab(tabFromHash(window.location.hash));
  }
});
activateTab(initialTab());

// Boot starts on the loading screen, not the sign-in gate: while
// the saved session is being restored or the anonymous probe is
// in flight, showing the Google button would read as "not signed
// in yet". The gate appears only once sign-in is truly required —
// every transition below therefore starts from showLoading and
// lands on exactly one of gate / expired / dashboard.
function showLoading() {
  loadingEl.hidden = false;
  gateEl.hidden = true;
  dashboardEl.hidden = true;
  expiredEl.hidden = true;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
}

function showGate() {
  loadingEl.hidden = true;
  gateEl.hidden = false;
  dashboardEl.hidden = true;
  expiredEl.hidden = true;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
  // The session kind is settled (signed out): the privacy
  // toggle may appear now.
  sessionSettled = true;
  renderPrivacy();
}

function showExpired() {
  loadingEl.hidden = true;
  gateEl.hidden = true;
  dashboardEl.hidden = true;
  expiredEl.hidden = false;
  shareCardEl.hidden = true;
  logoutBtn.hidden = true;
  sessionSettled = true;
  renderPrivacy();
}

async function loadDashboard() {
  // The session kind is settled by the time the dashboard loads:
  // restate the privacy masking for it (a share session suspends
  // masking and hides the toggle).
  renderPrivacy();
  // Every request the dashboard needs is independent — a different
  // action or report shape off the same bridge — so they all
  // start here, in parallel, instead of queueing behind each
  // other. What a section waits for is only its own data: the
  // dashboard itself is revealed as soon as the GA totals land
  // (that response doubles as the auth verdict), and the other
  // sections fill in as their own responses arrive.
  // Article titles come from the blog RSS feed; fetched in parallel
  // and never allowed to block (or break) the numbers.
  const titlesPromise = fetchArticleTitles(CONFIG.BLOG_RSS_URL);
  // The article tag map comes from the blog API's titles payload;
  // same treatment: parallel, tolerant, display-only.
  const metaPromise = fetchBlogMeta(CONFIG.BLOG_TITLES_URL);
  const totalsPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "",
  });
  const dailyPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "date",
    metrics: "screenPageViews",
    limit: 40,
  });
  // Fetch well past the top 10: the same article can be split
  // across two page paths, and the rows are merged before ranking.
  const pagesPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    limit: 250,
  });
  // Per-article display times (the article_render metric pair,
  // plus the bridge's slow-count metric: how many of the
  // article's displays took ten seconds or more, so an average
  // inflated by one stall reads as such). Served from the
  // history sheet's blog_speed tab; until the first displays
  // are recorded the report answers with no rows and the
  // section stays hidden, so a rejection here must never break
  // the blog tab — the catch is attached up front.
  const speedPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "pagePath",
    metrics: "customEvent:render_ms,eventCount,customEvent:render_slow_count",
    limit: 250,
  });
  speedPromise.catch(() => {});
  const sourcesPromise = fetchReport(CONFIG.GAS_ENDPOINT, auth(), {
    dimensions: "sessionDefaultChannelGroup",
    limit: 8,
  });
  // The SNS snapshot and history start now too, alongside the GA
  // reports; their loaders are only invoked once the totals check
  // below has passed, so a dead session never renders into a
  // dashboard that stays hidden. The no-op catches keep a
  // rejection from surfacing as unhandled when that check fails
  // first and the loaders never run; a loader's own catch still
  // sees the rejection when it does run.
  const detailPromise = fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth());
  detailPromise.catch(() => {});
  const historyPromise = fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth());
  historyPromise.catch(() => {});
  const totals = await totalsPromise;
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
  overviewState.gaTotals = t;
  renderOverview();
  document.getElementById("total-views").textContent = t.views.toLocaleString();
  document.getElementById("total-users").textContent = t.users.toLocaleString();
  document.getElementById("total-sessions").textContent =
    t.sessions.toLocaleString();
  // The totals are in, so the session is good: reveal the
  // dashboard now and let the remaining sections fill in as
  // their responses land, instead of holding the loading screen
  // until the slowest request finishes.
  loadingEl.hidden = true;
  gateEl.hidden = true;
  expiredEl.hidden = true;
  dashboardEl.hidden = false;
  logoutBtn.hidden = !sessionToken;
  shareCardEl.hidden = !sessionToken;
  // The dashboard is up, so the session kind is settled: the
  // privacy toggle may appear (unless this is a share session,
  // where renderPrivacy keeps it hidden).
  sessionSettled = true;
  renderPrivacy();
  // The SNS section loads on its own: a failure there must not take
  // the GA dashboard down with it.
  loadSns(detailPromise);
  loadSnsHistory(historyPromise);
  loadBlogSections(
    dailyPromise,
    pagesPromise,
    sourcesPromise,
    titlesPromise,
    metaPromise,
    speedPromise,
  );
  return true;
}

function renderRanking(elId, response, limit) {
  const list = document.getElementById(elId);
  list.innerHTML = "";
  for (const item of dimensionRanking(response, limit)) {
    const li = document.createElement("li");
    li.textContent = item.name;
    const span = document.createElement("span");
    // Blog-tab figures are unpublished GA rollups: masked
    // like every other raw count.
    span.className = "rank-value amount-value";
    span.textContent = item.views.toLocaleString();
    li.appendChild(span);
    list.appendChild(li);
  }
}

// The blog tab's sections, filled in as their responses land.
// Each chain renders only its own sections, so a slow (or failed)
// response holds up nothing else. Until a section's response
// lands it carries the loading line; a failed one ends on the
// failure line — neither can be mistaken for a section that
// simply has no data.
function loadBlogSections(
  dailyPromise,
  pagesPromise,
  sourcesPromise,
  titlesPromise,
  metaPromise,
  speedPromise,
) {
  const dailyChartEl = document.getElementById("daily-chart");
  const sourcesEl = document.getElementById("top-sources");
  setSectionLoading(dailyChartEl);
  setSectionLoading(sourcesEl);
  setSectionLoading(document.getElementById("top-pages"));
  setSectionLoading(document.getElementById("blog-genres"));
  setSectionLoading(document.getElementById("blog-article-body"));
  // The two KPI boxes the page rows feed (the article count and
  // the per-article average) wait on the same load: they show
  // the loading wording, without the masking class — the
  // wording is not a figure — until fillBlogPages settles them.
  for (const id of ["total-articles", "total-per-article"]) {
    const el = document.getElementById(id);
    el.textContent = SECTION_LOADING_TEXT;
    el.classList.add("section-pending");
    el.classList.remove("amount-value");
  }
  // The daily chart carries the published-article overlay, so
  // it settles only when both of its inputs have: the daily
  // report and the article titles (merged from the same two
  // sources the page sections use). Until then the section
  // keeps its loading line; a failed daily report ends it on
  // the failure line. The title fetches resolve to empty maps
  // on failure by design, so an empty merge simply renders the
  // chart without markers rather than failing the section.
  let dailyOutcome = null;
  let dailyTitles = null;
  const renderDailyChart = () => {
    if (!dailyOutcome || !dailyTitles) {
      return;
    }
    if (!dailyOutcome.ok) {
      setSectionFailed(dailyChartEl);
      return;
    }
    renderBlogDaily(dailyOutcome.series, dailyTitles);
    wireChartTooltip();
  };
  dailyPromise
    .then((daily) => {
      dailyOutcome =
        daily && daily.ok !== false
          ? { ok: true, series: dailySeries(daily) }
          : { ok: false };
      renderDailyChart();
    })
    .catch(() => {
      dailyOutcome = { ok: false };
      renderDailyChart();
    });
  Promise.all([titlesPromise, metaPromise])
    .then(([rssTitles, meta]) => {
      dailyTitles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
      renderDailyChart();
    })
    .catch(() => {
      dailyTitles = new Map();
      renderDailyChart();
    });
  sourcesPromise
    .then((sources) => {
      if (!sources || sources.ok === false) {
        setSectionFailed(sourcesEl);
        return;
      }
      renderRanking("top-sources", sources, 8);
    })
    .catch(() => setSectionFailed(sourcesEl));
  fillBlogPages(pagesPromise, titlesPromise, metaPromise, speedPromise);
}

// --- Blog daily chart (日ごとの表示回数と公開した記事) ---
// The blog counterpart of the Instagram follow chart's overlay:
// days that carry a published article get a ▼ marker (with the
// article count beside it when the day has more than one), and
// tapping a marked day's column — or the marker — scrolls to
// that day's entry in the list below and highlights both, the
// same operation as the follow chart's posted days. Article
// dates come from the titles' leading "YYYY-MM-DD" (see
// blogArticlesByDate); articles whose day falls outside the
// chart's range cannot be placed on it and stay out of the list.
// The day entries' view counts are the blog's daily GA figures,
// so they mask like every other blog number.

function jumpToBlogDay(wrap, date) {
  for (const el of wrap.querySelectorAll(".blog-day-hit.selected")) {
    el.classList.remove("selected");
  }
  for (const el of wrap.querySelectorAll(".blog-day-entry.highlight")) {
    el.classList.remove("highlight");
  }
  const hit = wrap.querySelector(`.blog-day-hit[data-date="${date}"]`);
  if (hit) {
    hit.classList.add("selected");
  }
  const entry = wrap.querySelector(`.blog-day-entry[data-date="${date}"]`);
  if (entry) {
    entry.classList.add("highlight");
    entry.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderBlogDaily(points, titles) {
  const wrap = document.getElementById("daily-chart");
  wrap.innerHTML = "";
  const articlesByDate = new Map(
    blogArticlesByDate(titles, CONFIG.SITE_ORIGIN).map((day) => [
      day.date,
      day.articles,
    ]),
  );
  const markedDays = new Map();
  const viewsByDate = new Map();
  for (const point of points) {
    viewsByDate.set(point.date, point.views);
    const articles = articlesByDate.get(point.date);
    if (articles && articles.length) {
      markedDays.set(point.date, articles.length);
    }
  }
  // The blog's daily figures are 28-day GA rollups that no
  // public page prints, so the chart's max label masks like
  // the other charts'.
  const chart = document.createElement("div");
  chart.innerHTML = buildLineChartSvg(points, { markedDays });
  chart.addEventListener("click", (event) => {
    const hit = event.target.closest?.("[data-date]");
    if (hit && articlesByDate.has(hit.dataset.date)) {
      jumpToBlogDay(wrap, hit.dataset.date);
    }
  });
  wrap.appendChild(chart);
  if (!markedDays.size) {
    return;
  }
  const legend = document.createElement("p");
  legend.className = "meta";
  legend.textContent =
    "▼は記事を公開した日です。▼や列を押すと、その日の記事に飛びます。";
  wrap.appendChild(legend);
  const head = document.createElement("h4");
  head.className = "demo-list-title";
  head.textContent = "記事を公開した日";
  wrap.appendChild(head);
  const postedDays = [...markedDays.keys()].sort().reverse();
  for (const date of postedDays) {
    const articles = articlesByDate.get(date);
    const entry = document.createElement("div");
    entry.className = "blog-day-entry";
    entry.dataset.date = date;
    const dayLine = document.createElement("p");
    dayLine.className = "meta";
    dayLine.append(`${formatDateLabel(date)}：表示回数 `);
    const views = document.createElement("span");
    views.className = "amount-value";
    views.textContent = formatCount(viewsByDate.get(date) ?? 0);
    dayLine.append(views, "回");
    if (articles.length > 1) {
      dayLine.append(` · 記事${articles.length}件`);
    }
    entry.appendChild(dayLine);
    const list = document.createElement("ul");
    list.className = "ranking";
    for (const article of articles) {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = article.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = article.title;
      li.appendChild(link);
      list.appendChild(li);
    }
    entry.appendChild(list);
    wrap.appendChild(entry);
  }
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "表示回数はブログ全体の日次です。記事との対応は公開日による重ね合わせで、どの記事がきっかけかまでは分かりません。";
  wrap.appendChild(note);
}

// The page rows could not be read: every section they feed
// ends on the failure line (the two KPI boxes keep the pending
// size and take the failure colour), and the overview's blog
// top list settles the same way.
function settleBlogPagesFailed() {
  overviewState.blogSettled = true;
  overviewState.blogFailed = true;
  setSectionFailed(document.getElementById("top-pages"));
  setSectionFailed(document.getElementById("blog-genres"));
  setSectionFailed(document.getElementById("blog-article-body"));
  for (const id of ["total-articles", "total-per-article"]) {
    const el = document.getElementById(id);
    el.textContent = SECTION_FAILED_TEXT;
    el.classList.add("section-failed");
  }
  renderTopPosts();
}

// The page ranking and everything joined to it: the blog tab's
// page list, the overview's blog top-3 rows, the per-genre rollup
// and the per-article table. They share one input set — the GA
// page rows plus the two title sources — so they land together,
// when the slowest of the three arrives.
async function fillBlogPages(pagesPromise, titlesPromise, metaPromise, speedPromise) {
  let pages;
  let rssTitles;
  let meta;
  try {
    [pages, rssTitles, meta] = await Promise.all([
      pagesPromise,
      titlesPromise,
      metaPromise,
    ]);
  } catch {
    settleBlogPagesFailed();
    return;
  }
  if (!pages || pages.ok === false) {
    settleBlogPagesFailed();
    return;
  }
  // Page rows show the article title and link to the page itself,
  // opening in a new tab. Split article paths are merged into a
  // single row by pageRanking. The titles are the merged map of
  // both blog title sources (RSS + the titles payload): the page
  // ranking used to read the RSS alone, so one failed RSS fetch
  // silently dropped every article back to its raw path even
  // though the payload copy had arrived fine.
  const titles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
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
    // Per-article view counts here are last-28-days GA figures,
    // not a number any public page prints: masked.
    span.className = "rank-value amount-value";
    span.textContent = item.views.toLocaleString();
    li.appendChild(span);
    pageList.appendChild(li);
  }
  // The same ranking, top 3 only, feeds the overview's blog
  // section in the per-channel top lists.
  overviewState.blogTop = pageRanking(pages, titles, CONFIG.SITE_ORIGIN, 3);
  overviewState.blogSettled = true;
  renderTopPosts();
  // The display-time ranking rides its own report; it fills in
  // when it lands and reveals its section only when at least one
  // article has a recorded display time. Any failure leaves the
  // section hidden.
  if (speedPromise) {
    speedPromise
      .then((speed) => {
        const items = pageSpeedRanking(speed, titles, CONFIG.SITE_ORIGIN, 10);
        if (!items.length) {
          return;
        }
        const speedList = document.getElementById("top-speed");
        speedList.innerHTML = "";
        for (const item of items) {
          const li = document.createElement("li");
          const link = document.createElement("a");
          link.href = item.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = item.label;
          li.appendChild(link);
          const span = document.createElement("span");
          // Per-article display times are blog figures like the
          // view counts above: masked outside share links. An
          // article with slow displays names them, so an average
          // inflated by one stall reads as one; with none, the
          // line keeps its plain form.
          span.className = "rank-value amount-value";
          span.textContent =
            item.slow > 0
              ? `${(item.avgMs / 1000).toFixed(1)}秒（${item.samples.toLocaleString()}件・うち遅い${item.slow.toLocaleString()}件）`
              : `${(item.avgMs / 1000).toFixed(1)}秒（${item.samples.toLocaleString()}件）`;
          li.appendChild(span);
          speedList.appendChild(li);
        }
        document.getElementById("speed-section").hidden = false;
      })
      .catch(() => {});
  }
  // The per-genre rollup joins the page rows with the tag map. It
  // renders only when the map actually arrived; blogGenreStats
  // returns nothing without one and the section says why instead.
  renderBlogGenres(pages, meta, titles);
  renderBlogArticles(pages, meta, titles);
  // The blog KPI row gains the article count and the per-article
  // average over the same article list the 記事ごと table shows;
  // the boxes leave their pending state (the masking class comes
  // back with the real figures).
  const articleStats = articleViewStats(blogArticles);
  const articlesEl = document.getElementById("total-articles");
  articlesEl.textContent = articleStats.count
    ? formatCount(articleStats.count)
    : "-";
  articlesEl.classList.remove("section-pending");
  articlesEl.classList.add("amount-value");
  const perArticleEl = document.getElementById("total-per-article");
  perArticleEl.textContent = formatCount(articleStats.perArticle);
  perArticleEl.classList.remove("section-pending");
  perArticleEl.classList.add("amount-value");
}

// --- Genre visuals (Instagram / blog genre sections) ---
// Both genre sections lead with the visuals, in the same order:
// a treemap whose tile area is the genre's per-item average and
// the legend directly under the tiles; the full table follows
// below (its 平均 column carries the same average as a number,
// so no separate bar list repeats it). Each tile
// draws the text lines its size can hold (see tileLabelLevel):
// the name and the figure ride on every tile, down to micro
// type on the smallest ones, and the legend under the map
// lists every genre's exact average and total.
// Tile colour is a heat scale on the same average (see
// genreHeatBackground): the biggest average on show is the
// bluest, the smallest keeps the plain tile colour.

// One-line micro label for the tiles too small for the stacked
// lines: "micro-v" runs the line vertically down a tall narrow
// tile, "micro-h" keeps it horizontal on a wide flat one. The
// name and the figure share the single line.
function tileOneLineLabel(level, name, valueText, isPublic = false) {
  const el = document.createElement("div");
  el.className =
    level === "micro-v" ? "treemap-tile-vlabel" : "treemap-tile-hlabel";
  // The name stays readable; only the figure is a raw count and
  // rides in a masking-ready span — unless the figure is one of
  // the published ones, which takes .is-public instead.
  el.append(`${name} `);
  const value = document.createElement("span");
  value.className = "amount-value" + (isPublic ? " is-public" : "");
  value.textContent = valueText;
  el.appendChild(value);
  return el;
}

// Draws a genre (or, for the blog, tag) treemap and its legend.
// With options.isPublic every figure also takes .is-public;
// no current caller passes it — the blog genre section's figures
// are unpublished 28-day rollups and mask like the SNS genre
// sections' — but the renderer keeps the switch the channel
// map's per-figure flags use elsewhere.
function renderGenreTreemap(mapEl, legendEl, map, options = {}) {
  const valueClass = (base) =>
    base + " amount-value" + (options.isPublic ? " is-public" : "");
  mapEl.innerHTML = "";
  if (!map.tiles.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    mapEl.appendChild(p);
  }
  for (const tile of map.tiles) {
    const div = document.createElement("div");
    div.className = "treemap-tile";
    div.style.left = `${tile.x}%`;
    div.style.top = `${tile.y}%`;
    div.style.width = `${tile.w}%`;
    div.style.height = `${tile.h}%`;
    if (tile.heat) {
      div.style.background = tile.heat;
    }
    // The title repeats the figures as a hover tooltip, which
    // CSS cannot blur; while masking is on it is left off (the
    // legend below the map carries the same figures, masked).
    if (!maskingOn()) {
      div.title = `${tile.name}：${tile.avgText}、${tile.totalText}`;
    }
    // Draw the lines this tile's level allows: the name and
    // the figure always ride, in type sized to the tile; the
    // total line joins only on the roomiest tiles.
    const level = tile.labelLevel ?? (tile.labelRoom ? "full" : "none");
    div.classList.add(`level-${level}`);
    if (level === "micro-v" || level === "micro-h") {
      div.appendChild(
        tileOneLineLabel(level, tile.name, tile.avgLabel, options.isPublic),
      );
    } else if (level !== "none") {
      const name = document.createElement("div");
      name.className = "treemap-tile-name";
      name.textContent = tile.name;
      div.appendChild(name);
      const value = document.createElement("div");
      value.className = valueClass("treemap-tile-value");
      value.textContent = tile.avgLabel;
      div.appendChild(value);
      if (level === "full") {
        const total = document.createElement("div");
        total.className = valueClass("treemap-tile-sub");
        total.textContent = tile.totalText;
        div.appendChild(total);
      }
    }
    mapEl.appendChild(div);
  }
  legendEl.innerHTML = "";
  for (const entry of map.legend) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "channel-legend-name";
    name.textContent = entry.name;
    li.appendChild(name);
    const value = document.createElement("span");
    value.className = valueClass("channel-legend-value");
    value.textContent = entry.avgText;
    li.appendChild(value);
    const total = document.createElement("span");
    total.className = valueClass("channel-legend-note");
    total.textContent = entry.totalText;
    li.appendChild(total);
    legendEl.appendChild(li);
  }
}

function buildGenreTreemap(map, noteText, options = {}) {
  const frag = document.createDocumentFragment();
  const mapEl = document.createElement("div");
  mapEl.className = "treemap";
  const legendEl = document.createElement("ul");
  legendEl.className = "channel-legend";
  renderGenreTreemap(mapEl, legendEl, map, options);
  frag.appendChild(mapEl);
  frag.appendChild(legendEl);
  if (noteText) {
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent = noteText;
    frag.appendChild(note);
  }
  return frag;
}

// --- Blog genre rollup (blog tab) ---
// Joins the GA page rows with the blog's article tag map. Without
// the map there is nothing honest to group by: the section then
// carries a short note instead of a table. Column headers sort
// the rows, like the Instagram tables; the last render's inputs
// are kept so a header click can re-render in the new order.

let blogGenreSort = { key: "totalViews", dir: "desc" };
let blogGenreContext = null;

const BLOG_GENRE_COLUMNS = [
  { key: "tag", label: "タグ", numeric: false },
  { key: "count", label: "記事数", numeric: true },
  { key: "totalViews", label: "表示回数 合計", numeric: true },
  { key: "perArticle", label: "1記事あたり", numeric: true },
  { key: "top", label: "最も読まれた記事", numeric: false },
];

function renderBlogGenres(pagesResponse, meta, rssTitles) {
  blogGenreContext = { pagesResponse, meta, rssTitles };
  const wrap = document.getElementById("blog-genres");
  wrap.innerHTML = "";
  if (!meta || !meta.tags || meta.tags.size === 0) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent =
      "記事のタグ情報を取得できなかったため、ジャンル別は表示していません。";
    wrap.appendChild(p);
    return;
  }
  // The RSS titles win; the titles payload fills any gap.
  const titles = mergeBlogTitles(meta.titles, rssTitles);
  const rows = sortGenreRows(
    blogGenreStats(pagesResponse, meta.tags, titles, CONFIG.SITE_ORIGIN),
    blogGenreSort.key,
    blogGenreSort.dir,
  );
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    wrap.appendChild(p);
    return;
  }
  // The tiles (area = views per article) summarise the same
  // rows the table below lists in full. Every figure here is a
  // last-28-days GA rollup that no public page prints, so the
  // whole section masks like the SNS genre sections.
  wrap.appendChild(
    buildGenreTreemap(
      genreTreemap(rows, (row) => ({
        name: row.tag,
        avg: row.perArticle,
        avgText: `1記事あたり ${formatCount(row.perArticle)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
      "タイルの面積は1記事あたり表示回数の大きさです。色が青いほど1記事あたり表示回数が多いです。",
    ),
  );
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of BLOG_GENRE_COLUMNS) {
    const th = document.createElement("th");
    th.className = (column.numeric ? "num " : "") + "sortable";
    const active = blogGenreSort.key === column.key;
    th.textContent =
      column.label +
      (active ? (blogGenreSort.dir === "desc" ? " ↓" : " ↑") : "");
    th.addEventListener("click", () => {
      if (blogGenreSort.key === column.key) {
        blogGenreSort = {
          key: column.key,
          dir: blogGenreSort.dir === "desc" ? "asc" : "desc",
        };
      } else {
        blogGenreSort = { key: column.key, dir: "desc" };
      }
      if (blogGenreContext) {
        renderBlogGenres(
          blogGenreContext.pagesResponse,
          blogGenreContext.meta,
          blogGenreContext.rssTitles,
        );
      }
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const tagTd = document.createElement("td");
    tagTd.textContent = row.tag;
    tr.appendChild(tagTd);
    for (const value of [row.count, row.totalViews, row.perArticle]) {
      const td = document.createElement("td");
      td.className = "num amount-value";
      td.textContent = formatCount(value);
      tr.appendChild(td);
    }
    const topTd = document.createElement("td");
    if (row.top) {
      const link = document.createElement("a");
      link.href = row.top.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = row.top.title;
      topTd.appendChild(link);
      const span = document.createElement("span");
      span.className = "rank-value amount-value";
      span.textContent = formatCount(row.top.views);
      topTd.appendChild(span);
    } else {
      topTd.textContent = "—";
    }
    tr.appendChild(topTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.appendChild(table);
  wrap.appendChild(scroll);
}

// --- Blog per-article table (blog tab) ---
// The blog counterpart of the Instagram tab's 投稿ごと: every
// article that drew views in the GA window, with its tags shown
// as genres, the shared genre filter buttons and sortable
// columns. The differences from the media table follow the
// data, not the design: the GA rows cover a fixed last-28-days
// window, so there is no period selector to link or ignore —
// and an article can carry several tags, so it appears under
// each of its genres' filters (the genre rollup counts it the
// same way). A fresh dashboard load resets the filter to
// すべて, exactly like the media table.

let blogArticles = [];
let blogArticleSort = { key: "views", dir: "desc", wired: false };
// The per-article table's genre filter: null shows every
// article (the すべて button).
let blogArticleGenreFilter = null;

function renderBlogArticleGenreTabs() {
  renderGenreFilterTabs(document.getElementById("blog-article-genre-tabs"), {
    total: blogArticles.length,
    options: articleGenreOptions(blogArticles),
    active: blogArticleGenreFilter,
    onSelect: (genre) => {
      blogArticleGenreFilter = genre;
      renderBlogArticleGenreTabs();
      renderBlogArticleTable();
    },
  });
}

function renderBlogArticleTable() {
  const tbody = document.getElementById("blog-article-body");
  tbody.innerHTML = "";
  const rows = sortMedia(
    filterArticlesByGenre(blogArticles, blogArticleGenreFilter),
    blogArticleSort.key,
    blogArticleSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const article of rows) {
    const tr = document.createElement("tr");
    const titleTd = document.createElement("td");
    const link = document.createElement("a");
    link.href = article.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = article.title;
    titleTd.appendChild(link);
    tr.appendChild(titleTd);
    const genreTd = document.createElement("td");
    genreTd.className = "nowrap";
    genreTd.textContent = article.tags.length
      ? article.tags.join("、")
      : "—";
    tr.appendChild(genreTd);
    const viewsTd = document.createElement("td");
    // Per-article view counts here are last-28-days GA figures,
    // not a number any public page prints: masked.
    viewsTd.className = "num amount-value";
    viewsTd.textContent = formatCount(article.views);
    tr.appendChild(viewsTd);
    tbody.appendChild(tr);
  }
  updateSortHeaders("blog-article-table", blogArticleSort);
}

function renderBlogArticles(pagesResponse, meta, rssTitles) {
  // The RSS titles win; the titles payload fills any gap — the
  // same merge the genre rollup makes.
  const titles = mergeBlogTitles(meta ? meta.titles : null, rssTitles);
  blogArticles = blogArticleList(
    pagesResponse,
    meta ? meta.tags : null,
    titles,
    CONFIG.SITE_ORIGIN,
  );
  const articleRangeEl = document.getElementById("blog-article-range");
  articleRangeEl.textContent = "";
  if (blogArticles.length) {
    articleRangeEl.append(
      "対象：直近28日間に表示された記事（全",
      countSpan(blogArticles.length, true),
      "件）",
    );
  }
  // A fresh load resets the per-article genre filter to すべて.
  blogArticleGenreFilter = null;
  renderBlogArticleGenreTabs();
  wireSortableTable(
    "blog-article-table",
    blogArticleSort,
    renderBlogArticleTable,
  );
  renderBlogArticleTable();
}

// --- Overview tab ---
// The overview pulls its numbers from three independent loads (GA
// totals, the SNS snapshot, the SNS history). Each loader stores
// its result here and re-renders; a figure whose load has not
// arrived yet carries that load's state line (kpiLoadState /
// topPostsPendingText) instead of a bare "—", and carries no
// change line.

const overviewState = {
  gaTotals: null,
  detail: null,
  // Whether each late-arriving load has finished (and whether
  // it failed). Sections filled by a load that is still in
  // flight show the loading line; once it has failed they show
  // the failure line; only a settled load may fall back to a
  // section's ordinary empty state. See section-status.js.
  detailSettled: false,
  detailFailed: false,
  historyRows: null,
  historySettled: false,
  historyFailed: false,
  // The blog's top articles for the overview's per-channel top
  // lists, ranked from the GA page rows when the report lands
  // (null until then; the blog section shows its load state).
  blogTop: null,
  blogSettled: false,
  blogFailed: false,
};

// Puts a not-yet-filled container into its load state — the
// loading line while the load behind it is in flight, the
// failure line once it has failed — and reports whether it did:
// false means the load has landed and the caller renders for
// real. One helper per load, so every section filled by the
// same response settles the same way.
function fillDetailPending(el) {
  if (!overviewState.detailSettled) {
    setSectionLoading(el);
    return true;
  }
  if (overviewState.detailFailed) {
    setSectionFailed(el);
    return true;
  }
  return false;
}

function fillHistoryPending(el) {
  if (!overviewState.historySettled) {
    setSectionLoading(el);
    return true;
  }
  if (overviewState.historyFailed) {
    setSectionFailed(el);
    return true;
  }
  return false;
}

// The 前日比 line under a card's value, shared by the overview
// KPI cards and any total box that carries a change (the
// Instagram tab's フォロー / フォロー解除 cards mirror the
// overview's): an increase is green and a decrease red —
// except on the cards flagged invert (フォロー解除）, where
// an increase is the bad direction and takes the red instead.
// The line is one of this page's own analysis figures, so it
// takes .amount-value and stays masked like the other numbers
// (never .is-public). Cards without a delta get no line.
function appendDeltaLine(box, item) {
  if (!item.delta) {
    return;
  }
  const delta = document.createElement("div");
  const sign = item.delta.startsWith("+")
    ? 1
    : item.delta.startsWith("-")
      ? -1
      : 0;
  const good = item.invert ? sign < 0 : sign > 0;
  const bad = item.invert ? sign > 0 : sign < 0;
  delta.className =
    "kpi-delta amount-value" + (good ? " up" : bad ? " down" : "");
  delta.textContent = `前日比 ${item.delta}`;
  box.appendChild(delta);
}

function fillKpiBoxes(items) {
  const wrap = document.getElementById("kpi-cards");
  wrap.innerHTML = "";
  for (const item of items) {
    const box = document.createElement("div");
    box.className = "total-box";
    const label = document.createElement("div");
    label.className = "total-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    // A card still waiting on its load shows the load-state
    // wording instead of a figure: it takes no .amount-value,
    // so privacy masking (which blurs figures) leaves the
    // wording itself readable.
    value.className = item.pending
      ? "total-value section-pending"
      : totalValueClass(item);
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    appendDeltaLine(box, item);
    wrap.appendChild(box);
  }
}

// The empty-row wording for one of the overview's top lists:
// the load state of the load behind the channel (the SNS
// snapshot, or the GA page rows for the blog) until it settles,
// then the plain "—" of a channel with genuinely nothing to
// list.
function topPostsPendingText(channel) {
  if (channel === "ブログ") {
    if (!overviewState.blogSettled) {
      return SECTION_LOADING_TEXT;
    }
    return overviewState.blogFailed ? SECTION_FAILED_TEXT : "—";
  }
  if (!overviewState.detailSettled) {
    return SECTION_LOADING_TEXT;
  }
  return overviewState.detailFailed ? SECTION_FAILED_TEXT : "—";
}

// The overview's top lists, one per channel: each channel's
// three most-viewed items under a heading that names the
// channel and the metric it reports (再生回数 for Instagram and
// YouTube, 表示回数 for Threads, X and the blog). The sections
// come from topPostsByChannel; a channel with nothing collected
// yet keeps its heading and a "—" row. The blog's rows land
// with the GA report (overviewState.blogTop), the rest with the
// SNS snapshot, and renderOverview re-runs as each arrives.
function renderTopPosts() {
  const wrap = document.getElementById("top-posts");
  wrap.innerHTML = "";
  const sections = topPostsByChannel(
    overviewState.detail,
    overviewState.blogTop,
    3,
  );
  for (const section of sections) {
    const head = document.createElement("h3");
    head.className = "subsection-title";
    head.textContent = `${section.channel}（${section.metric}）`;
    wrap.appendChild(head);
    const list = document.createElement("ol");
    list.className = "ranking";
    if (!section.items.length) {
      const li = document.createElement("li");
      // No rows yet: while the load behind this channel is
      // still in flight the row carries its load state, so an
      // empty list cannot be mistaken for a channel with no
      // posts; only a settled load keeps the bare "—".
      li.textContent = topPostsPendingText(section.channel);
      list.appendChild(li);
    }
    for (const item of section.items) {
      const li = document.createElement("li");
      if (item.href) {
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = item.label;
        li.appendChild(link);
      } else {
        li.textContent = item.label;
      }
      const span = document.createElement("span");
      span.className =
        "rank-value amount-value" + (item.public ? " is-public" : "");
      span.textContent = formatCount(item.value);
      li.appendChild(span);
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }
}

// The channel sizes at the top of the overview, as a treemap:
// tile area = the channel's size figure (followers, or
// subscribers for YouTube; the blog's 28-day user count, named
// as 利用者 on its tile), tile colour = the blue heat scale the
// genre tiles use, scaled by the figure. Each tile draws the
// lines its size can hold (see tileLabelLevel): the channel
// name and the count ride on every tile, down to micro type,
// and the roomiest tiles add a sub line with the day-over-day
// change (coloured green / red by direction)
// and the channel's share of the combined SNS followers. The
// legend under the map lists every channel's exact figures,
// so a channel still awaiting collection reads there too.
function renderChannelTreemap() {
  const mapEl = document.getElementById("channel-treemap");
  const legendEl = document.getElementById("channel-legend");
  const { tiles, legend } = channelTreemap(
    overviewState.detail,
    overviewState.gaTotals,
    overviewState.historyRows,
  );
  mapEl.innerHTML = "";
  if (!tiles.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    mapEl.appendChild(p);
  }
  for (const tile of tiles) {
    const div = document.createElement("div");
    div.className = "treemap-tile";
    div.style.left = `${tile.x}%`;
    div.style.top = `${tile.y}%`;
    div.style.width = `${tile.w}%`;
    div.style.height = `${tile.h}%`;
    if (tile.heat) {
      div.style.background = tile.heat;
    }
    // The title repeats the figures as a hover tooltip, which
    // CSS cannot blur; while masking is on it is left off (the
    // legend below the map carries the same figures, masked).
    if (!maskingOn()) {
      div.title =
        `${tile.name}：${tile.metricLabel} ${tile.valueLabel}` +
        (tile.shareLabel ? `（${tile.shareLabel}）` : "") +
        (tile.deltaLabel ? ` 前日比 ${tile.deltaLabel}` : "");
    }
    const level = tile.labelLevel ?? (tile.labelRoom ? "full" : "none");
    div.classList.add(`level-${level}`);
    if (level === "micro-v" || level === "micro-h") {
      // The SNS channels' figures are the top page's published
      // follower counts and stay exempt from masking; the blog's
      // figure is a 28-day GA user count no public page prints,
      // so its tile masks (the 前日比 sub line below stays
      // masked for every channel).
      div.appendChild(
        tileOneLineLabel(level, tile.name, tile.valueText, tile.id !== "blog"),
      );
      mapEl.appendChild(div);
      continue;
    }
    if (level !== "none") {
      const name = document.createElement("div");
      name.className = "treemap-tile-name";
      name.textContent = tile.name;
      div.appendChild(name);
      const value = document.createElement("div");
      value.className =
        "treemap-tile-value amount-value" +
        (tile.id !== "blog" ? " is-public" : "");
      value.textContent = tile.valueText;
      div.appendChild(value);
    }
    if (level === "full") {
      const sub = document.createElement("div");
      sub.className = "treemap-tile-sub";
      if (tile.deltaLabel) {
        const delta = document.createElement("span");
        delta.className =
          "treemap-tile-delta amount-value" +
          (tile.tone !== "neutral" ? ` ${tile.tone}` : "");
        delta.textContent = `前日比 ${tile.deltaLabel}`;
        sub.appendChild(delta);
      }
      if (tile.shareLabel) {
        if (tile.deltaLabel) {
          sub.appendChild(document.createTextNode("・"));
        }
        const share = document.createElement("span");
        share.textContent = tile.shareLabel;
        sub.appendChild(share);
      }
      div.appendChild(sub);
    }
    mapEl.appendChild(div);
  }
  legendEl.innerHTML = "";
  for (const entry of legend) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "channel-legend-name";
    name.textContent = entry.name;
    li.appendChild(name);
    const metric = document.createElement("span");
    metric.className = "channel-legend-metric";
    metric.textContent = entry.metricLabel;
    li.appendChild(metric);
    if (entry.note) {
      const note = document.createElement("span");
      note.className = "channel-legend-note";
      note.textContent = entry.note;
      li.appendChild(note);
    } else {
      const value = document.createElement("span");
      // Same line as the tiles: SNS follower counts are
      // published and exempt; the blog's user count is not.
      value.className =
        "channel-legend-value amount-value" +
        (entry.id !== "blog" ? " is-public" : "");
      value.textContent = entry.valueLabel;
      li.appendChild(value);
      if (entry.shareLabel) {
        const share = document.createElement("span");
        share.className = "channel-legend-note";
        share.textContent = entry.shareLabel;
        li.appendChild(share);
      }
      if (entry.deltaLabel) {
        const delta = document.createElement("span");
        delta.className =
          "kpi-delta amount-value" +
          (entry.delta > 0 ? " up" : entry.delta < 0 ? " down" : "");
        delta.textContent = `前日比 ${entry.deltaLabel}`;
        li.appendChild(delta);
      }
    }
    legendEl.appendChild(li);
  }
}


// A KPI card whose figure rides on the SNS snapshot, while
// that load is still in flight (or has failed): the bare "—"
// the card would otherwise sit on reads as "no data", so the
// card shows the load state instead, without a change line.
// The blog cards ride on the GA totals, which gate the reveal
// itself, so their "—" never passes through here.
function kpiLoadState(item) {
  if (overviewState.detail || item.value !== "—") {
    return item;
  }
  if (!overviewState.detailSettled) {
    return { ...item, value: SECTION_LOADING_TEXT, delta: null, pending: true };
  }
  if (overviewState.detailFailed) {
    return { ...item, value: SECTION_FAILED_TEXT, delta: null, pending: true };
  }
  return item;
}

function renderOverview() {
  renderChannelTreemap();
  fillKpiBoxes(
    overviewKpis(
      overviewState.detail,
      overviewState.gaTotals,
      overviewState.historyRows,
    ).map(kpiLoadState),
  );
  renderTopPosts();
}

// --- SNS section ---

const snsStatusEl = document.getElementById("sns-status");
const snsBodyEl = document.getElementById("sns-body");

let snsMediaRows = [];
// The media table starts sorted by views, most-watched first.
let snsSort = { key: "views", dir: "desc", wired: false };
// The per-post table's genre filter: null shows every post (the
// すべて button). Independent of the genre section's period
// selector — the filter always covers the full fetched list.
let snsGenreFilter = null;

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
    value.className = totalValueClass(item);
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    if (item.delta) {
      const delta = document.createElement("div");
      // The same change line as the overview KPI cards: an
      // increase is green and a decrease red — except on the
      // cards flagged invert, where an increase is the bad
      // direction and takes the red instead.
      const sign = item.delta.startsWith("+")
        ? 1
        : item.delta.startsWith("-")
          ? -1
          : 0;
      const good = item.invert ? sign < 0 : sign > 0;
      const bad = item.invert ? sign > 0 : sign < 0;
      delta.className =
        "kpi-delta amount-value" + (good ? " up" : bad ? " down" : "");
      delta.textContent = `前日比 ${item.delta}`;
      box.appendChild(delta);
    }
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
    span.className = "rank-value amount-value";
    span.textContent = formatCount(item.value);
    li.appendChild(span);
    list.appendChild(li);
  }
}

// The genre filter buttons above a per-item table (the
// Instagram tab's 投稿ごと and the blog tab's 記事ごと share
// this renderer, so the two tables feel the same): すべて plus
// one button per genre that has items, each labelled with its
// item count. `total` is the count on the すべて button — the
// caller computes it, since a blog article with several tags
// counts once per tag in the options but is still one article.
// Clicking a button reports the genre (null for すべて) through
// onSelect; the caller owns the filter state and re-renders.
function renderGenreFilterTabs(
  wrap,
  { total, options, active, onSelect },
) {
  wrap.innerHTML = "";
  const buttons = [{ genre: null, name: "すべて", count: total }];
  for (const option of options) {
    buttons.push({
      genre: option.genre,
      name: option.genre,
      count: option.count,
    });
  }
  for (const entry of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab-button genre-filter-button";
    const isActive = active === entry.genre;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", String(isActive));
    // The item count is a raw count: it rides in a masking span
    // inside the button's label.
    btn.append(`${entry.name}（`, countSpan(entry.count), "）");
    btn.addEventListener("click", () => onSelect(entry.genre));
    wrap.appendChild(btn);
  }
}

// The buttons are rebuilt from the current media list on every
// SNS render, so they always match the genres the classifier
// produces. Clicking one narrows the table below to that genre;
// the sort order is kept.
function renderMediaGenreTabs() {
  const wrap = document.getElementById("sns-media-genre-tabs");
  const options = mediaGenreOptions(snsMediaRows);
  const total = options.reduce((sum, option) => sum + option.count, 0);
  renderGenreFilterTabs(wrap, {
    total,
    options,
    active: snsGenreFilter,
    onSelect: (genre) => {
      snsGenreFilter = genre;
      renderMediaGenreTabs();
      renderMediaTable();
    },
  });
}

// One post-list thumbnail: a fixed-size frame the row height
// never depends on, with the image cover-cropped into it. `shape`
// names the frame's aspect — "vertical" (reels), "square"
// (photos) or "horizontal" (wide videos). `candidates` are image
// URLs in order of preference: one that fails to load falls
// through to the next, and when none is left the frame simply
// stays empty, so a missing or expired image never breaks the
// row. With `autoShape` (YouTube, whose URL shape serves both
// orientations) a candidate that loads as YouTube's 120x90
// placeholder also falls through, and the frame adopts the
// loaded image's own aspect once it arrives.
function thumbnailCell({ candidates = [], shape = "square", autoShape = false }) {
  const td = document.createElement("td");
  td.className = "thumb-cell";
  const frame = document.createElement("span");
  frame.className = `thumb-frame thumb-${shape}`;
  const urls = candidates.filter(
    (url) => typeof url === "string" && url.length > 0,
  );
  if (urls.length) {
    const img = document.createElement("img");
    img.className = "thumb-img";
    img.alt = "";
    img.loading = "lazy";
    let index = 0;
    const advance = () => {
      index += 1;
      if (index < urls.length) {
        img.src = urls[index];
      } else {
        img.remove();
      }
    };
    img.addEventListener("error", advance);
    img.addEventListener("load", () => {
      if (
        autoShape &&
        isPlaceholderThumbnail(img.naturalWidth, img.naturalHeight)
      ) {
        advance();
        return;
      }
      if (autoShape) {
        const orientation = thumbnailOrientation(
          img.naturalWidth,
          img.naturalHeight,
        );
        if (orientation) {
          frame.className = `thumb-frame thumb-${orientation}`;
        }
      }
    });
    img.src = urls[0];
    frame.appendChild(img);
  }
  td.appendChild(frame);
  return td;
}

function renderMediaTable() {
  const tbody = document.getElementById("sns-media-body");
  tbody.innerHTML = "";
  const rows = sortMedia(
    filterMediaByGenre(snsMediaRows, snsGenreFilter),
    snsSort.key,
    snsSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 12;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const numCell = (value, format = formatCount) => {
    const td = document.createElement("td");
    td.className = "num amount-value";
    td.textContent = format(value);
    return td;
  };
  for (const media of rows) {
    const tr = document.createElement("tr");
    tr.appendChild(
      thumbnailCell({
        candidates: [instagramThumbnailUrl(media)],
        shape: mediaThumbnailShape(media),
      }),
    );
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
      link.className = "post-link-icon";
      link.textContent = "↗";
      link.title = "Instagramで開く";
      link.setAttribute("aria-label", "Instagramで開く");
      linkTd.appendChild(link);
    } else {
      linkTd.textContent = "—";
    }
    tr.appendChild(linkTd);
    tbody.appendChild(tr);
  }
  updateSortHeaders("sns-media-table", snsSort);
}

// Column-header sorting shared by the per-item tables (the
// Instagram tab's 投稿ごと and the blog tab's 記事ごと): the
// first click on a header sorts descending by that column,
// clicking the same header again flips the direction, and the
// active header carries a ↓ / ↑ mark. `sortState` is the
// table's own { key, dir, wired } object; render redraws the
// table body (and calls updateSortHeaders) after a click.
function wireSortableTable(tableId, sortState, render) {
  if (sortState.wired) {
    return;
  }
  sortState.wired = true;
  document.querySelectorAll(`#${tableId} th.sortable`).forEach((th) => {
    th.dataset.label = th.textContent;
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      if (sortState.key === key) {
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      } else {
        sortState.key = key;
        sortState.dir = "desc";
      }
      render();
    });
  });
}

function updateSortHeaders(tableId, sortState) {
  document.querySelectorAll(`#${tableId} th.sortable`).forEach((th) => {
    const active = th.dataset.sortKey === sortState.key;
    th.textContent =
      th.dataset.label + (active ? (sortState.dir === "desc" ? " ↓" : " ↑") : "");
  });
}

function wireMediaSort() {
  wireSortableTable("sns-media-table", snsSort, renderMediaTable);
}

// --- Instagram genre rollup ---
// The genre stats are computed over a period window of the
// fetched posts (all of them, or the last 30 / 7 days), chosen
// with the period selector; the section header states the exact
// dates the current window covers. Column headers sort the rows,
// and the tiles / average bars follow the same rows.

let snsDetail = null;
let genreSort = { key: "totalViews", dir: "desc" };
let genrePeriod = "all";
let genreControlsWired = false;

function updateGenreHeaders() {
  document.querySelectorAll("#sns-genre-table th.sortable").forEach((th) => {
    const active = th.dataset.sortKey === genreSort.key;
    th.textContent =
      th.dataset.label + (active ? (genreSort.dir === "desc" ? " ↓" : " ↑") : "");
  });
}

function wireGenreControls() {
  if (genreControlsWired) {
    return;
  }
  genreControlsWired = true;
  document.querySelectorAll("#sns-genre-table th.sortable").forEach((th) => {
    th.dataset.label = th.textContent;
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      if (genreSort.key === key) {
        genreSort = { key, dir: genreSort.dir === "desc" ? "asc" : "desc" };
      } else {
        genreSort = { key, dir: "desc" };
      }
      renderGenreTable(snsDetail);
    });
  });
  const select = document.getElementById("sns-genre-period");
  select.addEventListener("change", () => {
    genrePeriod = select.value;
    renderGenreTable(snsDetail);
  });
}

// Per-genre rollup of the posts in the selected period window:
// one row per genre that has at least one post. The top post
// links out to Instagram.
function renderGenreTable(detail) {
  const media = filterMediaByPeriod(snsMediaRows, genrePeriod);
  const rows = sortGenreRows(
    genreStatsForMedia(media),
    genreSort.key,
    genreSort.dir,
  );
  const rangeEl = document.getElementById("sns-genre-range");
  const range = mediaDateRange(media);
  rangeEl.textContent = "";
  if (!media.length) {
    rangeEl.textContent = "この期間の投稿はありません";
  } else if (range) {
    rangeEl.append(
      `対象：${formatJstDate(range.from)}〜${formatJstDate(range.to)}の投稿（全`,
      countSpan(media.length),
      "件）",
    );
  }
  renderGenreTreemap(
    document.getElementById("sns-genre-treemap"),
    document.getElementById("sns-genre-legend"),
    genreTreemap(rows, (row) => ({
      name: row.genre,
      avg: row.avgViews,
      avgText: `平均再生 ${formatCount(row.avgViews)}`,
      totalText: `合計 ${formatCount(row.totalViews)}`,
    })),
  );
  updateGenreHeaders();
  const tbody = document.getElementById("sns-genre-body");
  tbody.innerHTML = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  const numCell = (text) => {
    const td = document.createElement("td");
    td.className = "num amount-value";
    td.textContent = text;
    return td;
  };
  // Rate cells （保存率・いいね率） are ratios: they stay
  // readable while masking, so they take no .amount-value.
  const rateCell = (text) => {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = text;
    return td;
  };
  for (const row of rows) {
    const tr = document.createElement("tr");
    const genreTd = document.createElement("td");
    genreTd.className = "nowrap";
    genreTd.textContent = row.genre;
    tr.appendChild(genreTd);
    tr.appendChild(numCell(formatCount(row.count)));
    tr.appendChild(numCell(formatCount(row.totalViews)));
    tr.appendChild(numCell(formatCount(row.avgViews)));
    tr.appendChild(rateCell(formatRate(row.saveRate)));
    tr.appendChild(rateCell(formatRate(row.likeRate)));
    const topTd = document.createElement("td");
    if (row.top) {
      if (row.top.permalink) {
        const link = document.createElement("a");
        link.href = row.top.permalink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = row.top.title;
        topTd.appendChild(link);
      } else {
        topTd.textContent = row.top.title;
      }
      const span = document.createElement("span");
      span.className = "rank-value amount-value";
      span.textContent = formatCount(row.top.views);
      topTd.appendChild(span);
    } else {
      topTd.textContent = "—";
    }
    tr.appendChild(topTd);
    tbody.appendChild(tr);
  }
}

function renderYoutube(detail) {
  fillTotalBoxes(
    "sns-youtube-totals",
    youtubeTotals(detail, overviewState.historyRows),
  );
  const tbody = document.getElementById("sns-youtube-body");
  tbody.innerHTML = "";
  const videos = youtubeVideos(detail);
  if (!videos.length) {
    // No snapshot behind this render yet (the loader's initial
    // call, or its failure): the table carries the load state,
    // not the empty-table line.
    if (detail == null && fillDetailPending(tbody)) {
      return;
    }
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const video of videos) {
    const tr = document.createElement("tr");
    tr.appendChild(
      thumbnailCell({
        candidates: youtubeThumbnailUrls(video),
        shape: "horizontal",
        autoShape: true,
      }),
    );
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
      td.className = "num amount-value";
      td.textContent = formatCount(value);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// The YouTube tab's subscriber trend, drawn from the same
// history rows as the other channel tabs' trends (X and Threads
// render theirs inside renderX / renderThreads). renderSns and
// loadSnsHistory both call it, so whichever load lands second
// completes the picture; until a row carries a subscriber count
// the section shows its empty state.
function renderYoutubeHistory() {
  const wrap = document.getElementById("youtube-history");
  // Until the history load settles, the wrap carries its load
  // state rather than the "no history yet" line.
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = youtubeHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  const item = series[0];
  const head = document.createElement("p");
  head.className = "meta";
  head.append(
    `${item.label}：最新 `,
    countSpan(item.latest, true),
    `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
  );
  const chart = document.createElement("div");
  chart.className = "chart-wrap";
  chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
  wrap.appendChild(head);
  wrap.appendChild(chart);
}

// --- Threads tab ---
// The Threads tab reads the same two loads as the overview: the
// follower count, the last-30-days account totals and the recent
// posts from the SNS snapshot (sns_detail's threads section),
// and the follower trend from the history rows. renderSns and
// loadSnsHistory both call renderThreads, so whichever load
// lands second completes the picture; data that has not arrived
// yet shows as "—" and the chart area keeps its empty-state
// line. Threads history only starts on 2026-11-09, so for a
// while the chart holds a handful of points (or just one).

let threadsPostRows = [];
// The posts table starts sorted by views, most-viewed first,
// like the Instagram tab's media table.
let threadsSort = { key: "views", dir: "desc", wired: false };
// The per-post table's genre filter: null shows every post
// (the すべて button). The classification is the shared one
// (classifyCaption over the post text), so the buttons, the
// genre section above and the filter always agree.
let threadsGenreFilter = null;
// The genre table's sort, mirroring the Instagram genre table.
let threadsGenreSort = { key: "totalViews", dir: "desc" };

// --- Post genre sections (Threads / X) ---
// The same construction as the Instagram tab's ジャンル別 —
// treemap (tile area = the genre's average views, heat colour
// on the same average), legend, then the table (its 平均表示
// column carries the average as a number) —
// over the fetched posts, classified by the shared rules over
// each post's text. Threads and X numbers are lifetime counts,
// so there is no period selector; the section rebuilds on
// every render (the blog genre section's pattern), which also
// keeps the sort headers in step. Neither channel's posts
// carry saves, so the table carries いいね率 but no 保存率.
// The builder takes the channel's rollup rows and sort state;
// each tab's own renderer is a thin wrapper over it, so the
// two sections can never drift apart.

const POST_GENRE_COLUMNS = [
  { key: "genre", label: "ジャンル", numeric: false },
  { key: "count", label: "投稿数", numeric: true },
  { key: "totalViews", label: "表示合計", numeric: true },
  { key: "avgViews", label: "平均表示", numeric: true },
  { key: "likeRate", label: "いいね率", numeric: true },
  { key: "top", label: "表示トップ", numeric: false },
];

function renderPostGenres(wrap, stats, sortState, rerender) {
  wrap.innerHTML = "";
  const rows = sortGenreRows(stats, sortState.key, sortState.dir);
  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    wrap.appendChild(p);
    return;
  }
  wrap.appendChild(
    buildGenreTreemap(
      genreTreemap(rows, (row) => ({
        name: row.genre,
        avg: row.avgViews,
        avgText: `平均表示 ${formatCount(row.avgViews)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
      "タイルの面積は平均表示回数の大きさです。色が青いほど平均表示回数が多いです。",
    ),
  );
  const table = document.createElement("table");
  table.className = "data-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of POST_GENRE_COLUMNS) {
    const th = document.createElement("th");
    th.className = (column.numeric ? "num " : "") + "sortable";
    const active = sortState.key === column.key;
    th.textContent =
      column.label +
      (active ? (sortState.dir === "desc" ? " ↓" : " ↑") : "");
    th.addEventListener("click", () => {
      if (sortState.key === column.key) {
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      } else {
        sortState.key = column.key;
        sortState.dir = "desc";
      }
      rerender();
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  const numCell = (text) => {
    const td = document.createElement("td");
    td.className = "num amount-value";
    td.textContent = text;
    return td;
  };
  // The rate cell （いいね率） is a ratio: it stays readable
  // while masking, so it takes no .amount-value.
  const rateCell = (text) => {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = text;
    return td;
  };
  for (const row of rows) {
    const tr = document.createElement("tr");
    const genreTd = document.createElement("td");
    genreTd.className = "nowrap";
    genreTd.textContent = row.genre;
    tr.appendChild(genreTd);
    tr.appendChild(numCell(formatCount(row.count)));
    tr.appendChild(numCell(formatCount(row.totalViews)));
    tr.appendChild(numCell(formatCount(row.avgViews)));
    tr.appendChild(rateCell(formatRate(row.likeRate)));
    const topTd = document.createElement("td");
    if (row.top) {
      if (row.top.permalink) {
        const link = document.createElement("a");
        link.href = row.top.permalink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = row.top.title;
        topTd.appendChild(link);
      } else {
        topTd.textContent = row.top.title;
      }
      const span = document.createElement("span");
      span.className = "rank-value amount-value";
      span.textContent = formatCount(row.top.views);
      topTd.appendChild(span);
    } else {
      topTd.textContent = "—";
    }
    tr.appendChild(topTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const scroll = document.createElement("div");
  scroll.className = "table-scroll";
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent =
    "ジャンルは本文のキーワードで振り分けています（Instagram と同じルール）。いいね率は、投稿ごとの率（いいね÷表示）の平均です。";
  wrap.appendChild(note);
  const scope = document.createElement("p");
  scope.className = "meta";
  scope.textContent =
    "集計は取得済みの投稿だけが対象です（すべての投稿ではありません）。";
  wrap.appendChild(scope);
}

// The Threads tab's genre section: the shared builder over
// the Threads rollup and the tab's own sort state.
function renderThreadsGenres() {
  renderPostGenres(
    document.getElementById("threads-genres"),
    genreStatsForThreads(threadsPostRows),
    threadsGenreSort,
    renderThreadsGenres,
  );
}

// The buttons above the Threads per-post table, rendered with
// the shared genre filter renderer like the other two tabs.
// The counts come from the same rollup the genre section
// shows, so a button's count is exactly the number of rows its
// filter keeps.
function renderThreadsPostsGenreTabs() {
  renderGenreFilterTabs(document.getElementById("threads-posts-genre-tabs"), {
    total: threadsPostRows.length,
    options: threadsGenreOptions(threadsPostRows),
    active: threadsGenreFilter,
    onSelect: (genre) => {
      threadsGenreFilter = genre;
      renderThreadsPostsGenreTabs();
      renderThreadsPosts();
    },
  });
}

// Per-post table of the Threads tab, the counterpart of the
// Instagram tab's 投稿ごと: one row per recent post, the text
// shortened and linked to the post itself, the shared genre
// filter buttons above it and the shared header-click sorting.
// Values that could not be collected show "—", and a partial
// failure (posts_error) never hides the posts that did arrive.
function renderThreadsPosts() {
  const tbody = document.getElementById("threads-posts-body");
  tbody.innerHTML = "";
  const threadsRangeEl = document.getElementById("threads-posts-range");
  threadsRangeEl.textContent = "";
  if (threadsPostRows.length) {
    threadsRangeEl.append(
      "対象：直近の投稿（全",
      countSpan(threadsPostRows.length),
      "件）",
    );
  }
  const rows = sortMedia(
    filterThreadsByGenre(threadsPostRows, threadsGenreFilter),
    threadsSort.key,
    threadsSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    const numCell = (value) => {
      const td = document.createElement("td");
      td.className = "num amount-value";
      td.textContent = formatCount(value);
      return td;
    };
    for (const post of rows) {
      const tr = document.createElement("tr");
      const dateTd = document.createElement("td");
      dateTd.className = "nowrap";
      dateTd.textContent = formatJstDateTime(post.posted_at);
      tr.appendChild(dateTd);
      const textTd = document.createElement("td");
      textTd.className = "caption-cell";
      const head = captionHead(post.text) || "投稿";
      if (post.permalink) {
        const link = document.createElement("a");
        link.href = post.permalink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = head;
        textTd.appendChild(link);
      } else {
        textTd.textContent = head;
      }
      tr.appendChild(textTd);
      tr.appendChild(numCell(post.views));
      tr.appendChild(numCell(post.likes));
      tr.appendChild(numCell(post.replies));
      tr.appendChild(numCell(post.reposts));
      tr.appendChild(numCell(post.quotes));
      tbody.appendChild(tr);
    }
  }
  updateSortHeaders("threads-posts-table", threadsSort);
}

function renderThreads() {
  fillTotalBoxes(
    "sns-threads-totals",
    threadsTotals(overviewState.detail, overviewState.historyRows),
  );
  fillTotalBoxes(
    "sns-threads-interactions",
    threadsInteractions(overviewState.detail),
  );
  threadsPostRows = threadsPosts(overviewState.detail);
  wireSortableTable("threads-posts-table", threadsSort, renderThreadsPosts);
  // Until the snapshot settles, the genre section and the
  // per-post table carry the load state instead of their empty
  // states (the totals boxes above show "—" under the tab's
  // status line, like the Instagram tab's sections do).
  if (fillDetailPending(document.getElementById("threads-genres"))) {
    fillDetailPending(document.getElementById("threads-posts-body"));
    document.getElementById("threads-posts-genre-tabs").innerHTML = "";
    document.getElementById("threads-posts-range").textContent = "";
  } else {
    renderThreadsGenres();
    renderThreadsPostsGenreTabs();
    renderThreadsPosts();
  }
  const notes = document.getElementById("threads-notes");
  notes.innerHTML = "";
  for (const note of threadsErrorNotes(overviewState.detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  const wrap = document.getElementById("threads-history");
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = threadsHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  const item = series[0];
  const head = document.createElement("p");
  head.className = "meta";
  head.append(
    `${item.label}：最新 `,
    countSpan(item.latest, true),
    `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
  );
  const chart = document.createElement("div");
  chart.className = "chart-wrap";
  chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
  wrap.appendChild(head);
  wrap.appendChild(chart);
}

// --- X tab ---
// The X tab reads the same two loads as the Threads tab: the
// follower count and the recent posts from sns_detail's x
// section (collected by social-gas from tweet-gas), and the
// follower trend from the history rows. renderSns and
// loadSnsHistory both call renderX, so whichever load lands
// second completes the picture; data that has not arrived yet
// shows as "—". Like the Threads tab, the posts are classified
// by the shared genre rules over their text, with the same
// ジャンル別 section and genre filter over the per-post table.

let xPostRows = [];
// The posts table starts sorted by views, most-viewed first,
// like the other per-post tables.
let xSort = { key: "views", dir: "desc", wired: false };
// The per-post table's genre filter: null shows every post
// (the すべて button). The classification is the shared one
// (classifyCaption over the post text), so the buttons, the
// genre section above and the filter always agree.
let xGenreFilter = null;
// The genre table's sort, mirroring the other genre tables.
let xGenreSort = { key: "totalViews", dir: "desc" };

// The X tab's genre section: the shared builder over the X
// rollup and the tab's own sort state.
function renderXGenres() {
  renderPostGenres(
    document.getElementById("x-genres"),
    genreStatsForX(xPostRows),
    xGenreSort,
    renderXGenres,
  );
}

// The buttons above the X per-post table, rendered with the
// shared genre filter renderer like the other tabs. The
// counts come from the same rollup the genre section shows,
// so a button's count is exactly the number of rows its
// filter keeps.
function renderXPostsGenreTabs() {
  renderGenreFilterTabs(document.getElementById("x-posts-genre-tabs"), {
    total: xPostRows.length,
    options: xGenreOptions(xPostRows),
    active: xGenreFilter,
    onSelect: (genre) => {
      xGenreFilter = genre;
      renderXPostsGenreTabs();
      renderXPosts();
    },
  });
}

function renderXPosts() {
  const tbody = document.getElementById("x-posts-body");
  tbody.innerHTML = "";
  const xRangeEl = document.getElementById("x-posts-range");
  xRangeEl.textContent = "";
  if (xPostRows.length) {
    xRangeEl.append(
      "対象：直近の投稿（全",
      countSpan(xPostRows.length),
      "件）",
    );
  }
  const rows = sortMedia(
    filterXByGenre(xPostRows, xGenreFilter),
    xSort.key,
    xSort.dir,
  );
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "データがありません";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    const numCell = (value) => {
      const td = document.createElement("td");
      td.className = "num amount-value";
      td.textContent = formatCount(value);
      return td;
    };
    for (const post of rows) {
      const tr = document.createElement("tr");
      const dateTd = document.createElement("td");
      dateTd.className = "nowrap";
      dateTd.textContent = formatJstDateTime(post.posted_at);
      tr.appendChild(dateTd);
      const textTd = document.createElement("td");
      textTd.className = "caption-cell";
      const head = captionHead(post.text) || "投稿";
      if (post.url) {
        const link = document.createElement("a");
        link.href = post.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = head;
        textTd.appendChild(link);
      } else {
        textTd.textContent = head;
      }
      tr.appendChild(textTd);
      tr.appendChild(numCell(post.views));
      tr.appendChild(numCell(post.likes));
      tr.appendChild(numCell(post.reposts));
      tr.appendChild(numCell(post.replies));
      tbody.appendChild(tr);
    }
  }
  updateSortHeaders("x-posts-table", xSort);
}

function renderX() {
  fillTotalBoxes("sns-x-totals", xTotals(overviewState.detail, overviewState.historyRows));
  xPostRows = xPosts(overviewState.detail);
  wireSortableTable("x-posts-table", xSort, renderXPosts);
  // Until the snapshot settles, the genre section and the
  // per-post table carry the load state instead of their empty
  // states, like the Threads tab's.
  if (fillDetailPending(document.getElementById("x-genres"))) {
    fillDetailPending(document.getElementById("x-posts-body"));
    document.getElementById("x-posts-genre-tabs").innerHTML = "";
    document.getElementById("x-posts-range").textContent = "";
  } else {
    renderXGenres();
    renderXPostsGenreTabs();
    renderXPosts();
  }
  const notes = document.getElementById("x-notes");
  notes.innerHTML = "";
  for (const note of xErrorNotes(overviewState.detail)) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${note}`;
    notes.appendChild(p);
  }
  const wrap = document.getElementById("x-history");
  if (fillHistoryPending(wrap)) {
    return;
  }
  wrap.innerHTML = "";
  const series = xHistorySeries(overviewState.historyRows);
  if (!series.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "履歴はまだありません（取得のたびに貯まっていきます）";
    wrap.appendChild(p);
    return;
  }
  const item = series[0];
  const head = document.createElement("p");
  head.className = "meta";
  head.append(
    `${item.label}：最新 `,
    countSpan(item.latest, true),
    `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
  );
  const chart = document.createElement("div");
  chart.className = "chart-wrap";
  chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
  wrap.appendChild(head);
  wrap.appendChild(chart);
}

// --- Instagram daily follows (フォロー・フォロー解除（日ごと）) ---
// Daily follow / unfollow bars with the day's posts mapped onto
// them. Meta only reports follows as an account-wide daily
// number, so the overlay is by calendar day: it shows what was
// posted on the days follows moved, never that a post caused the
// move — the note under the chart says exactly that. The series
// arrives with sns_detail (instagram.daily_follows); until
// social-gas collects it, the section shows its empty state.
//
// Tapping a posted day's column in the chart (the ▼ marker or
// anywhere on the column — buildFollowChartSvg gives those days
// a full-column hit rect) scrolls to that day's entry in the
// list below and highlights both the entry and the column until
// another day is picked.

function jumpToFollowDay(wrap, date) {
  for (const el of wrap.querySelectorAll(".follow-day-hit.selected")) {
    el.classList.remove("selected");
  }
  for (const el of wrap.querySelectorAll(".follow-day-entry.highlight")) {
    el.classList.remove("highlight");
  }
  const hit = wrap.querySelector(`.follow-day-hit[data-date="${date}"]`);
  if (hit) {
    hit.classList.add("selected");
  }
  const entry = wrap.querySelector(`.follow-day-entry[data-date="${date}"]`);
  if (entry) {
    entry.classList.add("highlight");
    entry.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderFollowChart(detail) {
  const wrap = document.getElementById("sns-follow-chart");
  wrap.innerHTML = "";
  const days = followChartDays(detail);
  if (!days.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "データがありません";
    wrap.appendChild(p);
  } else {
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    chart.innerHTML = buildFollowChartSvg(days);
    chart.addEventListener("click", (event) => {
      const hit = event.target.closest?.("[data-date]");
      if (hit) {
        jumpToFollowDay(wrap, hit.dataset.date);
      }
    });
    wrap.appendChild(chart);
    const legend = document.createElement("p");
    legend.className = "meta";
    legend.textContent =
      "青い棒がフォロー、赤い棒がフォロー解除です。▼は投稿があった日です。▼や棒を押すと、その日の投稿に飛びます。";
    wrap.appendChild(legend);
    const postedDays = days.filter((day) => day.posts.length);
    if (postedDays.length) {
      const head = document.createElement("h4");
      head.className = "demo-list-title";
      head.textContent = "投稿があった日";
      wrap.appendChild(head);
      for (const day of [...postedDays].reverse()) {
        const entry = document.createElement("div");
        entry.className = "follow-day-entry";
        entry.dataset.date = day.date;
        const dayLine = document.createElement("p");
        dayLine.className = "meta";
        dayLine.append(`${formatDateLabel(day.date)}：フォロー `);
        const followsCount = document.createElement("span");
        followsCount.className = "follow-count-up amount-value";
        followsCount.textContent = formatCount(day.follows);
        dayLine.append(followsCount, " · フォロー解除 ");
        const unfollowsCount = document.createElement("span");
        unfollowsCount.className = "follow-count-down amount-value";
        unfollowsCount.textContent = formatCount(day.unfollows);
        dayLine.append(unfollowsCount);
        entry.appendChild(dayLine);
        const list = document.createElement("ul");
        list.className = "ranking";
        for (const media of day.posts) {
          const li = document.createElement("li");
          const label =
            captionHead(media.caption) || mediaTypeLabel(media.type) || "投稿";
          if (media.permalink) {
            const link = document.createElement("a");
            link.href = media.permalink;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = label;
            li.appendChild(link);
          } else {
            li.textContent = label;
          }
          const span = document.createElement("span");
          span.className = "rank-value amount-value";
          span.textContent = formatCount(media.views);
          li.appendChild(span);
          list.appendChild(li);
        }
        entry.appendChild(list);
        wrap.appendChild(entry);
      }
    }
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent =
      "フォロー数はアカウント全体の数字です。投稿との対応は日付による重ね合わせで、どの投稿がきっかけかまでは分かりません。";
    wrap.appendChild(note);
  }
  const error = instagramDailyFollowsError(detail);
  if (error) {
    const p = document.createElement("p");
    p.className = "meta sns-note";
    p.textContent = `※ ${error}`;
    wrap.appendChild(p);
  }
}

// The Instagram tab's KPI row. The フォロー / フォロー解除
// cards carry a 前日比 taken from the history rows, so the row
// renders from the shared state and loadSnsHistory re-renders
// it when the history lands, like the other channel tabs'
// totals: whichever of the snapshot and the history arrives
// second completes the row.
function renderInstagramTotals() {
  fillTotalBoxes(
    "sns-overview",
    snsOverview(overviewState.detail, overviewState.historyRows),
  );
}

function renderSns(detail) {
  overviewState.detail = detail;
  overviewState.detailSettled = true;
  overviewState.detailFailed = false;
  renderOverview();
  // The collection timestamp behind every tab, shown once above
  // the tab bar (the blog numbers come from the same collection).
  dataAsOfEl.textContent = dataAsOfText(detail?.collected_at);
  snsStatusEl.textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("youtube-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("threads-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("x-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  renderInstagramTotals();
  fillTotalBoxes("sns-interactions", snsInteractions(detail));
  const bars = document.getElementById("sns-age-gender");
  bars.innerHTML = "";
  const pyramid = demographicsPyramid(detail);
  if (!pyramid.bands.length && !pyramid.unknown.length) {
    const p = document.createElement("p");
    p.className = "meta";
    p.textContent = "—";
    bars.appendChild(p);
  }
  if (pyramid.bands.length) {
    const head = document.createElement("div");
    head.className = "pyramid-row pyramid-head";
    for (const text of ["", "男性", "", "女性", ""]) {
      const span = document.createElement("span");
      span.textContent = text;
      head.appendChild(span);
    }
    bars.appendChild(head);
  }
  for (const band of pyramid.bands) {
    const div = document.createElement("div");
    div.className = "pyramid-row";
    const maleValue = document.createElement("span");
    maleValue.className = "pyramid-value pyramid-value-left amount-value";
    maleValue.textContent = formatCount(band.male.value);
    const maleTrack = document.createElement("div");
    maleTrack.className = "pyramid-track pyramid-track-left";
    const maleFill = document.createElement("div");
    maleFill.className = "pyramid-fill";
    maleFill.style.width = `${band.male.pct}%`;
    maleTrack.appendChild(maleFill);
    const age = document.createElement("span");
    age.className = "pyramid-age";
    age.textContent = band.ageLabel;
    const unknown = document.createElement("span");
    unknown.className = "pyramid-unknown";
    unknown.append("不明 ", countSpan(band.unknown));
    age.appendChild(unknown);
    const femaleTrack = document.createElement("div");
    femaleTrack.className = "pyramid-track pyramid-track-right";
    const femaleFill = document.createElement("div");
    femaleFill.className = "pyramid-fill";
    femaleFill.style.width = `${band.female.pct}%`;
    femaleTrack.appendChild(femaleFill);
    const femaleValue = document.createElement("span");
    femaleValue.className = "pyramid-value pyramid-value-right amount-value";
    femaleValue.textContent = formatCount(band.female.value);
    div.appendChild(maleValue);
    div.appendChild(maleTrack);
    div.appendChild(age);
    div.appendChild(femaleTrack);
    div.appendChild(femaleValue);
    bars.appendChild(div);
  }
  for (const row of pyramid.unknown) {
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
    value.className = "demo-bar-value amount-value";
    value.textContent = formatCount(row.value);
    div.appendChild(label);
    div.appendChild(track);
    div.appendChild(value);
    bars.appendChild(div);
  }
  const demo = detail?.instagram?.demographics ?? {};
  fillDemoRanking("sns-cities", topDemographics(demo.top_cities));
  fillDemoRanking("sns-countries", topDemographics(demo.top_countries));
  renderFollowChart(detail);
  snsMediaRows = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  snsDetail = detail;
  const mediaRange = mediaDateRange(snsMediaRows);
  const mediaRangeEl = document.getElementById("sns-media-range");
  mediaRangeEl.textContent = "";
  if (mediaRange) {
    mediaRangeEl.append(
      `対象：${formatJstDate(mediaRange.from)}〜${formatJstDate(mediaRange.to)}の投稿（全`,
      countSpan(snsMediaRows.length),
      "件）",
    );
  }
  // A fresh snapshot resets the per-post genre filter to すべて.
  snsGenreFilter = null;
  renderMediaGenreTabs();
  wireMediaSort();
  renderMediaTable();
  wireGenreControls();
  renderGenreTable(detail);
  renderYoutube(detail);
  renderYoutubeHistory();
  renderThreads();
  renderX();
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

async function loadSns(detailPromise) {
  snsStatusEl.textContent = "読み込み中…";
  snsBodyEl.hidden = true;
  const youtubeStatusEl = document.getElementById("youtube-status");
  youtubeStatusEl.textContent = "読み込み中…";
  const threadsStatusEl = document.getElementById("threads-status");
  threadsStatusEl.textContent = "読み込み中…";
  const xStatusEl = document.getElementById("x-status");
  xStatusEl.textContent = "読み込み中…";
  renderYoutube(null);
  renderThreads();
  renderX();
  try {
    const detail = await (detailPromise ??
      fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth()));
    if (!detail || !detail.ok) {
      const message =
        (detail && detail.error) || "SNSデータを取得できませんでした";
      snsStatusEl.textContent = message;
      youtubeStatusEl.textContent = message;
      threadsStatusEl.textContent = message;
      xStatusEl.textContent = message;
      settleSnsFailed();
      return;
    }
    renderSns(detail);
  } catch {
    snsStatusEl.textContent = "SNSデータを取得できませんでした";
    youtubeStatusEl.textContent = "SNSデータを取得できませんでした";
    threadsStatusEl.textContent = "SNSデータを取得できませんでした";
    xStatusEl.textContent = "SNSデータを取得できませんでした";
    settleSnsFailed();
  }
}

// The SNS snapshot could not be read: the sections it feeds end
// on their failure state instead of sitting on the loading line
// (the per-tab status lines above carry the error message).
function settleSnsFailed() {
  overviewState.detailSettled = true;
  overviewState.detailFailed = true;
  renderOverview();
  renderYoutube(null);
  renderThreads();
  renderX();
}

// --- SNS trend charts (overview tab) ---

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
    head.append(
      `${item.label}：最新 `,
      // The combined follower total is a published figure
      // (the top page's hero); the other series stay masked.
      countSpan(item.latest, item.key === "total_followers"),
      `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`,
    );
    const chart = document.createElement("div");
    chart.className = "chart-wrap";
    chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
    wrap.appendChild(head);
    wrap.appendChild(chart);
  }
}

// The history has its own load: it never touches the rest of
// the SNS section, and its rows also feed the overview KPI
// deltas. While it is in flight the trend sections carry the
// loading line; a failed load ends them on the failure line,
// distinct from a history that is genuinely still empty.
async function loadSnsHistory(historyPromise) {
  const historyEl = document.getElementById("sns-history");
  setSectionLoading(historyEl);
  let response = null;
  let failed = false;
  try {
    response = await (historyPromise ??
      fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth()));
    if (!response || !response.ok) {
      failed = true;
    }
  } catch {
    failed = true;
  }
  overviewState.historyRows = snsHistoryRows(failed ? null : response);
  overviewState.historySettled = true;
  overviewState.historyFailed = failed;
  if (failed) {
    setSectionFailed(historyEl);
  } else {
    renderSnsHistory(response);
  }
  renderOverview();
  // The YouTube totals now read the history too (the subscriber
  // change card), so they re-render with the other channel tabs
  // when the history settles.
  renderYoutube(overviewState.detail);
  renderInstagramTotals();
  renderYoutubeHistory();
  renderThreads();
  renderX();
}

// --- Daily chart tooltip (hover on PC, tap on touch) ---

const chartTooltipEl = document.getElementById("chart-tooltip");

function showChartTooltip(pointEl) {
  // The date stays readable; the view count rides in a
  // .privacy-mask span (tooltipText in chart.js composes the
  // same wording as plain text for tests). This tooltip serves
  // the blog's daily chart, whose figures are unpublished
  // 28-day rollups, so the count masks like any raw count.
  chartTooltipEl.textContent = "";
  chartTooltipEl.append(`${formatDateFull(pointEl.dataset.date)} · `);
  const count = document.createElement("span");
  count.className = "privacy-mask";
  count.textContent = `${Number(pointEl.dataset.views).toLocaleString()}回`;
  chartTooltipEl.appendChild(count);
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

function showAccountEmail(credential) {
  try {
    const payload = decodeJwtPayload(credential);
    accountEl.textContent = payload.email ? `${payload.email} でログイン中` : "";
  } catch {
    accountEl.textContent = "";
  }
}

async function onSignedIn(credential) {
  showAccountEmail(credential);
  // Exchange the (1-hour) Google ID token for a 30-day owner session
  // and save that, so later visits restore the session instead of
  // starting at the gate — the same arrangement as the asset app.
  let result = null;
  try {
    result = await exchangeSession(CONFIG.GAS_ENDPOINT, credential);
  } catch {
    result = null;
  }
  if (!result || !result.ok || !result.session_token) {
    gateErrorEl.textContent = "ログインに失敗しました。もう一度お試しください。";
    accountEl.textContent = "";
    showGate();
    initGoogleSignIn();
    return;
  }
  sessionToken = result.session_token;
  saveSessionToken(sessionToken);
  // Sign-in just succeeded, so the gate (and its button) must not
  // stay on screen while the dashboard loads.
  showLoading();
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
  const endingSession = sessionToken;
  sessionToken = null;
  shareToken = null;
  renderPrivacy();
  if (endingSession) {
    // Revoke the owner session server-side; local logout proceeds
    // regardless of the outcome.
    revokeSession(CONFIG.GAS_ENDPOINT, endingSession).catch(() => {});
  }
  clearSavedSessionToken();
  clearSavedIdToken();
  clearSavedShareToken();
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
    const result = await shareAction(CONFIG.GAS_ENDPOINT, auth(), "issue_share");
    if (!result.ok) {
      shareStatusEl.textContent = result.error || "発行できませんでした";
      return;
    }
    // Issued links always name the app root, not the tab the
    // issuer happens to be on (the pathname varies with the tab
    // now that tabs live in the path).
    const base = window.location.origin + APP_BASE;
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
    await shareAction(CONFIG.GAS_ENDPOINT, auth(), "revoke_share");
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

// Entry point. A share link skips sign-in entirely; without one, a
// session saved by an earlier visit is restored before falling back
// to the sign-in gate — the same arrangement as the asset app.
async function enterWithShareToken(token, fromHash) {
  // Validation takes a network round-trip; stay on the loading
  // screen until it lands on the dashboard, the expired screen,
  // or (for a stale saved copy) the sign-in gate.
  showLoading();
  shareToken = token;
  if (fromHash) {
    // Keep a copy so reopening the app without the fragment (or a
    // restored tab) can resume this session.
    saveShareToken(token);
  }
  let result = null;
  try {
    result = await validateShareToken(CONFIG.GAS_ENDPOINT, token);
  } catch {
    result = null;
  }
  if (result && result.ok) {
    shareExpiresAt = result._share ? result._share.expires_at : null;
    loadDashboard();
    return;
  }
  shareToken = null;
  renderPrivacy();
  // A dead token must not linger in storage: it would shadow the
  // sign-in restore on every later visit.
  clearSavedShareToken();
  if (fromHash) {
    // The link itself is dead (revoked, expired, or unreachable).
    showExpired();
  } else {
    // The saved copy went stale. The visitor did not open a link
    // just now, so the "expired link" screen would mislead; show
    // the sign-in gate instead.
    gateErrorEl.textContent = "";
    showGate();
    initGoogleSignIn();
  }
}

function probeAnonymous() {
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

async function boot() {
  // The markup already opens on the loading screen; restate it so
  // the state machine starts from a known place.
  showLoading();
  // Drop any legacy saved Google ID token left by the old scheme.
  clearSavedIdToken();
  const entry = bootEntry({
    hashToken: parseShareToken(window.location.hash),
    savedSessionToken: loadSavedSessionToken(),
    savedShareToken: loadSavedShareToken(),
  });
  if (entry.kind === "share") {
    await enterWithShareToken(entry.token, entry.fromHash);
    return;
  }
  if (entry.kind === "session") {
    sessionToken = entry.token;
    if (await loadDashboard()) {
      return;
    }
    // The saved session expired or was rejected: drop it and fall
    // back to a saved share session, then to the gate.
    clearSavedSessionToken();
    sessionToken = null;
    accountEl.textContent = "";
    const savedShare = loadSavedShareToken();
    if (savedShare) {
      await enterWithShareToken(savedShare, false);
      return;
    }
    gateErrorEl.textContent = "";
    showGate();
    initGoogleSignIn();
    return;
  }
  probeAnonymous();
}

boot();
