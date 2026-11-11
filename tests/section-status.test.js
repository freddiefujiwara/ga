import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SECTION_LOADING_TEXT,
  SECTION_FAILED_TEXT,
  setSectionLoading,
  setSectionFailed,
} from "../src/section-status.js";

// Per-section load states: since the dashboard loads in parallel
// and reveals early, a section whose own response is still in
// flight must say so — the owner's report that "the article info
// is not displayed" was a blog section sitting silently empty
// while its data was on the way (and, for the page rows, never
// arriving at all: loadBlogSections referenced speedPromise
// without taking it as a parameter, so fillBlogPages threw
// before it could render). These tests pin the state lines'
// shape per container kind and the main.js wiring that puts
// every late-filled section through them.
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

describe("section status lines", () => {
  it("uses the SNS status lines' wording for loading and failure", () => {
    expect(SECTION_LOADING_TEXT).toBe("読み込み中…");
    expect(SECTION_FAILED_TEXT).toBe("取得できませんでした");
  });

  it("puts a muted paragraph into a plain container, replacing its contents", () => {
    const div = document.createElement("div");
    div.innerHTML = "<p>前の内容</p>";
    setSectionLoading(div);
    expect(div.children).toHaveLength(1);
    const p = div.querySelector("p");
    expect(p.className).toContain("meta");
    expect(p.className).toContain("section-status");
    expect(p.textContent).toBe(SECTION_LOADING_TEXT);
  });

  it("marks the failure line as failed, in the same container", () => {
    const div = document.createElement("div");
    setSectionLoading(div);
    setSectionFailed(div);
    const p = div.querySelector("p");
    expect(p.textContent).toBe(SECTION_FAILED_TEXT);
    expect(p.className).toContain("section-failed");
  });

  it("puts a list item into a ranking list", () => {
    const ol = document.createElement("ol");
    setSectionLoading(ol);
    const li = ol.querySelector("li");
    expect(li).not.toBeNull();
    expect(li.textContent).toBe(SECTION_LOADING_TEXT);
  });

  it("puts a full-width row into a table body, spanning the header's columns", () => {
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>タイトル</th><th>ジャンル</th><th>表示回数</th></tr></thead>" +
      "<tbody></tbody>";
    const tbody = table.querySelector("tbody");
    setSectionLoading(tbody);
    const td = tbody.querySelector("td");
    expect(td.colSpan).toBe(3);
    expect(td.textContent).toBe(SECTION_LOADING_TEXT);
  });

  it("accepts a caller-specific message", () => {
    const div = document.createElement("div");
    setSectionFailed(div, "タグ情報を取得できませんでした");
    expect(div.querySelector("p").textContent).toBe(
      "タグ情報を取得できませんでした",
    );
  });

  it("is replaced wholesale when the section renders for real", () => {
    const div = document.createElement("div");
    setSectionLoading(div);
    // Section renderers assign innerHTML before appending their
    // content; the status line must not survive that.
    div.innerHTML = "<p>実データ</p>";
    expect(div.querySelector(".section-status")).toBeNull();
    expect(div.textContent).toBe("実データ");
  });
});

describe("main.js section-state wiring", () => {
  it("passes the speed report promise into the blog sections (the #56 slip)", () => {
    const dashboard = fnBody("async function loadDashboard()");
    expect(dashboard).toContain("speedPromise,");
    const sections = fnBody("function loadBlogSections(");
    expect(sections).toContain("speedPromise");
    expect(sections).toContain(
      "fillBlogPages(pagesPromise, titlesPromise, metaPromise, speedPromise)",
    );
  });

  it("holds every blog section in its loading state until its response lands", () => {
    const sections = fnBody("function loadBlogSections(");
    // The daily chart and the sources list are held in locals
    // because their promise handlers reuse them.
    expect(sections).toContain(
      'const dailyChartEl = document.getElementById("daily-chart")',
    );
    expect(sections).toContain("setSectionLoading(dailyChartEl)");
    expect(sections).toContain(
      'const sourcesEl = document.getElementById("top-sources")',
    );
    expect(sections).toContain("setSectionLoading(sourcesEl)");
    for (const id of ["top-pages", "blog-genres", "blog-article-body"]) {
      expect(sections).toContain(
        `setSectionLoading(document.getElementById("${id}"))`,
      );
    }
    expect(sections).toContain("SECTION_LOADING_TEXT");
  });

  it("ends the blog daily chart and sources on the failure line when their loads fail", () => {
    const sections = fnBody("function loadBlogSections(");
    expect(sections).toContain("setSectionFailed(dailyChartEl)");
    expect(sections).toContain("setSectionFailed(sourcesEl)");
  });

  it("settles every page-fed blog section as failed when the page rows fail", () => {
    const settle = fnBody("function settleBlogPagesFailed()");
    expect(settle).toContain("overviewState.blogFailed = true");
    for (const id of ["top-pages", "blog-genres", "blog-article-body"]) {
      expect(settle).toContain(
        `setSectionFailed(document.getElementById("${id}"))`,
      );
    }
    const fill = fnBody("async function fillBlogPages(");
    expect(fill).toContain("settleBlogPagesFailed()");
    expect(fill).toContain("overviewState.blogSettled = true");
  });

  it("shows the trend section loading, then failed or rendered, from the history load", () => {
    const load = fnBody("async function loadSnsHistory(");
    expect(load).toContain("setSectionLoading(historyEl)");
    expect(load).toContain("setSectionFailed(historyEl)");
    expect(load).toContain("overviewState.historyFailed = failed");
  });

  it("settles the SNS-driven sections when the snapshot load fails", () => {
    const load = fnBody("async function loadSns(");
    expect(load).toContain("settleSnsFailed()");
    const settle = fnBody("function settleSnsFailed()");
    expect(settle).toContain("overviewState.detailFailed = true");
    expect(settle).toContain("renderOverview()");
    expect(settle).toContain("renderThreads()");
    expect(settle).toContain("renderX()");
  });

  it("renders the overview KPI cards through their load-state mapping", () => {
    expect(mainJs).toContain("function kpiLoadState(item)");
    const overview = fnBody("function renderOverview()");
    expect(overview).toContain(".map(kpiLoadState)");
    const mapping = fnBody("function kpiLoadState(item)");
    expect(mapping).toContain("SECTION_LOADING_TEXT");
    expect(mapping).toContain("SECTION_FAILED_TEXT");
  });

  it("words an empty top-list row by the load behind its channel", () => {
    expect(mainJs).toContain("function topPostsPendingText(channel)");
    const render = fnBody("function renderTopPosts()");
    expect(render).toContain("topPostsPendingText(section.channel)");
  });

  it("keeps the other tabs' late-filled sections behind the same helpers", () => {
    expect(mainJs).toContain("function fillDetailPending(el)");
    expect(mainJs).toContain("function fillHistoryPending(el)");
    expect(fnBody("function renderThreads()")).toContain("fillDetailPending(");
    expect(fnBody("function renderThreads()")).toContain("fillHistoryPending(");
    expect(fnBody("function renderX()")).toContain("fillDetailPending(");
    expect(fnBody("function renderYoutubeHistory()")).toContain(
      "fillHistoryPending(",
    );
  });
});
