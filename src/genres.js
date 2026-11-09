// Genre performance shaping: pure helpers, unit-tested.
//
// Instagram: every recent post is bucketed into one genre by
// keyword rules over its caption (hashtags included, since the
// caption carries them). The rules live in one ordered array so
// the owner can retune them in a single place: the first rule
// whose keywords appear in the caption wins, and a caption that
// matches nothing lands in the fallback genre.
//
// Classification runs in two stages. Stage 1 looks at the
// caption's hashtags only: a hashtag is the author's own
// declaration of what the post is, so it outranks every word in
// the body. Stage 2 is the keyword rules below, the fallback
// for the older posts that carry no genre hashtag.
//
// The stage-2 priority order is "the shop (destination) wins" —
// the owner's call, so a post about riding a bicycle TO a shop
// is counted as that shop's genre, not as cycling:
// - Shop words for concrete dishes/venues (カレー, ラーメン,
//   ランチ, …) sit BEFORE the cycling rule: a ride to a curry
//   shop is グルメ. The cafe/sweets words (カフェ, ケーキ,
//   モーニング, …) are in that same グルメ rule: the old
//   カフェ・スイーツ genre was merged into グルメ, and its
//   stage-1 hashtag #川口カフェ maps to グルメ as well.
// - The generic food words (グルメ, 料理, 食べ歩き) sit AFTER
//   cycling: a long ride whose caption merely mentions eating
//   something at the destination (a fair, say) stays サイクリング
//   instead of being dragged into グルメ.
// - 街歩き・スポット is split in two. The early rule carries the
//   outing words themselves (散歩, まつり, トランポリン, …);
//   places that often appear only in passing — the park a ride
//   starts from, a museum along the route — sit in the late rule,
//   after cycling, so they cannot mis-bucket a ride. A post that
//   introduces a museum still lands in 街歩き・スポット via the
//   散歩-style hashtags in its caption tail.
// - Two rules may share one genre name on purpose: the rollup
//   (genreStatsForMedia) groups by genre name, so the split
//   rules add up into a single row.

import { captionHead, formatCount, mediaTypeLabel } from "./api.js";

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

export const INSTAGRAM_FALLBACK_GENRE = "日常・その他";

// Stage 1: hashtag → genre, in priority order. Matching is per
// hashtag and exact (case-insensitive): the bare word in the
// body does not count, and a longer tag that merely starts with
// one of these (#川口グルメ巡り) does not match either. 音楽
// comes first because a song post routinely carries other tags
// alongside #Suno.
export const INSTAGRAM_HASHTAG_GENRES = [
  { genre: "音楽", tags: ["suno"] },
  // #川口カフェ maps to グルメ too: the former カフェ・スイーツ
  // genre was merged into グルメ, so the tag stays on as a
  // グルメ signal rather than being dropped.
  { genre: "グルメ", tags: ["川口グルメ", "川口カフェ"] },
  { genre: "街歩き・スポット", tags: ["川口散歩"] },
  { genre: "サイクリング", tags: ["サイクリング", "川口サイクリング"] },
];

