import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for the dashboard's loading order, which the unit tests
// over src modules cannot see:
//   - every request is independent (a different action or report
//     shape off the same bridge), so loadDashboard must start
//     them all up front — the SNS snapshot and history included —
//     instead of letting sections queue behind each other;
//   - the dashboard reveal waits only for the GA totals (that
//     response doubles as the auth verdict); the blog sections
//     and the SNS sections fill in as their own responses land.
// A regression to "await everything, then reveal" would put the
// loading screen back at the mercy of the slowest request.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

// The body of a top-level function declaration: from its header
// to the closing brace at column 0.
const fnBody = (header) => {
  const start = mainJs.indexOf(header);
  if (start < 0) {
    return "";
  }
  const end = mainJs.indexOf("\n}\n", start);
  return end < 0 ? "" : mainJs.slice(start, end);
};

describe("dashboard loading order", () => {
  const dashboard = fnBody("async function loadDashboard()");

  it("starts the SNS snapshot and history before awaiting the totals", () => {
    const totalsAwait = dashboard.indexOf("await totalsPromise");
    expect(totalsAwait).toBeGreaterThan(-1);
    expect(dashboard.indexOf("fetchSnsDetail(")).toBeGreaterThan(-1);
    expect(dashboard.indexOf("fetchSnsDetail(")).toBeLessThan(totalsAwait);
    expect(dashboard.indexOf("fetchSnsHistory(")).toBeGreaterThan(-1);
    expect(dashboard.indexOf("fetchSnsHistory(")).toBeLessThan(totalsAwait);
  });

  it("hands the pre-started promises to the SNS loaders", () => {
    expect(dashboard).toContain("loadSns(detailPromise)");
    expect(dashboard).toContain("loadSnsHistory(historyPromise)");
  });

  it("does not gate the reveal on the whole report batch", () => {
    expect(dashboard).not.toContain("await Promise.all");
    expect(dashboard).toContain("dashboardEl.hidden = false");
  });

  it("lands the blog page sections on their own shared inputs", () => {
    const fill = fnBody("async function fillBlogPages(");
    expect(fill).toContain("await Promise.all");
    expect(fill).toContain("pagesPromise");
    expect(fill).toContain("titlesPromise");
    expect(fill).toContain("metaPromise");
  });

  it("renders the daily chart and the sources ranking off their own responses", () => {
    const sections = fnBody("function loadBlogSections(");
    expect(sections).toContain("dailyPromise");
    expect(sections).toContain("sourcesPromise");
    expect(sections).toContain('renderRanking("top-sources", sources, 8)');
  });
});
