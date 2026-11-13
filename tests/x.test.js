import { describe, expect, it } from "vitest";
import {
  snsTotalFollowers,
  xHistorySeries,
  xTotals,
  xApiBalance,
  xApiRunwayMonths,
  xApiCreditSummary,
  xApiDailyPace,
  formatUsd,
  xPosts,
  xErrorNotes,
} from "../src/api.js";

// The X tab's shaping: the follower count and posts arrive in
// sns_detail's x section (collected by social-gas from
// tweet-gas), the trend comes from the history rows' x_followers.
// Until the sync is connected every value is null and the tab
// must still render its empty states.
const DETAIL = {
  collected_at: "2026-11-10T00:00:00.000Z",
  x: {
    followers: 321,
    username: "freddiefujiwara",
    x_error: null,
    posts_error: null,
    recent_posts: [
      {
        id: "2001",
        posted_at: "2026-11-09T10:00:00.000Z",
        text: "川口のブログを更新しました",
        url: "https://x.com/i/web/status/2001",
        views: 500,
        likes: 12,
        reposts: 3,
        replies: 2,
      },
    ],
  },
};

const ROWS = [
  { collected_at: "2026-11-09T00:00:00.000Z", x_followers: null },
  { collected_at: "2026-11-09T12:00:00.000Z", x_followers: 300 },
  { collected_at: "2026-11-10T00:00:00.000Z", x_followers: 321 },
];

