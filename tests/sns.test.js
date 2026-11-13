import { describe, expect, it, vi } from "vitest";
import {
  fetchSnsDetail,
  fetchSnsHistory,
  snsHistoryRows,
  snsHistorySeries,
  instagramTrendSeries,
  dailyLatestSeries,
  threadsHistorySeries,
  threadsTotals,
  threadsInteractions,
  threadsPosts,
  threadsErrorNotes,
  jstDateKey,
  formatCount,
  formatPercent,
  formatSeconds,
  formatJstDateTime,
  formatJstDate,
  snsTotalFollowers,
  snsOverview,
  overviewKpis,
  snsInteractions,
  ageGenderLabel,
  demographicsBars,
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
  youtubeHistorySeries,
  articleViewStats,
  snsErrorNotes,
  instagramDailyFollows,
  instagramDailyFollowsError,
  followChartDays,
} from "../src/api.js";

const ENDPOINT = "https://example.com/exec";
const jsonResponse = (obj) => ({ json: async () => obj });

// A snapshot in the sns_detail contract shape, with nulls mixed in
// the way a partial collection produces them.
const DETAIL = {
  ok: true,
  action: "sns_detail",
  collected_at: "2026-11-08T19:25:52.088Z",
  youtube: {
    subscribers: 9,
    total_views: 12345,
    video_count: 21,
    recent_videos: [
      {
        id: "abc",
        title: "川口の歌",
        published_at: "2026-11-08T04:00:00Z",
        views: 500,
        likes: 30,
        comments: 4,
        url: "https://www.youtube.com/watch?v=abc",
      },
    ],
  },
  instagram: {
    freddiefujiwara: 1991,
    anemone_cancer: 59,
    media_count: 2420,
    views_30d: 576645,
    non_follower_pct: 94.5,
    reach_30d: 210000,
    accounts_engaged_30d: 8200,
    interactions_30d: { total: 9100, likes: 7000, comments: 300, shares: 400, saves: 1400 },
    profile_links_taps_30d: 46,
    follows_30d: 120,
    unfollows_30d: null,
    demographics: {
      age_gender: [
        { key: "F.25-34", value: 400 },
        { key: "M.35-44", value: 800 },
        { key: "F.35-44", value: null },
        { key: "M.25-34", value: 200 },
      ],
      top_cities: [
        { key: "川口市", value: 300 },
        { key: "さいたま市", value: 500 },
      ],
      top_countries: [{ key: "JP", value: 1800 }],
    },
    recent_media: [
      {
        id: "m1",
        type: "REELS",
        posted_at: "2026-11-07T01:00:00Z",
        caption: "短いキャプション",
        permalink: "https://www.instagram.com/reel/m1/",
        views: 100,
        reach: 90,
        likes: 10,
        comments: 1,
        shares: 2,
        saves: 3,
        avg_watch_sec: 8.25,
        total_watch_sec: 825,
      },
      {
        id: "m2",
        type: "IMAGE",
        posted_at: "2026-11-08T01:00:00Z",
        caption: null,
        permalink: "https://www.instagram.com/p/m2/",
        views: null,
        reach: null,
        likes: 5,
        comments: 0,
        shares: 0,
        saves: 1,
        avg_watch_sec: null,
        total_watch_sec: null,
      },
    ],
    insights_error: null,
    detail_error: null,
    media_error: null,
    daily_follows: [
      { date: "2026-11-06", follows: 4, unfollows: 1 },
      { date: "2026-11-07", follows: 12, unfollows: null },
      { date: "2026-11-08", follows: null, unfollows: 2 },
    ],
    daily_follows_error: null,
  },
  threads: { followers: null },
};

describe("fetchSnsDetail", () => {
  it("requests the sns_detail action with the id token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchSnsDetail(ENDPOINT, { idToken: "idt" }, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("sns_detail");
    expect(url.searchParams.get("id_token")).toBe("idt");
  });

  it("requests the sns_detail action with a share token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchSnsDetail(ENDPOINT, { shareToken: "tok" }, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("sns_detail");
    expect(url.searchParams.get("share_token")).toBe("tok");
    expect(url.searchParams.get("id_token")).toBeNull();
  });
});

describe("fetchSnsHistory", () => {
  it("requests the sns_history action with the id token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, rows: [] }));
    const response = await fetchSnsHistory(ENDPOINT, { idToken: "idt" }, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("sns_history");
    expect(url.searchParams.get("id_token")).toBe("idt");
    expect(response.rows).toEqual([]);
  });

  it("requests the sns_history action with a share token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, rows: [] }));
    await fetchSnsHistory(ENDPOINT, { shareToken: "tok" }, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("sns_history");
    expect(url.searchParams.get("share_token")).toBe("tok");
    expect(url.searchParams.get("id_token")).toBeNull();
  });
});

