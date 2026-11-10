import { describe, expect, it } from "vitest";
import {
  channelAudiences,
  channelTreemap,
  deltaTone,
  genreHeatBackground,
  genreHeatMix,
  genreTreemap,
  hasLabelRoom,
  layoutWithLabelRoom,
  squarifiedLayout,
  tileLabelFits,
  tileLabelLevel,
} from "../src/treemap.js";

// Same fixture numbers as tests/overview.test.js.
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
  },
  threads: { followers: null },
};

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

const area = (rect) => rect.w * rect.h;

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

describe("squarifiedLayout", () => {
  const items = [
    { id: "a", value: 100 },
    { id: "b", value: 50 },
    { id: "c", value: 25 },
    { id: "d", value: 10 },
  ];

  it("fills the whole box: areas add up to the box area", () => {
    const rects = squarifiedLayout(items, 100, 100);
    expect(rects).toHaveLength(4);
    const total = rects.reduce((sum, rect) => sum + area(rect), 0);
    expect(total).toBeCloseTo(10000, 6);
  });

  it("keeps every rectangle inside the box and free of overlaps", () => {
    const rects = squarifiedLayout(items, 100, 100);
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.y + rect.h).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.w).toBeGreaterThan(0);
      expect(rect.h).toBeGreaterThan(0);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlapArea(rects[i], rects[j])).toBeLessThan(1e-6);
      }
    }
  });

  it("makes area proportional to value: bigger value, bigger tile", () => {
    const rects = squarifiedLayout(items, 100, 100);
    const byId = Object.fromEntries(rects.map((rect) => [rect.id, rect]));
    // Each area is the value's share of the whole box.
    expect(area(byId.a)).toBeCloseTo((100 / 185) * 10000, 6);
    expect(area(byId.d)).toBeCloseTo((10 / 185) * 10000, 6);
    const byArea = [...rects].sort((p, q) => area(q) - area(p)).map((r) => r.id);
    const byValue = [...items].sort((p, q) => q.value - p.value).map((r) => r.id);
    expect(byArea).toEqual(byValue);
  });

  it("works in a non-square box too", () => {
    const rects = squarifiedLayout(items, 200, 50);
    const total = rects.reduce((sum, rect) => sum + area(rect), 0);
    expect(total).toBeCloseTo(200 * 50, 6);
    for (const rect of rects) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(200 + 1e-9);
      expect(rect.y + rect.h).toBeLessThanOrEqual(50 + 1e-9);
    }
  });

  it("survives empty, zero and junk input", () => {
    expect(squarifiedLayout([])).toEqual([]);
    expect(squarifiedLayout(null)).toEqual([]);
    expect(squarifiedLayout("nope")).toEqual([]);
    expect(squarifiedLayout([{ id: "a", value: 0 }, { id: "b", value: -3 }])).toEqual([]);
    expect(squarifiedLayout([{ id: "a", value: NaN }])).toEqual([]);
    expect(squarifiedLayout(items, 0, 100)).toEqual([]);
    // Zero values are dropped, positive ones still tile the box.
    const rects = squarifiedLayout([{ id: "a", value: 0 }, { id: "b", value: 10 }]);
    expect(rects.map((rect) => rect.id)).toEqual(["b"]);
    expect(area(rects[0])).toBeCloseTo(10000, 6);
  });

  it("gives a single item the whole box", () => {
    const rects = squarifiedLayout([{ id: "only", value: 42 }], 100, 100);
    expect(rects).toEqual([{ id: "only", value: 42, x: 0, y: 0, w: 100, h: 100 }]);
  });
});

