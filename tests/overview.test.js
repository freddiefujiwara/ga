import { describe, expect, it } from "vitest";
import {
  historyDailyDelta,
  formatDelta,
  overviewKpis,
  topMedia,
  topPostsByChannel,
} from "../src/api.js";

// A snapshot in the sns_detail contract shape (same numbers as the
// DETAIL fixture in sns.test.js, trimmed to what the overview reads).
const DETAIL = {
  ok: true,
  collected_at: "2026-11-08T19:25:52.088Z",
  youtube: { subscribers: 9, total_views: 12345, video_count: 21 },
  instagram: {
    freddiefujiwara: 1991,
    media_count: 2420,
    views_30d: 576645,
    follows_30d: 120,
    unfollows_30d: null,
    recent_media: [
      { id: "a", type: "REELS", caption: "再生数の少ない投稿", permalink: "https://www.instagram.com/reel/a/", views: 300 },
      { id: "b", type: "REELS", caption: "一番見られた投稿", permalink: "https://www.instagram.com/reel/b/", views: 9000 },
      { id: "c", type: "IMAGE", caption: "真ん中の投稿", permalink: "https://www.instagram.com/p/c/", views: 1500 },
      { id: "d", type: "REELS", caption: "再生数が取れていない投稿", permalink: "https://www.instagram.com/reel/d/", views: null },
      { id: "e", type: "REELS", caption: "二番目の投稿", permalink: "https://www.instagram.com/reel/e/", views: 5000 },
      { id: "f", type: "REELS", caption: "六番目の投稿", permalink: "https://www.instagram.com/reel/f/", views: 100 },
    ],
  },
  threads: { followers: null },
};

// Two history collections on consecutive JST calendar days
// (2026-11-08 and 2026-11-09), so the day-over-day change can be
// computed; unfollows_30d only has a number on the first day, so
// no delta can be computed for it.
const HISTORY2 = [
  {
    collected_at: "2026-11-07T19:00:00.000Z",
    total_followers: 2000,
    ig_followers: 1991,
    youtube_subscribers: 9,
    views_30d: 570000,
    media_count: 2419,
    follows_30d: 118,
    unfollows_30d: 40,
  },
  {
    collected_at: "2026-11-09T01:00:00.000Z",
    total_followers: 2005,
    ig_followers: 1995,
    youtube_subscribers: 10,
    views_30d: 576645,
    media_count: 2420,
    follows_30d: 120,
    unfollows_30d: null,
  },
];

const GA_TOTALS = { views: 12345, users: 678, sessions: 901 };