describe("sns history series", () => {
  // Rows as the sns_history action serves them: ascending, with
  // nulls where a collection missed a number. The first row is
  // 2026/11/8 19:00 UTC = 2026/11/9 04:00 JST.
  const ROWS = [
    {
      collected_at: "2026-11-08T19:00:00.000Z",
      total_followers: 2000,
      views_30d: 576645,
      media_count: 2420,
    },
    {
      collected_at: "2026-11-09T01:00:00.000Z",
      total_followers: 2005,
      views_30d: null,
      media_count: 2421,
    },
    {
      collected_at: "2026-11-09T07:00:00.000Z",
      total_followers: null,
      views_30d: 580000,
      media_count: 2421,
    },
  ];

  it("snsHistoryRows passes rows through and tolerates junk", () => {
    expect(snsHistoryRows({ ok: true, rows: ROWS })).toEqual(ROWS);
    expect(snsHistoryRows(null)).toEqual([]);
    expect(snsHistoryRows({ ok: false, rows: ROWS })).toEqual([]);
    expect(snsHistoryRows({ ok: true })).toEqual([]);
    expect(snsHistoryRows({ ok: true, rows: "nope" })).toEqual([]);
  });

  it("jstDateKey takes the JST calendar day", () => {
    expect(jstDateKey("2026-11-08T19:25:52.088Z")).toBe("20261109");
    expect(jstDateKey("2026-11-09T01:00:00.000Z")).toBe("20261109");
    expect(jstDateKey(null)).toBeNull();
    expect(jstDateKey("not-a-date")).toBeNull();
  });

  it("shapes rows into the three chart series, skipping missing values", () => {
    const series = snsHistorySeries(ROWS);
    expect(series.map((s) => s.key)).toEqual([
      "total_followers",
      "views_30d",
      "media_count",
    ]);
    const followers = series[0];
    expect(followers.label).toBe("SNS延べフォロワー数");
    // All three rows fall on the same JST day, so each series
    // collapses to that day's last value.
    expect(followers.points).toEqual([{ date: "20261109", views: 2005 }]);
    expect(followers.latest).toBe(2005);
    // The period follows the plotted points: the first and last
    // daily points both come from the 10:00 JST collection here.
    expect(followers.firstAt).toBe("2026-11-09T01:00:00.000Z");
    expect(followers.lastAt).toBe("2026-11-09T01:00:00.000Z");
    // The null in the middle row is skipped, not zero-filled.
    expect(series[1].points).toEqual([{ date: "20261109", views: 580000 }]);
    expect(series[1].latest).toBe(580000);
    expect(series[1].firstAt).toBe("2026-11-09T07:00:00.000Z");
    expect(series[1].lastAt).toBe("2026-11-09T07:00:00.000Z");
    expect(series[2].points).toEqual([{ date: "20261109", views: 2421 }]);
    expect(series[2].latest).toBe(2421);
  });

  it("sorts out-of-order rows and drops series without any number", () => {
    const shuffled = [ROWS[2], ROWS[0], ROWS[1]];
    const series = snsHistorySeries(shuffled);
    expect(series[0].points.map((p) => p.views)).toEqual([2005]);
    const onlyFollowers = snsHistorySeries([
      { collected_at: "2026-11-09T00:00:00.000Z", total_followers: 2000 },
    ]);
    expect(onlyFollowers.map((s) => s.key)).toEqual(["total_followers"]);
  });

  it("cuts the days at the JST boundary, not the UTC one", () => {
    // 16:30 UTC is already 01:30 JST the next day, and 15:30 UTC
    // is 00:30 JST: the first two rows sit on different UTC days
    // but the same JST day, the last two share a UTC day but fall
    // on different JST days.
    const series = snsHistorySeries([
      {
        collected_at: "2026-11-08T16:30:00.000Z",
        total_followers: 2000,
      },
      {
        collected_at: "2026-11-09T14:00:00.000Z",
        total_followers: 2010,
      },
      {
        collected_at: "2026-11-09T15:30:00.000Z",
        total_followers: 2020,
      },
    ]);
    expect(series[0].points).toEqual([
      { date: "20261109", views: 2010 },
      { date: "20261110", views: 2020 },
    ]);
    expect(series[0].firstAt).toBe("2026-11-09T14:00:00.000Z");
    expect(series[0].lastAt).toBe("2026-11-09T15:30:00.000Z");
  });

  it("empty or junk history yields no series (the empty state)", () => {
    expect(snsHistorySeries([])).toEqual([]);
    expect(snsHistorySeries(null)).toEqual([]);
    expect(snsHistorySeries("nope")).toEqual([]);
    expect(snsHistorySeries([{ total_followers: 2000 }])).toEqual([]);
    expect(
      snsHistorySeries([
        { collected_at: "2026-11-09T00:00:00.000Z", total_followers: null },
      ]),
    ).toEqual([]);
  });
});

describe("instagramTrendSeries", () => {
  const TREND_ROWS = [
    {
      collected_at: "2026-11-08T16:00:00.000Z",
      views_30d: 570000,
      reach_30d: 150000,
      interactions_total: 8500,
      interactions_likes: 6300,
      interactions_comments: 170,
      interactions_shares: 330,
      interactions_saves: 1190,
    },
    {
      collected_at: "2026-11-09T01:00:00.000Z",
      views_30d: 580000,
      reach_30d: null,
      interactions_total: 8600,
      interactions_likes: 6400,
      interactions_comments: 175,
      interactions_shares: 335,
      interactions_saves: 1200,
    },
  ];

  it("shapes the seven engagement series in chip order, daily-collapsed", () => {
    const series = instagramTrendSeries(TREND_ROWS);
    expect(series.map((s) => s.key)).toEqual([
      "views_30d",
      "reach_30d",
      "interactions_total",
      "interactions_likes",
      "interactions_comments",
      "interactions_saves",
      "interactions_shares",
    ]);
    expect(series.map((s) => s.label)).toEqual([
      "再生回数",
      "リーチ",
      "反応合計",
      "いいね",
      "コメント",
      "保存",
      "シェア",
    ]);
    // Both rows fall on JST 2026-11-09, so each series collapses
    // to that day's last value.
    const views = series[0];
    expect(views.points).toEqual([{ date: "20261109", views: 580000 }]);
    expect(views.latest).toBe(580000);
    expect(views.firstAt).toBe("2026-11-09T01:00:00.000Z");
    expect(views.lastAt).toBe("2026-11-09T01:00:00.000Z");
    // The null reach in the later row is skipped, so the day's
    // point is the earlier collection's value.
    expect(series[1].points).toEqual([{ date: "20261109", views: 150000 }]);
    expect(series[1].firstAt).toBe("2026-11-08T16:00:00.000Z");
    expect(series[6].latest).toBe(335);
  });

  it("drops a metric the history never carries (older GAS responses)", () => {
    const series = instagramTrendSeries([
      { collected_at: "2026-11-09T01:00:00.000Z", views_30d: 580000 },
    ]);
    expect(series.map((s) => s.key)).toEqual(["views_30d"]);
  });

  it("keeps only the newest 30 days and dates the period by the slice", () => {
    const rows = [];
    for (let d = 0; d < 35; d += 1) {
      rows.push({
        collected_at: new Date(Date.UTC(2026, 9, 10 + d)).toISOString(),
        views_30d: 1000 + d,
      });
    }
    const series = instagramTrendSeries(rows);
    expect(series).toHaveLength(1);
    expect(series[0].points).toHaveLength(30);
    expect(series[0].points[0].views).toBe(1005);
    expect(series[0].latest).toBe(1034);
    expect(series[0].firstAt).toBe(rows[5].collected_at);
    expect(series[0].lastAt).toBe(rows[34].collected_at);
  });

  it("empty or junk history yields no series (the empty state)", () => {
    expect(instagramTrendSeries([])).toEqual([]);
    expect(instagramTrendSeries(null)).toEqual([]);
    expect(instagramTrendSeries("nope")).toEqual([]);
  });
});

