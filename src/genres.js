// Genre performance shaping: pure helpers, unit-tested.
//
// Instagram: every recent post is bucketed into one genre by
// keyword rules over its caption (hashtags included, since the
// caption carries them). The rules live in one ordered array so
// the owner can retune them in a single place: the first rule
// whose keywords appear in the caption wins, and a caption that
// matches nothing lands in the fallback genre. Rule order is the
// priority order — specific signals (cycling, barber/relaxation,
// music) come before the broad food words, and cafe/sweets comes
// before general gourmet because cafe captions routinely carry
// gourmet hashtags too.

import { captionHead, formatCount, mediaTypeLabel } from "./api.js";

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

export const INSTAGRAM_FALLBACK_GENRE = "日常・その他";

export const INSTAGRAM_GENRE_RULES = [
  {
    genre: "音楽",
    keywords: ["音楽", "Suno", "リリック", "歌", "曲"],
  },
  {
    genre: "サイクリング",
    keywords: [
      "サイクリング",
      "自転車",
      "ポタリング",
      "HELLO CYCLING",
      "ハローサイクリング",
    ],
  },
  {
    genre: "理容・リラクゼーション",
    keywords: [
      "理容",
      "バーバー",
      "床屋",
      "散髪",
      "丸刈り",
      "美容室",
      "サロン",
      "リラクゼーション",
      "マッサージ",
      "よもぎ蒸し",
      "整体",
      "エステ",
      "ヘッドスパ",
    ],
  },
  {
    genre: "カフェ・スイーツ",
    keywords: [
      "カフェ",
      "スイーツ",
      "ケーキ",
      "今川焼き",
      "大福",
      "プリン",
      "パフェ",
      "コーヒー",
      "喫茶",
      "モーニング",
      "パン屋",
      "ベーカリー",
      "甘味",
    ],
  },
  {
    genre: "グルメ",
    keywords: [
      "グルメ",
      "ランチ",
      "ディナー",
      "食堂",
      "レストラン",
      "居酒屋",
      "ラーメン",
      "カレー",
      "寿司",
      "焼肉",
      "料理",
      "定食",
      "食べ歩き",
    ],
  },
  {
    genre: "街歩き・スポット",
    keywords: [
      "街歩き",
      "散歩",
      "祭り",
      "花火",
      "公園",
      "神社",
      "お寺",
      "銭湯",
      "温泉",
      "商店街",
      "市場",
      "スポット",
    ],
  },
];

// The genre of one post: the first rule (in array order) with a
// keyword appearing in the caption. Matching is a plain substring
// test, case-insensitive so the latin keywords ("Suno",
// "HELLO CYCLING") work in any casing. A missing caption matches
// nothing and falls back like any other unmatched caption.
export function classifyCaption(caption, rules = INSTAGRAM_GENRE_RULES) {
  const text = String(caption ?? "").toLowerCase();
  for (const rule of rules) {
    const hit = (rule.keywords || []).some((keyword) =>
      text.includes(String(keyword).toLowerCase()),
    );
    if (hit) {
      return rule.genre;
    }
  }
  return INSTAGRAM_FALLBACK_GENRE;
}

// A rate (0..1) as a one-decimal percent label; "—" when missing.
export function formatRate(value) {
  return isNum(value) ? `${(value * 100).toFixed(1)}%` : "—";
}

// Period windows for the genre rollup, keyed by the value of the
// period selector on the Instagram tab. "all" keeps every fetched
// post; the ranged windows keep the posts published within the
// last N days (counted back from `now`).
export const GENRE_PERIODS = [
  { key: "all", label: "取得分すべて", days: null },
  { key: "30d", label: "過去30日", days: 30 },
  { key: "7d", label: "過去7日", days: 7 },
];

const postedTime = (post) => {
  const time = post?.posted_at ? new Date(post.posted_at).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
};

// The posts of one period window. "all" (and any unknown key)
// returns the fetched posts untouched; a ranged window keeps the
// posts whose posted_at falls inside it — a post without a usable
// date cannot be placed in a window, so it drops out of ranged
// windows only.
export function filterMediaByPeriod(media, periodKey, now = new Date()) {
  const list = Array.isArray(media) ? media : [];
  const period = GENRE_PERIODS.find((p) => p.key === periodKey);
  if (!period || period.days === null) {
    return [...list];
  }
  const cutoff = now.getTime() - period.days * 24 * 60 * 60 * 1000;
  return list.filter((post) => {
    const time = postedTime(post);
    return time !== null && time >= cutoff;
  });
}

// The oldest and newest post dates in a population, as the raw
// posted_at strings: { from, to }. Posts without a usable date do
// not take part; null when no post has one.
export function mediaDateRange(media) {
  const list = Array.isArray(media) ? media : [];
  let from = null;
  let to = null;
  for (const post of list) {
    const time = postedTime(post);
    if (time === null) {
      continue;
    }
    if (from === null || time < from.time) {
      from = { time, iso: post.posted_at };
    }
    if (to === null || time > to.time) {
      to = { time, iso: post.posted_at };
    }
  }
  return from ? { from: from.iso, to: to.iso } : null;
}

