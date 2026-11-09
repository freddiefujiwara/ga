import { describe, expect, it } from "vitest";
import {
  snsTotalFollowers,
  xHistorySeries,
  xTotals,
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

  it("xTotals formats the followers and the change since the previous collection", () => {
    const boxes = Object.fromEntries(
      xTotals(DETAIL, ROWS).map((box) => [box.label, box.value]),
    );
    expect(boxes["フォロワー"]).toBe("321");
    expect(boxes["前回比"]).toBe("+21");
  });

  it("xTotals dashes everything while X is not collected yet", () => {
    const boxes = xTotals({}, []);
    expect(boxes).toEqual([
      { label: "フォロワー", value: "—" },
      { label: "前回比", value: "—" },
    ]);
    expect(xTotals(null, null)[0].value).toBe("—");
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
