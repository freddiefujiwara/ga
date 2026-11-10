import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for the boot display contract, which the unit tests over
// src modules cannot see:
//   - the page must open on the loading screen, never on the
//     sign-in gate — while a saved session is restored in the
//     background, a visible Google button reads as "not signed
//     in yet" and makes the visitor anxious;
//   - the gate (and its button) appears only once sign-in is
//     truly required, so main.js must hide the loading screen in
//     every transition that shows the gate or the expired screen;
//   - the "as of" line lives above the tab bar so every tab
//     shows which collection its figures come from.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

const sectionTag = (id) => {
  const match = html.match(new RegExp(`<section id="${id}"[^>]*>`));
  return match ? match[0] : "";
};

describe("boot display", () => {
  it("opens on the loading screen, not the sign-in gate", () => {
    expect(sectionTag("boot-loading")).not.toBe("");
    expect(sectionTag("boot-loading")).not.toContain("hidden");
    expect(sectionTag("gate")).toContain("hidden");
  });

  it("keeps the dashboard and the expired screen hidden at open", () => {
    expect(html).toMatch(/<div id="dashboard" hidden>/);
    expect(sectionTag("share-expired")).toContain("hidden");
  });

  it("hides the loading screen when the gate or expired screen shows", () => {
    for (const fn of ["showGate", "showExpired"]) {
      const body = mainJs.match(
        new RegExp(`function ${fn}\\(\\) \\{[^}]*\\}`),
      )?.[0];
      expect(body).toContain("loadingEl.hidden = true");
    }
  });

  it("starts boot from the loading screen", () => {
    expect(mainJs).toContain('getElementById("boot-loading")');
    const bootBody = mainJs.match(/async function boot\(\) \{[^}]*\}/)?.[0];
    expect(bootBody).toContain("showLoading()");
  });

  it("orders the overview 主要KPI above チャネルの大きさ, with per-channel top lists", () => {
    const overviewAt = html.indexOf('id="tab-overview"');
    const kpiAt = html.indexOf("主要KPI", overviewAt);
    const sizeAt = html.indexOf("チャネルの大きさ", overviewAt);
    expect(kpiAt).toBeGreaterThan(-1);
    expect(sizeAt).toBeGreaterThan(kpiAt);
    expect(html).toContain("チャネル別トップ3");
    expect(html).toContain('<div id="top-posts"></div>');
  });

  it("orders the overview チャネル別トップ3 above 推移", () => {
    const overviewAt = html.indexOf('id="tab-overview"');
    const topAt = html.indexOf("チャネル別トップ3", overviewAt);
    const trendAt = html.indexOf(">推移<", overviewAt);
    expect(topAt).toBeGreaterThan(-1);
    expect(trendAt).toBeGreaterThan(topAt);
  });

  it("gives the blog KPI row its article boxes and YouTube its trend slot", () => {
    expect(html).toContain('id="total-articles"');
    expect(html).toContain('id="total-per-article"');
    expect(html).toContain('id="youtube-history"');
    expect(mainJs).toContain("articleViewStats(blogArticles)");
    expect(mainJs).toContain("youtubeHistorySeries(overviewState.historyRows)");
  });

  it("shows the collection time above the tabs, fed from sns_detail", () => {
    const dashboardAt = html.indexOf('id="dashboard"');
    const asOfAt = html.indexOf('id="data-asof"');
    const tabsAt = html.indexOf('id="tabs"');
    expect(asOfAt).toBeGreaterThan(dashboardAt);
    expect(asOfAt).toBeLessThan(tabsAt);
    expect(mainJs).toContain('getElementById("data-asof")');
    expect(mainJs).toMatch(/dataAsOfText\(detail\?\.collected_at\)/);
  });
});
