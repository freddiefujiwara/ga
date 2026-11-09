import { describe, expect, it } from "vitest";
import {
  buildLineChartSvg,
  buildFollowChartSvg,
  formatDateLabel,
  formatDateFull,
  tooltipText,
  tickIndices,
} from "../src/chart.js";

describe("buildLineChartSvg", () => {
  it("renders an empty svg for no points", () => {
    const svg = buildLineChartSvg([]);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<polyline");
  });

  it("plots points scaled to the maximum", () => {
    const svg = buildLineChartSvg(
      [
        { date: "20261104", views: 50 },
        { date: "20261105", views: 100 },
      ],
      { width: 200, height: 100, padding: 10 },
    );
    expect(svg).toContain("<polyline");
    expect(svg).toContain("最大 100");
    // Highest point touches the top inner edge (y = padding).
    expect(svg).toContain("190,10");
  });

  it("carries the data on hit points for the tooltip", () => {
    const svg = buildLineChartSvg([
      { date: "20261104", views: 50 },
      { date: "20261105", views: 100 },
    ]);
    expect(svg).toContain('class="chart-point"');
    expect(svg).toContain('data-date="20261105"');
    expect(svg).toContain('data-views="100"');
  });

  it("labels the axis with a few dates including both ends", () => {
    const points = Array.from({ length: 28 }, (_, i) => ({
      date: `202610${String(i + 1).padStart(2, "0")}`,
      views: i,
    }));
    const svg = buildLineChartSvg(points);
    expect(svg).toContain('class="chart-axis-label"');
    expect(svg).toContain(">10/1<");
    expect(svg).toContain(">10/28<");
    // Five ticks at most for 28 days.
    expect(svg.match(/chart-axis-label/g)).toHaveLength(5);
  });

  it("handles a single point and all-zero views", () => {
    const svg = buildLineChartSvg([{ date: "20261105", views: 0 }]);
    expect(svg).toContain("<polyline");
    expect(svg).toContain("最大 1");
  });
});

describe("date formatting", () => {
  it("formats short and full labels", () => {
    expect(formatDateLabel("20261102")).toBe("11/2");
    expect(formatDateLabel("20261028")).toBe("10/28");
    expect(formatDateFull("20261102")).toBe("2026年11月2日");
  });

  it("builds the tooltip text", () => {
    expect(tooltipText({ date: "20261102", views: 962 })).toBe(
      "2026年11月2日 · 962回",
    );
    expect(tooltipText({ date: "20261105", views: "1053" })).toBe(
      "2026年11月5日 · 1,053回",
    );
  });
});

describe("tickIndices", () => {
  it("returns all indices for short series", () => {
    expect(tickIndices(3)).toEqual([0, 1, 2]);
    expect(tickIndices(0)).toEqual([]);
  });

  it("spaces five ticks across a long series", () => {
    expect(tickIndices(28)).toEqual([0, 7, 14, 20, 27]);
  });
});

describe("buildFollowChartSvg", () => {
  const count = (svg, needle) => svg.split(needle).length - 1;

  it("renders an empty svg for no days", () => {
    const svg = buildFollowChartSvg([]);
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("<rect");
    expect(buildFollowChartSvg(null)).toContain("<svg");
  });

  it("draws follow bars above and unfollow bars below one baseline", () => {
    const svg = buildFollowChartSvg(
      [
        { date: "20261107", follows: 10, unfollows: 5, posts: [] },
        { date: "20261108", follows: 20, unfollows: null, posts: [{ id: "m" }] },
      ],
      { width: 200, height: 140, padding: 10 },
    );
    expect(svg).toContain('class="follow-baseline"');
    expect(count(svg, 'class="follow-bar"')).toBe(2);
    // The null unfollow day draws no bar below the baseline.
    expect(count(svg, 'class="unfollow-bar"')).toBe(1);
    expect(svg).toContain("最大フォロー 20");
    expect(svg).toContain("最大解除 5");
    expect(svg).toContain(">11/7<");
    expect(svg).toContain(">11/8<");
  });

  it("scales both sides to the larger maximum", () => {
    // height 140, padding 10: inner height 98, half 49, baseline
    // at y=59. The maximum follow bar (20) fills the upper half.
    const svg = buildFollowChartSvg(
      [
        { date: "20261107", follows: 10, unfollows: 5, posts: [] },
        { date: "20261108", follows: 20, unfollows: null, posts: [] },
      ],
      { width: 200, height: 140, padding: 10 },
    );
    expect(svg).toContain('x="136" y="10" width="18" height="49"');
    expect(svg).toContain('x="46" y="34.5" width="18" height="24.5"');
    // The unfollow bar starts at the baseline and grows down.
    expect(svg).toContain('x="46" y="59" width="18" height="12.3"');
  });

  it("marks only the days that carry posts", () => {
    const svg = buildFollowChartSvg([
      { date: "20261107", follows: 3, unfollows: 1, posts: [] },
      { date: "20261108", follows: 3, unfollows: 1, posts: [{ id: "a" }, { id: "b" }] },
      { date: "20261109", follows: null, unfollows: null, posts: [{ id: "c" }] },
    ]);
    expect(count(svg, 'class="follow-post-marker"')).toBe(2);
  });

  it("gives posted days a full-column hit rect carrying the date", () => {
    // width 200, padding 10: inner width 180, so each of the two
    // days owns a 90-wide column; the second starts at x=100.
    const svg = buildFollowChartSvg(
      [
        { date: "20261107", follows: 10, unfollows: 5, posts: [] },
        { date: "20261108", follows: 20, unfollows: null, posts: [{ id: "m" }] },
      ],
      { width: 200, height: 140, padding: 10 },
    );
    expect(count(svg, 'class="follow-day-hit"')).toBe(1);
    expect(svg).toContain(
      '<rect class="follow-day-hit" data-date="20261108" x="100" y="0" width="90" height="140"/>',
    );
    expect(svg).toContain('class="follow-post-marker" data-date="20261108"');
  });

  it("draws no hit rect when no day carries posts", () => {
    const svg = buildFollowChartSvg([
      { date: "20261107", follows: 10, unfollows: 5, posts: [] },
      { date: "20261108", follows: 20, unfollows: null, posts: [] },
    ]);
    expect(svg).not.toContain("follow-day-hit");
  });

  it("draws no bars for zero or null values", () => {
    const svg = buildFollowChartSvg([
      { date: "20261107", follows: 0, unfollows: 0, posts: [] },
      { date: "20261108", follows: null, unfollows: null, posts: [] },
    ]);
    expect(svg).not.toContain("<rect");
    expect(svg).toContain("最大フォロー 0");
  });
});
