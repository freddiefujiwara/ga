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

import { captionHead, mediaTypeLabel } from "./api.js";

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

// Per-genre rollup of the recent-media snapshot:
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
export function instagramGenreStats(detail, rules = INSTAGRAM_GENRE_RULES) {
  const media = Array.isArray(detail?.instagram?.recent_media)
    ? detail.instagram.recent_media
    : [];
  const groups = new Map();
  for (const post of media) {
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
