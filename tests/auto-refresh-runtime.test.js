import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runtime coverage for the dashboard's auto-refresh: boots
// main.js in jsdom with a stubbed bridge and fake timers, then
// checks that an open page re-fetches the SNS snapshot and
// history on the ten-minute interval and re-renders in place —
// the data-as-of line moves to the new collection, the open tab
// and the Instagram per-post genre filter survive, a hidden tab
// costs no requests and catches up when it returns, and a
// failed refresh leaves the current figures untouched.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

const mediaRow = (id, caption, views) => ({
  id,
  type: "REELS",
  posted_at: "2026-11-13T01:00:00Z",
  caption,
  permalink: `https://www.instagram.com/reel/${id}/`,
  views,
  reach: views,
  likes: 10,
  comments: 1,
  shares: 2,
  saves: 3,
  avg_watch_sec: 8,
  total_watch_sec: 800,
});

const detailPayload = (collectedAt, musicViews) =>
  jsonResponse({
    ok: true,
    collected_at: collectedAt,
    instagram: {
      recent_media: [
        mediaRow("m1", "川口の歌を作りました", musicViews),
        mediaRow("m2", "今日のランチはカレー", 222),
      ],
    },
    youtube: {},
    threads: {},
    x: {},
  });

// The boot chain is promise-driven, so a bounded run of
// microtask turns settles it without the (faked) clock moving.
async function until(fn, turns = 500) {
  for (let i = 0; i < turns; i += 1) {
    if (fn()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("timed out waiting for condition");
}

describe("dashboard auto-refresh (runtime)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("re-fetches the SNS data on the interval and keeps the view state", async () => {
    vi.useFakeTimers();
    document.documentElement.innerHTML = html
      .replace(/<script[\s\S]*?<\/script>/g, "")
      .replace(/<!doctype html>/i, "");
    localStorage.setItem("ga-session-token", "test-session-token");

    let detailCalls = 0;
    let historyCalls = 0;
    let detailFails = false;
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
        detailCalls += 1;
        if (detailFails) {
          throw new Error("network down");
        }
        return detailCalls === 1
          ? detailPayload("2026-11-13T10:00:00Z", 111)
          : detailPayload("2026-11-13T11:00:00Z", 999);
      }
      if (params.get("action") === "sns_history") {
        historyCalls += 1;
        return jsonResponse({ ok: true, rows: [] });
      }
      const dimensions = params.get("dimensions");
      const metrics = params.get("metrics") || "";
      if (metrics.includes("customEvent:render_ms")) {
        return report([]);
      }
      if (dimensions === "date") {
        return report([row(["20261113"], ["42"])]);
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
      return report([]);
    });
    vi.stubGlobal("fetch", fetchStub);

    await import("../src/main.js");

    const dataAsOf = () => document.getElementById("data-asof").textContent;
    const mediaBody = () => document.getElementById("sns-media-body");

    await until(
      () =>
        document.getElementById("dashboard").hidden === false &&
        dataAsOf().includes("19:00"),
    );
    expect(detailCalls).toBe(1);
    expect(historyCalls).toBe(1);
    expect(mediaBody().textContent).toContain("111");

    // Open the Instagram tab and narrow the per-post table to
    // the 音楽 genre; both must survive the refresh.
    document
      .querySelector('#tabs .tab-button[data-tab="instagram"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("tab-instagram").hidden).toBe(false);
    const genreButtons = [
      ...document.querySelectorAll("#sns-media-genre-tabs button"),
    ];
    const musicButton = genreButtons.find((btn) =>
      btn.textContent.startsWith("音楽"),
    );
    expect(musicButton).toBeTruthy();
    musicButton.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect(mediaBody().textContent).toContain("川口の歌");
    expect(mediaBody().textContent).not.toContain("ランチはカレー");

    // One interval later the snapshot and history are re-fetched
    // and the page re-renders in place: the new collection's
    // timestamp and figures land, the tab stays on Instagram,
    // and the genre filter still narrows the table.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await until(() => dataAsOf().includes("20:00"));
    expect(detailCalls).toBe(2);
    expect(historyCalls).toBe(2);
    expect(mediaBody().textContent).toContain("999");
    expect(document.getElementById("tab-instagram").hidden).toBe(false);
    expect(mediaBody().textContent).not.toContain("ランチはカレー");
    const activeGenre = document.querySelector(
      "#sns-media-genre-tabs button.active",
    );
    expect(activeGenre.textContent).toContain("音楽");

    // A failed refresh leaves the current display untouched and
    // does not stop the schedule: the next interval retries and
    // lands normally.
    detailFails = true;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(detailCalls).toBe(3);
    expect(dataAsOf()).toContain("20:00");
    expect(mediaBody().textContent).toContain("999");
    detailFails = false;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(detailCalls).toBe(4);
    expect(mediaBody().textContent).toContain("999");

    // While the tab is hidden the interval costs no requests;
    // coming back after the interval has elapsed refreshes at
    // once instead of waiting out the timer.
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(detailCalls).toBe(4);
    Object.defineProperty(document, "hidden", {
      value: false,
      configurable: true,
    });
    document.dispatchEvent(new window.Event("visibilitychange"));
    await until(() => detailCalls === 5);
    expect(historyCalls).toBe(5);
  });
});
