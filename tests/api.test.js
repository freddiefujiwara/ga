import { describe, expect, it, vi } from "vitest";
import {
  fetchReport,
  validateShareToken,
  shareAction,
  rowsOf,
  totalsOf,
  dailySeries,
  dimensionRanking,
  dataAsOfText,
} from "../src/api.js";

const ENDPOINT = "https://example.com/exec";

const jsonResponse = (obj) => ({ json: async () => obj });

describe("request building", () => {
  it("fetchReport sends auth and report parameters as query params", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchReport(
      ENDPOINT,
      { idToken: "idt" },
      { dimensions: "date", limit: 40 },
      fetchImpl,
    );
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("id_token")).toBe("idt");
    expect(url.searchParams.get("dimensions")).toBe("date");
    expect(url.searchParams.get("limit")).toBe("40");
  });

  it("fetchReport sends a share token instead of an id token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await fetchReport(ENDPOINT, { shareToken: "tok" }, {}, fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("share_token")).toBe("tok");
    expect(url.searchParams.get("id_token")).toBeNull();
  });

  it("validateShareToken asks for totals only", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, _share: { expires_at: "2999-01-01" } }),
    );
    const result = await validateShareToken(ENDPOINT, "tok", fetchImpl);
    expect(result.ok).toBe(true);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("share_token")).toBe("tok");
    expect(url.searchParams.get("dimensions")).toBe("");
  });

  it("shareAction carries the action and the id token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await shareAction(ENDPOINT, "idt", "issue_share", fetchImpl);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("action")).toBe("issue_share");
    expect(url.searchParams.get("id_token")).toBe("idt");
  });
});

const report = (rows) => ({ ok: true, data: { rows } });
const row = (dim, metrics) => ({
  dimensionValues: [{ value: dim }],
  metricValues: metrics.map((v) => ({ value: String(v) })),
});

describe("report shaping", () => {
  it("rowsOf tolerates missing data", () => {
    expect(rowsOf(null)).toEqual([]);
    expect(rowsOf({ ok: false })).toEqual([]);
    expect(rowsOf({ ok: true })).toEqual([]);
    expect(rowsOf(report([row("/", [1])]))).toHaveLength(1);
  });

  it("totalsOf reads the first row's three metrics", () => {
    expect(totalsOf(report([row("", [3689, 157, 337])]))).toEqual({
      views: 3689,
      users: 157,
      sessions: 337,
    });
    expect(totalsOf(report([]))).toEqual({ views: 0, users: 0, sessions: 0 });
  });

  it("dailySeries sorts ascending by date", () => {
    const series = dailySeries(
      report([row("20261105", [10]), row("20261103", [30]), row("20261104", [20])]),
    );
    expect(series).toEqual([
      { date: "20261103", views: 30 },
      { date: "20261104", views: 20 },
      { date: "20261105", views: 10 },
    ]);
  });

  it("dimensionRanking keeps order and applies the limit", () => {
    const ranking = dimensionRanking(
      report([row("/a", [5]), row("/b", [3]), row("/c", [1])]),
      2,
    );
    expect(ranking).toEqual([
      { name: "/a", views: 5 },
      { name: "/b", views: 3 },
    ]);
  });
});

describe("dataAsOfText", () => {
  it("formats the collection time in JST, zero-padded", () => {
    expect(dataAsOfText("2026-11-09T09:50:00.000Z")).toBe(
      "データは 2026/11/09 18:50 時点のものです",
    );
  });

  it("rolls the date over at the JST day boundary", () => {
    expect(dataAsOfText("2026-11-08T16:30:00.000Z")).toBe(
      "データは 2026/11/09 01:30 時点のものです",
    );
  });

  it("returns an empty string when there is no usable timestamp", () => {
    expect(dataAsOfText(null)).toBe("");
    expect(dataAsOfText(undefined)).toBe("");
    expect(dataAsOfText("")).toBe("");
    expect(dataAsOfText("not-a-date")).toBe("");
  });
});