describe("dailyLatestSeries", () => {
  it("keeps only the last point of each day", () => {
    expect(
      dailyLatestSeries([
        { date: "20261109", views: 2000 },
        { date: "20261109", views: 2005 },
        { date: "20261109", views: 2003 },
      ]),
    ).toEqual([{ date: "20261109", views: 2003 }]);
  });

  it("keeps the ascending day order across days", () => {
    expect(
      dailyLatestSeries([
        { date: "20261108", views: 1900 },
        { date: "20261109", views: 2000 },
        { date: "20261109", views: 2005 },
        { date: "20261110", views: 2010 },
      ]),
    ).toEqual([
      { date: "20261108", views: 1900 },
      { date: "20261109", views: 2005 },
      { date: "20261110", views: 2010 },
    ]);
  });

  it("leaves a single-point day as is", () => {
    const points = [{ date: "20261109", views: 252 }];
    expect(dailyLatestSeries(points)).toEqual(points);
  });

  it("tolerates empty and junk input", () => {
    expect(dailyLatestSeries([])).toEqual([]);
    expect(dailyLatestSeries(null)).toEqual([]);
    expect(dailyLatestSeries("nope")).toEqual([]);
    expect(dailyLatestSeries([null, { views: 1 }, { date: "20261109", views: 2 }])).toEqual([
      { date: "20261109", views: 2 },
    ]);
  });
});

describe("threads tab", () => {
  // A null row from before Threads collection started, then a
  // numbered point on JST 2026-11-08 and another on JST
  // 2026-11-09, so the day-over-day change has both days.
  const THREADS_ROWS = [
    {
      collected_at: "2026-11-07T21:09:00.000Z",
      threads_followers: null,
    },
    {
      collected_at: "2026-11-07T23:46:00.000Z",
      threads_followers: 252,
    },
    {
      collected_at: "2026-11-09T05:00:00.000Z",
      threads_followers: 255,
    },
  ];

  it("threadsHistorySeries charts only the rows that carry a number", () => {
    const series = threadsHistorySeries(THREADS_ROWS);
    expect(series).toHaveLength(1);
    expect(series[0].key).toBe("threads_followers");
    expect(series[0].label).toBe("Threads フォロワー");
    // The numbered rows fall on JST 2026-11-08 and 2026-11-09,
    // one point per day.
    expect(series[0].points).toEqual([
      { date: "20261108", views: 252 },
      { date: "20261109", views: 255 },
    ]);
    expect(series[0].latest).toBe(255);
    // The period follows the plotted points: the null row before
    // Threads collection started does not stretch it.
    expect(series[0].firstAt).toBe("2026-11-07T23:46:00.000Z");
    expect(series[0].lastAt).toBe("2026-11-09T05:00:00.000Z");
  });

  it("threadsHistorySeries holds up with a single point", () => {
    const series = threadsHistorySeries([THREADS_ROWS[1]]);
    expect(series).toHaveLength(1);
    expect(series[0].points).toEqual([{ date: "20261108", views: 252 }]);
    expect(series[0].firstAt).toBe("2026-11-07T23:46:00.000Z");
    expect(series[0].lastAt).toBe("2026-11-07T23:46:00.000Z");
  });

  it("threadsHistorySeries is empty until a Threads number exists", () => {
    expect(threadsHistorySeries([THREADS_ROWS[0]])).toEqual([]);
    expect(threadsHistorySeries([])).toEqual([]);
    expect(threadsHistorySeries(null)).toEqual([]);
  });

  it("threadsTotals shows the count and both changes on one card", () => {
    const detail = { threads: { followers: 255 } };
    expect(threadsTotals(detail, THREADS_ROWS)).toEqual([
      // Two daily points a day apart: the 前日比 and the
      // window line both cover the one day between them, the
      // window naming its own span.
      {
        label: "フォロワー",
        value: "255",
        public: true,
        delta: "+3",
        window: "+3",
        windowLabel: "過去1日間",
      },
      { label: "表示回数（過去30日）", value: "—" },
      { label: "反応の合計（過去30日）", value: "—" },
    ]);
  });

  it("threadsTotals carries the 30-day account totals", () => {
    // The production shape, measured on 2026-11-09.
    const detail = {
      threads: {
        followers: 252,
        views_30d: 53342,
        interactions_30d: { total: 808, likes: 654, replies: 151, reposts: 3, quotes: 0 },
      },
    };
    expect(threadsTotals(detail, THREADS_ROWS)).toEqual([
      {
        label: "フォロワー",
        value: "252",
        public: true,
        delta: "+3",
        window: "+3",
        windowLabel: "過去1日間",
      },
      { label: "表示回数（過去30日）", value: "53,342" },
      { label: "反応の合計（過去30日）", value: "808" },
    ]);
  });

  it("threadsTotals signs drops and flats like the overview deltas", () => {
    const down = [
      { collected_at: "2026-11-07T23:46:00.000Z", threads_followers: 255 },
      { collected_at: "2026-11-09T05:00:00.000Z", threads_followers: 252 },
    ];
    expect(threadsTotals({ threads: { followers: 252 } }, down)[0].delta).toBe(
      "-3",
    );
    const flat = [
      { collected_at: "2026-11-07T23:46:00.000Z", threads_followers: 252 },
      { collected_at: "2026-11-09T05:00:00.000Z", threads_followers: 252 },
    ];
    expect(threadsTotals({ threads: { followers: 252 } }, flat)[0].delta).toBe(
      "±0",
    );
  });

  it("threadsTotals leaves the change lines off until two points exist", () => {
    const detail = { threads: { followers: 252 } };
    const bare = {
      label: "フォロワー",
      value: "252",
      public: true,
      delta: null,
      window: null,
      windowLabel: null,
    };
    expect(threadsTotals(detail, [THREADS_ROWS[1]])).toEqual([
      bare,
      { label: "表示回数（過去30日）", value: "—" },
      { label: "反応の合計（過去30日）", value: "—" },
    ]);
    expect(threadsTotals(detail, [])).toEqual([
      bare,
      { label: "表示回数（過去30日）", value: "—" },
      { label: "反応の合計（過去30日）", value: "—" },
    ]);
    expect(threadsTotals(detail, null)[0].delta).toBeNull();
  });

  it("threadsTotals tolerates a missing snapshot", () => {
    expect(threadsTotals(null, THREADS_ROWS)).toEqual([
      {
        label: "フォロワー",
        value: "—",
        public: true,
        delta: "+3",
        window: "+3",
        windowLabel: "過去1日間",
      },
      { label: "表示回数（過去30日）", value: "—" },
      { label: "反応の合計（過去30日）", value: "—" },
    ]);
    expect(threadsTotals({}, null)).toEqual([
      {
        label: "フォロワー",
        value: "—",
        public: true,
        delta: null,
        window: null,
        windowLabel: null,
      },
      { label: "表示回数（過去30日）", value: "—" },
      { label: "反応の合計（過去30日）", value: "—" },
    ]);
  });

  it("threadsInteractions splits the 30-day interactions four ways", () => {
    const detail = {
      threads: {
        interactions_30d: { total: 808, likes: 654, replies: 151, reposts: 3, quotes: 0 },
      },
    };
    expect(threadsInteractions(detail)).toEqual([
      { label: "いいね", value: "654" },
      { label: "返信", value: "151" },
      { label: "リポスト", value: "3" },
      { label: "引用", value: "0" },
    ]);
  });

  it("threadsInteractions dashes whatever is missing", () => {
    expect(
      threadsInteractions({ threads: { interactions_30d: { likes: 10 } } }),
    ).toEqual([
      { label: "いいね", value: "10" },
      { label: "返信", value: "—" },
      { label: "リポスト", value: "—" },
      { label: "引用", value: "—" },
    ]);
    expect(threadsInteractions(null)).toEqual([
      { label: "いいね", value: "—" },
      { label: "返信", value: "—" },
      { label: "リポスト", value: "—" },
      { label: "引用", value: "—" },
    ]);
    expect(threadsInteractions({})).toEqual(threadsInteractions(null));
  });

  it("threadsPosts passes the collected posts through", () => {
    const posts = [
      {
        id: "1",
        type: "TEXT_POST",
        posted_at: "2026-11-09T00:00:00.000Z",
        text: "テスト投稿",
        permalink: "https://www.threads.net/t/example",
        views: 120,
        likes: 4,
        replies: 1,
        reposts: 0,
        quotes: null,
      },
    ];
    expect(threadsPosts({ threads: { recent_posts: posts } })).toEqual(posts);
  });

  it("threadsPosts is empty until posts arrive", () => {
    expect(threadsPosts(null)).toEqual([]);
    expect(threadsPosts({})).toEqual([]);
    expect(threadsPosts({ threads: {} })).toEqual([]);
    expect(threadsPosts({ threads: { recent_posts: null } })).toEqual([]);
    expect(threadsPosts({ threads: { recent_posts: "nope" } })).toEqual([]);
  });

  it("threadsErrorNotes surfaces partial-failure notes only", () => {
    expect(
      threadsErrorNotes({
        threads: { detail_error: "指標の一部を取得できませんでした", posts_error: null },
      }),
    ).toEqual(["指標の一部を取得できませんでした"]);
    expect(
      threadsErrorNotes({
        threads: { detail_error: "a", posts_error: "b" },
      }),
    ).toEqual(["a", "b"]);
    expect(threadsErrorNotes({ threads: {} })).toEqual([]);
    expect(threadsErrorNotes({ threads: { detail_error: "" } })).toEqual([]);
    expect(threadsErrorNotes(null)).toEqual([]);
  });
});

