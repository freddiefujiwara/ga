import { describe, expect, it, vi } from "vitest";
import {
  fetchSnsDetail,
  fetchSnsHistory,
  snsHistoryRows,
  snsHistorySeries,
  jstDateKey,
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
  demographicsPyramid,
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
    expect(cards).toHaveLength(12);
    expect(cards.every((c) => c.value === "—")).toBe(true);
    expect(snsOverview({ ok: false })).toHaveLength(12);
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
