import { describe, expect, it } from "vitest";
import { historyDelta, formatDelta, overviewKpis, topMedia } from "../src/api.js";

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

// Two history collections; unfollows_30d only has a number in the
// first one, so no delta can be computed for it.
const HISTORY2 = [
  {
    collected_at: "2026-11-08T19:00:00.000Z",
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

describe("historyDelta", () => {
  it("compares the two most recent numeric points", () => {
    expect(historyDelta(HISTORY2, "total_followers")).toEqual({
      latest: 2005,
      previous: 2000,
      delta: 5,
    });
    expect(historyDelta(HISTORY2, "views_30d")).toEqual({
      latest: 576645,
      previous: 570000,
      delta: 6645,
    });
  });

  it("sorts out-of-order rows before comparing", () => {
    const shuffled = [HISTORY2[1], HISTORY2[0]];
    expect(historyDelta(shuffled, "ig_followers")).toEqual({
      latest: 1995,
      previous: 1991,
      delta: 4,
    });
  });

  it("skips collections where the metric is missing", () => {
    const rows = [
      { collected_at: "2026-11-08T13:00:00.000Z", media_count: 2418 },
      { collected_at: "2026-11-08T19:00:00.000Z", media_count: null },
      { collected_at: "2026-11-09T01:00:00.000Z", media_count: 2420 },
    ];
    expect(historyDelta(rows, "media_count")).toEqual({
      latest: 2420,
      previous: 2418,
      delta: 2,
    });
  });

  it("is null with fewer than two numeric points", () => {
    expect(historyDelta([HISTORY2[0]], "total_followers")).toBeNull();
    // unfollows_30d has a number in only one of the two rows.
    expect(historyDelta(HISTORY2, "unfollows_30d")).toBeNull();
    expect(historyDelta(HISTORY2, "no_such_key")).toBeNull();
    expect(historyDelta([], "total_followers")).toBeNull();
    expect(historyDelta(null, "total_followers")).toBeNull();
    expect(historyDelta("nope", "total_followers")).toBeNull();
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
  it("shows every KPI with the change since the previous collection", () => {
    const cards = Object.fromEntries(
      overviewKpis(DETAIL, GA_TOTALS, HISTORY2).map((c) => [c.label, c]),
    );
    expect(cards["SNS延べフォロワー数"]).toEqual({ label: "SNS延べフォロワー数", value: "2,000", delta: "+5" });
    expect(cards["Instagram フォロワー"]).toEqual({ label: "Instagram フォロワー", value: "1,991", delta: "+4" });
    expect(cards["YouTube 登録者"]).toEqual({ label: "YouTube 登録者", value: "9", delta: "+1" });
    expect(cards["再生回数（過去30日）"]).toEqual({ label: "再生回数（過去30日）", value: "576,645", delta: "+6,645" });
    expect(cards["投稿数"]).toEqual({ label: "投稿数", value: "2,420", delta: "+1" });
    expect(cards["フォロー（過去30日）"]).toEqual({ label: "フォロー（過去30日）", value: "120", delta: "+2" });
    // The snapshot value is null and the history has only one
    // numeric point, so neither a value nor a delta is available.
    expect(cards["フォロー解除（過去30日）"]).toEqual({ label: "フォロー解除（過去30日）", value: "—", delta: null });
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