describe("profile links taps card", () => {
  // The official API cannot return this metric (it answers 0 in
  // every shape, measured on 2026-11-09), so the card is not
  // rendered at all, whatever the snapshot happens to carry.
  it("snsOverview has no profile-links card when the API returns 0", () => {
    const detail = {
      ...DETAIL,
      instagram: { ...DETAIL.instagram, profile_links_taps_30d: 0 },
    };
    const labels = snsOverview(detail).map((c) => c.label);
    expect(labels).not.toContain("プロフィールのリンク（過去30日）");
  });

  it("snsOverview has no profile-links card for a non-zero value either", () => {
    const labels = snsOverview(DETAIL).map((c) => c.label);
    expect(labels).not.toContain("プロフィールのリンク（過去30日）");
  });
});

describe("channel separation of the Instagram tab cards", () => {
  // The Instagram tab shows the Instagram account's own numbers
  // only. The cross-channel figures (the combined follower total,
  // YouTube subscribers, Threads followers) belong to the
  // overview tab, so they never appear among these cards.
  it("snsOverview has no cross-channel cards", () => {
    const labels = snsOverview(DETAIL).map((c) => c.label);
    expect(labels).not.toContain("SNS延べフォロワー");
    expect(labels).not.toContain("YouTube 登録者");
    expect(labels).not.toContain("Threads フォロワー");
  });

  it("snsOverview lists the Instagram cards in display order", () => {
    expect(snsOverview(DETAIL).map((c) => c.label)).toEqual([
      "Instagram フォロワー",
      "Instagram 投稿数",
      "再生回数（過去30日）",
      "リーチ（過去30日）",
      "反応した人数（過去30日）",
      "反応の合計（過去30日）",
      "フォロワー以外（過去30日）",
      "フォロー（過去30日）",
      "フォロー解除（過去30日）",
    ]);
  });

  it("the cross-channel figures stay available on the overview KPIs", () => {
    const labels = overviewKpis(DETAIL, null, []).map((c) => c.label);
    expect(labels).toContain("SNS延べフォロワー数");
    expect(labels).toContain("YouTube 登録者");
    // Threads reaches the overview through the channel tiles; the
    // combined total it feeds is the SNS延べフォロワー数 above.
  });
});