describe("tileLabelFits", () => {
  it("accepts tiles big enough for two micro lines", () => {
    expect(tileLabelFits({ w: 11, h: 14 })).toBe(true);
    expect(tileLabelFits({ w: 50, h: 50 })).toBe(true);
    expect(tileLabelFits({ w: 10.9, h: 14 })).toBe(false);
    expect(tileLabelFits({ w: 11, h: 13.9 })).toBe(false);
  });

  it("accepts tall narrow tiles a vertical line can run down", () => {
    expect(tileLabelFits({ w: 8, h: 28 })).toBe(true);
    expect(tileLabelFits({ w: 9, h: 100 })).toBe(true);
    // Not tall enough, or not twice as tall as wide.
    expect(tileLabelFits({ w: 8, h: 27 })).toBe(false);
    expect(tileLabelFits({ w: 10, h: 19 })).toBe(false);
  });

  it("accepts wide flat tiles that hold one line", () => {
    expect(tileLabelFits({ w: 20, h: 10 })).toBe(true);
    expect(tileLabelFits({ w: 19, h: 10 })).toBe(false);
    expect(tileLabelFits({ w: 20, h: 9 })).toBe(false);
  });

  it("rejects junk", () => {
    expect(tileLabelFits(null)).toBe(false);
    expect(tileLabelFits({})).toBe(false);
    expect(tileLabelFits({ w: NaN, h: 50 })).toBe(false);
  });
});

describe("layoutWithLabelRoom", () => {
  // The production channel figures: two giants, two mid-size
  // channels and a nine-subscriber minnow.
  const channels = [
    { id: "instagram", value: 2015 },
    { id: "x", value: 1834 },
    { id: "blog", value: 255 },
    { id: "threads", value: 252 },
    { id: "youtube", value: 10 },
  ];

  it("grows every tile to label size while keeping the tiling intact", () => {
    const rects = layoutWithLabelRoom(channels);
    expect(rects).toHaveLength(5);
    for (const rect of rects) {
      expect(tileLabelFits(rect)).toBe(true);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(100 + 1e-9);
      expect(rect.y + rect.h).toBeLessThanOrEqual(100 + 1e-9);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlapArea(rects[i], rects[j])).toBeLessThan(1e-6);
      }
    }
    const totalArea = rects.reduce((sum, rect) => sum + area(rect), 0);
    expect(totalArea).toBeCloseTo(10000, 6);
  });

  it("keeps the tiles' size order in step with the values", () => {
    const rects = layoutWithLabelRoom(channels);
    const byArea = [...rects]
      .sort((p, q) => area(q) - area(p))
      .map((rect) => rect.id);
    expect(byArea).toEqual(["instagram", "x", "blog", "threads", "youtube"]);
    // YouTube is still by far the smallest tile: the floor
    // softens the contrast, it does not erase it.
    const byId = Object.fromEntries(rects.map((rect) => [rect.id, rect]));
    expect(area(byId.youtube)).toBeLessThan(area(byId.threads));
    expect(area(byId.youtube) / 10000).toBeLessThan(0.05);
  });

  it("rescues a ~30:1 straggler as a vertical strip", () => {
    const rects = layoutWithLabelRoom([
      { id: "big", value: 29702 },
      { id: "small", value: 900 },
    ]);
    const small = rects.find((rect) => rect.id === "small");
    expect(tileLabelFits(small)).toBe(true);
    expect(tileLabelLevel(small)).toBe("micro-v");
  });

  it("leaves a layout that already fits untouched", () => {
    const items = [
      { id: "a", value: 100 },
      { id: "b", value: 50 },
      { id: "c", value: 25 },
      { id: "d", value: 10 },
    ];
    expect(layoutWithLabelRoom(items)).toEqual(squarifiedLayout(items, 100, 100));
  });

  it("survives empty, zero and junk input", () => {
    expect(layoutWithLabelRoom([])).toEqual([]);
    expect(layoutWithLabelRoom(null)).toEqual([]);
    expect(layoutWithLabelRoom([{ id: "a", value: 0 }])).toEqual([]);
    const rects = layoutWithLabelRoom([{ id: "only", value: 42 }]);
    expect(rects).toEqual([{ id: "only", value: 42, x: 0, y: 0, w: 100, h: 100 }]);
  });
});

