import { describe, expect, it } from "vitest";
import {
  buildLineChartSvg,
  buildFollowChartSvg,
  formatAxisValue,
  formatDateLabel,
  formatDateFull,
  niceAxisScale,
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

  it("marks the max label so privacy masking can hide it", () => {
    const svg = buildLineChartSvg([{ date: "20261105", views: 42 }]);
    expect(svg).toContain('class="chart-max-label"');
    expect(svg).toContain("最大 42");
  });

  it("marks only the days in markedDays, with a column hit rect", () => {
    const points = [
      { date: "20261104", views: 50 },
      { date: "20261105", views: 100 },
      { date: "20261106", views: 25 },
    ];
    const svg = buildLineChartSvg(points, {
      markedDays: new Map([["20261105", 1]]),
    });
    const count = (needle) => svg.split(needle).length - 1;
    expect(count('class="blog-post-marker"')).toBe(1);
    expect(svg).toContain('class="blog-post-marker" data-date="20261105"');
    expect(count('class="blog-day-hit"')).toBe(1);
    expect(svg).toContain('class="blog-day-hit" data-date="20261105"');
    // A single-article day carries no count label.
    expect(svg).not.toContain('class="blog-post-count"');
  });

  it("shows the article count beside the marker on multi-article days", () => {
    const svg = buildLineChartSvg(
      [
        { date: "20261104", views: 50 },
        { date: "20261105", views: 100 },
      ],
      { markedDays: new Map([["20261104", 2]]) },
    );
    expect(svg).toContain('class="blog-post-count"');
    expect(svg).toContain(">2</text>");
  });

  it("draws the marked day's column between its neighbours' midpoints", () => {
    // width 200, padding 10, three points: x = 10, 100, 190.
    // The middle day's column runs from 55 to 145.
    const svg = buildLineChartSvg(
      [
        { date: "20261104", views: 50 },
        { date: "20261105", views: 100 },
        { date: "20261106", views: 25 },
      ],
      { width: 200, height: 100, padding: 10, markedDays: new Map([["20261105", 1]]) },
    );
    expect(svg).toContain(
      '<rect class="blog-day-hit" data-date="20261105" x="55" y="0" width="90" height="100"/>',
    );
  });

  it("draws no markers or column hits without markedDays", () => {
    const svg = buildLineChartSvg([
      { date: "20261104", views: 50 },
      { date: "20261105", views: 100 },
    ]);
    expect(svg).not.toContain("blog-post-marker");
    expect(svg).not.toContain("blog-day-hit");
  });

  it("never marks the max label public", () => {
    // The chart builder has no public-label switch: every
    // chart's figures are unpublished rollups, so the label
    // always masks (the stylesheet hides it while masking).
    const svg = buildLineChartSvg([{ date: "20261105", views: 42 }], {
      publicMaxLabel: true,
    });
    expect(svg).toContain('class="chart-max-label"');
    expect(svg).not.toContain("is-public");
    expect(svg).toContain("最大 42");
  });

  it("draws a y axis with gridlines and round tick labels on request", () => {
    const svg = buildLineChartSvg(
      [
        { date: "20261109", views: 480000 },
        { date: "20261110", views: 520000 },
        { date: "20261111", views: 550000 },
      ],
      { yAxis: true },
    );
    const count = (needle) => svg.split(needle).length - 1;
    // Five ticks (48万..56万), each with a gridline and a label.
    expect(count('class="chart-gridline"')).toBe(5);
    expect(count('class="chart-y-label"')).toBe(5);
    expect(svg).toContain(">48万</text>");
    expect(svg).toContain(">56万</text>");
    // The ticks carry the scale, so the max label is dropped,
    // and the labels never carry the public exemption.
    expect(svg).not.toContain("chart-max-label");
    expect(svg).not.toContain("最大");
    expect(svg).not.toContain("is-public");
  });

  it("scales the y axis to the data, not to zero", () => {
    // Domain 48万..56万 widened by 4%: the lowest point sits
    // above the plot's bottom edge (default height 196, bottom
    // inner edge y = 196 - 46 = 150) instead of on it.
    const svg = buildLineChartSvg(
      [
        { date: "20261109", views: 480000 },
        { date: "20261110", views: 550000 },
      ],
      { yAxis: true },
    );
    const firstPoint = svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)"/);
    expect(Number(firstPoint[2])).toBeLessThan(150);
    expect(Number(firstPoint[2])).toBeGreaterThan(24);
  });

  it("keeps the zero-based chart without the yAxis option", () => {
    const svg = buildLineChartSvg([
      { date: "20261109", views: 480000 },
      { date: "20261110", views: 550000 },
    ]);
    expect(svg).not.toContain("chart-gridline");
    expect(svg).not.toContain("chart-y-label");
    expect(svg).toContain("最大 550000");
  });

  it("draws the y axis for a single point", () => {
    const svg = buildLineChartSvg([{ date: "20261109", views: 500 }], {
      yAxis: true,
    });
    expect(svg).toContain('class="chart-gridline"');
    expect(svg).toContain('class="chart-y-label"');
    expect(svg).toContain("<polyline");
  });
});

describe("niceAxisScale", () => {
  it("snaps the domain outward to round steps", () => {
    expect(niceAxisScale(480000, 550000)).toEqual({
      lo: 480000,
      hi: 560000,
      ticks: [480000, 500000, 520000, 540000, 560000],
    });
    expect(niceAxisScale(100, 175)).toEqual({
      lo: 100,
      hi: 180,
      ticks: [100, 120, 140, 160, 180],
    });
  });

  it("never starts below zero for non-negative data", () => {
    const scale = niceAxisScale(3, 40);
    expect(scale.lo).toBe(0);
    expect(scale.ticks[0]).toBe(0);
  });

  it("expands a flat range so a single value still scales", () => {
    const scale = niceAxisScale(500, 500);
    expect(scale.lo).toBeLessThan(500);
    expect(scale.hi).toBeGreaterThan(500);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects unusable ranges", () => {
    expect(niceAxisScale(Number.NaN, 10)).toBeNull();
    expect(niceAxisScale(10, 5)).toBeNull();
  });
});

describe("formatAxisValue", () => {
  it("writes large counts in 万 units", () => {
    expect(formatAxisValue(480000)).toBe("48万");
    expect(formatAxisValue(10000)).toBe("1万");
    expect(formatAxisValue(125000)).toBe("12.5万");
  });

  it("groups smaller counts and trims fractions", () => {
    expect(formatAxisValue(4400)).toBe("4,400");
    expect(formatAxisValue(142)).toBe("142");
    expect(formatAxisValue(0)).toBe("0");
    expect(formatAxisValue(0.5)).toBe("0.5");
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
    // Both max labels carry the class privacy masking hides.
    expect(count(svg, 'class="chart-max-label"')).toBe(2);
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