describe("formatting", () => {
  it("formatCount locales numbers and dashes the rest", () => {
    expect(formatCount(576645)).toBe("576,645");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
    expect(formatCount("123")).toBe("—");
    expect(formatCount(NaN)).toBe("—");
  });

  it("formatPercent keeps one decimal and dashes nulls", () => {
    expect(formatPercent(94.5)).toBe("94.5%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formatSeconds rounds to one decimal", () => {
    expect(formatSeconds(8.25)).toBe("8.3秒");
    expect(formatSeconds(12)).toBe("12秒");
    expect(formatSeconds(null)).toBe("—");
  });

  it("formats timestamps in JST", () => {
    // 19:25 UTC is 04:25 the next day in Tokyo.
    expect(formatJstDateTime("2026-11-08T19:25:52.088Z")).toBe(
      "2026/11/9 4:25",
    );
    expect(formatJstDate("2026-11-08T19:25:52.088Z")).toBe("2026/11/9");
    expect(formatJstDateTime(null)).toBe("—");
    expect(formatJstDateTime("not-a-date")).toBe("—");
    expect(formatJstDate(undefined)).toBe("—");
  });
});

describe("totals and overview", () => {
  it("snsTotalFollowers sums the main accounts only", () => {
    // 1991 (Instagram) + 9 (YouTube); Threads is null and the
    // secondary Instagram account is not part of the sum.
    expect(snsTotalFollowers(DETAIL)).toBe(2000);
  });

  it("snsTotalFollowers is null when nothing reported", () => {
    expect(snsTotalFollowers(null)).toBeNull();
    expect(snsTotalFollowers({})).toBeNull();
    expect(
      snsTotalFollowers({ instagram: {}, youtube: {}, threads: {} }),
    ).toBeNull();
  });

  it("snsOverview formats every card and dashes the nulls", () => {
    const cards = Object.fromEntries(
      snsOverview(DETAIL).map((c) => [c.label, c.value]),
    );
    expect(cards["Instagram フォロワー"]).toBe("1,991");
    expect(cards["Instagram 投稿数"]).toBe("2,420");
    expect(cards["再生回数（過去30日）"]).toBe("576,645");
    expect(cards["フォロワー以外（過去30日）"]).toBe("94.5%");
    expect(cards["反応の合計（過去30日）"]).toBe("9,100");
    expect(cards["フォロー解除（過去30日）"]).toBe("—");
  });

  it("snsOverview flags only the published figures public", () => {
    // The follower count and the post count are the top page's
    // published figures; the 30-day analysis cards stay
    // unflagged so masking still blurs them. (The フォロワー以外
    // percentage is exempt by its % value, not by this flag.)
    const flagged = snsOverview(DETAIL)
      .filter((c) => c.public === true)
      .map((c) => c.label);
    expect(flagged).toEqual(["Instagram フォロワー", "Instagram 投稿数"]);
  });

  it("snsOverview tolerates a missing response", () => {
    const cards = snsOverview(null);
    expect(cards).toHaveLength(9);
    expect(cards.every((c) => c.value === "—")).toBe(true);
    expect(snsOverview({ ok: false })).toHaveLength(9);
  });

  it("snsInteractions splits the four kinds", () => {
    expect(snsInteractions(DETAIL)).toEqual([
      { label: "いいね", value: "7,000" },
      { label: "コメント", value: "300" },
      { label: "シェア", value: "400" },
      { label: "保存", value: "1,400" },
    ]);
    expect(snsInteractions(null).every((c) => c.value === "—")).toBe(true);
  });
});

describe("demographics", () => {
  it("ageGenderLabel expands both key formats, age first", () => {
    expect(ageGenderLabel("F.25-34")).toBe("25-34歳 女性");
    expect(ageGenderLabel("M.18-24")).toBe("18-24歳 男性");
    expect(ageGenderLabel("U.65+")).toBe("65歳以上 不明");
    expect(ageGenderLabel("45-54/M")).toBe("45-54歳 男性");
    expect(ageGenderLabel("45-54/F")).toBe(ageGenderLabel("F.45-54"));
    expect(ageGenderLabel("65+/M")).toBe("65歳以上 男性");
    expect(ageGenderLabel("something-else")).toBe("something-else");
    expect(ageGenderLabel(null)).toBe("");
  });

  it("demographicsBars zero-fills the full grid in age order and scales to the max", () => {
    const rows = demographicsBars(DETAIL);
    expect(rows).toHaveLength(21);
    expect(rows.map((r) => r.label)).toEqual([
      "13-17歳 男性",
      "13-17歳 女性",
      "13-17歳 不明",
      "18-24歳 男性",
      "18-24歳 女性",
      "18-24歳 不明",
      "25-34歳 男性",
      "25-34歳 女性",
      "25-34歳 不明",
      "35-44歳 男性",
      "35-44歳 女性",
      "35-44歳 不明",
      "45-54歳 男性",
      "45-54歳 女性",
      "45-54歳 不明",
      "55-64歳 男性",
      "55-64歳 女性",
      "55-64歳 不明",
      "65歳以上 男性",
      "65歳以上 女性",
      "65歳以上 不明",
    ]);
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    // Present buckets keep their raw key, value and scaled pct.
    expect(byLabel["25-34歳 男性"]).toMatchObject({
      key: "M.25-34",
      value: 200,
      pct: 25,
    });
    expect(byLabel["25-34歳 女性"]).toMatchObject({
      key: "F.25-34",
      value: 400,
      pct: 50,
    });
    expect(byLabel["35-44歳 男性"]).toMatchObject({
      key: "M.35-44",
      value: 800,
      pct: 100,
    });
    // Missing buckets (including the null-valued F.35-44) are 0.
    expect(byLabel["13-17歳 男性"]).toMatchObject({ value: 0, pct: 0 });
    expect(byLabel["35-44歳 女性"]).toMatchObject({ value: 0, pct: 0 });
    expect(byLabel["65歳以上 不明"]).toMatchObject({ value: 0, pct: 0 });
    expect(demographicsBars(null)).toEqual([]);
    expect(demographicsBars({ instagram: { demographics: {} } })).toEqual([]);
  });

  it("demographicsBars zero-fills from a single reported bucket", () => {
    const detail = {
      instagram: {
        demographics: { age_gender: [{ key: "45-54/M", value: 263 }] },
      },
    };
    const rows = demographicsBars(detail);
    expect(rows).toHaveLength(21);
    expect(rows[0]).toEqual({
      key: "13-17/M",
      label: "13-17歳 男性",
      value: 0,
      pct: 0,
    });
    expect(rows.find((r) => r.label === "45-54歳 男性")).toEqual({
      key: "45-54/M",
      label: "45-54歳 男性",
      value: 263,
      pct: 100,
    });
    expect(rows[rows.length - 1]).toEqual({
      key: "65+/U",
      label: "65歳以上 不明",
      value: 0,
      pct: 0,
    });
  });

  it("demographicsBars does not zero-fill when there is no data", () => {
    expect(demographicsBars({ instagram: { demographics: { age_gender: [] } } })).toEqual(
      [],
    );
    expect(
      demographicsBars({
        instagram: {
          demographics: { age_gender: [{ key: "M.25-34", value: null }] },
        },
      }),
    ).toEqual([]);
  });

  it("demographicsBars orders scrambled mixed-format keys, unknown last", () => {
    const detail = {
      instagram: {
        demographics: {
          age_gender: [
            { key: "45-54/U", value: 10 },
            { key: "unknown-key", value: 999 },
            { key: "M.18-24", value: 30 },
            { key: "25-34/F", value: 20 },
            { key: "U.13-17", value: 5 },
            { key: "18-24/F", value: 40 },
            { key: "M.25-34", value: 25 },
            { key: "65+/M", value: 15 },
          ],
        },
      },
    };
    const rows = demographicsBars(detail);
    // The full grid in age order (missing cells zero-filled with a
    // canonical key), then the unknown key last with its raw label.
    expect(rows.map((r) => r.key)).toEqual([
      "13-17/M",
      "13-17/F",
      "U.13-17",
      "M.18-24",
      "18-24/F",
      "18-24/U",
      "M.25-34",
      "25-34/F",
      "25-34/U",
      "35-44/M",
      "35-44/F",
      "35-44/U",
      "45-54/M",
      "45-54/F",
      "45-54/U",
      "55-64/M",
      "55-64/F",
      "55-64/U",
      "65+/M",
      "65+/F",
      "65+/U",
      "unknown-key",
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "13-17歳 男性",
      "13-17歳 女性",
      "13-17歳 不明",
      "18-24歳 男性",
      "18-24歳 女性",
      "18-24歳 不明",
      "25-34歳 男性",
      "25-34歳 女性",
      "25-34歳 不明",
      "35-44歳 男性",
      "35-44歳 女性",
      "35-44歳 不明",
      "45-54歳 男性",
      "45-54歳 女性",
      "45-54歳 不明",
      "55-64歳 男性",
      "55-64歳 女性",
      "55-64歳 不明",
      "65歳以上 男性",
      "65歳以上 女性",
      "65歳以上 不明",
      "unknown-key",
    ]);
    // Bars still scale to the largest value, unknown rows included.
    expect(rows[rows.length - 1].pct).toBe(100);
    expect(rows.find((r) => r.key === "U.13-17").pct).toBe(1);
    expect(rows[0].pct).toBe(0);
  });

  it("demographicsPyramid splits each band into left male, right female, unknown aside", () => {
    const { bands, unknown } = demographicsPyramid(DETAIL);
    expect(unknown).toEqual([]);
    expect(bands.map((b) => b.age)).toEqual([
      "13-17",
      "18-24",
      "25-34",
      "35-44",
      "45-54",
      "55-64",
      "65+",
    ]);
    expect(bands.map((b) => b.ageLabel)).toEqual([
      "13-17歳",
      "18-24歳",
      "25-34歳",
      "35-44歳",
      "45-54歳",
      "55-64歳",
      "65歳以上",
    ]);
    const byAge = Object.fromEntries(bands.map((b) => [b.age, b]));
    // Both sides scale to the shared maximum (M.35-44 = 800).
    expect(byAge["25-34"]).toMatchObject({
      male: { value: 200, pct: 25 },
      female: { value: 400, pct: 50 },
      unknown: 0,
    });
    // The null-valued F.35-44 is zero-filled on the female side.
    expect(byAge["35-44"]).toMatchObject({
      male: { value: 800, pct: 100 },
      female: { value: 0, pct: 0 },
      unknown: 0,
    });
    // Bands with no data at all still appear, fully zeroed.
    expect(byAge["13-17"]).toMatchObject({
      male: { value: 0, pct: 0 },
      female: { value: 0, pct: 0 },
      unknown: 0,
    });
  });

  it("demographicsPyramid zero-fills every band from a single reported bucket", () => {
    const detail = {
      instagram: {
        demographics: { age_gender: [{ key: "45-54/M", value: 263 }] },
      },
    };
    const { bands, unknown } = demographicsPyramid(detail);
    expect(unknown).toEqual([]);
    expect(bands).toHaveLength(7);
    const byAge = Object.fromEntries(bands.map((b) => [b.age, b]));
    expect(byAge["45-54"]).toMatchObject({
      male: { value: 263, pct: 100 },
      female: { value: 0, pct: 0 },
      unknown: 0,
    });
    expect(byAge["65+"]).toMatchObject({
      ageLabel: "65歳以上",
      male: { value: 0, pct: 0 },
      female: { value: 0, pct: 0 },
    });
  });

  it("demographicsPyramid separates the unknown gender and keeps unknown keys last", () => {
    const detail = {
      instagram: {
        demographics: {
          age_gender: [
            { key: "45-54/U", value: 10 },
            { key: "unknown-key", value: 999 },
            { key: "M.18-24", value: 30 },
            { key: "25-34/F", value: 20 },
            { key: "U.13-17", value: 5 },
            { key: "18-24/F", value: 40 },
            { key: "M.25-34", value: 25 },
            { key: "65+/M", value: 15 },
          ],
        },
      },
    };
    const { bands, unknown } = demographicsPyramid(detail);
    const byAge = Object.fromEntries(bands.map((b) => [b.age, b]));
    expect(byAge["13-17"]).toMatchObject({
      male: { value: 0 },
      female: { value: 0 },
      unknown: 5,
    });
    expect(byAge["18-24"]).toMatchObject({
      male: { value: 30 },
      female: { value: 40 },
      unknown: 0,
    });
    expect(byAge["25-34"]).toMatchObject({
      male: { value: 25 },
      female: { value: 20 },
      unknown: 0,
    });
    expect(byAge["45-54"]).toMatchObject({
      male: { value: 0 },
      female: { value: 0 },
      unknown: 10,
    });
    expect(byAge["65+"]).toMatchObject({
      male: { value: 15 },
      female: { value: 0 },
      unknown: 0,
    });
    // The unknown key stays a plain row, scaled on the shared max.
    expect(unknown).toEqual([
      { key: "unknown-key", label: "unknown-key", value: 999, pct: 100 },
    ]);
    expect(byAge["18-24"].female.pct).toBe(4);
    expect(byAge["18-24"].male.pct).toBe(3);
  });

  it("demographicsPyramid generates no bands when there is no data", () => {
    const empty = { bands: [], unknown: [] };
    expect(demographicsPyramid(null)).toEqual(empty);
    expect(demographicsPyramid({ instagram: { demographics: {} } })).toEqual(empty);
    expect(
      demographicsPyramid({ instagram: { demographics: { age_gender: [] } } }),
    ).toEqual(empty);
    expect(
      demographicsPyramid({
        instagram: {
          demographics: { age_gender: [{ key: "M.25-34", value: null }] },
        },
      }),
    ).toEqual(empty);
  });

  it("topDemographics sorts descending and applies the limit", () => {
    expect(topDemographics(DETAIL.instagram.demographics.top_cities)).toEqual([
      { name: "さいたま市", value: 500 },
      { name: "川口市", value: 300 },
    ]);
    expect(topDemographics(null)).toEqual([]);
    expect(topDemographics([{ key: "x", value: null }])).toEqual([]);
  });
});

describe("media rows", () => {
  const rows = DETAIL.instagram.recent_media;

  it("sortMedia defaults to views descending with nulls last", () => {
    expect(sortMedia(rows).map((r) => r.id)).toEqual(["m1", "m2"]);
    expect(sortMedia(rows, "views", "asc").map((r) => r.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("sortMedia orders by date when asked", () => {
    expect(sortMedia(rows, "posted_at", "desc").map((r) => r.id)).toEqual([
      "m2",
      "m1",
    ]);
    expect(sortMedia(rows, "posted_at", "asc").map((r) => r.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("sortMedia tolerates junk input and does not mutate", () => {
    expect(sortMedia(null)).toEqual([]);
    expect(sortMedia("nope")).toEqual([]);
    const input = [...rows];
    sortMedia(input, "likes", "desc");
    expect(input.map((r) => r.id)).toEqual(["m1", "m2"]);
  });

  it("captionHead collapses whitespace and truncates", () => {
    expect(captionHead("  あい\nうえお  ")).toBe("あい うえお");
    expect(captionHead(null)).toBe("");
    expect(captionHead("x".repeat(70), 60)).toBe(`${"x".repeat(60)}…`);
    expect(captionHead("短い")).toBe("短い");
  });

  it("mediaTypeLabel maps the API values", () => {
    expect(mediaTypeLabel("REELS")).toBe("リール");
    expect(mediaTypeLabel("VIDEO")).toBe("リール");
    expect(mediaTypeLabel("IMAGE")).toBe("写真");
    expect(mediaTypeLabel("CAROUSEL_ALBUM")).toBe("カルーセル");
    expect(mediaTypeLabel("OTHER")).toBe("OTHER");
    expect(mediaTypeLabel(null)).toBe("—");
  });
});

describe("youtube and error notes", () => {
  it("youtubeTotals formats the channel numbers", () => {
    expect(youtubeTotals(DETAIL)).toEqual([
      {
        label: "登録者",
        value: "9",
        public: true,
        delta: null,
        window: null,
        windowLabel: null,
      },
      { label: "総再生回数", value: "12,345" },
      { label: "動画本数", value: "21" },
    ]);
    expect(youtubeTotals(null).every((c) => c.value === "—")).toBe(true);
  });

  it("youtubeTotals names the subscriber change after its actual window", () => {
    // JST 2026-11-09 .. 2026-11-13: four days of history, so
    // the window line on the subscriber card compares against
    // the oldest day and says so. The two points are not on
    // consecutive days, so there is no 前日比 line yet.
    const rows = [
      { collected_at: "2026-11-08T21:00:00.000Z", youtube_subscribers: 10 },
      { collected_at: "2026-11-12T21:00:00.000Z", youtube_subscribers: 11 },
    ];
    const boxes = youtubeTotals(DETAIL, rows);
    expect(boxes[0]).toEqual({
      label: "登録者",
      value: "9",
      public: true,
      delta: null,
      window: "+1",
      windowLabel: "過去4日間",
    });
    // Only the current subscriber count is public; the change
    // lines are this page's own analysis and stay masked.
    expect(boxes.filter((c) => c.public === true).map((c) => c.label)).toEqual([
      "登録者",
    ]);
  });

  it("youtubeVideos passes the array through and tolerates junk", () => {
    expect(youtubeVideos(DETAIL)).toHaveLength(1);
    expect(youtubeVideos(null)).toEqual([]);
    expect(youtubeVideos({ youtube: { recent_videos: "x" } })).toEqual([]);
  });

  it("instagramThumbnailUrl passes a collected URL through and nulls junk", () => {
    expect(
      instagramThumbnailUrl({ thumbnail_url: "https://example.com/t.jpg" }),
    ).toBe("https://example.com/t.jpg");
    expect(instagramThumbnailUrl({ thumbnail_url: "" })).toBeNull();
    expect(instagramThumbnailUrl({ thumbnail_url: 42 })).toBeNull();
    expect(instagramThumbnailUrl({})).toBeNull();
    expect(instagramThumbnailUrl(null)).toBeNull();
  });

  it("mediaThumbnailShape stands reels up and squares the rest", () => {
    expect(mediaThumbnailShape({ type: "REELS" })).toBe("vertical");
    expect(mediaThumbnailShape({ type: "REEL" })).toBe("vertical");
    expect(mediaThumbnailShape({ type: "VIDEO" })).toBe("vertical");
    expect(mediaThumbnailShape({ type: "IMAGE" })).toBe("square");
    expect(mediaThumbnailShape({ type: "FEED" })).toBe("square");
    expect(mediaThumbnailShape({ type: "CAROUSEL_ALBUM" })).toBe("square");
    expect(mediaThumbnailShape(null)).toBe("square");
  });

  it("youtubeThumbnailUrls derives both candidates from the video id", () => {
    expect(youtubeThumbnailUrls({ id: "abc123" })).toEqual([
      "https://i.ytimg.com/vi/abc123/oardefault.jpg",
      "https://i.ytimg.com/vi/abc123/oar2.jpg",
    ]);
    // A row that only carries its watch URL still yields its id.
    expect(
      youtubeThumbnailUrls({ url: "https://www.youtube.com/watch?v=xyz-789" }),
    ).toEqual([
      "https://i.ytimg.com/vi/xyz-789/oardefault.jpg",
      "https://i.ytimg.com/vi/xyz-789/oar2.jpg",
    ]);
    expect(youtubeThumbnailUrls({ id: "" })).toEqual([]);
    expect(youtubeThumbnailUrls({})).toEqual([]);
    expect(youtubeThumbnailUrls(null)).toEqual([]);
  });

  it("isPlaceholderThumbnail recognises only the 120x90 stub", () => {
    expect(isPlaceholderThumbnail(120, 90)).toBe(true);
    expect(isPlaceholderThumbnail(1080, 1920)).toBe(false);
    expect(isPlaceholderThumbnail(120, 120)).toBe(false);
    expect(isPlaceholderThumbnail(0, 0)).toBe(false);
  });

  it("thumbnailOrientation reads the loaded image's own aspect", () => {
    expect(thumbnailOrientation(1080, 1920)).toBe("vertical");
    expect(thumbnailOrientation(1920, 1080)).toBe("horizontal");
    expect(thumbnailOrientation(100, 100)).toBe("horizontal");
    expect(thumbnailOrientation(0, 100)).toBeNull();
    expect(thumbnailOrientation(null, null)).toBeNull();
  });

  it("youtubeHistorySeries charts only the rows that carry a subscriber count", () => {
    const rows = [
      { collected_at: "2026-11-09T00:00:00.000Z", youtube_subscribers: null },
      { collected_at: "2026-11-09T12:00:00.000Z", youtube_subscribers: 9 },
      { collected_at: "2026-11-10T00:00:00.000Z", youtube_subscribers: 10 },
    ];
    const series = youtubeHistorySeries(rows);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("YouTube 登録者");
    expect(series[0].latest).toBe(10);
    expect(series[0].points).toHaveLength(2);
    expect(youtubeHistorySeries([])).toEqual([]);
    expect(youtubeHistorySeries(null)).toEqual([]);
  });

  it("articleViewStats counts articles and averages their views", () => {
    expect(
      articleViewStats([
        { views: 100 },
        { views: 51 },
        { views: null },
      ]),
    ).toEqual({ count: 3, totalViews: 151, perArticle: 50 });
    expect(articleViewStats([])).toEqual({
      count: 0,
      totalViews: 0,
      perArticle: null,
    });
    expect(articleViewStats(null).count).toBe(0);
  });

  it("snsErrorNotes only surfaces non-empty error strings", () => {
    expect(snsErrorNotes(DETAIL)).toEqual([]);
    const withError = {
      instagram: {
        insights_error: null,
        detail_error: "HTTP 400 code=100: something",
        media_error: "",
      },
    };
    expect(snsErrorNotes(withError)).toEqual(["HTTP 400 code=100: something"]);
    expect(snsErrorNotes(null)).toEqual([]);
  });
});

describe("instagramDailyFollows", () => {
  it("passes the collected array through", () => {
    expect(instagramDailyFollows(DETAIL)).toHaveLength(3);
    expect(instagramDailyFollows(DETAIL)[0]).toEqual({
      date: "2026-11-06",
      follows: 4,
      unfollows: 1,
    });
  });

  it("yields an empty list when the section is missing or junk", () => {
    expect(instagramDailyFollows(null)).toEqual([]);
    expect(instagramDailyFollows({})).toEqual([]);
    expect(instagramDailyFollows({ instagram: { daily_follows: "x" } })).toEqual([]);
  });
});

describe("instagramDailyFollowsError", () => {
  it("returns the error string and null otherwise", () => {
    expect(instagramDailyFollowsError(DETAIL)).toBeNull();
    expect(
      instagramDailyFollowsError({
        instagram: { daily_follows_error: "HTTP 400: daily unavailable" },
      }),
    ).toBe("HTTP 400: daily unavailable");
    expect(instagramDailyFollowsError(null)).toBeNull();
    expect(
      instagramDailyFollowsError({ instagram: { daily_follows_error: "" } }),
    ).toBeNull();
  });
});

describe("followChartDays", () => {
  it("maps each post onto the JST day it was posted", () => {
    const days = followChartDays(DETAIL);
    expect(days.map((d) => d.date)).toEqual(["20261106", "20261107", "20261108"]);
    expect(days[0]).toMatchObject({ follows: 4, unfollows: 1, posts: [] });
    // m1 was posted 2026-11-07T01:00Z = 10:00 JST on 11/7.
    expect(days[1].follows).toBe(12);
    expect(days[1].unfollows).toBeNull();
    expect(days[1].posts.map((p) => p.id)).toEqual(["m1"]);
    expect(days[2].follows).toBeNull();
    expect(days[2].posts.map((p) => p.id)).toEqual(["m2"]);
  });

  it("sorts a day's posts by views, most first", () => {
    const detail = {
      instagram: {
        daily_follows: [{ date: "2026-11-07", follows: 3, unfollows: 1 }],
        recent_media: [
          { id: "small", posted_at: "2026-11-07T01:00:00Z", views: 120 },
          { id: "big", posted_at: "2026-11-07T02:00:00Z", views: 5400 },
          { id: "noviews", posted_at: "2026-11-07T03:00:00Z", views: null },
          { id: "mid", posted_at: "2026-11-07T04:00:00Z", views: 800 },
        ],
      },
    };
    const days = followChartDays(detail);
    // Most views first; a post without a view count goes last.
    expect(days[0].posts.map((p) => p.id)).toEqual([
      "big",
      "mid",
      "small",
      "noviews",
    ]);
  });

  it("uses the JST calendar day, not the UTC day, for the mapping", () => {
    const detail = {
      instagram: {
        daily_follows: [
          { date: "2026-11-06", follows: 1, unfollows: 0 },
          { date: "2026-11-07", follows: 2, unfollows: 0 },
        ],
        recent_media: [
          // 2026-11-06 16:30 UTC is already 2026-11-07 01:30 in Tokyo.
          { id: "late", posted_at: "2026-11-06T16:30:00Z", caption: "x" },
        ],
      },
    };
    const days = followChartDays(detail);
    expect(days[0].posts).toEqual([]);
    expect(days[1].posts.map((p) => p.id)).toEqual(["late"]);
  });

  it("drops posts outside the series and malformed rows", () => {
    const detail = {
      instagram: {
        daily_follows: [
          { date: "2026/11/07", follows: 1, unfollows: 1 },
          { date: "2026-11-07", follows: "many", unfollows: 3 },
          null,
          { follows: 1, unfollows: 1 },
        ],
        recent_media: [
          { id: "old", posted_at: "2026-10-01T01:00:00Z", caption: "x" },
          { id: "bad", posted_at: "not-a-date", caption: "x" },
        ],
      },
    };
    const days = followChartDays(detail);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("20261107");
    // A non-numeric value stays a gap (null), not a zero.
    expect(days[0].follows).toBeNull();
    expect(days[0].unfollows).toBe(3);
    expect(days[0].posts).toEqual([]);
  });

  it("keeps the last entry of a duplicated date and sorts ascending", () => {
    const detail = {
      instagram: {
        daily_follows: [
          { date: "2026-11-08", follows: 1, unfollows: 1 },
          { date: "2026-11-07", follows: 2, unfollows: 2 },
          { date: "2026-11-08", follows: 9, unfollows: 9 },
        ],
        recent_media: [],
      },
    };
    const days = followChartDays(detail);
    expect(days.map((d) => d.date)).toEqual(["20261107", "20261108"]);
    expect(days[1].follows).toBe(9);
  });

  it("is empty without a daily series", () => {
    expect(followChartDays(null)).toEqual([]);
    expect(followChartDays({ instagram: { recent_media: [] } })).toEqual([]);
  });
});
