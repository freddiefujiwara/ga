import { describe, expect, it, vi } from "vitest";
import {
  fetchSnsDetail,
  fetchSnsHistory,
  snsHistoryRows,
  snsHistorySeries,
  jstDateKey,
  formatTapsCount,
  formatCount,
  formatPercent,
  formatSeconds,
  formatJstDateTime,
  formatJstDate,
  snsTotalFollowers,
  snsOverview,
  snsInteractions,
  ageGenderLabel,
  demographicsBars,
  topDemographics,
  sortMedia,
  captionHead,
  mediaTypeLabel,
  youtubeVideos,
  youtubeTotals,
  snsErrorNotes,
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
    expect(followers.points).toEqual([
      { date: "20261109", views: 2000 },
      { date: "20261109", views: 2005 },
    ]);
    expect(followers.latest).toBe(2005);
    expect(followers.firstAt).toBe("2026-11-08T19:00:00.000Z");
    expect(followers.lastAt).toBe("2026-11-09T07:00:00.000Z");
    // The null in the middle row is skipped, not zero-filled.
    expect(series[1].points).toEqual([
      { date: "20261109", views: 576645 },
      { date: "20261109", views: 580000 },
    ]);
    expect(series[1].latest).toBe(580000);
    expect(series[2].latest).toBe(2421);
  });

  it("sorts out-of-order rows and drops series without any number", () => {
    const shuffled = [ROWS[2], ROWS[0], ROWS[1]];
    const series = snsHistorySeries(shuffled);
    expect(series[0].points.map((p) => p.views)).toEqual([2000, 2005]);
    const onlyFollowers = snsHistorySeries([
      { collected_at: "2026-11-09T00:00:00.000Z", total_followers: 2000 },
    ]);
    expect(onlyFollowers.map((s) => s.key)).toEqual(["total_followers"]);
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

describe("profile links taps card", () => {
  it("formatTapsCount dashes the API's 0 and shows real numbers as-is", () => {
    expect(formatTapsCount(0)).toBe("—");
    expect(formatTapsCount(46)).toBe("46");
    expect(formatTapsCount(null)).toBe("—");
    expect(formatTapsCount(undefined)).toBe("—");
  });

  it("snsOverview dashes the taps card when the API returns 0", () => {
    const detail = {
      ...DETAIL,
      instagram: { ...DETAIL.instagram, profile_links_taps_30d: 0 },
    };
    const cards = Object.fromEntries(
      snsOverview(detail).map((c) => [c.label, c.value]),
    );
    expect(cards["プロフィールのリンク（過去30日）"]).toBe("—");
  });

  it("snsOverview shows a non-zero taps count as-is", () => {
    const cards = Object.fromEntries(
      snsOverview(DETAIL).map((c) => [c.label, c.value]),
    );
    expect(cards["プロフィールのリンク（過去30日）"]).toBe("46");
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
    expect(cards["SNS延べフォロワー"]).toBe("2,000");
    expect(cards["Instagram フォロワー"]).toBe("1,991");
    expect(cards["YouTube 登録者"]).toBe("9");
    expect(cards["Threads フォロワー"]).toBe("—");
    expect(cards["Instagram 投稿数"]).toBe("2,420");
    expect(cards["再生回数（過去30日）"]).toBe("576,645");
    expect(cards["フォロワー以外（過去30日）"]).toBe("94.5%");
    expect(cards["反応の合計（過去30日）"]).toBe("9,100");
    expect(cards["フォロー解除（過去30日）"]).toBe("—");
  });

  it("snsOverview tolerates a missing response", () => {
    const cards = snsOverview(null);
    expect(cards).toHaveLength(13);
    expect(cards.every((c) => c.value === "—")).toBe(true);
    expect(snsOverview({ ok: false })).toHaveLength(13);
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
  it("ageGenderLabel expands the F./M. keys", () => {
    expect(ageGenderLabel("F.25-34")).toBe("女性 25-34歳");
    expect(ageGenderLabel("M.18-24")).toBe("男性 18-24歳");
    expect(ageGenderLabel("U.65+")).toBe("不明 65+歳");
    expect(ageGenderLabel("something-else")).toBe("something-else");
    expect(ageGenderLabel(null)).toBe("");
  });

  it("demographicsBars sorts, drops nulls and scales to the max", () => {
    expect(demographicsBars(DETAIL)).toEqual([
      { key: "M.35-44", label: "男性 35-44歳", value: 800, pct: 100 },
      { key: "F.25-34", label: "女性 25-34歳", value: 400, pct: 50 },
      { key: "M.25-34", label: "男性 25-34歳", value: 200, pct: 25 },
    ]);
    expect(demographicsBars(null)).toEqual([]);
    expect(demographicsBars({ instagram: { demographics: {} } })).toEqual([]);
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
      { label: "登録者", value: "9" },
      { label: "総再生回数", value: "12,345" },
      { label: "動画本数", value: "21" },
    ]);
    expect(youtubeTotals(null).every((c) => c.value === "—")).toBe(true);
  });

  it("youtubeVideos passes the array through and tolerates junk", () => {
    expect(youtubeVideos(DETAIL)).toHaveLength(1);
    expect(youtubeVideos(null)).toEqual([]);
    expect(youtubeVideos({ youtube: { recent_videos: "x" } })).toEqual([]);
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