// Bar-chart shape for comparing one per-genre average across
// genres (Instagram: avgViews; blog: perArticle): [{ name, value,
// valueLabel, pct }] sorted by the value, biggest first, with pct
// scaled so the biggest bar is 100. Rows whose average is missing
// keep an empty bar (pct 0, label "—") and sink to the end. The
// name comes from the row's `genre` (Instagram) or `tag` (blog).
export function genreAverageBars(rows, valueKey) {
  const list = Array.isArray(rows) ? rows : [];
  const entries = list.map((row) => ({
    name: row ? (row.genre ?? row.tag ?? "") : "",
    value: row && isNum(row[valueKey]) ? row[valueKey] : null,
  }));
  const max = entries.reduce(
    (biggest, entry) => (entry.value !== null && entry.value > biggest ? entry.value : biggest),
    0,
  );
  return entries
    .map((entry) => ({
      ...entry,
      valueLabel: formatCount(entry.value),
      pct:
        entry.value !== null && max > 0
          ? Math.round((entry.value / max) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
}

// Sort genre-stat rows (either flavour: Instagram rows keyed by
// `genre`, blog rows keyed by `tag`) by one column. The "top"
// column sorts by the top entry's view count. Missing values
// always sink to the bottom, whichever direction is chosen —
// the same rule sortMedia uses for the per-post table. Returns
// a new array.
export function sortGenreRows(rows, key = "totalViews", dir = "desc") {
  if (!Array.isArray(rows)) {
    return [];
  }
  const sign = dir === "asc" ? 1 : -1;
  const valueOf = (row) => {
    if (!row) {
      return null;
    }
    const value = key === "top" ? row.top?.views : row[key];
    return isNum(value) || typeof value === "string" ? value : null;
  };
  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === null && bv === null) {
      return 0;
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }
    const cmp =
      isNum(av) && isNum(bv) ? av - bv : String(av).localeCompare(String(bv));
    return cmp * sign;
  });
}

// Per-genre rollup of a media list:
// [{ genre, count, totalViews, avgViews, saveRate, likeRate, top }]
// sorted by total views, biggest first; genres with no posts are
// omitted. Definitions, chosen so null-heavy snapshots stay sane:
// - count counts every post in the genre, metrics or not.
// - totalViews sums the posts that reported a view count, and
//   avgViews averages over those posts only (null when none did).
// - saveRate / likeRate average the per-post rates (saves/views,
//   likes/views) over the posts with a positive view count and a
//   numeric numerator; null when no post qualifies.
// - top is the most-viewed post of the genre ({ title, views,
//   permalink }), null when no post reported views.
export function genreStatsForMedia(media, rules = INSTAGRAM_GENRE_RULES) {
  const list = Array.isArray(media) ? media : [];
  const groups = new Map();
  for (const post of list) {
    if (!post) {
      continue;
    }
    const genre = classifyCaption(post.caption, rules);
    let group = groups.get(genre);
    if (!group) {
      group = {
        genre,
        count: 0,
        totalViews: 0,
        viewsCount: 0,
        saveRates: [],
        likeRates: [],
        topPost: null,
      };
      groups.set(genre, group);
    }
    group.count += 1;
    if (isNum(post.views)) {
      group.totalViews += post.views;
      group.viewsCount += 1;
      if (post.views > 0) {
        if (isNum(post.saves)) {
          group.saveRates.push(post.saves / post.views);
        }
        if (isNum(post.likes)) {
          group.likeRates.push(post.likes / post.views);
        }
      }
      if (!group.topPost || post.views > group.topPost.views) {
        group.topPost = post;
      }
    }
  }
  const average = (values) =>
    values.length
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : null;
  return [...groups.values()]
    .map((group) => ({
      genre: group.genre,
      count: group.count,
      totalViews: group.totalViews,
      avgViews: group.viewsCount
        ? Math.round(group.totalViews / group.viewsCount)
        : null,
      saveRate: average(group.saveRates),
      likeRate: average(group.likeRates),
      top: group.topPost
        ? {
            title:
              captionHead(group.topPost.caption) ||
              mediaTypeLabel(group.topPost.type),
            views: group.topPost.views,
            permalink: group.topPost.permalink ?? null,
          }
        : null,
    }))
    .sort((a, b) => b.totalViews - a.totalViews || b.count - a.count);
}

// The rollup over the snapshot's full recent-media list; the tab
// narrows the list with filterMediaByPeriod first when a period
// window is selected.
export function instagramGenreStats(detail, rules = INSTAGRAM_GENRE_RULES) {
  const media = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  return genreStatsForMedia(media, rules);
}
