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
  fetchBlogMeta,
  blogGenreStats,
  blogArticleList,
  fetchSnsDetail,
  fetchSnsHistory,
  snsHistoryRows,
  snsHistorySeries,
  threadsHistorySeries,
  threadsTotals,
  overviewKpis,
  topMedia,
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
  snsErrorNotes,
} from "./api.js";
import { buildLineChartSvg, tooltipText } from "./chart.js";
import {
  genreStatsForMedia,
  filterMediaByPeriod,
  filterMediaByGenre,
  mediaGenreOptions,
  articleGenreOptions,
  filterArticlesByGenre,
  mediaDateRange,
  sortGenreRows,
  genreAverageBars,
  formatRate,
} from "./genres.js";
import { tabFromHash, hashWithTab } from "./tabs.js";
import { channelBars, genreTreemap } from "./treemap.js";
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

// --- Dashboard tabs ---
// The selected tab lives in the URL hash as a "tab=" part, next to
// the share token, so a reload restores it. Switching tabs uses
// replaceState (no extra history entries, no scroll jump).

const tabButtons = [...document.querySelectorAll("#tabs .tab-button")];
const tabPanels = {
  overview: document.getElementById("tab-overview"),
  instagram: document.getElementById("tab-instagram"),
  blog: document.getElementById("tab-blog"),
  youtube: document.getElementById("tab-youtube"),
  threads: document.getElementById("tab-threads"),
};

function activateTab(tabId, updateHash = true) {
  for (const btn of tabButtons) {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  }
  for (const [id, panel] of Object.entries(tabPanels)) {
    panel.hidden = id !== tabId;
  }
  if (updateHash) {
    const next = hashWithTab(window.location.hash, tabId);
    if (next !== window.location.hash) {
      window.history.replaceState(null, "", next);
    }
  }
}

for (const btn of tabButtons) {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
}
window.addEventListener("hashchange", () => {
  activateTab(tabFromHash(window.location.hash), false);
});
activateTab(tabFromHash(window.location.hash), false);

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
  // The article tag map comes from the blog API's titles payload;
  // same treatment: parallel, tolerant, display-only.
  const metaPromise = fetchBlogMeta(CONFIG.BLOG_TITLES_URL);
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
  overviewState.gaTotals = t;
  renderOverview();
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
  // The per-genre rollup joins the page rows with the tag map. It
  // renders only when the map actually arrived; blogGenreStats
  // returns nothing without one and the section says why instead.
  const meta = await metaPromise;
  renderBlogGenres(pages, meta, titles);
  renderBlogArticles(pages, meta, titles);
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

// --- Genre visuals (Instagram / blog genre sections) ---
// Both genre sections lead with the visuals, in the same order:
// a treemap whose tile area is the genre's per-item average, the
// legend directly under the tiles, then a bar chart comparing
// the same average; the full table follows below. Each tile
// draws only the text lines its size can hold (see
// tileLabelLevel); the legend under the map lists every genre's
// average and total, so nothing is lost on the small tiles.
// Tile colour is a heat scale on the same average (see
// genreHeatBackground): the biggest average on show is the
// reddest, the smallest keeps the plain tile colour.

function renderGenreTreemap(mapEl, legendEl, map) {
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
    div.title = `${tile.name}：${tile.avgText}、${tile.totalText}`;
    // Draw only the lines this tile's size can hold: the level
    // comes from tileLabelLevel, and a line that is not drawn
    // cannot overflow. The legend below carries every figure.
    const level = tile.labelLevel ?? (tile.labelRoom ? "full" : "none");
    if (level !== "none") {
      const name = document.createElement("div");
      name.className = "treemap-tile-name";
      name.textContent = tile.name;
      div.appendChild(name);
    }
    if (level === "full" || level === "value") {
      const value = document.createElement("div");
      value.className = "treemap-tile-value";
      value.textContent = tile.avgLabel;
      div.appendChild(value);
    }
    if (level === "full") {
      const total = document.createElement("div");
      total.className = "treemap-tile-sub";
      total.textContent = tile.totalText;
      div.appendChild(total);
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
    value.className = "channel-legend-value";
    value.textContent = entry.avgText;
    li.appendChild(value);
    const total = document.createElement("span");
    total.className = "channel-legend-note";
    total.textContent = entry.totalText;
    li.appendChild(total);
    legendEl.appendChild(li);
  }
}