describe("historyDailyDelta", () => {
  it("compares the latest day with the previous calendar day", () => {
    expect(historyDailyDelta(HISTORY2, "total_followers")).toEqual({
      latest: 2005,
      previous: 2000,
      delta: 5,
    });
    expect(historyDailyDelta(HISTORY2, "views_30d")).toEqual({
      latest: 576645,
      previous: 570000,
      delta: 6645,
    });
  });

  it("sorts out-of-order rows before comparing", () => {
    const shuffled = [HISTORY2[1], HISTORY2[0]];
    expect(historyDailyDelta(shuffled, "ig_followers")).toEqual({
      latest: 1995,
      previous: 1991,
      delta: 4,
    });
  });

  it("takes each day's last collection as that day's value", () => {
    const rows = [
      { collected_at: "2026-11-07T15:00:00.000Z", media_count: 100 },
      { collected_at: "2026-11-07T21:00:00.000Z", media_count: 120 },
      { collected_at: "2026-11-08T15:00:00.000Z", media_count: 150 },
      { collected_at: "2026-11-08T21:00:00.000Z", media_count: 140 },
    ];
    // JST days 2026-11-08 (…, 120) and 2026-11-09 (…, 140).
    expect(historyDailyDelta(rows, "media_count")).toEqual({
      latest: 140,
      previous: 120,
      delta: 20,
    });
  });

  it("skips collections where the metric is missing", () => {
    const rows = [
      { collected_at: "2026-11-08T13:00:00.000Z", media_count: 2418 },
      { collected_at: "2026-11-08T19:00:00.000Z", media_count: null },
      { collected_at: "2026-11-09T01:00:00.000Z", media_count: 2420 },
    ];
    expect(historyDailyDelta(rows, "media_count")).toEqual({
      latest: 2420,
      previous: 2418,
      delta: 2,
    });
  });

  it("is null when every point falls on a single day", () => {
    // Both collections are on JST 2026-11-09, so there is no
    // previous day to compare against yet.
    const rows = [
      { collected_at: "2026-11-08T19:00:00.000Z", total_followers: 2000 },
      { collected_at: "2026-11-09T01:00:00.000Z", total_followers: 2005 },
    ];
    expect(historyDailyDelta(rows, "total_followers")).toBeNull();
  });

  it("is null when the previous calendar day has no point", () => {
    // Points on JST 2026-11-07 and 2026-11-09, nothing on the
    // day in between: no day-over-day comparison is offered
    // rather than silently comparing across the gap.
    const rows = [
      { collected_at: "2026-11-06T19:00:00.000Z", total_followers: 1990 },
      { collected_at: "2026-11-08T19:00:00.000Z", total_followers: 2005 },
    ];
    expect(historyDailyDelta(rows, "total_followers")).toBeNull();
  });

  it("is null with fewer than two numeric points", () => {
    expect(historyDailyDelta([HISTORY2[0]], "total_followers")).toBeNull();
    // unfollows_30d has a number on only one of the two days.
    expect(historyDailyDelta(HISTORY2, "unfollows_30d")).toBeNull();
    expect(historyDailyDelta(HISTORY2, "no_such_key")).toBeNull();
    expect(historyDailyDelta([], "total_followers")).toBeNull();
    expect(historyDailyDelta(null, "total_followers")).toBeNull();
    expect(historyDailyDelta("nope", "total_followers")).toBeNull();
  });
});

describe("formatDelta", () => {
  it("signs the change, followers style", () => {
    expect(formatDelta(5)).toBe("+5");
    expect(formatDelta(6645)).toBe("+6,645");
    expect(formatDelta(-3)).toBe("-3");
    expect(formatDelta(-1200)).toBe("-1,200");
    expect(formatDelta(0)).toBe("±0");
  });

  it("is null for non-numbers", () => {
    expect(formatDelta(null)).toBeNull();
    expect(formatDelta(undefined)).toBeNull();
    expect(formatDelta(NaN)).toBeNull();
    expect(formatDelta("5")).toBeNull();
  });
});

