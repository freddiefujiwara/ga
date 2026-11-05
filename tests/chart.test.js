import { describe, expect, it } from "vitest";
import { buildLineChartSvg } from "../src/chart.js";

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
    expect(svg).toContain("<title>20261105: 100</title>");
  });

  it("handles a single point and all-zero views", () => {
    const svg = buildLineChartSvg([{ date: "20261105", views: 0 }]);
    expect(svg).toContain("<polyline");
    expect(svg).toContain("最大 1");
  });
});