// The hashtags of a caption, lowercased, without the "#".
const captionHashtags = (caption) => {
  const found = new Set();
  for (const match of String(caption ?? "").matchAll(/#([^\s#]+)/g)) {
    found.add(match[1].toLowerCase());
  }
  return found;
};

export const INSTAGRAM_GENRE_RULES = [
  {
    genre: "音楽",
    keywords: ["音楽", "Suno", "リリック", "歌", "曲"],
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
    // グルメ (venues/dishes): before cycling, so a ride whose
    // destination is a shop counts as the shop's genre. The
    // cafe/sweets words live in this rule too — the former
    // カフェ・スイーツ genre was merged into グルメ (owner's
    // call), so no separate cafe rule remains.
    genre: "グルメ",
    keywords: [
      "ランチ",
      "ディナー",
      "食堂",
      "レストラン",
      "居酒屋",
      "ラーメン",
      "カレー",
      "寿司",
      "焼肉",
      "定食",
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
    // 街歩き・スポット (outings): the outing words themselves.
    // まち歩き/まつり cover the hiragana spellings, トランポリン
    // the trampoline-park posts.
    genre: "街歩き・スポット",
    keywords: [
      "街歩き",
      "まち歩き",
      "散歩",
      "祭り",
      "まつり",
      "花火",
      "神社",
      "お寺",
      "銭湯",
      "温泉",
      "スポット",
      "トランポリン",
    ],
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
    // グルメ (generic): after cycling, so a ride that only
    // mentions food in passing is not dragged into グルメ.
    genre: "グルメ",
    keywords: ["グルメ", "料理", "食べ歩き"],
  },
  {
    // 街歩き・スポット (places): after cycling — these places
    // often appear only in passing (the park a ride starts
    // from, a museum along the route).
    genre: "街歩き・スポット",
    keywords: ["公園", "商店街", "市場", "博物館", "美術館"],
  },
];

// The genre of one post. Stage 1: an exact hashtag match from
// INSTAGRAM_HASHTAG_GENRES wins outright. Stage 2: the first
// rule (in array order) with a keyword appearing in the caption.
// Keyword matching is a plain substring test, case-insensitive
// so the latin keywords ("Suno", "HELLO CYCLING") work in any
// casing. A missing caption matches nothing and falls back like
// any other unmatched caption.
export function classifyCaption(caption, rules = INSTAGRAM_GENRE_RULES) {
  const hashtags = captionHashtags(caption);
  for (const entry of INSTAGRAM_HASHTAG_GENRES) {
    if (entry.tags.some((tag) => hashtags.has(tag))) {
      return entry.genre;
    }
  }
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

// The genre filter of the per-post table: one entry per genre
// that actually has posts, in the rollup's order (total views,
// biggest first) so the filter buttons line up with the genre
// section above them: [{ genre, count }]. Genres with no posts
// are omitted — a button that shows nothing is dead weight.
export function mediaGenreOptions(media, rules = INSTAGRAM_GENRE_RULES) {
  return genreStatsForMedia(media, rules).map((row) => ({
    genre: row.genre,
    count: row.count,
  }));
}

// The posts of one genre for the per-post table's genre filter.
// A null/undefined genre means "no filter" (the すべて button):
// every usable post comes back. Otherwise a post stays only
// when its classified genre equals the requested one exactly —
// the genre names are the classifier's own output, so the
// buttons and the filter can never drift apart. Null entries
// are skipped either way (the rollup skips them too).
export function filterMediaByGenre(media, genre, rules = INSTAGRAM_GENRE_RULES) {
  const list = (Array.isArray(media) ? media : []).filter((post) => post);
  if (genre === null || genre === undefined) {
    return list;
  }
  return list.filter((post) => classifyCaption(post.caption, rules) === genre);
}

// The genre filter of the blog tab's per-article table: one
// entry per tag that actually has articles, in the blog genre
// rollup's order (total views, biggest first) so the filter
// buttons line up with the genre section above them:
// [{ genre, count }]. The grouping mirrors blogGenreStats — an
// article with several tags counts once under each of them —
// so the counts on the buttons always match the genre table.
// Articles whose tags list is empty (no tag map) contribute
// nothing: no button is offered for an unknown genre.
export function articleGenreOptions(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const groups = new Map();
  for (const row of list) {
    if (!row || !Array.isArray(row.tags)) {
      continue;
    }
    for (const tag of row.tags) {
      let group = groups.get(tag);
      if (!group) {
        group = { genre: tag, count: 0, totalViews: 0 };
        groups.set(tag, group);
      }
      group.count += 1;
      group.totalViews += isNum(row.views) ? row.views : 0;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.totalViews - a.totalViews || b.count - a.count)
    .map(({ genre, count }) => ({ genre, count }));
}

// The articles of one genre for the per-article table's genre
// filter, the blog counterpart of filterMediaByGenre. A
// null/undefined genre means "no filter" (the すべて button):
// every usable row comes back. Otherwise a row stays when its
// tag list contains the genre — an article with several tags
// appears under each of its genres' filters, the same counting
// the blog genre rollup states in its note. Null entries are
// skipped either way.
export function filterArticlesByGenre(rows, genre) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row);
  if (genre === null || genre === undefined) {
    return list;
  }
  return list.filter(
    (row) => Array.isArray(row.tags) && row.tags.includes(genre),
  );
}