describe("overviewKpis", () => {
  it("shows every KPI with the day-over-day change", () => {
    const cards = Object.fromEntries(
      overviewKpis(DETAIL, GA_TOTALS, HISTORY2).map((c) => [c.label, c]),
    );
    expect(cards["SNS延べフォロワー数"]).toEqual({ label: "SNS延べフォロワー数", value: "2,000", delta: "+5", public: true });
    expect(cards["Instagram フォロワー"]).toEqual({ label: "Instagram フォロワー", value: "1,991", delta: "+4", public: true });
    expect(cards["YouTube 登録者"]).toEqual({ label: "YouTube 登録者", value: "9", delta: "+1", public: true });
    expect(cards["再生回数（過去30日）"]).toEqual({ label: "再生回数（過去30日）", value: "576,645", delta: "+6,645" });
    expect(cards["投稿数"]).toEqual({ label: "投稿数", value: "2,420", delta: "+1", public: true });
    expect(cards["フォロー（過去30日）"]).toEqual({ label: "フォロー（過去30日）", value: "120", delta: "+2" });
    // The snapshot value is null and the history has only one
    // numeric point, so neither a value nor a delta is available.
    expect(cards["フォロー解除（過去30日）"]).toEqual({ label: "フォロー解除（過去30日）", value: "—", delta: null, invert: true });
  });

  it("flags only the unfollows card for inverted delta colours", () => {
    const cards = overviewKpis(DETAIL, GA_TOTALS, HISTORY2);
    for (const card of cards) {
      if (card.label === "フォロー解除（過去30日）") {
        expect(card.invert).toBe(true);
      } else {
        expect(card.invert).toBeUndefined();
      }
    }
    // With two numeric unfollow points the delta itself is a
    // plain signed change; the inversion lives in the flag, so
    // an increase still reads "+5" and the renderer colours it
    // red.
    const rows = [
      { collected_at: "2026-11-07T19:00:00.000Z", unfollows_30d: 40 },
      { collected_at: "2026-11-09T01:00:00.000Z", unfollows_30d: 45 },
    ];
    const detail = {
      ...DETAIL,
      instagram: { ...DETAIL.instagram, unfollows_30d: 45 },
    };
    const card = overviewKpis(detail, GA_TOTALS, rows).find(
      (c) => c.label === "フォロー解除（過去30日）",
    );
    expect(card).toEqual({
      label: "フォロー解除（過去30日）",
      value: "45",
      delta: "+5",
      invert: true,
    });
  });

  it("flags the already-published figures public for masking exemption", () => {
    // The public set is exactly what the top page already
    // publishes: the follower total and breakdown and the
    // Instagram post count. The blog's two cards are 28-day GA
    // rollups no public page prints, so they stay unflagged
    // with the analysis cards (30-day views, follows,
    // unfollows) — and the day-over-day deltas ride separately
    // and stay masked too.
    const cards = overviewKpis(DETAIL, GA_TOTALS, HISTORY2);
    const publicLabels = cards
      .filter((c) => c.public === true)
      .map((c) => c.label);
    expect(publicLabels).toEqual([
      "SNS延べフォロワー数",
      "Instagram フォロワー",
      "YouTube 登録者",
      "投稿数",
    ]);
  });

  it("blog cards come from the GA totals and never carry a delta", () => {
    const cards = Object.fromEntries(
      overviewKpis(DETAIL, GA_TOTALS, HISTORY2).map((c) => [c.label, c]),
    );
    expect(cards["ブログ 表示回数（直近28日）"]).toEqual({
      label: "ブログ 表示回数（直近28日）",
      value: "12,345",
      delta: null,
    });
    expect(cards["ブログ ユーザー（直近28日）"]).toEqual({
      label: "ブログ ユーザー（直近28日）",
      value: "678",
      delta: null,
    });
  });

  it("omits every delta when the history has a single point", () => {
    const cards = overviewKpis(DETAIL, GA_TOTALS, [HISTORY2[0]]);
    expect(cards).toHaveLength(9);
    expect(cards.every((c) => c.delta === null)).toBe(true);
    // The values themselves still come from the snapshot.
    expect(cards[0]).toMatchObject({ label: "SNS延べフォロワー数", value: "2,000" });
  });

  it("tolerates missing sources entirely", () => {
    const cards = overviewKpis(null, null, null);
    expect(cards).toHaveLength(9);
    expect(cards.every((c) => c.value === "—" && c.delta === null)).toBe(true);
    const noGa = Object.fromEntries(
      overviewKpis(DETAIL, null, HISTORY2).map((c) => [c.label, c]),
    );
    expect(noGa["ブログ 表示回数（直近28日）"].value).toBe("—");
    expect(noGa["SNS延べフォロワー数"].delta).toBe("+5");
  });
});

