import { describe, expect, it } from "vitest";
import {
  channelAudiences,
  channelTreemap,
  deltaTone,
  hasLabelRoom,
  squarifiedLayout,
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
      delta: null,
      deltaLabel: null,
    });
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
    expect(entries.map((e) => e.id)).toEqual(["instagram", "blog", "youtube", "threads"]);
    expect(entries.every((e) => e.value === null && e.delta === null)).toBe(true);
  });
});

describe("channelTreemap", () => {
  it("tiles only the channels with a positive audience", () => {
    const { tiles, legend } = channelTreemap(DETAIL, GA_TOTALS, HISTORY2);
    expect(tiles.map((tile) => tile.id).sort()).toEqual(["blog", "instagram", "youtube"]);
    expect(legend.map((entry) => entry.id)).toEqual(["instagram", "blog", "youtube", "threads"]);
    // The tiles together cover the whole map.
    const total = tiles.reduce((sum, tile) => sum + area(tile), 0);
    expect(total).toBeCloseTo(10000, 6);
  });

  it("gives Instagram the largest tile and colours changes by direction", () => {
    const { tiles } = channelTreemap(DETAIL, GA_TOTALS, HISTORY2);
    const biggest = [...tiles].sort((a, b) => area(b) - area(a))[0];
    expect(biggest.id).toBe("instagram");
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    expect(byId.instagram.tone).toBe("up");
    expect(byId.youtube.tone).toBe("up");
    // The blog has no history, so it stays neutral.
    expect(byId.blog.tone).toBe("neutral");
  });

  it("colours a shrinking channel red", () => {
    const shrinking = [
      HISTORY2[0],
      { ...HISTORY2[1], ig_followers: 1980, youtube_subscribers: 9 },
    ];
    const { tiles } = channelTreemap(DETAIL, GA_TOTALS, shrinking);
    const byId = Object.fromEntries(tiles.map((tile) => [tile.id, tile]));
    expect(byId.instagram.tone).toBe("down");
    expect(byId.youtube.tone).toBe("neutral");
  });

  it("includes Threads as a tile once its followers are collected", () => {
    const detail = { ...DETAIL, threads: { followers: 500 } };
    const { tiles, legend } = channelTreemap(detail, GA_TOTALS, HISTORY2);
    expect(tiles.map((tile) => tile.id)).toContain("threads");
    const threads = legend.find((entry) => entry.id === "threads");
    expect(threads).toMatchObject({ value: 500, valueLabel: "500", note: null });
  });

  it("keeps zero-audience channels in the legend but out of the map", () => {
    const detail = { ...DETAIL, youtube: { subscribers: 0 } };
    const { tiles, legend } = channelTreemap(detail, GA_TOTALS, HISTORY2);
    expect(tiles.map((tile) => tile.id)).not.toContain("youtube");
    const youtube = legend.find((entry) => entry.id === "youtube");
    expect(youtube).toMatchObject({ value: 0, valueLabel: "0" });
  });

  it("returns no tiles when nothing has been collected yet", () => {
    const { tiles, legend } = channelTreemap(null, null, null);
    expect(tiles).toEqual([]);
    expect(legend).toHaveLength(4);
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
