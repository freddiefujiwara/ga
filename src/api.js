// Requests to the ga-gas endpoint (GET with query parameters; the
// bridge is a plain doGet). Auth travels as a session_token parameter
// (the 30-day owner session exchanged at Google sign-in) or a
// share_token parameter (temporary access link). The raw Google ID
// token is only sent once, to the exchange_session action.
// Each function returns the parsed JSON ({ ok: true, ... } on success).

function buildUrl(endpoint, auth, params) {
  const url = new URL(endpoint);
  if (auth && auth.idToken) {
    url.searchParams.set("id_token", auth.idToken);
  }
  if (auth && auth.sessionToken) {
    url.searchParams.set("session_token", auth.sessionToken);
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
// "revoke_share"; requires owner proof (the owner session token).
export async function shareAction(endpoint, auth, action, fetchImpl = fetch) {
  return getJson(endpoint, auth, { action }, fetchImpl);
}

// Exchange a fresh Google ID token for a 30-day owner session:
// resolves with { ok: true, session_token, expires_at, ... }.
export async function exchangeSession(endpoint, idToken, fetchImpl = fetch) {
  return getJson(endpoint, { idToken }, { action: "exchange_session" }, fetchImpl);
}

// Revoke the owner session (logout). Best effort by design.
export async function revokeSession(endpoint, sessionToken, fetchImpl = fetch) {
  return getJson(endpoint, { sessionToken }, { action: "revoke_session" }, fetchImpl);
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

// Collapse a chronological point list to one point per calendar
// day: the day's last point wins. Points carry their JST day in
// `date` ("YYYYMMDD", from jstDateKey), so a Map keyed by date —
// last write wins, first-insertion order kept — does the whole
// reduction while preserving the ascending day order. Entries
// without a usable date are dropped.
export function dailyLatestSeries(points) {
  if (!Array.isArray(points)) {
    return [];
  }
  const byDate = new Map();
  for (const point of points) {
    if (point && point.date) {
      byDate.set(point.date, point);
    }
  }
  return [...byDate.values()];
}

// Shape history rows into one chart series per metric: points are
// { date, views } for buildLineChartSvg (views is just the value),
// skipping the collections where that metric is missing, and
// collapsed to one point per JST calendar day via
// dailyLatestSeries (collections run every six hours plus manual
// runs, so a raw series would stack several points on the same
// day). Each series also carries its latest value and the covered
// period: the collected_at behind its first and last daily
// points, so the stated period follows the plotted days. Series
// with no numeric point at all are dropped, and an empty history
// yields an empty list.
// Shared shaping behind snsHistorySeries / threadsHistorySeries:
// one chart series per { key, label } definition. A caller that
// only wants the recent window passes maxDays and keeps the last
// that many daily points (the stated period follows the slice).
function shapeHistorySeries(rows, defs, maxDays = null) {
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
      const entries = [];
      for (const row of sorted) {
        const date = isNum(row[key]) ? jstDateKey(row.collected_at) : null;
        if (date) {
          entries.push({
            date,
            views: row[key],
            collected_at: row.collected_at,
          });
        }
      }
      if (!entries.length) {
        return null;
      }
      const allDaily = dailyLatestSeries(entries);
      const daily = maxDays ? allDaily.slice(-maxDays) : allDaily;
      const points = daily.map(({ date, views }) => ({ date, views }));
      return {
        key,
        label,
        points,
        latest: points[points.length - 1].views,
        firstAt: daily[0].collected_at,
        lastAt: daily[daily.length - 1].collected_at,
      };
    })
    .filter(Boolean);
}

export function snsHistorySeries(rows) {
  return shapeHistorySeries(rows, SNS_HISTORY_SERIES);
}

// The Threads follower trend for the Threads tab: the same history
// rows, a single series. Threads numbers only exist since
// 2026-11-09, long after the other metrics, so the period spans
// only the collections that actually carry one — the earlier rows
// (threads_followers null) contribute no point and do not stretch
// the stated period.
export function threadsHistorySeries(rows) {
  return shapeHistorySeries(rows, [
    { key: "threads_followers", label: "Threads フォロワー" },
  ]);
}

// The Instagram tab's engagement trend: the account metrics
// Meta reports as rolling last-30-days totals — views, reach
// and the interaction total with its breakdown — one series
// per metric, in chip order. Every series is a rolling total
// rather than a per-day count, so the chart plots the daily
// latest value as-is (no moving average: smoothing a rolling
// total would only blur the window's own movement). The
// interaction breakdown columns only arrive once social-gas
// serves them; until then those series simply drop out and
// the chips offer the rest.
//
// The plotted window follows the period chips: the renderer
// asks for the newest `maxDays` daily points (or every point
// for 全期間）. Only days the history actually holds can
// appear — a longer window than the history simply shows the
// days there are, never a stretched blank. social-gas serves
// the newest ~275 days of collections, so every period below
// is covered by the response.
export const INSTAGRAM_TREND_PERIODS = [
  { days: 30, label: "30日" },
  { days: 90, label: "90日" },
  { days: 180, label: "180日" },
  { days: null, label: "全期間" },
];

export const INSTAGRAM_TREND_DEFAULT_DAYS = 90;

export const INSTAGRAM_TREND_SERIES = [
  { key: "views_30d", label: "再生回数" },
  { key: "reach_30d", label: "リーチ" },
  { key: "interactions_total", label: "反応合計" },
  { key: "interactions_likes", label: "いいね" },
  { key: "interactions_comments", label: "コメント" },
  { key: "interactions_saves", label: "保存" },
  { key: "interactions_shares", label: "シェア" },
];

export function instagramTrendSeries(rows, maxDays = null) {
  return shapeHistorySeries(rows, INSTAGRAM_TREND_SERIES, maxDays);
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

const jstDateTimePadded = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// The "as of" line shown above the tabs: when the collection
// behind every figure on the page ran, in JST, zero-padded
// ("データは 2026/11/09 18:50 時点のものです"). Returns "" when
// the timestamp is missing or unparseable, so the caller can
// leave the line blank instead of showing a placeholder.
export function dataAsOfText(collectedAt) {
  const date = collectedAt ? new Date(collectedAt) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return `データは ${jstDateTimePadded.format(date)} 時点のものです`;
}

// The combined follower total shown on the top page: the main
// Instagram account, Threads, YouTube and X. The secondary
// Instagram account (@anemone_cancer) is deliberately not part
// of the sum. Null when not a single network reported a number.
export function snsTotalFollowers(detail) {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const parts = [
    detail.instagram?.freddiefujiwara,
    detail.threads?.followers,
    detail.youtube?.subscribers,
    detail.x?.followers,
  ].filter(isNum);
  return parts.length ? parts.reduce((sum, v) => sum + v, 0) : null;
}

// KPI cards for the Instagram tab: the Instagram account's own
// numbers only. The cross-channel figures (the combined follower
// total, the YouTube and Threads counts) live on the overview tab
// instead, so each channel tab shows just its own channel. The
// フォロー / フォロー解除 cards carry the same day-over-day
// change as the overview tab's cards of the same names, computed
// by the shared kpiDelta over the history rows, so the two tabs
// cannot drift apart.
export function snsOverview(detail, historyRows) {
  const ig = detail?.instagram ?? {};
  const interactions = ig.interactions_30d ?? {};
  return [
    // The follower count and the post count are public figures:
    // the top page publishes both (the hero's follower breakdown
    // and 投稿数, and sns-count.json), so privacy masking
    // exempts them (the `public` flag, rendered as .is-public).
    { label: "Instagram フォロワー", value: formatCount(ig.freddiefujiwara), public: true },
    { label: "Instagram 投稿数", value: formatCount(ig.media_count), public: true },
    { label: "再生回数（過去30日）", value: formatCount(ig.views_30d) },
    { label: "リーチ（過去30日）", value: formatCount(ig.reach_30d) },
    { label: "反応した人数（過去30日）", value: formatCount(ig.accounts_engaged_30d) },
    { label: "反応の合計（過去30日）", value: formatCount(interactions.total) },
    { label: "フォロワー以外（過去30日）", value: formatPercent(ig.non_follower_pct) },
    {
      label: "フォロー（過去30日）",
      value: formatCount(ig.follows_30d),
      delta: kpiDelta(historyRows, "follows_30d"),
    },
    {
      label: "フォロー解除（過去30日）",
      value: formatCount(ig.unfollows_30d),
      delta: kpiDelta(historyRows, "unfollows_30d"),
      // More unfollows is worse: the change line colours the
      // other way round, exactly as on the overview card.
      invert: true,
    },
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

// The still image for one Instagram post, as collected into
// thumbnail_url (a reel's thumbnail, or a photo's own image).
// The URLs are signed and expire; the hourly collection refreshes
// them, so what the screen holds is at most one collection old.
// A missing or non-string value yields null, and the row renders
// an empty frame instead.
export function instagramThumbnailUrl(media) {
  const url = media?.thumbnail_url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

// The thumbnail frame shape an Instagram post needs: reels and
// videos are vertical, everything else (photos, carousels) sits
// in a square frame; the image is cover-cropped either way.
export function mediaThumbnailShape(media) {
  switch (media?.type) {
    case "REELS":
    case "REEL":
    case "VIDEO":
      return "vertical";
    default:
      return "square";
  }
}

// The video id a YouTube thumbnail is derived from: the entry's
// own id, or — for a row that only carries its watch URL — the
// id inside that URL. Anything else yields null.
function youtubeVideoId(video) {
  if (video && typeof video.id === "string" && video.id.length > 0) {
    return video.id;
  }
  const url = typeof video?.url === "string" ? video.url : "";
  const match = url.match(/[?&]v=([\w-]{6,})/);
  return match ? match[1] : null;
}

// YouTube thumbnail candidates for one video, best first, derived
// from the video id (nothing extra is collected): oardefault is
// the posted thumbnail in the video's original aspect — vertical
// for Shorts, wide for regular videos — but only some videos have
// one; the rest answer with YouTube's 120x90 placeholder (see
// isPlaceholderThumbnail), so oar2, a frame in the same original
// aspect, follows as the fallback. No id means no candidates.
export function youtubeThumbnailUrls(video) {
  const id = youtubeVideoId(video);
  if (!id) {
    return [];
  }
  return [
    `https://i.ytimg.com/vi/${id}/oardefault.jpg`,
    `https://i.ytimg.com/vi/${id}/oar2.jpg`,
  ];
}

// Whether a loaded image is YouTube's 120x90 placeholder rather
// than a real thumbnail: i.ytimg.com answers missing variants
// with that fixed-size stub instead of an error.
export function isPlaceholderThumbnail(naturalWidth, naturalHeight) {
  return naturalWidth === 120 && naturalHeight === 90;
}

// The frame shape a loaded thumbnail's own aspect calls for:
// taller than wide is "vertical" (Shorts), anything else —
// including a square — is "horizontal". A size that is not two
// positive numbers yields null (no opinion).
export function thumbnailOrientation(naturalWidth, naturalHeight) {
  if (!(naturalWidth > 0) || !(naturalHeight > 0)) {
    return null;
  }
  return naturalHeight > naturalWidth ? "vertical" : "horizontal";
}

export function youtubeTotals(detail, historyRows) {
  const yt = detail?.youtube ?? {};
  const change = historyDailyDelta(historyRows, "youtube_subscribers");
  const growth = historyWindowDelta(historyRows, "youtube_subscribers");
  return [
    // YouTube reports no subscribe / unsubscribe split, so the
    // subscriber card itself carries the changes (see
    // followerTotalBox).
    followerTotalBox("登録者", yt.subscribers, change, growth),
    { label: "総再生回数", value: formatCount(yt.total_views) },
    { label: "動画本数", value: formatCount(yt.video_count) },
  ];
}

// Totals boxes for the Threads tab: one follower card carrying
// the current count, its day-over-day change （前日比） and
// the change over the trailing window, all taken from the
// history rows exactly like the overview KPI deltas (see
// followerTotalBox). Then the account-wide last-30-days
// numbers ga-gas collects with the detail: total views and
// the interactions total (the four-way split is
// threadsInteractions).
// Every number can be null; missing ones show "—".
export function threadsTotals(detail, historyRows) {
  const th = detail?.threads ?? {};
  const change = historyDailyDelta(historyRows, "threads_followers");
  const growth = historyWindowDelta(historyRows, "threads_followers");
  const interactions = th.interactions_30d ?? {};
  return [
    // Threads reports no follow / unfollow split, so the
    // follower card itself carries the changes.
    followerTotalBox("フォロワー", th.followers, change, growth),
    { label: "表示回数（過去30日）", value: formatCount(th.views_30d) },
    {
      label: "反応の合計（過去30日）",
      value: formatCount(interactions.total),
    },
  ];
}

// The four-way split of the Threads account's last 30 days of
// interactions, the counterpart of snsInteractions on the
// Instagram tab.
export function threadsInteractions(detail) {
  const it = detail?.threads?.interactions_30d ?? {};
  return [
    { label: "いいね", value: formatCount(it.likes) },
    { label: "返信", value: formatCount(it.replies) },
    { label: "リポスト", value: formatCount(it.reposts) },
    { label: "引用", value: formatCount(it.quotes) },
  ];
}

// The Threads account's recent posts, newest first as collected:
// [{ id, type, posted_at, text, permalink, views, likes, replies,
// reposts, quotes }], with nulls wherever a number could not be
// collected. Anything that is not a list yields an empty one.
export function threadsPosts(detail) {
  const list = detail?.threads?.recent_posts;
  return Array.isArray(list) ? list : [];
}

// Partial-collection notes ga-gas attaches to the Threads section
// (empty in the normal case); shown as small print only when
// present, like snsErrorNotes for the Instagram section.
export function threadsErrorNotes(detail) {
  const th = detail?.threads ?? {};
  return ["detail_error", "posts_error"]
    .map((key) => th[key])
    .filter((value) => typeof value === "string" && value.length > 0);
}

// The YouTube subscriber trend for the YouTube tab: the same
// history rows, a single series — the counterpart of
// threadsHistorySeries / xHistorySeries, so the YouTube tab
// shows its follower trend the same way the other channel tabs
// show theirs.
export function youtubeHistorySeries(rows) {
  return shapeHistorySeries(rows, [
    { key: "youtube_subscribers", label: "YouTube 登録者" },
  ]);
}

// The X follower trend for the X tab: the same history rows, a
// single series. X numbers only exist since the tweet-gas sync
// was connected, so — like Threads — the rows before that
// (x_followers null) contribute no point.
export function xHistorySeries(rows) {
  return shapeHistorySeries(rows, [
    { key: "x_followers", label: "X フォロワー" },
  ]);
}

// Totals boxes for the X tab: one follower card carrying the
// current count, its day-over-day change （前日比） and the
// change over the trailing window, from the history rows
// exactly like threadsTotals (see followerTotalBox). X
// collection started on 2026-11-10, so until a previous
// calendar day carries an X number there is nothing to
// compare. X has no account-wide 30-day totals in the
// collection (the API tweet-gas reads reports per-post numbers
// only), so the rest of the row is summed from the fetched
// posts themselves and labelled with the scope they cover —
// the newest 50 posts, the delivery cap on both sides of the
// sheet: the post count, their combined views and the
// per-post average — the average that otherwise only appears
// inside the genre section.
export function xTotals(detail, historyRows) {
  const x = detail?.x ?? {};
  const change = historyDailyDelta(historyRows, "x_followers");
  const growth = historyWindowDelta(historyRows, "x_followers");
  const posts = xPosts(detail);
  const viewed = posts.filter((post) => isNum(post?.views));
  const totalViews = viewed.length
    ? viewed.reduce((sum, post) => sum + post.views, 0)
    : null;
  return [
    // X reports no follow / unfollow split either, so the
    // follower card itself carries the changes.
    followerTotalBox("フォロワー", x.followers, change, growth),
    { label: "投稿数（直近50件）", value: formatCount(posts.length || null) },
    { label: "表示回数の合計（直近50件）", value: formatCount(totalViews) },
    {
      label: "1投稿あたりの平均表示",
      value: formatCount(
        totalViews === null ? null : Math.round(totalViews / viewed.length),
      ),
    },
  ];
}

// A USD amount as the X tab's credit card shows it: "$41.65".
// Anything that is not a finite number yields the empty-state
// dash, like every other card.
export function formatUsd(value) {
  if (!isNum(value)) {
    return "—";
  }
  return `$${value.toFixed(2)}`;
}

// The X API credit balance (USD) for the X tab's credit card:
// the newest daily point of the history rows' x_api_balance_usd
// (the sheet series is the source the whole screen reads), with
// the detail's x section as the fallback while no history row
// carries the balance yet. Null until tweet-gas reports one.
export function xApiBalance(detail, historyRows) {
  const daily = dailyPointsForKey(historyRows, "x_api_balance_usd");
  if (daily.length) {
    return daily[daily.length - 1].views;
  }
  const fromDetail = detail?.x?.api_balance_usd;
  return isNum(fromDetail) ? fromDetail : null;
}

// How long the current balance lasts at the recent burn rate,
// in months — estimated from the balance's own stored series,
// never from usage counts: converting tweet counts into money
// would need a unit price this screen does not know. The burn
// is the sum of the day-to-day decreases over the last month
// of daily points divided by the days they span; balance
// increases (a top-up) are not consumption and never raise the
// burn. Null until at least two days carry a balance and the
// balance actually decreased over the window — before that
// there is no honest pace to project.
export function xApiRunwayMonths(historyRows) {
  const daily = dailyPointsForKey(historyRows, "x_api_balance_usd");
  if (daily.length < 2) {
    return null;
  }
  const points = daily.slice(-31);
  const first = points[0];
  const latest = points[points.length - 1];
  const span = daySpan(first.date, latest.date);
  if (!span || span < 1) {
    return null;
  }
  let burned = 0;
  for (let i = 1; i < points.length; i++) {
    const drop = points[i - 1].views - points[i].views;
    if (drop > 0) {
      burned += drop;
    }
  }
  if (burned <= 0) {
    return null;
  }
  const months = latest.views / ((burned / span) * (365.25 / 12));
  if (!Number.isFinite(months) || months <= 0) {
    return null;
  }
  return Math.round(months * 10) / 10;
}

// The runway line of the credit card: absent while no estimate
// can be made, "3年以上" once the pace is slow enough that a
// month count stops being informative.
export function formatXApiRunway(months) {
  if (!isNum(months)) {
    return null;
  }
  if (months > 36) {
    return "今のペースであと3年以上分";
  }
  const text = Number.isInteger(months) ? String(months) : months.toFixed(1);
  return `今のペースであと約${text}か月分`;
}

// Everything the X tab's API credit card renders: the balance
// (a number this page never published, so the card masks it —
// the renderer gives the value .amount-value without .is-public)
// and the runway line, itself derived from the balance and
// masked the same way.
// The average daily consumption pace (posts per day) over the
// most recent 30 reported days of x.api_daily_posts, or null
// when no day carries a count. This is a plain count of posts
// consumed — deliberately NOT converted into money: the
// consumption mixes owned reads and regular reads, which are
// billed at different unit rates, so a single-rate conversion
// could misstate the runway several-fold. The runway above is
// estimated from the balance's own decrease instead.
export function xApiDailyPace(detail) {
  const days =
    detail && detail.x && Array.isArray(detail.x.api_daily_posts)
      ? detail.x.api_daily_posts
      : [];
  const counted = days
    .filter((entry) => entry && isNum(entry.tweets_consumed))
    .slice(-30);
  if (counted.length === 0) {
    return null;
  }
  const total = counted.reduce((sum, entry) => sum + entry.tweets_consumed, 0);
  return Math.round(total / counted.length);
}

export function xApiCreditSummary(detail, historyRows) {
  const balance = xApiBalance(detail, historyRows);
  const pace = xApiDailyPace(detail);
  return {
    balance,
    balanceText: formatUsd(balance),
    runwayText: formatXApiRunway(xApiRunwayMonths(historyRows)),
    paceText:
      pace === null
        ? null
        : `直近30日の消費ペース：1日平均${formatCount(pace)}件`,
  };
}

// The X account's recent posts, newest first as collected:
// [{ id, posted_at, text, url, views, likes, reposts, replies }],
// with nulls wherever a number could not be collected. Anything
// that is not a list yields an empty one.
export function xPosts(detail) {
  const list = detail?.x?.recent_posts;
  return Array.isArray(list) ? list : [];
}

// Partial-collection notes social-gas attaches to the X section.
// The tweet-gas call often reports the same summary on both
// fields (the two halves travel in one call), so duplicates are
// shown once.
export function xErrorNotes(detail) {
  const x = detail?.x ?? {};
  return ["x_error", "posts_error", "usage_error"]
    .map((key) => x[key])
    .filter((value) => typeof value === "string" && value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);
}

// Partial-collection notes ga-gas attaches to the snapshot (empty
// in the normal case); shown as small print only when present.
export function snsErrorNotes(detail) {
  const ig = detail?.instagram ?? {};
  return ["insights_error", "detail_error", "media_error"]
    .map((key) => ig[key])
    .filter((value) => typeof value === "string" && value.length > 0);
}

// The Instagram account's daily follows / unfollows over the last
// 30 days, as collected for the detail's instagram section:
// [{ date: "YYYY-MM-DD", follows, unfollows }] in ascending date
// order, with nulls wherever a day's number could not be
// collected. Anything that is not a list yields an empty one.
export function instagramDailyFollows(detail) {
  const list = detail?.instagram?.daily_follows;
  return Array.isArray(list) ? list : [];
}

// The collection error ga-gas attaches when the daily follows
// could not be fetched (null in the normal case); the follow
// chart section shows it as small print when present.
export function instagramDailyFollowsError(detail) {
  const error = detail?.instagram?.daily_follows_error;
  return typeof error === "string" && error.length > 0 ? error : null;
}

// Days for the Instagram tab's daily follow / unfollow chart: the
// daily-follows series with the recent posts mapped onto the JST
// calendar day each was posted (the day key is the "YYYYMMDD"
// shape the chart builders take). Days ascend by date and a
// duplicated date keeps its last entry. A value that is not a
// finite number becomes null — a gap in the chart, not a zero.
// Posts whose JST day falls outside the series cannot be placed
// on it and are left out.
export function followChartDays(detail) {
  const media = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  const postsByDate = new Map();
  for (const post of media) {
    const key = post ? jstDateKey(post.posted_at) : null;
    if (!key) {
      continue;
    }
    if (!postsByDate.has(key)) {
      postsByDate.set(key, []);
    }
    postsByDate.get(key).push(post);
  }
  const byDate = new Map();
  for (const row of instagramDailyFollows(detail)) {
    const key =
      row && typeof row.date === "string" ? row.date.replace(/-/g, "") : "";
    if (!/^\d{8}$/.test(key)) {
      continue;
    }
    byDate.set(key, {
      date: key,
      follows: isNum(row.follows) ? row.follows : null,
      unfollows: isNum(row.unfollows) ? row.unfollows : null,
      // The day's posts read best-first, like the per-post
      // table's default order.
      posts: sortMedia(postsByDate.get(key) ?? [], "views", "desc"),
    });
  }
  return [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

// --- Overview tab helpers ---

// The "YYYYMMDD" day key of the day `days` before the given
// one, by plain calendar arithmetic (the keys are JST day
// labels, so no timezone conversion is involved).
function dayKeyBefore(dateKey, days) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const prev = new Date(Date.UTC(year, month - 1, day) - days * 86400000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${prev.getUTCFullYear()}${pad(prev.getUTCMonth() + 1)}${pad(prev.getUTCDate())}`;
}

// The "YYYYMMDD" day key of the day before the given one.
function previousDayKey(dateKey) {
  return dayKeyBefore(dateKey, 1);
}

// Whole days from one "YYYYMMDD" day key to a later one.
function daySpan(fromKey, toKey) {
  const toUtc = (key) =>
    Date.UTC(
      Number(key.slice(0, 4)),
      Number(key.slice(4, 6)) - 1,
      Number(key.slice(6, 8)),
    );
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86400000);
}

// One history metric collapsed to one point per JST calendar
// day: the day's last collection wins, the same reduction the
// trend charts plot. Points are { date, views } in ascending
// day order; collections where the metric is missing contribute
// no point.
function dailyPointsForKey(rows, key) {
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
  const entries = [];
  for (const row of sorted) {
    const date = isNum(row[key]) ? jstDateKey(row.collected_at) : null;
    if (date) {
      entries.push({ date, views: row[key] });
    }
  }
  return dailyLatestSeries(entries);
}

// The day-over-day change of one history metric （前日比）: the
// latest day's value minus the previous calendar day's, over the
// daily points of dailyPointsForKey. Null when either side has
// no numeric point: a metric whose collection only started
// today (X, collected from 2026-11-10) has no previous day yet,
// and a day the collection skipped leaves nothing honest to
// compare against — in both cases the displays show "—" until
// the days line up.
export function historyDailyDelta(rows, key) {
  const daily = dailyPointsForKey(rows, key);
  if (!daily.length) {
    return null;
  }
  const latest = daily[daily.length - 1];
  const previous = daily.find(
    (point) => point.date === previousDayKey(latest.date),
  );
  if (!previous) {
    return null;
  }
  return {
    latest: latest.views,
    previous: previous.views,
    delta: latest.views - previous.views,
  };
}

// The trailing window a follower-change card compares over:
// the window follows the history's length, capped at this many
// days.
export const FOLLOWER_WINDOW_DAYS = 30;

// The change of one history metric over the trailing window
// （フォロワー増減）: the latest day's value minus the value
// windowDays before it. While the history is shorter than the
// window, no point reaches that far back and the base falls
// back to the oldest point instead — the window grows with the
// history and pins to the full window once enough days have
// accumulated. `days` is the window the delta actually covers
// and `full` says whether it reached the whole window, so the
// card can name its own period. `dayOverDay` is the 前日比 of
// the window delta itself: today's window delta minus the same
// figure computed as of the previous calendar day, null when
// that day has no point or its own window cannot be computed.
// Null overall until at least two days carry a number.
export function historyWindowDelta(rows, key, windowDays = FOLLOWER_WINDOW_DAYS) {
  const daily = dailyPointsForKey(rows, key);
  if (daily.length < 2) {
    return null;
  }
  const windowFor = (endIndex) => {
    const end = daily[endIndex];
    const target = dayKeyBefore(end.date, windowDays);
    let base = null;
    for (let i = endIndex; i >= 0; i--) {
      if (daily[i].date <= target) {
        base = daily[i];
        break;
      }
    }
    const full = base !== null;
    if (!full) {
      base = daily[0];
    }
    if (base.date >= end.date) {
      return null;
    }
    return {
      delta: end.views - base.views,
      days: full ? windowDays : daySpan(base.date, end.date),
      full,
    };
  };
  const current = windowFor(daily.length - 1);
  if (!current) {
    return null;
  }
  const latest = daily[daily.length - 1];
  const prevIndex = daily.findIndex(
    (point) => point.date === previousDayKey(latest.date),
  );
  let dayOverDay = null;
  if (prevIndex >= 0) {
    const previous = windowFor(prevIndex);
    if (previous) {
      dayOverDay = current.delta - previous.delta;
    }
  }
  return { ...current, dayOverDay };
}

// The period a follower card's window line names: the full
// window once the history reaches it, the actual span in days
// while it is still growing.
function followerWindowPeriod(change) {
  if (!change || change.full) {
    return `過去${FOLLOWER_WINDOW_DAYS}日`;
  }
  return `過去${change.days}日間`;
}

// The follower / subscriber card of a channel tab (YouTube・
// Threads・X): the current count as the value — one of the top
// page's published follower figures, so masking exempts it —
// with the day-over-day change as the delta line and the
// trailing-window change as a second line naming its own
// period. These channels report no follow / unfollow split, so
// the two changes stand in for it on the one card; the window
// change's own day-over-day is not carried, as its own card it
// sat too close to the count's 前日比. Either line is absent
// while its figure cannot be computed yet; the two change
// figures are this page's own analysis and stay masked (no
// `public` on the lines — the renderers give them
// .amount-value like every delta line).
function followerTotalBox(label, count, change, growth) {
  return {
    label,
    value: formatCount(count),
    public: true,
    delta: change ? formatDelta(change.delta) : null,
    window: growth ? formatDelta(growth.delta) : null,
    windowLabel: growth ? followerWindowPeriod(growth) : null,
  };
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

// One metric's day-over-day change （前日比） as a card's
// change-line text: the metric's history collapses to one point
// per JST calendar day and the latest day is compared with the
// previous calendar day (see historyDailyDelta). Null when the
// history cannot offer the comparison. Shared by the overview
// cards and the channel-tab cards that mirror them (the
// Instagram tab's フォロー / フォロー解除）, so the same card
// shows the same change wherever it appears.
export function kpiDelta(historyRows, key) {
  const change = historyDailyDelta(historyRows, key);
  return change ? formatDelta(change.delta) : null;
}

// KPI cards for the overview tab: the headline numbers of every
// network plus the blog, each carrying the day-over-day change
// （前日比） wherever the SNS history offers both the latest
// day and the previous calendar day to compare — the 30-day
// window cards （再生回数（過去30日） etc.) compare the same way,
// today's 30-day figure against yesterday's. The blog numbers
// come from the GA totals object ({ views, users, sessions });
// no history exists for them, so they never carry a delta.
// Every input tolerates being missing: values fall back to "—"
// and deltas to null.
export function overviewKpis(detail, gaTotals, historyRows) {
  const ig = detail?.instagram ?? {};
  const yt = detail?.youtube ?? {};
  const deltaFor = (key) => kpiDelta(historyRows, key);
  // The `public` flag marks the figures the owner already
  // publishes elsewhere — the top page's hero (the combined
  // follower total, the per-channel follower breakdown and the
  // Instagram post count, all mirrored in sns-count.json) — so
  // privacy masking exempts the value (rendered as .is-public).
  // The blog's two cards are GA rollups over the last 28 days;
  // no public page prints them, so they stay masked like the
  // other analysis figures. The day-over-day change lines are
  // this page's own analysis and stay masked either way; they
  // render separately from the value.
  return [
    {
      label: "SNS延べフォロワー数",
      value: formatCount(snsTotalFollowers(detail)),
      delta: deltaFor("total_followers"),
      public: true,
    },
    {
      label: "Instagram フォロワー",
      value: formatCount(ig.freddiefujiwara),
      delta: deltaFor("ig_followers"),
      public: true,
    },
    {
      label: "YouTube 登録者",
      value: formatCount(yt.subscribers),
      delta: deltaFor("youtube_subscribers"),
      public: true,
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
      public: true,
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
      // More unfollows is worse, so this card's change is
      // coloured the other way round (an increase reads red, a
      // decrease green). fillKpiBoxes applies the inversion;
      // every other card colours an increase green.
      invert: true,
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

// The overview's per-channel top lists: the most-viewed items of
// every channel, each under its channel's name and the metric
// that channel actually reports — Instagram and YouTube count
// 再生回数, Threads and X count 表示回数, and the blog counts its
// articles' 表示回数. Every item is shaped the same way,
// { label, href, value }, with href null when the item carries
// no link, so a single renderer serves all five sections. The
// blog rows are ranked by the caller (pageRanking over the GA
// report) and arrive ready-made as { label, href, views }; only
// the first `limit` are kept, in the caller's order.
export function topPostsByChannel(detail, blogItems = [], limit = 3) {
  const top = (rows, toItem) =>
    sortMedia(rows, "views", "desc").slice(0, limit).map(toItem);
  return [
    {
      channel: "Instagram",
      metric: "再生回数",
      items: topMedia(detail, limit).map((media) => ({
        label:
          captionHead(media.caption) || mediaTypeLabel(media.type) || "投稿",
        href: media.permalink ?? null,
        value: media.views,
      })),
    },
    {
      channel: "YouTube",
      metric: "再生回数",
      items: top(youtubeVideos(detail), (video) => ({
        label: video.title || "動画",
        href: video.url ?? null,
        value: video.views,
      })),
    },
    {
      channel: "Threads",
      metric: "表示回数",
      items: top(threadsPosts(detail), (post) => ({
        label: captionHead(post.text) || "投稿",
        href: post.permalink ?? null,
        value: post.views,
      })),
    },
    {
      channel: "X",
      metric: "表示回数",
      items: top(xPosts(detail), (post) => ({
        label: captionHead(post.text) || "投稿",
        href: post.url ?? null,
        value: post.views,
      })),
    },
    {
      channel: "ブログ",
      metric: "表示回数",
      items: (Array.isArray(blogItems) ? blogItems : [])
        .slice(0, limit)
        .map((item) => ({
          label: item.label,
          href: item.href ?? null,
          value: item.views,
          // No public flag: the per-article counts here are GA
          // figures over the last 28 days, which no public page
          // prints, so masking treats them like the other
          // channels' per-post counts.
        })),
    },
  ];
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
  "/social/": "アクセス解析",
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

// Build the per-article display-time ranking from the speed
// report (pagePath x [render_ms total, sample count, slow
// count], served by social-gas from its blog_speed tab): split
// article paths merge under the canonical key with totals,
// samples and slow counts summed, the average is total /
// samples, slowest first. The slow count is how many of the
// article's displays took ten seconds or more (the blog's
// article_render_slow events); a report that predates it has
// no third value and reads as zero. Articles with no recorded
// display are absent from the report and stay absent here.
// Returns [{ label, href, avgMs, samples, slow }] ready to
// render.
export function pageSpeedRanking(response, titles, origin, limit = 10) {
  const merged = new Map();
  for (const row of rowsOf(response)) {
    const path = row.dimensionValues[0].value;
    const total = Number(row.metricValues[0].value) || 0;
    const samples = Number(row.metricValues[1].value) || 0;
    if (!samples) {
      continue;
    }
    const slow = Number(row.metricValues[2]?.value) || 0;
    const key = canonicalPageKey(path);
    const entry = merged.get(key) || { total: 0, samples: 0, slow: 0 };
    entry.total += total;
    entry.samples += samples;
    entry.slow += slow;
    merged.set(key, entry);
  }
  return [...merged.entries()]
    .map(([key, entry]) => ({
      ...pageDisplay(key, titles, origin),
      avgMs: Math.round(entry.total / entry.samples),
      samples: entry.samples,
      slow: entry.slow,
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
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

// One title map out of the two blog title sources: the titles
// payload (?o=titles) fills the map first and the RSS titles win
// on overlap — the merge the blog tab's sections all share, so a
// failure of either single fetch no longer blanks every title.
export function mergeBlogTitles(metaTitles, rssTitles) {
  const titles = new Map(metaTitles || []);
  for (const [id, title] of rssTitles || []) {
    titles.set(id, title);
  }
  return titles;
}

// The publication day of one article, as the "YYYYMMDD" day key
// the chart builders take, read off the leading "YYYY-MM-DD" of
// its title. The merged title map the blog tab renders from
// carries no date field of its own — the titles payload is
// { ids, titles, tags } and parseRssTitles keeps only the text —
// but every article title opens with its publication date (the
// RSS items carry a pubDate too, and it agrees with the prefix),
// so the prefix is the date source for the daily chart's article
// overlay. A title without a well-formed leading date yields
// null and the article simply takes no part in the overlay.
export function blogArticleDateKey(title) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\s|$)/.exec(String(title || ""));
  if (!match) {
    return null;
  }
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${match[1]}${match[2]}${match[3]}`;
}

// The blog's articles grouped by publication day, for the daily
// chart's overlay: [{ date, articles: [{ id, title, href }] }]
// with days ascending and each day's articles in title order.
// Only articles whose title carries a date (blogArticleDateKey)
// take part. The href is the canonical article URL, the same
// target pageDisplay builds for an article path.
export function blogArticlesByDate(titles, origin) {
  const byDate = new Map();
  for (const [id, title] of titles || []) {
    const date = blogArticleDateKey(title);
    if (!date) {
      continue;
    }
    if (!byDate.has(date)) {
      byDate.set(date, []);
    }
    byDate.get(date).push({ id, title, href: `${origin}/blog/${id}` });
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, articles]) => ({
      date,
      articles: articles.sort((a, b) =>
        a.title < b.title ? -1 : a.title > b.title ? 1 : 0,
      ),
    }));
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

// Count / total / per-article views over a blogArticleList, for
// the blog tab's KPI row: the article count and the per-article
// average sit next to the GA totals there, so the average does
// not live only inside the genre section. perArticle is null
// when there are no articles at all.
export function articleViewStats(articles) {
  const rows = Array.isArray(articles) ? articles : [];
  const totalViews = rows.reduce(
    (sum, article) => sum + (isNum(article?.views) ? article.views : 0),
    0,
  );
  return {
    count: rows.length,
    totalViews,
    perArticle: rows.length ? Math.round(totalViews / rows.length) : null,
  };
}