describe("X shaping", () => {
  it("snsTotalFollowers includes X once it reports a number", () => {
    const detail = {
      instagram: { freddiefujiwara: 2000 },
      threads: { followers: 252 },
      youtube: { subscribers: 10 },
      x: { followers: 321 },
    };
    expect(snsTotalFollowers(detail)).toBe(2000 + 252 + 10 + 321);
    // Without an X section the sum is unchanged.
    const { x, ...withoutX } = detail;
    expect(snsTotalFollowers(withoutX)).toBe(2000 + 252 + 10);
  });

  it("xTotals formats the follower card with both changes", () => {
    expect(xTotals(DETAIL, ROWS)[0]).toEqual({
      label: "フォロワー",
      value: "321",
      public: true,
      delta: "+21",
      window: "+21",
      windowLabel: "過去1日間",
    });
  });

  it("xTotals sums the fetched posts into count / total / average boxes", () => {
    const detail = {
      x: {
        followers: 321,
        recent_posts: [
          { id: "1", views: 500 },
          { id: "2", views: 301 },
          { id: "3", views: null },
        ],
      },
    };
    const boxes = Object.fromEntries(
      xTotals(detail, []).map((box) => [box.label, box.value]),
    );
    expect(boxes["投稿数（直近50件）"]).toBe("3");
    // Only the posts with a view count feed the total / average.
    expect(boxes["表示回数の合計（直近50件）"]).toBe("801");
    expect(boxes["1投稿あたりの平均表示"]).toBe("401");
  });

  it("xTotals dashes everything while X is not collected yet", () => {
    const boxes = xTotals({}, []);
    expect(boxes).toEqual([
      {
        label: "フォロワー",
        value: "—",
        public: true,
        delta: null,
        window: null,
        windowLabel: null,
      },
      { label: "投稿数（直近50件）", value: "—" },
      { label: "表示回数の合計（直近50件）", value: "—" },
      { label: "1投稿あたりの平均表示", value: "—" },
    ]);
    expect(xTotals(null, null)[0].value).toBe("—");
  });

  it("xTotals carries the follower change over its actual window", () => {
    // ROWS carry two daily points a day apart (JST 2026-11-09
    // and 2026-11-10), so the window line on the follower card
    // covers that one day and names it.
    const box = xTotals(DETAIL, ROWS)[0];
    expect(box.window).toBe("+21");
    expect(box.windowLabel).toBe("過去1日間");
  });

  it("xTotals flags only the follower count public", () => {
    // The follower count is published on the top page; the
    // change lines and the fetched-post sums are this page's
    // own analysis and stay masked.
    const flagged = xTotals(DETAIL, ROWS)
      .filter((box) => box.public === true)
      .map((box) => box.label);
    expect(flagged).toEqual(["フォロワー"]);
  });

  it("xHistorySeries charts only the rows that carry a number", () => {
    const series = xHistorySeries(ROWS);
    expect(series).toHaveLength(1);
    expect(series[0].label).toBe("X フォロワー");
    expect(series[0].latest).toBe(321);
    expect(series[0].points).toHaveLength(2);
    expect(xHistorySeries([])).toEqual([]);
    expect(xHistorySeries(null)).toEqual([]);
  });

  it("xPosts returns the collected list and tolerates anything else", () => {
    expect(xPosts(DETAIL)).toHaveLength(1);
    expect(xPosts(DETAIL)[0].views).toBe(500);
    expect(xPosts({})).toEqual([]);
    expect(xPosts(null)).toEqual([]);
    expect(xPosts({ x: { recent_posts: null } })).toEqual([]);
  });

  it("formatUsd renders a balance and dashes anything else", () => {
    expect(formatUsd(41.65)).toBe("$41.65");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });

  it("xApiBalance reads the newest history point, then the detail", () => {
    const rows = [
      { collected_at: "2026-11-12T00:00:00.000Z", x_api_balance_usd: 43.1 },
      { collected_at: "2026-11-13T00:00:00.000Z", x_api_balance_usd: 41.65 },
      { collected_at: "2026-11-13T01:00:00.000Z", x_api_balance_usd: null },
    ];
    expect(xApiBalance({}, rows)).toBe(41.65);
    expect(xApiBalance({ x: { api_balance_usd: 39.5 } }, [])).toBe(39.5);
    expect(xApiBalance({}, [])).toBeNull();
    expect(xApiBalance(null, null)).toBeNull();
  });

  it("xApiRunwayMonths projects the balance's own burn rate", () => {
    // $10 burned over 10 days -> $1/day; $41.65 lasts ~1.4 months.
    const rows = [
      { collected_at: "2026-11-03T00:00:00.000Z", x_api_balance_usd: 51.65 },
      { collected_at: "2026-11-08T00:00:00.000Z", x_api_balance_usd: 46.65 },
      { collected_at: "2026-11-13T00:00:00.000Z", x_api_balance_usd: 41.65 },
    ];
    expect(xApiRunwayMonths(rows)).toBe(1.4);
  });

  it("xApiRunwayMonths ignores top-ups and needs a real decrease", () => {
    const toppedUp = [
      { collected_at: "2026-11-03T00:00:00.000Z", x_api_balance_usd: 20 },
      { collected_at: "2026-11-08T00:00:00.000Z", x_api_balance_usd: 45 },
      { collected_at: "2026-11-13T00:00:00.000Z", x_api_balance_usd: 44 },
    ];
    // Only the $1 decrease counts, over the full 10-day span:
    // $0.10/day against $44 -> about 14.5 months.
    expect(xApiRunwayMonths(toppedUp)).toBe(14.5);
    const flat = [
      { collected_at: "2026-11-12T00:00:00.000Z", x_api_balance_usd: 41.65 },
      { collected_at: "2026-11-13T00:00:00.000Z", x_api_balance_usd: 41.65 },
    ];
    expect(xApiRunwayMonths(flat)).toBeNull();
    expect(xApiRunwayMonths(flat.slice(0, 1))).toBeNull();
    expect(xApiRunwayMonths([])).toBeNull();
  });

  it("xApiDailyPace averages the counted days, ignoring null counts", () => {
    const detail = {
      x: {
        api_daily_posts: [
          { date: "2026-11-11", tweets_consumed: 100 },
          { date: "2026-11-12", tweets_consumed: null },
          { date: "2026-11-13", tweets_consumed: 200 },
        ],
      },
    };
    expect(xApiDailyPace(detail)).toBe(150);
    expect(xApiDailyPace({ x: { api_daily_posts: null } })).toBeNull();
    expect(xApiDailyPace({})).toBeNull();
    expect(
      xApiDailyPace({
        x: { api_daily_posts: [{ date: "2026-11-13", tweets_consumed: null }] },
      }),
    ).toBeNull();
  });

  it("xApiCreditSummary combines balance, runway and pace texts", () => {
    const rows = [
      { collected_at: "2026-11-03T00:00:00.000Z", x_api_balance_usd: 51.65 },
      { collected_at: "2026-11-13T00:00:00.000Z", x_api_balance_usd: 41.65 },
    ];
    const detail = {
      x: {
        api_daily_posts: [
          { date: "2026-11-12", tweets_consumed: 100 },
          { date: "2026-11-13", tweets_consumed: 200 },
        ],
      },
    };
    expect(xApiCreditSummary(detail, rows)).toEqual({
      balance: 41.65,
      balanceText: "$41.65",
      runwayText: "今のペースであと約1.4か月分",
      paceText: "直近30日の消費ペース：1日平均150件",
    });
    expect(xApiCreditSummary({}, [])).toEqual({
      balance: null,
      balanceText: "—",
      runwayText: null,
      paceText: null,
    });
  });

  it("xErrorNotes shows each distinct note once", () => {
    expect(xErrorNotes(DETAIL)).toEqual([]);
    const failed = {
      x: { x_error: "tweet-gas HTTP 401", posts_error: "tweet-gas HTTP 401" },
    };
    expect(xErrorNotes(failed)).toEqual(["tweet-gas HTTP 401"]);
    const partial = {
      x: { x_error: null, posts_error: "x posts: HTTP 429" },
    };
    expect(xErrorNotes(partial)).toEqual(["x posts: HTTP 429"]);
  });
});
