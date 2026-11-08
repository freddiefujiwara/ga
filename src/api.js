// Requests to the ga-gas endpoint (GET with query parameters; the
// bridge is a plain doGet). Auth travels as an id_token parameter
// (Google sign-in) or a share_token parameter (temporary access link).
// Each function returns the parsed JSON ({ ok: true, ... } on success).

function buildUrl(endpoint, auth, params) {
  const url = new URL(endpoint);
  if (auth && auth.idToken) {
    url.searchParams.set("id_token", auth.idToken);
  }
  if (auth && auth.shareToken) {
    url.searchParams.set("share_token", auth.shareToken);
  }
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function getJson(endpoint, auth, params, fetchImpl) {
  const res = await fetchImpl(buildUrl(endpoint, auth, params));
  return res.json();
}

export async function fetchReport(endpoint, auth, params, fetchImpl = fetch) {
  return getJson(endpoint, auth, params, fetchImpl);
}

// Lightweight call to check a share link: resolves with the bridge's
// response ({ ok: true, _share: { expires_at } } for a live link).
export async function validateShareToken(endpoint, shareToken, fetchImpl = fetch) {
  return getJson(endpoint, { shareToken }, { dimensions: "", limit: 1 }, fetchImpl);
}

// Owner-only share administration: action is "issue_share" or
// "revoke_share"; requires the owner's Google ID token.
export async function shareAction(endpoint, idToken, action, fetchImpl = fetch) {
  return getJson(endpoint, { idToken }, { action }, fetchImpl);
}

// --- SNS detail (ga-gas action=sns_detail) ---
//
// The SNS snapshot ga-gas collects every six hours: per-network
// follower counts, the Instagram account's last-30-days insights,
// follower demographics, recent media with per-post insights, and
// the YouTube channel totals with its latest videos. Same auth as
// the GA report (id_token or share_token query parameters). Every
// number in the response can be null; the shaping helpers below are
// written to tolerate that (and a missing response altogether).

export async function fetchSnsDetail(endpoint, auth, fetchImpl = fetch) {
  return getJson(endpoint, auth, { action: "sns_detail" }, fetchImpl);
}

// --- SNS history (ga-gas action=sns_history) ---
//
// The account rows ga-gas appends to its history spreadsheet on
// every collection, oldest first: { ok: true, rows: [{ collected_at,
// ig_followers, ..., views_30d, ... }] } with nulls wherever a
// collection could not get a number. Same auth as sns_detail.

export async function fetchSnsHistory(endpoint, auth, fetchImpl = fetch) {
  return getJson(endpoint, auth, { action: "sns_history" }, fetchImpl);
}

export function snsHistoryRows(response) {
  return response && response.ok && Array.isArray(response.rows)
    ? response.rows
    : [];
}

const jstDayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-11-08T19:25:52.088Z" -> "20261109" (the JST calendar day),
// the date shape the line-chart builder takes. Null when unparsable.
export function jstDateKey(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return jstDayKeyFormat.format(date).replace(/-/g, "");
}

// The three trend series of the SNS section, in display order.
export const SNS_HISTORY_SERIES = [
  { key: "total_followers", label: "SNS延べフォロワー数" },
  { key: "views_30d", label: "再生回数（過去30日）" },
  { key: "media_count", label: "投稿数" },
];

// Shape history rows into one chart series per metric: points are
// { date, views } for buildLineChartSvg (views is just the value),
// skipping the collections where that metric is missing. Each
// series also carries its latest value and the covered period
// (first/last collected_at, ISO). Series with no numeric point at
// all are dropped, and an empty history yields an empty list.
export function snsHistorySeries(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  const sorted = rows
    .filter(
      (row) => row && typeof row.collected_at === "string" && row.collected_at,
    )
    .slice()
    .sort((a, b) =>
      a.collected_at < b.collected_at ? -1 : a.collected_at > b.collected_at ? 1 : 0,
    );
  if (!sorted.length) {
    return [];
  }
  const firstAt = sorted[0].collected_at;
  const lastAt = sorted[sorted.length - 1].collected_at;
  return SNS_HISTORY_SERIES.map(({ key, label }) => {
    const points = [];
    for (const row of sorted) {
      const date = isNum(row[key]) ? jstDateKey(row.collected_at) : null;
      if (date) {
        points.push({ date, views: row[key] });
      }
    }
    if (!points.length) {
      return null;
    }
    return {
      key,
      label,
      points,
      latest: points[points.length - 1].views,
      firstAt,
      lastAt,
    };
  }).filter(Boolean);
}

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

export function formatCount(value) {
  return isNum(value) ? value.toLocaleString("ja-JP") : "—";
}

export function formatPercent(value) {
  return isNum(value) ? `${value}%` : "—";
}

export function formatSeconds(value) {
  if (!isNum(value)) {
    return "—";
  }
  return `${Math.round(value * 10) / 10}秒`;
}

const jstDateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const jstDate = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export function formatJstDateTime(iso) {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? jstDateTime.format(date) : "—";
}

export function formatJstDate(iso) {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? jstDate.format(date) : "—";
}

// The combined follower total shown on the top page: the main
// Instagram account, Threads and YouTube. The secondary Instagram
// account (@anemone_cancer) is deliberately not part of the sum.
// Null when not a single network reported a number.
export function snsTotalFollowers(detail) {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const parts = [
    detail.instagram?.freddiefujiwara,
    detail.threads?.followers,
    detail.youtube?.subscribers,
  ].filter(isNum);
  return parts.length ? parts.reduce((sum, v) => sum + v, 0) : null;
}

// Overview cards for the SNS section: [{ label, value }] with the
// values already formatted ("—" for anything missing).
export function snsOverview(detail) {
  const ig = detail?.instagram ?? {};
  const yt = detail?.youtube ?? {};
  const th = detail?.threads ?? {};
  const interactions = ig.interactions_30d ?? {};
  return [
    { label: "SNS延べフォロワー", value: formatCount(snsTotalFollowers(detail)) },
    { label: "Instagram フォロワー", value: formatCount(ig.freddiefujiwara) },
    { label: "YouTube 登録者", value: formatCount(yt.subscribers) },
    { label: "Threads フォロワー", value: formatCount(th.followers) },
    { label: "Instagram 投稿数", value: formatCount(ig.media_count) },
    { label: "再生回数（過去30日）", value: formatCount(ig.views_30d) },
    { label: "リーチ（過去30日）", value: formatCount(ig.reach_30d) },
    { label: "反応した人数（過去30日）", value: formatCount(ig.accounts_engaged_30d) },
    { label: "反応の合計（過去30日）", value: formatCount(interactions.total) },
    { label: "フォロワー以外（過去30日）", value: formatPercent(ig.non_follower_pct) },
    { label: "フォロー（過去30日）", value: formatCount(ig.follows_30d) },
    { label: "フォロー解除（過去30日）", value: formatCount(ig.unfollows_30d) },
  ];
}

// The four-way split of the last 30 days of interactions.
export function snsInteractions(detail) {
  const it = detail?.instagram?.interactions_30d ?? {};
  return [
    { label: "いいね", value: formatCount(it.likes) },
    { label: "コメント", value: formatCount(it.comments) },
    { label: "シェア", value: formatCount(it.shares) },
    { label: "保存", value: formatCount(it.saves) },
  ];
}

// "F.25-34" -> "女性 25-34歳"; unknown shapes pass through as-is.
export function ageGenderLabel(key) {
  const match = /^([FMU])\.(.+)$/.exec(String(key ?? ""));
  if (!match) {
    return String(key ?? "");
  }
  const gender = { F: "女性", M: "男性", U: "不明" }[match[1]];
  return `${gender} ${match[2]}歳`;
}

// Age/gender rows for the bar list, biggest first, with each bar's
// width as a percentage of the largest value.
export function demographicsBars(detail, limit = 13) {
  const list = detail?.instagram?.demographics?.age_gender;
  if (!Array.isArray(list)) {
    return [];
  }
  const rows = list
    .filter((entry) => entry && isNum(entry.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const max = rows.reduce((m, entry) => Math.max(m, entry.value), 0);
  return rows.map((entry) => ({
    key: entry.key,
    label: ageGenderLabel(entry.key),
    value: entry.value,
    pct: max > 0 ? Math.round((entry.value / max) * 100) : 0,
  }));
}

// Top entries of a [{ key, value }] demographics list (cities,
// countries), biggest first.
export function topDemographics(list, limit = 5) {
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((entry) => entry && typeof entry.key === "string" && isNum(entry.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((entry) => ({ name: entry.key, value: entry.value }));
}

const isMissing = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "number" && !Number.isFinite(value));

// Sort recent-media rows by a column. Missing values always sink to
// the bottom, whichever direction is chosen. Returns a new array.
export function sortMedia(rows, key = "views", dir = "desc") {
  if (!Array.isArray(rows)) {
    return [];
  }
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a ? a[key] : null;
    const bv = b ? b[key] : null;
    if (isMissing(av) && isMissing(bv)) {
      return 0;
    }
    if (isMissing(av)) {
      return 1;
    }
    if (isMissing(bv)) {
      return -1;
    }
    const cmp =
      isNum(av) && isNum(bv) ? av - bv : String(av).localeCompare(String(bv));
    return cmp * sign;
  });
}

export function captionHead(caption, max = 60) {
  const text = String(caption ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function mediaTypeLabel(type) {
  switch (type) {
    case "REELS":
    case "REEL":
    case "VIDEO":
      return "リール";
    case "IMAGE":
      return "写真";
    case "CAROUSEL_ALBUM":
      return "カルーセル";
    default:
      return type ? String(type) : "—";
  }
}

export function youtubeVideos(detail) {
  const list = detail?.youtube?.recent_videos;
  return Array.isArray(list) ? list : [];
}

export function youtubeTotals(detail) {
  const yt = detail?.youtube ?? {};
  return [
    { label: "登録者", value: formatCount(yt.subscribers) },
    { label: "総再生回数", value: formatCount(yt.total_views) },
    { label: "動画本数", value: formatCount(yt.video_count) },
  ];
}

// Partial-collection notes ga-gas attaches to the snapshot (empty
// in the normal case); shown as small print only when present.
export function snsErrorNotes(detail) {
  const ig = detail?.instagram ?? {};
  return ["insights_error", "detail_error", "media_error"]
    .map((key) => ig[key])
    .filter((value) => typeof value === "string" && value.length > 0);
}

// --- Report shaping helpers (pure, unit-tested) ---

export function rowsOf(response) {
  if (!response || !response.ok || !response.data) {
    return [];
  }
  return response.data.rows || [];
}

export function totalsOf(response) {
  const row = rowsOf(response)[0];
  if (!row) {
    return { views: 0, users: 0, sessions: 0 };
  }
  const values = row.metricValues.map((m) => Number(m.value) || 0);
  return { views: values[0] || 0, users: values[1] || 0, sessions: values[2] || 0 };
}

// Daily rows come back as YYYYMMDD dimension values; sort ascending
// and shape them for the chart.
export function dailySeries(response) {
  return rowsOf(response)
    .map((row) => ({
      date: row.dimensionValues[0].value,
      views: Number(row.metricValues[0].value) || 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function dimensionRanking(response, limit = 10) {
  return rowsOf(response)
    .slice(0, limit)
    .map((row) => ({
      name: row.dimensionValues[0].value,
      views: Number(row.metricValues[0].value) || 0,
    }));
}

// --- Article titles from the blog RSS feed ---

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Parse the blog RSS into a Map of article id -> title. The feed's
// item links are https://freddiefujiwara.com/blog/<id>. Tolerant by
// design: anything unparsable is skipped, never thrown.
export function parseRssTitles(xml) {
  const titles = new Map();
  if (typeof xml !== "string") {
    return titles;
  }
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let item;
  while ((item = itemPattern.exec(xml)) !== null) {
    const title = /<title>([\s\S]*?)<\/title>/.exec(item[1]);
    const link = /<link>([\s\S]*?)<\/link>/.exec(item[1]);
    if (!title || !link) {
      continue;
    }
    const id = unescapeXml(link[1].trim()).split("/").filter(Boolean).pop();
    if (id) {
      titles.set(id, unescapeXml(title[1].trim()));
    }
  }
  return titles;
}

export async function fetchArticleTitles(rssUrl, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(rssUrl);
    return parseRssTitles(await res.text());
  } catch {
    return new Map();
  }
}

// --- Page path display (title + link) ---

// Friendly labels for the site's own app pages. Blog article paths
// are resolved through the RSS titles instead.
const KNOWN_PAGES = {
  "/": "トップページ",
  "/blog/": "ブログ トップ",
  "/list-of-stuff/": "持ち物リスト",
  "/health/": "健康",
  "/asset/": "資産",
  "/alarm/": "アラーム",
  "/tweet/": "ツイート",
  "/ga/": "アクセス解析",
};

// The identity a pagePath counts under in the ranking. Blog articles
// were recorded both as /<id> (the SPA's base-relative route) and as
// /blog/<id> (the real URL); both canonicalize to /blog/<id> so their
// views merge into one row. Every other path is its own identity.
export function canonicalPageKey(path) {
  const id = String(path || "").replace(/^\/(blog\/)?/, "").replace(/\/$/, "");
  // Article ids are the long URL-safe document tokens (they start
  // with a digit); app pages such as /list-of-stuff/ are not articles
  // and keep their own identity.
  if (/^[0-9][A-Za-z0-9_-]{24,}$/.test(id)) {
    return `/blog/${id}`;
  }
  return path;
}

// Shape one GA pagePath into a display label and a link target.
// Article paths appear both as /<id> and /blog/<id>; both resolve to
// the canonical /blog/<id> URL. Unknown paths keep the raw path as
// the label and still link to the page itself.
export function pageDisplay(path, titles, origin) {
  const href = (p) => `${origin}${p}`;
  if (KNOWN_PAGES[path]) {
    return { label: KNOWN_PAGES[path], href: href(path) };
  }
  const id = path.replace(/^\/(blog\/)?/, "").replace(/\/$/, "");
  if (id && !id.includes("/") && titles && titles.has(id)) {
    return { label: titles.get(id), href: href(`/blog/${id}`) };
  }
  return { label: path, href: href(path) };
}

// Build the page ranking with split article paths merged: rows that
// share a canonical key are summed first, then sorted by views.
// Returns [{ label, href, views }] ready to render.
export function pageRanking(response, titles, origin, limit = 10) {
  const merged = new Map();
  for (const row of rowsOf(response)) {
    const path = row.dimensionValues[0].value;
    const views = Number(row.metricValues[0].value) || 0;
    const key = canonicalPageKey(path);
    merged.set(key, (merged.get(key) || 0) + views);
  }
  return [...merged.entries()]
    .map(([key, views]) => ({ ...pageDisplay(key, titles, origin), views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}