function buildGenreTreemap(map, noteText) {
  const frag = document.createDocumentFragment();
  const mapEl = document.createElement("div");
  mapEl.className = "treemap";
  const legendEl = document.createElement("ul");
  legendEl.className = "channel-legend";
  renderGenreTreemap(mapEl, legendEl, map);
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

function renderGenreBars(barsEl, bars) {
  barsEl.innerHTML = "";
  for (const bar of bars) {
    const row = document.createElement("div");
    row.className = "demo-bar";
    const label = document.createElement("span");
    label.className = "demo-bar-label";
    label.textContent = bar.name;
    const track = document.createElement("div");
    track.className = "demo-bar-track";
    const fill = document.createElement("div");
    fill.className = "demo-bar-fill";
    fill.style.width = `${bar.pct}%`;
    track.appendChild(fill);
    const value = document.createElement("span");
    value.className = "demo-bar-value";
    value.textContent = bar.valueLabel;
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    barsEl.appendChild(row);
  }
}

function buildGenreBars(bars, labelText) {
  const frag = document.createDocumentFragment();
  const label = document.createElement("p");
  label.className = "meta";
  label.textContent = labelText;
  const barsEl = document.createElement("div");
  barsEl.className = "demo-bars genre-bars";
  renderGenreBars(barsEl, bars);
  frag.appendChild(label);
  frag.appendChild(barsEl);
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
  const titles = new Map(meta.titles);
  for (const [id, title] of rssTitles) {
    titles.set(id, title);
  }
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
  // The tiles (area = views per article) and the average bars
  // summarise the same rows the table below lists in full.
  wrap.appendChild(
    buildGenreTreemap(
      genreTreemap(rows, (row) => ({
        name: row.tag,
        avg: row.perArticle,
        avgText: `1記事あたり ${formatCount(row.perArticle)}`,
        totalText: `合計 ${formatCount(row.totalViews)}`,
      })),
      "タイルの面積は1記事あたり表示回数の大きさです。色が赤いほど1記事あたり表示回数が多いです。",
    ),
  );
  wrap.appendChild(
    buildGenreBars(genreAverageBars(rows, "perArticle"), "1記事あたり表示回数"),
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
      td.className = "num";
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
      span.className = "rank-value";
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
    viewsTd.className = "num";
    viewsTd.textContent = formatCount(article.views);
    tr.appendChild(viewsTd);
    tbody.appendChild(tr);
  }
  updateSortHeaders("blog-article-table", blogArticleSort);
}

function renderBlogArticles(pagesResponse, meta, rssTitles) {
  // The RSS titles win; the titles payload fills any gap — the
  // same merge the genre rollup makes.
  const titles = new Map(meta ? meta.titles : []);
  for (const [id, title] of rssTitles) {
    titles.set(id, title);
  }
  blogArticles = blogArticleList(
    pagesResponse,
    meta ? meta.tags : null,
    titles,
    CONFIG.SITE_ORIGIN,
  );
  document.getElementById("blog-article-range").textContent =
    blogArticles.length
      ? `対象：直近28日間に表示された記事（全${blogArticles.length}件）`
      : "";
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
// its result here and re-renders; whatever has not arrived yet
// shows as "—" and carries no change line.

const overviewState = { gaTotals: null, detail: null, historyRows: null };

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
    value.className = "total-value";
    value.textContent = item.value;
    box.appendChild(label);
    box.appendChild(value);
    if (item.delta) {
      const delta = document.createElement("div");
      delta.className =
        "kpi-delta" +
        (item.delta.startsWith("+")
          ? " up"
          : item.delta.startsWith("-")
            ? " down"
            : "");
      delta.textContent = `前回比 ${item.delta}`;
      box.appendChild(delta);
    }
    wrap.appendChild(box);
  }
}