describe("channelAudiences", () => {
  it("lists every channel with its own metric and the history change", () => {
    const entries = Object.fromEntries(
      channelAudiences(DETAIL, GA_TOTALS, HISTORY2).map((e) => [e.id, e]),
    );
    expect(entries.instagram).toMatchObject({
      name: "Instagram",
      metricLabel: "フォロワー",
      value: 1991,
      valueLabel: "1,991",
      delta: 4,
      deltaLabel: "+4",
      note: null,
    });
    expect(entries.blog).toMatchObject({
      name: "ブログ",
      metricLabel: "ユーザー（直近28日）",
      value: 678,
      valueLabel: "678",
      // The tile figure names its unit up front.
      valueText: "利用者 678",
      delta: null,
      deltaLabel: null,
    });
    expect(entries.instagram.valueText).toBe("1,991");
    expect(entries.youtube).toMatchObject({
      name: "YouTube",
      metricLabel: "登録者",
      value: 9,
      delta: 1,
      deltaLabel: "+1",
    });
  });

  it("marks Threads as 集計待ち while its followers are unknown", () => {
    const entries = Object.fromEntries(
      channelAudiences(DETAIL, GA_TOTALS, HISTORY2).map((e) => [e.id, e]),
    );
    expect(entries.threads).toMatchObject({ value: null, valueLabel: "—", note: "集計待ち" });
  });

  it("tolerates missing sources entirely", () => {
    const entries = channelAudiences(null, null, null);
    expect(entries.map((e) => e.id)).toEqual(["instagram", "blog", "youtube", "threads", "x"]);
    expect(entries.every((e) => e.value === null && e.delta === null)).toBe(true);
  });

  it("marks X as 集計待ち while its followers are unknown, then joins the bars", () => {
    const entries = Object.fromEntries(
      channelAudiences(DETAIL, GA_TOTALS, HISTORY2).map((e) => [e.id, e]),
    );
    expect(entries.x).toMatchObject({ value: null, valueLabel: "—", note: "集計待ち" });

    const detail = { ...DETAIL, x: { followers: 321 } };
    const joined = Object.fromEntries(
      channelAudiences(detail, GA_TOTALS, HISTORY2).map((e) => [e.id, e]),
    );
    expect(joined.x).toMatchObject({ value: 321, valueLabel: "321", note: null });
  });
});

