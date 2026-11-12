import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the section load states: boots main.js
// in jsdom with a stubbed bridge, holds the SNS snapshot, the
// SNS history and the GA page rows back, and checks that the
// late-filled sections show their loading lines mid-flight and
// their real content once the responses land — and, in the
// second scenario, that failed loads end every such section on
// the failure line. Exercising the real boot also guards the
// wiring the structural tests cannot run: before this change,
// loadBlogSections referenced speedPromise without taking it as
// a parameter, so fillBlogPages threw on every dashboard load
// and the page-fed blog sections never rendered at all.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const ARTICLE_ID = "2026010812345678901234567";
// The title leads with its publication date, like every real
// article: the daily chart's overlay reads the day off it, and
// the stubbed daily row below is dated the same day.
const ARTICLE_TITLE = "2026-11-10 検証用の記事タイトル";

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const jsonResponse = (data) => ({
  ok: true,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const report = (rows) => jsonResponse({ ok: true, data: { rows } });
const row = (dimensionValues, metricValues) => ({
  dimensionValues: dimensionValues.map((value) => ({ value })),
  metricValues: metricValues.map((value) => ({ value })),
});

async function until(fn, timeoutMs = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("dashboard load states (runtime)", () => {
  it("shows loading lines, then fills the sections in", async () => {
    document.documentElement.innerHTML = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<!doctype html>/i, "");
    const payload = Buffer.from(
      JSON.stringify({ email: "owner@example.com" }),
    ).toString("base64url");
    localStorage.setItem("ga-google-id-token", `x.${payload}.y`);

    const detailGate = deferred();
    const pagesGate = deferred();
    const historyGate = deferred();
    const fetchStub = vi.fn(async (url) => {
      const text = String(url);
      if (text.includes("o=rss")) {
        return {
          ok: true,
          text: async () =>
            `<rss><channel><item><title>${ARTICLE_TITLE}</title>` +
            `<link>https://freddiefujiwara.com/blog/${ARTICLE_ID}</link></item></channel></rss>`,
        };
      }
      if (text.includes("o=titles")) {
        return jsonResponse({
          titles: { [ARTICLE_ID]: ARTICLE_TITLE },
          tags: { [ARTICLE_ID]: ["川口"] },
        });
      }
      const params = new URL(text).searchParams;
      if (params.get("action") === "sns_detail") {
        return detailGate.promise;
      }
      if (params.get("action") === "sns_history") {
        return historyGate.promise;
      }
      const dimensions = params.get("dimensions");
      const metrics = params.get("metrics") || "";
      if (metrics.includes("customEvent:render_ms")) {
        return report([]);
      }
      if (dimensions === "date") {
        return report([row(["20261110"], ["42"])]);
      }
      if (dimensions === "sessionDefaultChannelGroup") {
        return report([row(["Organic Search"], ["77"])]);
      }
      if (dimensions === "") {
        return jsonResponse({
          ok: true,
          data: {
            rows: [
              {
                metricValues: [
                  { value: "1000" },
                  { value: "100" },
                  { value: "120" },
                ],
              },
            ],
          },
        });
      }
      // The page-rows report (limit=250, no dimensions).
      return pagesGate.promise;
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    // The dashboard reveals on the GA totals alone.
    await until(() => document.getElementById("dashboard").hidden === false);

    // Mid-flight: the snapshot-fed KPI card and the page-fed
    // blog sections carry the loading line.
    const kpiText = document.getElementById("kpi-cards").textContent;
    expect(kpiText).toContain("読み込み中…");
    expect(
      document.getElementById("blog-article-body").textContent,
    ).toContain("読み込み中…");
    expect(document.getElementById("total-articles").textContent).toBe(
      "読み込み中…",
    );
    expect(document.getElementById("top-pages").textContent).toContain(
      "読み込み中…",
    );
    expect(document.getElementById("sns-history").textContent).toContain(
      "読み込み中…",
    );

    // Sections with their own fast responses have already landed.
    expect(document.getElementById("top-sources").textContent).toContain(
      "Organic Search",
    );
    expect(document.getElementById("daily-chart").innerHTML).toContain("<svg");

    // Land the snapshot and the page rows.
    detailGate.resolve(
      jsonResponse({
        ok: true,
        collected_at: "2026-11-11T01:00:00Z",
        instagram: {},
        youtube: {},
        threads: {},
        x: {},
      }),
    );
    pagesGate.resolve(
      report([row([`/blog/${ARTICLE_ID}`], ["123"])]),
    );
    historyGate.resolve(jsonResponse({ ok: true, rows: [] }));

    await until(() =>
      document
        .getElementById("blog-article-body")
        .textContent.includes(ARTICLE_TITLE),
    );
    expect(document.getElementById("total-articles").textContent).toBe("1");
    expect(document.getElementById("top-pages").textContent).toContain(
      ARTICLE_TITLE,
    );
    expect(document.getElementById("blog-genres").textContent).toContain(
      "川口",
    );
    // The history load settled empty: the empty-state line, not
    // the loading line.
    await until(() =>
      document
        .getElementById("sns-history")
        .textContent.includes("履歴はまだありません"),
    );
    // No loading line survives anywhere on the blog tab.
    expect(document.getElementById("tab-blog").textContent).not.toContain(
      "読み込み中…",
    );

    // The daily chart's article overlay: the stubbed article's
    // title date matches the daily row's day, so the day carries
    // the marker and the entry below lists the article with a
    // link, next to the day's (masked) view count.
    const dailyChart = document.getElementById("daily-chart");
    const hit = dailyChart.querySelector(
      '.blog-day-hit[data-date="20261110"]',
    );
    expect(hit).not.toBeNull();
    expect(
      dailyChart.querySelector('.blog-post-marker[data-date="20261110"]'),
    ).not.toBeNull();
    const entry = dailyChart.querySelector(
      '.blog-day-entry[data-date="20261110"]',
    );
    expect(entry).not.toBeNull();
    expect(entry.textContent).toContain("表示回数");
    expect(entry.textContent).toContain("42回");
    const entryLink = entry.querySelector("a");
    expect(entryLink.textContent).toBe(ARTICLE_TITLE);
    expect(entryLink.getAttribute("href")).toBe(
      `https://freddiefujiwara.com/blog/${ARTICLE_ID}`,
    );
    // Tapping the marked day's column highlights the day on both
    // the chart and the entry (jsdom has no scrollIntoView, so
    // the jump's scroll is stubbed out).
    window.HTMLElement.prototype.scrollIntoView = () => {};
    hit.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(hit.classList.contains("selected")).toBe(true);
    expect(entry.classList.contains("highlight")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("ends failed sections on the failure line, not the loading line", async () => {
    vi.resetModules();
    document.documentElement.innerHTML = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<!doctype html>/i, "");
    const payload = Buffer.from(
      JSON.stringify({ email: "owner@example.com" }),
    ).toString("base64url");
    localStorage.setItem("ga-google-id-token", `x.${payload}.y`);

    const fetchStub = vi.fn(async (url) => {
      const text = String(url);
      if (text.includes("o=rss")) {
        return { ok: true, text: async () => "<rss><channel></channel></rss>" };
      }
      if (text.includes("o=titles")) {
        return jsonResponse({ titles: {}, tags: {} });
      }
      const params = new URL(text).searchParams;
      if (params.get("action") === "sns_detail") {
        throw new Error("network down");
      }
      if (params.get("action") === "sns_history") {
        throw new Error("network down");
      }
      const dimensions = params.get("dimensions");
      const metrics = params.get("metrics") || "";
      if (metrics.includes("customEvent:render_ms")) {
        return report([]);
      }
      if (dimensions === "date") {
        throw new Error("network down");
      }
      if (dimensions === "sessionDefaultChannelGroup") {
        return jsonResponse({ ok: false, error: "bridge error" });
      }
      if (dimensions === "") {
        return jsonResponse({
          ok: true,
          data: {
            rows: [
              {
                metricValues: [
                  { value: "1000" },
                  { value: "100" },
                  { value: "120" },
                ],
              },
            ],
          },
        });
      }
      // The page-rows report fails too.
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");
    await until(() => document.getElementById("dashboard").hidden === false);
    await until(() =>
      document
        .getElementById("blog-article-body")
        .textContent.includes("取得できませんでした"),
    );
    expect(document.getElementById("top-pages").textContent).toContain(
      "取得できませんでした",
    );
    expect(document.getElementById("blog-genres").textContent).toContain(
      "取得できませんでした",
    );
    expect(document.getElementById("total-articles").textContent).toBe(
      "取得できませんでした",
    );
    expect(document.getElementById("daily-chart").textContent).toContain(
      "取得できませんでした",
    );
    expect(document.getElementById("top-sources").textContent).toContain(
      "取得できませんでした",
    );
    expect(document.getElementById("sns-history").textContent).toContain(
      "取得できませんでした",
    );
    expect(document.getElementById("kpi-cards").textContent).toContain(
      "取得できませんでした",
    );
    // Nothing is left pretending to load.
    expect(document.getElementById("dashboard").textContent).not.toContain(
      "読み込み中…",
    );
    vi.unstubAllGlobals();
  });
});
