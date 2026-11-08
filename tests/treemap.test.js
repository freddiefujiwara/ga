import { describe, expect, it } from "vitest";
import {
  channelAudiences,
  channelBars,
  deltaTone,
  genreTreemap,
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

describe("channelBars", () => {
  it("scales bar lengths to the largest channel, in fixed order", () => {
    const bars = channelBars(DETAIL, GA_TOTALS, HISTORY2);
    expect(bars.map((bar) => bar.id)).toEqual([
      "instagram",
      "blog",
      "youtube",
      "threads",
    ]);
    const byId = Object.fromEntries(bars.map((bar) => [bar.id, bar]));
    expect(byId.instagram.pct).toBe(100);
    expect(byId.blog.pct).toBeCloseTo((678 / 1991) * 100, 1);
    expect(byId.youtube.pct).toBeCloseTo((9 / 1991) * 100, 1);
    expect(byId.instagram.valueLabel).toBe("1,991");
  });

  it("colours bars by the direction of the change", () => {
    const bars = channelBars(DETAIL, GA_TOTALS, HISTORY2);
    const byId = Object.fromEntries(bars.map((bar) => [bar.id, bar]));
    expect(byId.instagram.tone).toBe("up");
    expect(byId.youtube.tone).toBe("up");
    // The blog has no history, so it stays neutral.
    expect(byId.blog.tone).toBe("neutral");

    const shrinking = [
      HISTORY2[0],
      { ...HISTORY2[1], ig_followers: 1980, youtube_subscribers: 9 },
    ];
    const shrunk = channelBars(DETAIL, GA_TOTALS, shrinking);
    const shrunkById = Object.fromEntries(shrunk.map((bar) => [bar.id, bar]));
    expect(shrunkById.instagram.tone).toBe("down");
    expect(shrunkById.youtube.tone).toBe("neutral");
  });

  it("keeps Threads as an empty 集計待ち bar until followers arrive", () => {
    const bars = channelBars(DETAIL, GA_TOTALS, HISTORY2);
    const threads = bars.find((bar) => bar.id === "threads");
    expect(threads).toMatchObject({ value: null, pct: 0, note: "集計待ち" });

    const detail = { ...DETAIL, threads: { followers: 500 } };
    const withThreads = channelBars(detail, GA_TOTALS, HISTORY2);
    const joined = withThreads.find((bar) => bar.id === "threads");
    expect(joined).toMatchObject({ value: 500, valueLabel: "500", note: null });
    expect(joined.pct).toBeCloseTo((500 / 1991) * 100, 1);
  });

  it("returns empty bars when nothing has been collected yet", () => {
    const bars = channelBars(null, null, null);
    expect(bars).toHaveLength(4);
    expect(bars.every((bar) => bar.pct === 0)).toBe(true);
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

describe("genreTreemap", () => {
  const rows = [
    { genre: "グルメ", totalViews: 3000, avgViews: 1000 },
    { genre: "カフェ・スイーツ", totalViews: 1000, avgViews: 1000 },
    { genre: "日常・その他", totalViews: 0, avgViews: null },
  ];
  const pick = (row) => ({
    name: row.genre,
    total: row.totalViews,
    avgText: `平均再生 ${row.avgViews ?? "—"}`,
  });

  it("lays tiles out with areas proportional to the totals", () => {
    const { tiles } = genreTreemap(rows, pick);
    expect(tiles.map((t) => t.name)).toEqual(["グルメ", "カフェ・スイーツ"]);
    const gourmet = tiles.find((t) => t.name === "グルメ");
    const cafe = tiles.find((t) => t.name === "カフェ・スイーツ");
    expect((gourmet.w * gourmet.h) / (cafe.w * cafe.h)).toBeCloseTo(3, 5);
    expect(gourmet.totalLabel).toBe("3,000");
    expect(gourmet.avgText).toBe("平均再生 1000");
  });

  it("keeps zero-total rows in the legend only", () => {
    const { tiles, legend } = genreTreemap(rows, pick);
    expect(tiles.map((t) => t.name)).not.toContain("日常・その他");
    expect(legend.map((e) => e.name)).toEqual([
      "グルメ",
      "カフェ・スイーツ",
      "日常・その他",
    ]);
    expect(legend[2]).toMatchObject({ total: 0, totalLabel: "0" });
  });

  it("tolerates junk input", () => {
    expect(genreTreemap(null, pick)).toEqual({ tiles: [], legend: [] });
    expect(genreTreemap([], pick)).toEqual({ tiles: [], legend: [] });
  });
});