describe("channelTreemap", () => {
  // All four SNS channels collected. Combined followers:
  // 1991 + 9 + 250 + 1800 = 4050. GA_TOTALS gives the blog
  // 678 users over the last 28 days.
  const FULL_DETAIL = {
    ...DETAIL,
    threads: { followers: 250 },
    x: { followers: 1800 },
  };

  it("tiles every channel, the blog included, sized by its figure", () => {
    const { tiles, legend } = channelTreemap(FULL_DETAIL, GA_TOTALS, HISTORY2);
    // The legend keeps the fixed channel order, blog second.
    expect(legend.map((entry) => entry.id)).toEqual([
      "instagram",
      "blog",
      "youtube",
      "threads",
      "x",
    ]);
    expect(tiles.map((tile) => tile.id).sort()).toEqual([
      "blog",
      "instagram",
      "threads",
      "x",
      "youtube",
    ]);
    const totalArea = tiles.reduce((sum, tile) => sum + tile.w * tile.h, 0);
    expect(totalArea).toBeCloseTo(10000, 6);
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        expect(overlapArea(tiles[i], tiles[j])).toBeLessThan(1e-6);
      }
    }
    // Tile sizes keep the figures' order, smallest last.
    const byArea = [...tiles]
      .sort((p, q) => q.w * q.h - p.w * p.h)
      .map((tile) => tile.id);
    expect(byArea).toEqual(["instagram", "x", "blog", "threads", "youtube"]);
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    expect(byId.instagram.valueLabel).toBe("1,991");
    // The blog's tile names its unit: the number is a user
    // count, not followers.
    expect(byId.blog.valueText).toBe("利用者 678");
    expect(byId.instagram.valueText).toBe("1,991");
    // Every tile — even YouTube's, at nine subscribers — is
    // big enough for a micro label and earns one.
    for (const tile of tiles) {
      expect(tileLabelFits(tile)).toBe(true);
      expect(tile.labelLevel).not.toBe("none");
      expect(tile.labelRoom).toBe(true);
    }
    expect(["micro", "micro-v", "micro-h"]).toContain(byId.youtube.labelLevel);
  });

  it("carries each SNS channel's share of the combined followers", () => {
    const { tiles, legend } = channelTreemap(FULL_DETAIL, GA_TOTALS, HISTORY2);
    const byId = Object.fromEntries(legend.map((entry) => [entry.id, entry]));
    expect(byId.instagram.share).toBeCloseTo(49.2, 5);
    expect(byId.instagram.shareLabel).toBe("全体の 49.2%");
    expect(byId.x.share).toBeCloseTo(44.4, 5);
    expect(byId.threads.share).toBeCloseTo(6.2, 5);
    expect(byId.youtube.share).toBeCloseTo(0.2, 5);
    // The blog takes no share: its user count is a different
    // unit, so it stays out of the follower denominator and
    // the SNS shares are exactly what they were without it.
    expect(byId.blog.share).toBeNull();
    expect(byId.blog.shareLabel).toBeNull();
    // The tiles carry the same share as the legend.
    const tileById = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    expect(tileById.instagram.shareLabel).toBe("全体の 49.2%");
    expect(tileById.blog.shareLabel).toBeNull();
  });

  it("tones the change since the previous collection", () => {
    const { legend } = channelTreemap(FULL_DETAIL, null, HISTORY2);
    const byId = Object.fromEntries(legend.map((entry) => [entry.id, entry]));
    expect(byId.instagram).toMatchObject({ delta: 4, deltaLabel: "+4", tone: "up" });
    expect(byId.youtube).toMatchObject({ delta: 1, deltaLabel: "+1", tone: "up" });
    // The history has no Threads / X points yet: nothing to
    // compare, so no delta line and a neutral tone.
    expect(byId.threads).toMatchObject({ delta: null, deltaLabel: null, tone: "neutral" });
    expect(byId.x).toMatchObject({ delta: null, deltaLabel: null, tone: "neutral" });

    const shrinking = [
      HISTORY2[0],
      { ...HISTORY2[1], ig_followers: 1980, youtube_subscribers: 9 },
    ];
    const shrunk = Object.fromEntries(
      channelTreemap(FULL_DETAIL, null, shrinking).legend.map((entry) => [entry.id, entry]),
    );
    expect(shrunk.instagram.tone).toBe("down");
    expect(shrunk.youtube.tone).toBe("neutral");
  });

  it("heats the tiles on the genre tiles' blue scale, by follower count", () => {
    const { tiles, legend } = channelTreemap(FULL_DETAIL, null, HISTORY2);
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    // Instagram has the largest count and gets the strongest
    // blue; YouTube has the smallest and keeps the plain colour.
    expect(byId.instagram.heat).toBe(
      "color-mix(in srgb, #3b82f6 55%, var(--surface-elevated))",
    );
    expect(byId.x.heat).toBe(
      "color-mix(in srgb, #3b82f6 50%, var(--surface-elevated))",
    );
    expect(byId.threads.heat).toBe(
      "color-mix(in srgb, #3b82f6 7%, var(--surface-elevated))",
    );
    expect(byId.youtube.heat).toBeNull();
    // The legend carries no colour.
    for (const entry of legend) {
      expect(entry.heat).toBeUndefined();
    }
  });

  it("keeps uncollected channels in the legend only, as 集計待ち", () => {
    const { tiles, legend } = channelTreemap(DETAIL, null, HISTORY2);
    // DETAIL has no Threads / X followers yet, and no GA
    // totals were passed, so the blog has no figure either.
    expect(tiles.map((tile) => tile.id)).toEqual(["instagram", "youtube"]);
    const byId = Object.fromEntries(legend.map((entry) => [entry.id, entry]));
    expect(byId.threads).toMatchObject({
      value: null,
      note: "集計待ち",
      share: null,
      shareLabel: null,
    });
    expect(byId.x).toMatchObject({ value: null, note: "集計待ち", share: null });
    expect(byId.blog).toMatchObject({ value: null, share: null });
  });

  it("stamps every tile with the level its own size earns", () => {
    const { tiles } = channelTreemap(FULL_DETAIL, GA_TOTALS, HISTORY2);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.labelLevel).toBe(tileLabelLevel(tile));
      expect(tile.labelRoom).toBe(tile.labelLevel !== "none");
      expect(tile.labelRoom).toBe(true);
    }
  });

  it("leaves a lone channel's tile plain and gives it the whole box", () => {
    const { tiles, legend } = channelTreemap(
      { instagram: { freddiefujiwara: 100 } },
      null,
      null,
    );
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      id: "instagram",
      heat: null,
      share: 100,
      shareLabel: "全体の 100%",
    });
    expect(tiles[0].w * tiles[0].h).toBeCloseTo(10000, 6);
    expect(legend).toHaveLength(5);
  });

  it("tolerates missing sources entirely", () => {
    const { tiles, legend } = channelTreemap(null, null, null);
    expect(tiles).toEqual([]);
    expect(legend.map((entry) => entry.id)).toEqual([
      "instagram",
      "blog",
      "youtube",
      "threads",
      "x",
    ]);
    expect(
      legend.every((entry) => entry.value === null && entry.share === null),
    ).toBe(true);
  });
});


