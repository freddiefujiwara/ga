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
// Shared shaping behind snsHistorySeries / threadsHistorySeries:
// one chart series per { key, label } definition, points skipping
// the collections where that metric is missing. With
// periodFromPoints a series' period (firstAt / lastAt) spans only
// the rows that contributed a point; otherwise it spans the whole
// history. Series with no numeric point at all are dropped, and an
// empty history yields an empty list.
function shapeHistorySeries(rows, defs, periodFromPoints) {
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
  return defs
    .map(({ key, label }) => {
      const points = [];
      const pointRows = [];
      for (const row of sorted) {
        const date = isNum(row[key]) ? jstDateKey(row.collected_at) : null;
        if (date) {
          points.push({ date, views: row[key] });
          pointRows.push(row);
        }
      }
      if (!points.length) {
        return null;
      }
      const period = periodFromPoints ? pointRows : sorted;
      return {
        key,
        label,
        points,
        latest: points[points.length - 1].views,
        firstAt: period[0].collected_at,
        lastAt: period[period.length - 1].collected_at,
      };
    })
    .filter(Boolean);
}

export function snsHistorySeries(rows) {
  return shapeHistorySeries(rows, SNS_HISTORY_SERIES, false);
}

// The Threads follower trend for the Threads tab: the same history
// rows, a single series. Threads numbers only exist since
// 2026-11-09, long after the other metrics, so the period spans
// only the collections that actually carry one — the earlier rows
// (threads_followers null) contribute no point and do not stretch
// the stated period.
export function threadsHistorySeries(rows) {
  return shapeHistorySeries(
    rows,
    [{ key: "threads_followers", label: "Threads フォロワー" }],
    true,
  );
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

// Age/gender keys arrive in either wire format: "45-54/M" or
// "M.45-54". Parse both into { age, gender }; anything else returns
// null and is treated as an unknown shape.
function parseAgeGenderKey(key) {
  const raw = String(key ?? "");
  let match = /^(\d+-\d+|\d+\+)\/([FMU])$/.exec(raw);
  if (match) {
    return { age: match[1], gender: match[2] };
  }
  match = /^([FMU])\.(\d+-\d+|\d+\+)$/.exec(raw);
  if (match) {
    return { age: match[2], gender: match[1] };
  }
  return null;
}

// Sort ranks: age bands by their lower bound (13-17 < 18-24 < ... <
// 65+), genders male, female, unknown within a band.
const ageRank = (age) => parseInt(age, 10);
const GENDER_RANK = { M: 0, F: 1, U: 2 };

// The full age x gender grid. The API only reports buckets that
// have followers, so the display zero-fills every missing cell.
const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const GENDERS = ["M", "F", "U"];

// "65+" -> "65歳以上"; "45-54" -> "45-54歳".
function ageBandLabel(age) {
  return age.endsWith("+") ? `${age.slice(0, -1)}歳以上` : `${age}歳`;
}

// "45-54/M" -> "45-54歳 男性"; "U.65+" -> "65歳以上 不明";
// unknown shapes pass through as-is.
export function ageGenderLabel(key) {
  const parsed = parseAgeGenderKey(key);
  if (!parsed) {
    return String(key ?? "");
  }
  const gender = { F: "女性", M: "男性", U: "不明" }[parsed.gender];
  return `${ageBandLabel(parsed.age)} ${gender}`;
}

// Age/gender rows for the bar list, ordered by age band ascending
// and then male / female / unknown within a band, with each bar's
// width as a percentage of the largest value. Every cell of the
// age x gender grid is shown: buckets missing from the data (bands
// with no followers) are zero-filled with an empty bar, so the full
// age range is always visible once any demographics exist. Keys in
// an unknown shape keep their raw label and sink to the bottom. No
// row cap by default: with age ordering, a cap would drop whole
// age bands.
export function demographicsBars(detail, limit = Infinity) {
  const list = detail?.instagram?.demographics?.age_gender;
  if (!Array.isArray(list)) {
    return [];
  }
  const entries = list.filter((entry) => entry && isNum(entry.value));
  if (!entries.length) {
    return [];
  }
  // Merge entries by age/gender cell (both wire formats can name
  // the same cell); keep the first-seen raw key for the row.
  const cells = new Map();
  const unknown = [];
  for (const entry of entries) {
    const parsed = parseAgeGenderKey(entry.key);
    if (!parsed) {
      unknown.push(entry);
      continue;
    }
    const id = `${parsed.age}/${parsed.gender}`;
    const cell = cells.get(id);
    if (cell) {
      cell.value += entry.value;
    } else {
      cells.set(id, { key: entry.key, value: entry.value });
    }
  }
  const known = [];
  for (const age of AGE_BANDS) {
    for (const gender of GENDERS) {
      const cell = cells.get(`${age}/${gender}`);
      const key = `${age}/${gender}`;
      known.push({
        key: cell ? cell.key : key,
        label: ageGenderLabel(key),
        value: cell ? cell.value : 0,
      });
    }
  }
  // Parseable keys in a non-standard band are kept too, ordered by
  // band and gender after the standard grid.
  const extra = [...cells.entries()]
    .filter(([id]) => !AGE_BANDS.includes(id.split("/")[0]))
    .map(([id, cell]) => ({ id, ...cell, parsed: parseAgeGenderKey(id) }))
    .sort((a, b) => {
      const byAge = ageRank(a.parsed.age) - ageRank(b.parsed.age);
      if (byAge !== 0) {
        return byAge;
      }
      return GENDER_RANK[a.parsed.gender] - GENDER_RANK[b.parsed.gender];
    })
    .map(({ key, value }) => ({
      key,
      label: ageGenderLabel(key),
      value,
    }));
  const rows = [
    ...known,
    ...extra,
    ...unknown.map((entry) => ({
      key: entry.key,
      label: ageGenderLabel(entry.key),
      value: entry.value,
    })),
  ].slice(0, limit);
  const max = rows.reduce((m, row) => Math.max(m, row.value), 0);
  return rows.map((row) => ({
    ...row,
    pct: max > 0 ? Math.round((row.value / max) * 100) : 0,
  }));
}

// The demographicsBars grid regrouped into population-pyramid
// rows: one row per age band, ascending, with the male value on
// the left of the band label and the female value on the right.
// The unknown-gender count has no side to live on, so it stays a
// plain number on the band row; it is never dropped. Band rows
// inherit the grid's zero-fill: a band or gender missing from the
// data shows 0 with an empty bar, the unknown count included. Bar
// widths are percentages of one shared maximum across both
// genders and the trailing rows. Keys in an unknown shape keep
// their raw label and sink to the bottom as plain
// { key, label, value, pct } rows. Empty or missing demographics
// yield empty lists, so the caller can keep its empty display.
export function demographicsPyramid(detail) {
  const rows = demographicsBars(detail);
  if (!rows.length) {
    return { bands: [], unknown: [] };
  }
  const bandMap = new Map();
  const unknownRows = [];
  for (const row of rows) {
    const parsed = parseAgeGenderKey(row.key);
    if (!parsed) {
      unknownRows.push(row);
      continue;
    }
    let band = bandMap.get(parsed.age);
    if (!band) {
      band = { M: 0, F: 0, U: 0 };
      bandMap.set(parsed.age, band);
    }
    band[parsed.gender] += row.value;
  }
  let max = 0;
  for (const band of bandMap.values()) {
    max = Math.max(max, band.M, band.F);
  }
  for (const row of unknownRows) {
    max = Math.max(max, row.value);
  }
  const pct = (value) => (max > 0 ? Math.round((value / max) * 100) : 0);
  const bands = [...bandMap.entries()]
    .sort((a, b) => ageRank(a[0]) - ageRank(b[0]))
    .map(([age, band]) => ({
      age,
      ageLabel: ageBandLabel(age),
      male: { value: band.M, pct: pct(band.M) },
      female: { value: band.F, pct: pct(band.F) },
      unknown: band.U,
    }));
  const unknown = unknownRows.map((row) => ({ ...row, pct: pct(row.value) }));
  return { bands, unknown };
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

// Totals boxes for the Threads tab: the current follower count and
// its change since the previous collection, taken from the history
// rows exactly like the overview KPI deltas. Until two collections
// carry a Threads number there is nothing to compare, so the
// change box shows "—".
export function threadsTotals(detail, historyRows) {
  const th = detail?.threads ?? {};
  const change = historyDelta(historyRows, "threads_followers");
  return [
    { label: "フォロワー", value: formatCount(th.followers) },
    {
      label: "前回比",
      value: change ? (formatDelta(change.delta) ?? "—") : "—",
    },
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

// --- Overview tab helpers ---

// The change of one history metric between its two most recent
// collections: rows are ordered by collected_at and collections
// where the metric is missing (null) are skipped, exactly like the
// trend series. Null when the metric has fewer than two numeric
// points — with a single collection there is nothing to compare.
export function historyDelta(rows, key) {
  if (!Array.isArray(rows)) {
    return null;
  }
  const points = rows
    .filter(
      (row) =>
        row &&
        typeof row.collected_at === "string" &&
        row.collected_at &&
        isNum(row[key]),
    )
    .slice()
    .sort((a, b) =>
      a.collected_at < b.collected_at ? -1 : a.collected_at > b.collected_at ? 1 : 0,
    )
    .map((row) => row[key]);
  if (points.length < 2) {
    return null;
  }
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  return { latest, previous, delta: latest - previous };
}

// The signed change label: "+12" / "-3" / "±0". Null for anything
// that is not a finite number, so callers can omit the line.
export function formatDelta(delta) {
  if (!isNum(delta)) {
    return null;
  }
  if (delta > 0) {
    return `+${formatCount(delta)}`;
  }
  if (delta < 0) {
    return `-${formatCount(-delta)}`;
  }
  return "±0";
}

// KPI cards for the overview tab: the headline numbers of every
// network plus the blog, each carrying the change since the
// previous collection wherever the SNS history offers two points
// to compare. The blog numbers come from the GA totals object
// ({ views, users, sessions }); no history exists for them, so
// they never carry a delta. Every input tolerates being missing:
// values fall back to "—" and deltas to null.
export function overviewKpis(detail, gaTotals, historyRows) {
  const ig = detail?.instagram ?? {};
  const yt = detail?.youtube ?? {};
  const deltaFor = (key) => {
    const change = historyDelta(historyRows, key);
    return change ? formatDelta(change.delta) : null;
  };
  return [
    {
      label: "SNS延べフォロワー数",
      value: formatCount(snsTotalFollowers(detail)),
      delta: deltaFor("total_followers"),
    },
    {
      label: "Instagram フォロワー",
      value: formatCount(ig.freddiefujiwara),
      delta: deltaFor("ig_followers"),
    },
    {
      label: "YouTube 登録者",
      value: formatCount(yt.subscribers),
      delta: deltaFor("youtube_subscribers"),
    },
    {
      label: "ブログ 表示回数（直近28日）",
      value: gaTotals ? formatCount(gaTotals.views) : "—",
      delta: null,
    },
    {
      label: "ブログ ユーザー（直近28日）",
      value: gaTotals ? formatCount(gaTotals.users) : "—",
      delta: null,
    },
    {
      label: "再生回数（過去30日）",
      value: formatCount(ig.views_30d),
      delta: deltaFor("views_30d"),
    },
    {
      label: "投稿数",
      value: formatCount(ig.media_count),
      delta: deltaFor("media_count"),
    },
    {
      label: "フォロー（過去30日）",
      value: formatCount(ig.follows_30d),
      delta: deltaFor("follows_30d"),
    },
    {
      label: "フォロー解除（過去30日）",
      value: formatCount(ig.unfollows_30d),
      delta: deltaFor("unfollows_30d"),
    },
  ];
}

// The most-watched recent posts, most views first; posts without
// a view count sink to the bottom, as in the media table. The
// returned rows are the raw recent-media objects (permalink,
// caption, views, …), ready to render as links.
export function topMedia(detail, limit = 5) {
  const rows = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  return sortMedia(rows, "views", "desc").slice(0, limit);
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

// --- Blog article tags (blog-gas titles payload) ---
//
// The blog API's lightweight titles payload ({ ids, titles, tags })
// carries the article id -> tag list map next to the titles: the
// same public metadata the blog itself renders its tag pages from.
// It is the only source of the path -> genre mapping for the blog
// tab; when it cannot be fetched, the genre section stays hidden
// instead of guessing genres from titles.

export function parseBlogMeta(data) {
  const tags = new Map();
  const titles = new Map();
  if (!data || typeof data !== "object") {
    return { tags, titles };
  }
  if (data.titles && typeof data.titles === "object") {
    for (const [id, title] of Object.entries(data.titles)) {
      if (typeof title === "string" && title) {
        titles.set(id, title);
      }
    }
  }
  if (data.tags && typeof data.tags === "object") {
    for (const [id, list] of Object.entries(data.tags)) {
      if (!Array.isArray(list)) {
        continue;
      }
      const clean = [
        ...new Set(
          list
            .filter((tag) => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      if (clean.length) {
        tags.set(id, clean);
      }
    }
  }
  return { tags, titles };
}

// Fetch the titles payload for its tag map. The blog-gas tag cache
// can answer with every tag list empty while it is cold (the blog
// front-end merges around the same quirk), so one retry is made
// whenever the first attempt yields no tags at all. Any failure
// resolves to empty maps, never a rejection.
export async function fetchBlogMeta(url, fetchImpl = fetch) {
  let meta = { tags: new Map(), titles: new Map() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchImpl(url);
      meta = parseBlogMeta(await res.json());
    } catch {
      meta = { tags: new Map(), titles: new Map() };
    }
    if (meta.tags.size > 0) {
      break;
    }
  }
  return meta;
}

// Per-article view counts with the split paths merged, article
// rows only: [{ id, views }]. Non-article pages (apps, the blog
// top, …) are not articles and never appear here.
const ARTICLE_KEY_PATTERN = /^\/blog\/([0-9][A-Za-z0-9_-]{24,})$/;

export function articlePageViews(response) {
  const merged = new Map();
  for (const row of rowsOf(response)) {
    const key = canonicalPageKey(row.dimensionValues[0].value);
    const match = ARTICLE_KEY_PATTERN.exec(key);
    if (!match) {
      continue;
    }
    const views = Number(row.metricValues[0].value) || 0;
    merged.set(match[1], (merged.get(match[1]) || 0) + views);
  }
  return [...merged.entries()].map(([id, views]) => ({ id, views }));
}

// Bucket label for articles the tag map does not cover.
export const UNTAGGED_LABEL = "タグなし";

// Per-tag rollup of the blog's article views:
// [{ tag, count, totalViews, perArticle, top }] sorted by total
// views, biggest first. An article counts once under each of its
// tags (the blog's own tag index counts the same way). Articles
// with no tags gather under UNTAGGED_LABEL so the genre totals
// still account for every article view. Requires the tag map:
// without it there is nothing honest to group by, so the result
// is empty and the caller hides the section.
export function blogGenreStats(response, tags, titles, origin) {
  if (!tags || typeof tags.get !== "function" || tags.size === 0) {
    return [];
  }
  const groups = new Map();
  for (const { id, views } of articlePageViews(response)) {
    const labels =
      Array.isArray(tags.get(id)) && tags.get(id).length
        ? tags.get(id)
        : [UNTAGGED_LABEL];
    const title = (titles && titles.get(id)) || id;
    for (const label of labels) {
      let group = groups.get(label);
      if (!group) {
        group = { tag: label, count: 0, totalViews: 0, top: null };
        groups.set(label, group);
      }
      group.count += 1;
      group.totalViews += views;
      if (!group.top || views > group.top.views) {
        group.top = { title, views, href: `${origin}/blog/${id}` };
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      perArticle: group.count
        ? Math.round(group.totalViews / group.count)
        : 0,
    }))
    .sort((a, b) => b.totalViews - a.totalViews || b.count - a.count);
}

// Per-article rows for the blog tab's 記事ごと table, the blog
// counterpart of the Instagram tab's per-post table:
// [{ id, title, href, views, tags }] sorted by views, biggest
// first (title order breaks ties). Views are the same merged
// per-article counts blogGenreStats rolls up, so the two sections
// always agree. `tags` is the article's genre list under the
// rollup's convention: the tag map's list when it has one, and
// [UNTAGGED_LABEL] when the map exists but does not cover the
// article. When there is no tag map at all, tags is empty — the
// genre is unknown, not "untagged" — and the caller shows "—"
// and offers no genre filter.
export function blogArticleList(response, tags, titles, origin) {
  const hasMap = Boolean(tags) && typeof tags.get === "function" && tags.size > 0;
  return articlePageViews(response)
    .map(({ id, views }) => {
      const own = hasMap ? tags.get(id) : null;
      return {
        id,
        title: (titles && titles.get(id)) || id,
        href: `${origin}/blog/${id}`,
        views,
        tags: !hasMap ? [] : Array.isArray(own) && own.length ? [...own] : [UNTAGGED_LABEL],
      };
    })
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title));
}