function renderTopPosts() {
  const list = document.getElementById("top-posts");
  list.innerHTML = "";
  const posts = topMedia(overviewState.detail, 5);
  if (!posts.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    list.appendChild(li);
    return;
  }
  for (const media of posts) {
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
    span.className = "rank-value";
    span.textContent = formatCount(media.views);
    li.appendChild(span);
    list.appendChild(li);
  }
}

// The channel sizes at the top of the overview, as horizontal
// bars: bar length = the channel's audience, the fill colour and
// the change line follow the change since the previous
// collection (up = green, down = red). Threads shows as a
// "集計待ち" row with an empty bar until its followers arrive.
function renderChannelBars() {
  const wrap = document.getElementById("channel-bars");
  wrap.innerHTML = "";
  const bars = channelBars(
    overviewState.detail,
    overviewState.gaTotals,
    overviewState.historyRows,
  );
  for (const bar of bars) {
    const row = document.createElement("div");
    row.className = "demo-bar";
    const label = document.createElement("span");
    label.className = "demo-bar-label";
    const name = document.createElement("span");
    name.className = "channel-bar-name";
    name.textContent = bar.name;
    const metric = document.createElement("span");
    metric.className = "channel-bar-metric";
    metric.textContent = bar.metricLabel;
    label.appendChild(name);
    label.appendChild(document.createTextNode(" "));
    label.appendChild(metric);
    row.appendChild(label);
    const track = document.createElement("div");
    track.className = "demo-bar-track";
    const fill = document.createElement("div");
    fill.className =
      "demo-bar-fill" + (bar.tone !== "neutral" ? ` ${bar.tone}` : "");
    fill.style.width = `${bar.pct}%`;
    track.appendChild(fill);
    row.appendChild(track);
    const value = document.createElement("span");
    value.className = "demo-bar-value";
    value.textContent = bar.note ?? bar.valueLabel;
    row.appendChild(value);
    const delta = document.createElement("span");
    delta.className =
      "kpi-delta channel-bar-delta" +
      (bar.delta > 0 ? " up" : bar.delta < 0 ? " down" : "");
    delta.textContent = bar.deltaLabel ? `前回比 ${bar.deltaLabel}` : "";
    row.appendChild(delta);
    wrap.appendChild(row);
  }
}