describe("deltaTone / hasLabelRoom", () => {
  it("maps the change direction to a tone", () => {
    expect(deltaTone(5)).toBe("up");
    expect(deltaTone(-5)).toBe("down");
    expect(deltaTone(0)).toBe("neutral");
    expect(deltaTone(null)).toBe("neutral");
    expect(deltaTone(undefined)).toBe("neutral");
  });

  it("only roomy tiles carry a label", () => {
    expect(hasLabelRoom({ w: 80, h: 100 })).toBe(true);
    expect(hasLabelRoom({ w: 11, h: 8 })).toBe(false);
    expect(hasLabelRoom({ w: 5, h: 90 })).toBe(false);
    expect(hasLabelRoom(null)).toBe(false);
  });
});

describe("tileLabelLevel", () => {
  it("grants the full stack only to tiles tall and wide enough for three lines", () => {
    expect(tileLabelLevel({ w: 24, h: 42 })).toBe("full");
    expect(tileLabelLevel({ w: 100, h: 100 })).toBe("full");
    // One percent short on either axis drops the total line.
    expect(tileLabelLevel({ w: 24, h: 41 })).toBe("value");
    expect(tileLabelLevel({ w: 23, h: 60 })).toBe("value");
  });

  it("keeps name + average on mid-size tiles", () => {
    expect(tileLabelLevel({ w: 22, h: 30 })).toBe("value");
    expect(tileLabelLevel({ w: 60, h: 35 })).toBe("value");
    // Too short for the big figure: the name alone stays.
    expect(tileLabelLevel({ w: 30, h: 29 })).toBe("name");
    expect(tileLabelLevel({ w: 21, h: 40 })).toBe("name");
  });

  it("falls back to micro shapes on small tiles, never to blank", () => {
    expect(tileLabelLevel({ w: 14, h: 20 })).toBe("name");
    // Below the compact thresholds the tile still carries its
    // name and figure, in micro type.
    expect(tileLabelLevel({ w: 40, h: 19 })).toBe("micro");
    expect(tileLabelLevel({ w: 13, h: 40 })).toBe("micro");
    expect(tileLabelLevel({ w: 10, h: 10 })).toBe("micro");
  });

  it("runs the label vertically down tall narrow tiles", () => {
    expect(tileLabelLevel({ w: 9, h: 60 })).toBe("micro-v");
    expect(tileLabelLevel({ w: 8, h: 28 })).toBe("micro-v");
    // Wide enough for horizontal micro type: no rotation.
    expect(tileLabelLevel({ w: 11, h: 60 })).toBe("micro");
    // Too short for a vertical run: horizontal micro instead.
    expect(tileLabelLevel({ w: 9, h: 20 })).toBe("micro");
  });

  it("keeps one horizontal line on wide flat tiles", () => {
    expect(tileLabelLevel({ w: 26, h: 12 })).toBe("micro-h");
    expect(tileLabelLevel({ w: 40, h: 13 })).toBe("micro-h");
    // Too narrow for a one-line run: two tiny lines instead.
    expect(tileLabelLevel({ w: 19, h: 12 })).toBe("micro");
  });

  it("matches the tiles that overflowed in the owner's screenshot", () => {
    // Rectangles estimated from the shot: the roomy tiles keep
    // their stacks, and the cramped ones now get micro labels
    // instead of the lines that did not fit — or a blank tile.
    expect(tileLabelLevel({ w: 44, h: 53 })).toBe("full"); // 街歩き・スポット
    expect(tileLabelLevel({ w: 26, h: 30 })).toBe("value"); // 日常・その他: 合計が見切れた
    expect(tileLabelLevel({ w: 26, h: 15 })).toBe("micro"); // 理容・リラクゼーション: 名前が溢れた
    expect(tileLabelLevel({ w: 26, h: 12 })).toBe("micro-h"); // グルメ: 数字が下端に被った
  });

  it("treats junk as no room", () => {
    expect(tileLabelLevel(null)).toBe("none");
    expect(tileLabelLevel(undefined)).toBe("none");
    expect(tileLabelLevel({})).toBe("none");
    expect(tileLabelLevel({ w: NaN, h: 50 })).toBe("none");
  });
});