describe("topPostsByChannel", () => {
  const FULL = {
    ...DETAIL,
    youtube: {
      subscribers: 9,
      recent_videos: [
        { id: "v1", title: "小さい動画", views: 10, url: "https://www.youtube.com/watch?v=v1" },
        { id: "v2", title: "大きい動画", views: 800, url: "https://www.youtube.com/watch?v=v2" },
        { id: "v3", title: "中くらいの動画", views: 300, url: "https://www.youtube.com/watch?v=v3" },
        { id: "v4", title: "四番目の動画", views: 50, url: "https://www.youtube.com/watch?v=v4" },
      ],
    },
    threads: {
      followers: 252,
      recent_posts: [
        { id: "t1", text: "表示の少ない投稿", views: 20, permalink: "https://www.threads.net/t1" },
        { id: "t2", text: "表示の多い投稿", views: 900, permalink: "https://www.threads.net/t2" },
      ],
    },
    x: {
      followers: 321,
      recent_posts: [
        { id: "x1", text: "表示の多いポスト", views: 700, url: "https://x.com/i/web/status/x1" },
        { id: "x2", text: "リンクなしポスト", views: 100, url: null },
      ],
    },
  };
  const BLOG_TOP = [
    { label: "一番読まれた記事", href: "https://freddiefujiwara.com/blog/a", views: 400 },
    { label: "二番目の記事", href: "https://freddiefujiwara.com/blog/b", views: 200 },
    { label: "三番目の記事", href: "https://freddiefujiwara.com/blog/c", views: 90 },
    { label: "四番目の記事", href: "https://freddiefujiwara.com/blog/d", views: 10 },
  ];

  it("lists every channel with its own metric name, three items each", () => {
    const sections = topPostsByChannel(FULL, BLOG_TOP);
    expect(sections.map((s) => [s.channel, s.metric])).toEqual([
      ["Instagram", "再生回数"],
      ["YouTube", "再生回数"],
      ["Threads", "表示回数"],
      ["X", "表示回数"],
      ["ブログ", "表示回数"],
    ]);
    const byChannel = Object.fromEntries(
      sections.map((s) => [s.channel, s.items]),
    );
    expect(byChannel["Instagram"].map((i) => i.value)).toEqual([9000, 5000, 1500]);
    expect(byChannel["Instagram"][0]).toEqual({
      label: "一番見られた投稿",
      href: "https://www.instagram.com/reel/b/",
      value: 9000,
    });
    expect(byChannel["YouTube"].map((i) => i.label)).toEqual([
      "大きい動画",
      "中くらいの動画",
      "四番目の動画",
    ]);
    expect(byChannel["Threads"].map((i) => i.value)).toEqual([900, 20]);
    expect(byChannel["X"][0]).toEqual({
      label: "表示の多いポスト",
      href: "https://x.com/i/web/status/x1",
      value: 700,
    });
    // A post without a URL keeps a null href (rendered unlinked).
    expect(byChannel["X"][1].href).toBeNull();
    // The blog keeps the caller's ranking and stops at three.
    expect(byChannel["ブログ"].map((i) => i.value)).toEqual([400, 200, 90]);
    expect(byChannel["ブログ"][0].href).toBe(
      "https://freddiefujiwara.com/blog/a",
    );
    // No channel's items are flagged public: the per-post /
    // per-article counts are platform and GA figures no public
    // page prints with these values (the blog's are last-28-day
    // rollups), so masking treats every row alike.
    for (const channel of ["Instagram", "YouTube", "Threads", "X", "ブログ"]) {
      expect(byChannel[channel].every((i) => i.public === undefined)).toBe(
        true,
      );
    }
  });

  it("tolerates missing data with empty item lists", () => {
    const sections = topPostsByChannel(null);
    expect(sections).toHaveLength(5);
    expect(sections.every((s) => s.items.length === 0)).toBe(true);
    expect(topPostsByChannel(FULL, "nope")[4].items).toEqual([]);
  });
});

describe("topMedia", () => {
  it("returns the five most-watched posts, most views first", () => {
    const top = topMedia(DETAIL);
    expect(top.map((m) => m.id)).toEqual(["b", "e", "c", "a", "f"]);
    expect(top[0]).toMatchObject({
      views: 9000,
      permalink: "https://www.instagram.com/reel/b/",
    });
  });

  it("respects the limit and sinks view-less posts", () => {
    expect(topMedia(DETAIL, 3).map((m) => m.id)).toEqual(["b", "e", "c"]);
    const all = topMedia(DETAIL, 10);
    expect(all[all.length - 1].id).toBe("d");
  });

  it("tolerates missing data", () => {
    expect(topMedia(null)).toEqual([]);
    expect(topMedia({})).toEqual([]);
    expect(topMedia({ instagram: { recent_media: "nope" } })).toEqual([]);
  });
});