function renderOverview() {
  renderChannelBars();
  fillKpiBoxes(
    overviewKpis(
      overviewState.detail,
      overviewState.gaTotals,
      overviewState.historyRows,
    ),
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

// The genre filter buttons above a per-item table (the
// Instagram tab's 投稿ごと and the blog tab's 記事ごと share
// this renderer, so the two tables feel the same): すべて plus
// one button per genre that has items, each labelled with its
// item count. `total` is the count on the すべて button — the
// caller computes it, since a blog article with several tags
// counts once per tag in the options but is still one article.
// Clicking a button reports the genre (null for すべて) through
// onSelect; the caller owns the filter state and re-renders.
function renderGenreFilterTabs(wrap, { total, options, active, onSelect }) {
  wrap.innerHTML = "";
  const buttons = [{ genre: null, label: `すべて（${total}）` }];
  for (const option of options) {
    buttons.push({
      genre: option.genre,
      label: `${option.genre}（${option.count}）`,
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
    btn.textContent = entry.label;
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
  rangeEl.textContent = !media.length
    ? "この期間の投稿はありません"
    : range
      ? `対象：${formatJstDate(range.from)}〜${formatJstDate(range.to)}の投稿（全${media.length}件）`
      : "";
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
  renderGenreBars(
    document.getElementById("sns-genre-bars"),
    genreAverageBars(rows, "avgViews"),
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
    tr.appendChild(numCell(formatRate(row.saveRate)));
    tr.appendChild(numCell(formatRate(row.likeRate)));
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
      span.className = "rank-value";
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

// --- Threads tab ---
// The Threads tab reads the same two loads as the overview: the
// current follower count from the SNS snapshot and the trend from
// the history rows. renderSns and loadSnsHistory both call this,
// so whichever load lands second completes the picture; data that
// has not arrived yet shows as "—" and the chart area keeps its
// empty-state line. Threads history only starts on 2026-11-09, so
// for a while the chart holds a handful of points (or just one).

function renderThreads() {
  fillTotalBoxes(
    "sns-threads-totals",
    threadsTotals(overviewState.detail, overviewState.historyRows),
  );
  const wrap = document.getElementById("threads-history");
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
  head.textContent =
    `${item.label}：最新 ${formatCount(item.latest)}` +
    `（${formatJstDateTime(item.firstAt)} 〜 ${formatJstDateTime(item.lastAt)}）`;
  const chart = document.createElement("div");
  chart.className = "chart-wrap";
  chart.innerHTML = buildLineChartSvg(item.points, { label: item.label });
  wrap.appendChild(head);
  wrap.appendChild(chart);
}

function renderSns(detail) {
  overviewState.detail = detail;
  renderOverview();
  snsStatusEl.textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("youtube-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  document.getElementById("threads-status").textContent = detail.collected_at
    ? `取得時刻: ${formatJstDateTime(detail.collected_at)}`
    : "";
  fillTotalBoxes("sns-overview", snsOverview(detail));
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
    maleValue.className = "pyramid-value pyramid-value-left";
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
    unknown.textContent = `不明 ${formatCount(band.unknown)}`;
    age.appendChild(unknown);
    const femaleTrack = document.createElement("div");
    femaleTrack.className = "pyramid-track pyramid-track-right";
    const femaleFill = document.createElement("div");
    femaleFill.className = "pyramid-fill";
    femaleFill.style.width = `${band.female.pct}%`;
    femaleTrack.appendChild(femaleFill);
    const femaleValue = document.createElement("span");
    femaleValue.className = "pyramid-value pyramid-value-right";
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
  snsDetail = detail;
  const mediaRange = mediaDateRange(snsMediaRows);
  document.getElementById("sns-media-range").textContent = mediaRange
    ? `対象：${formatJstDate(mediaRange.from)}〜${formatJstDate(mediaRange.to)}の投稿（全${snsMediaRows.length}件）`
    : "";
  // A fresh snapshot resets the per-post genre filter to すべて.
  snsGenreFilter = null;
  renderMediaGenreTabs();
  wireMediaSort();
  renderMediaTable();
  wireGenreControls();
  renderGenreTable(detail);
  renderYoutube(detail);
  renderThreads();
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
  const youtubeStatusEl = document.getElementById("youtube-status");
  youtubeStatusEl.textContent = "読み込み中…";
  const threadsStatusEl = document.getElementById("threads-status");
  threadsStatusEl.textContent = "読み込み中…";
  renderYoutube(null);
  renderThreads();
  try {
    const detail = await fetchSnsDetail(CONFIG.GAS_ENDPOINT, auth());
    if (!detail || !detail.ok) {
      const message =
        (detail && detail.error) || "SNSデータを取得できませんでした";
      snsStatusEl.textContent = message;
      youtubeStatusEl.textContent = message;
      threadsStatusEl.textContent = message;
      return;
    }
    renderSns(detail);
  } catch {
    snsStatusEl.textContent = "SNSデータを取得できませんでした";
    youtubeStatusEl.textContent = "SNSデータを取得できませんでした";
    threadsStatusEl.textContent = "SNSデータを取得できませんでした";
  }
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
// Its rows also feed the overview KPI deltas.
async function loadSnsHistory() {
  try {
    const response = await fetchSnsHistory(CONFIG.GAS_ENDPOINT, auth());
    const ok = response && response.ok ? response : null;
    overviewState.historyRows = snsHistoryRows(ok);
    renderSnsHistory(ok);
  } catch {
    overviewState.historyRows = [];
    renderSnsHistory(null);
  }
  renderOverview();
  renderThreads();
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