describe("genreTreemap", () => {
  // The totals and the averages rank these rows differently on
  // purpose: グルメ has the bigger total, 音楽 the
  // bigger average, so the tile areas prove which one they use.
  const rows = [
    { genre: "グルメ", totalViews: 3000, avgViews: 1000 },
    { genre: "音楽", totalViews: 2000, avgViews: 2000 },
    { genre: "日常・その他", totalViews: 0, avgViews: null },
  ];
  const pick = (row) => ({
    name: row.genre,
    avg: row.avgViews,
    avgText: `平均再生 ${row.avgViews ?? "—"}`,
    totalText: `合計 ${row.totalViews}`,
  });

  it("lays tiles out with areas proportional to the averages", () => {
    const { tiles } = genreTreemap(rows, pick);
    expect(tiles.map((t) => t.name)).toEqual(["音楽", "グルメ"]);
    const gourmet = tiles.find((t) => t.name === "グルメ");
    const music = tiles.find((t) => t.name === "音楽");
    expect((music.w * music.h) / (gourmet.w * gourmet.h)).toBeCloseTo(2, 5);
    expect(gourmet.avgLabel).toBe("1,000");
    expect(gourmet.avgText).toBe("平均再生 1000");
    expect(gourmet.totalText).toBe("合計 3000");
    expect(music.avgLabel).toBe("2,000");
  });

  it("keeps rows without an average in the legend only", () => {
    const { tiles, legend } = genreTreemap(rows, pick);
    expect(tiles.map((t) => t.name)).not.toContain("日常・その他");
    expect(legend.map((e) => e.name)).toEqual([
      "グルメ",
      "音楽",
      "日常・その他",
    ]);
    expect(legend[0]).toMatchObject({
      avg: 1000,
      avgLabel: "1,000",
      totalText: "合計 3000",
    });
    expect(legend[2]).toMatchObject({ avg: null, avgLabel: "—" });
  });

  it("stamps every tile with the level its own size earns", () => {
    const { tiles } = genreTreemap(rows, pick);
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.labelLevel).toBe(tileLabelLevel(tile));
      expect(tile.labelRoom).toBe(tile.labelLevel !== "none");
    }
    // Both fixture tiles span the full height, so both earn the
    // full stack.
    expect(tiles.every((t) => t.labelLevel === "full")).toBe(true);
  });

  it("gives even a cramped tile a micro label", () => {
    const skewed = [
      { genre: "街歩き・スポット", totalViews: 29702, avgViews: 29702 },
      { genre: "グルメ", totalViews: 900, avgViews: 900 },
    ];
    const { tiles, legend } = genreTreemap(skewed, pick);
    const big = tiles.find((t) => t.name === "街歩き・スポット");
    const small = tiles.find((t) => t.name === "グルメ");
    expect(big.labelLevel).toBe("full");
    // The small tile's natural share of the area is ~3%: the
    // layout grows it into a tall narrow strip and the label
    // runs vertically down it, instead of the tile going blank.
    expect(tileLabelFits(small)).toBe(true);
    expect(small.labelLevel).toBe("micro-v");
    expect(small.labelRoom).toBe(true);
    expect(legend.map((e) => e.name)).toEqual(["街歩き・スポット", "グルメ"]);
    expect(legend[1]).toMatchObject({ avgLabel: "900", totalText: "合計 900" });
  });

  it("tolerates junk input", () => {
    expect(genreTreemap(null, pick)).toEqual({ tiles: [], legend: [] });
    expect(genreTreemap([], pick)).toEqual({ tiles: [], legend: [] });
  });

  it("heats the tiles from the smallest to the largest average", () => {
    const { tiles, legend } = genreTreemap(rows, pick);
    const gourmet = tiles.find((t) => t.name === "グルメ");
    const music = tiles.find((t) => t.name === "音楽");
    // グルメ has the smallest average on show, so its tile keeps
    // the plain colour; 音楽 has the largest and gets the
    // strongest blue.
    expect(gourmet.heat).toBeNull();
    expect(music.heat).toBe(
      "color-mix(in srgb, #3b82f6 55%, var(--surface-elevated))",
    );
    // The legend carries no colour: it stays a plain figure list.
    for (const entry of legend) {
      expect(entry.heat).toBeUndefined();
    }
  });

  it("leaves every tile plain when all averages are equal", () => {
    const flat = [
      { genre: "グルメ", totalViews: 1000, avgViews: 1000 },
      { genre: "音楽", totalViews: 2000, avgViews: 1000 },
    ];
    const { tiles } = genreTreemap(flat, pick);
    expect(tiles.length).toBe(2);
    expect(tiles.every((t) => t.heat === null)).toBe(true);
  });

  it("leaves a lone genre's tile plain", () => {
    const { tiles } = genreTreemap([rows[0]], pick);
    expect(tiles.length).toBe(1);
    expect(tiles[0].heat).toBeNull();
  });
});

