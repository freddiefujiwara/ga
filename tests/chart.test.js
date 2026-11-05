import { describe, expect, it } from "vitest";
import {
  buildLineChartSvg,
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