describe("genreHeatMix / genreHeatBackground", () => {
  it("sits at 0 for the smallest average and at the cap for the largest", () => {
    expect(genreHeatMix(100, 100, 300)).toBe(0);
    expect(genreHeatMix(300, 100, 300)).toBe(55);
    expect(genreHeatBackground(100, 100, 300)).toBeNull();
    expect(genreHeatBackground(300, 100, 300)).toBe(
      "color-mix(in srgb, #3b82f6 55%, var(--surface-elevated))",
    );
  });

  it("shades the middle smoothly", () => {
    expect(genreHeatMix(200, 100, 300)).toBe(28);
    expect(genreHeatMix(150, 100, 300)).toBe(14);
    expect(genreHeatBackground(200, 100, 300)).toBe(
      "color-mix(in srgb, #3b82f6 28%, var(--surface-elevated))",
    );
  });

  it("has no scale when every value is equal or there is only one", () => {
    expect(genreHeatMix(100, 100, 100)).toBeNull();
    expect(genreHeatBackground(100, 100, 100)).toBeNull();
  });

  it("has no colour for a missing average", () => {
    expect(genreHeatMix(null, 100, 300)).toBeNull();
    expect(genreHeatMix(undefined, 100, 300)).toBeNull();
    expect(genreHeatMix(NaN, 100, 300)).toBeNull();
    expect(genreHeatBackground(null, 100, 300)).toBeNull();
  });

  it("clamps averages outside the range", () => {
    expect(genreHeatMix(50, 100, 300)).toBe(0);
    expect(genreHeatMix(999, 100, 300)).toBe(55);
  });
});
