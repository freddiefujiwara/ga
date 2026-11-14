import { describe, expect, it, vi } from "vitest";
import {
  parseBlogMeta,
  fetchBlogMeta,
  mergeBlogTitles,
  articlePageViews,
  blogGenreStats,
  blogArticleList,
  blogScrollMap,
  blogSpeedMap,
  UNTAGGED_LABEL,
} from "../src/api.js";
import { articleGenreOptions, sortGenreRows } from "../src/genres.js";

const ORIGIN = "https://freddiefujiwara.com";

// Article ids in the real payload's shape.
const ID_UNNEI = "1egcvG9FvC232mYN--ZYr7nH65uVPDT5QgUlNhAGAm-w";
const ID_MULTI = "1ugO7JmY8cmxQ34E9sPLrYArHHw03ZySj-PvGG5FQX-U";
const ID_CHINESE = "186JmaWRWpqCCu97m1EJHliffTNbgMlf4ivYFcY8lB6k";
const ID_KAWAGUCHI = "1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A";
const ID_UNTAGGED = "1rb1BZG19mzzSQ9qK8thIl_LpGySGJgi7K2ZoKLzCB7U";

const row = (path, views) => ({
  dimensionValues: [{ value: path }],
  metricValues: [{ value: String(views) }],
});
const response = (rows) => ({ ok: true, data: { rows } });

const TITLES = new Map([
  [ID_UNNEI, "ブログ運営の裏側：運用費の話"],
  [ID_MULTI, "ブログ運営の裏側：壊さない仕組み"],
  [ID_CHINESE, "中国語レッスン5回目"],
  [ID_KAWAGUCHI, "川口の行きたい店まとめ"],
  [ID_UNTAGGED, "nginxのログで家電を動かす"],
]);

const TAGS = new Map([
  [ID_UNNEI, ["運営"]],
  [ID_MULTI, ["運営", "技術"]],
  [ID_CHINESE, ["中国語"]],
  [ID_KAWAGUCHI, ["川口"]],
]);

describe("parseBlogMeta", () => {
  it("builds the id -> tags map, dropping empty and malformed lists", () => {
    const { tags, titles } = parseBlogMeta({
      ids: [ID_UNNEI, ID_CHINESE, ID_UNTAGGED],
      titles: { [ID_UNNEI]: "タイトル", [ID_CHINESE]: 42 },
      tags: {
        [ID_UNNEI]: ["運営", "技術", "運営", " ", ""],
        [ID_CHINESE]: ["中国語"],
        [ID_UNTAGGED]: [],
        broken: "not-an-array",
      },
    });
    expect(tags.get(ID_UNNEI)).toEqual(["運営", "技術"]);
    expect(tags.get(ID_CHINESE)).toEqual(["中国語"]);
    expect(tags.has(ID_UNTAGGED)).toBe(false);
    expect(tags.has("broken")).toBe(false);
    expect(titles.get(ID_UNNEI)).toBe("タイトル");
    expect(titles.has(ID_CHINESE)).toBe(false);
  });

  it("returns empty maps for junk", () => {
    for (const junk of [null, undefined, "nope", 42, []]) {
      const { tags, titles } = parseBlogMeta(junk);
      expect(tags.size).toBe(0);
      expect(titles.size).toBe(0);
    }
  });
});

describe("fetchBlogMeta", () => {
  const jsonResponse = (obj) => ({ json: async () => obj });

  it("retries once when the first payload has no tags (cold cache)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ids: [ID_UNNEI], tags: { [ID_UNNEI]: [] } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ids: [ID_UNNEI], tags: { [ID_UNNEI]: ["運営"] } }),
      );
    const meta = await fetchBlogMeta("https://example.com/exec?o=titles", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(meta.tags.get(ID_UNNEI)).toEqual(["運営"]);
  });

  it("does not retry when tags arrive the first time", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ tags: { [ID_UNNEI]: ["運営"] } }),
    );
    const meta = await fetchBlogMeta("https://example.com/exec?o=titles", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(meta.tags.size).toBe(1);
  });

  it("resolves to empty maps when the fetch fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const meta = await fetchBlogMeta("https://example.com/exec?o=titles", fetchImpl);
    expect(meta.tags.size).toBe(0);
    expect(meta.titles.size).toBe(0);
  });
});

describe("mergeBlogTitles", () => {
  it("fills gaps from the titles payload and lets RSS win on overlap", () => {
    const metaTitles = new Map([
      [ID_UNNEI, "ペイロード側のタイトル"],
      [ID_CHINESE, "中国語レッスン5回目"],
    ]);
    const rssTitles = new Map([[ID_UNNEI, "RSS側のタイトル"]]);
    const merged = mergeBlogTitles(metaTitles, rssTitles);
    expect(merged.get(ID_UNNEI)).toBe("RSS側のタイトル");
    expect(merged.get(ID_CHINESE)).toBe("中国語レッスン5回目");
    expect(merged.size).toBe(2);
  });

  it("keeps the payload titles when the RSS fetch came back empty", () => {
    // The page ranking's failure mode: RSS empty must not blank
    // the titles the payload delivered.
    const merged = mergeBlogTitles(TITLES, new Map());
    expect(merged.get(ID_KAWAGUCHI)).toBe("川口の行きたい店まとめ");
    expect(merged.size).toBe(TITLES.size);
  });

  it("tolerates missing maps on either side", () => {
    expect(mergeBlogTitles(null, null).size).toBe(0);
    expect(mergeBlogTitles(undefined, TITLES).get(ID_UNNEI)).toBe(
      "ブログ運営の裏側：運用費の話",
    );
    expect(mergeBlogTitles(TITLES, undefined).size).toBe(TITLES.size);
  });
});

describe("articlePageViews", () => {
  it("merges split article paths and skips non-article pages", () => {
    const views = articlePageViews(
      response([
        row(`/${ID_UNNEI}`, 30),
        row(`/blog/${ID_UNNEI}`, 12),
        row(`/blog/${ID_CHINESE}`, 45),
        row("/", 900),
        row("/blog/", 300),
        row("/list-of-stuff/", 200),
      ]),
    );
    expect(views).toEqual([
      { id: ID_UNNEI, views: 42 },
      { id: ID_CHINESE, views: 45 },
    ]);
  });

  it("returns nothing for a missing response", () => {
    expect(articlePageViews(null)).toEqual([]);
    expect(articlePageViews({ ok: false })).toEqual([]);
  });
});

describe("blogGenreStats", () => {
  const pages = response([
    row(`/blog/${ID_UNNEI}`, 100),
    row(`/blog/${ID_MULTI}`, 60),
    row(`/${ID_CHINESE}`, 45),
    row(`/blog/${ID_KAWAGUCHI}`, 40),
    row(`/blog/${ID_UNTAGGED}`, 10),
    row("/", 999),
  ]);

  it("rolls views up per tag, counting multi-tag articles under each tag", () => {
    const rows = blogGenreStats(pages, TAGS, TITLES, ORIGIN);
    expect(rows.map((r) => r.tag)).toEqual([
      "運営",
      "技術",
      "中国語",
      "川口",
      UNTAGGED_LABEL,
    ]);
    const unnei = rows[0];
    expect(unnei.count).toBe(2);
    expect(unnei.totalViews).toBe(160);
    expect(unnei.perArticle).toBe(80);
    expect(unnei.top).toEqual({
      title: "ブログ運営の裏側：運用費の話",
      views: 100,
      href: `${ORIGIN}/blog/${ID_UNNEI}`,
    });
    const tech = rows[1];
    expect(tech.count).toBe(1);
    expect(tech.totalViews).toBe(60);
    expect(tech.perArticle).toBe(60);
    const untagged = rows[4];
    expect(untagged.count).toBe(1);
    expect(untagged.totalViews).toBe(10);
    expect(untagged.top.title).toBe("nginxのログで家電を動かす");
  });

  it("returns nothing without a tag map", () => {
    expect(blogGenreStats(pages, new Map(), TITLES, ORIGIN)).toEqual([]);
    expect(blogGenreStats(pages, null, TITLES, ORIGIN)).toEqual([]);
    expect(blogGenreStats(pages, undefined, TITLES, ORIGIN)).toEqual([]);
  });

  it("blog rows sort by every column through sortGenreRows", () => {
    const rows = blogGenreStats(pages, TAGS, TITLES, ORIGIN);
    expect(sortGenreRows(rows, "perArticle", "asc").map((r) => r.tag)).toEqual([
      UNTAGGED_LABEL,
      "川口",
      "中国語",
      "技術",
      "運営",
    ]);
    expect(sortGenreRows(rows, "top", "desc").at(0).tag).toBe("運営");
    expect(sortGenreRows(rows, "count", "desc").at(0)).toMatchObject({
      tag: "運営",
      count: 2,
    });
  });
});

describe("blogArticleList", () => {
  const pages = response([
    row(`/blog/${ID_UNNEI}`, 100),
    row(`/blog/${ID_MULTI}`, 60),
    row(`/${ID_CHINESE}`, 45),
    row(`/blog/${ID_KAWAGUCHI}`, 40),
    row(`/blog/${ID_UNTAGGED}`, 10),
    row("/", 999),
  ]);

  // The fields beyond title / views / tags: no title here leads
  // with a date and no scroll map is passed, so every row's
  // published and depth fields are null.
  const noDepth = {
    published: null,
    scroll25: null,
    scroll50: null,
    scroll75: null,
    scroll100: null,
    completion: null,
    avgSpeedSec: null,
    slowCount: null,
  };

  it("lists every viewed article with title, link, views and tags, biggest first", () => {
    expect(blogArticleList(pages, TAGS, TITLES, ORIGIN)).toEqual([
      {
        id: ID_UNNEI,
        title: "ブログ運営の裏側：運用費の話",
        href: `${ORIGIN}/blog/${ID_UNNEI}`,
        views: 100,
        tags: ["運営"],
        ...noDepth,
      },
      {
        id: ID_MULTI,
        title: "ブログ運営の裏側：壊さない仕組み",
        href: `${ORIGIN}/blog/${ID_MULTI}`,
        views: 60,
        tags: ["運営", "技術"],
        ...noDepth,
      },
      {
        id: ID_CHINESE,
        title: "中国語レッスン5回目",
        href: `${ORIGIN}/blog/${ID_CHINESE}`,
        views: 45,
        tags: ["中国語"],
        ...noDepth,
      },
      {
        id: ID_KAWAGUCHI,
        title: "川口の行きたい店まとめ",
        href: `${ORIGIN}/blog/${ID_KAWAGUCHI}`,
        views: 40,
        tags: ["川口"],
        ...noDepth,
      },
      {
        id: ID_UNTAGGED,
        title: "nginxのログで家電を動かす",
        href: `${ORIGIN}/blog/${ID_UNTAGGED}`,
        views: 10,
        tags: [UNTAGGED_LABEL],
        ...noDepth,
      },
    ]);
  });

  it("reads the publication day off the title's leading date", () => {
    const dated = new Map(TITLES);
    dated.set(ID_UNNEI, "2026-11-07 ブログ運営の裏側：運用費の話");
    dated.set(ID_MULTI, "2026-13-40 ありえない日付の記事");
    const rows = blogArticleList(pages, TAGS, dated, ORIGIN);
    expect(rows.find((r) => r.id === ID_UNNEI).published).toBe("2026-11-07");
    expect(rows.find((r) => r.id === ID_MULTI).published).toBeNull();
    expect(rows.find((r) => r.id === ID_CHINESE).published).toBeNull();
  });

  it("joins the scroll-depth map and derives the completion rate", () => {
    const scroll = new Map([
      [ID_UNNEI, { scroll25: 80, scroll50: 60, scroll75: 40, scroll100: 25 }],
    ]);
    const rows = blogArticleList(pages, TAGS, TITLES, ORIGIN, scroll);
    const unnei = rows.find((r) => r.id === ID_UNNEI);
    expect(unnei).toMatchObject({
      scroll25: 80,
      scroll50: 60,
      scroll75: 40,
      scroll100: 25,
      // 25 of 100 views reached the end: 25.0%.
      completion: 25,
    });
    // An article the map does not cover keeps its depth null.
    const multi = rows.find((r) => r.id === ID_MULTI);
    expect(multi).toMatchObject({
      scroll25: null,
      scroll50: null,
      scroll75: null,
      scroll100: null,
      completion: null,
    });
  });

  it("joins the speed map into seconds and slow counts", () => {
    const speed = new Map([
      [ID_UNNEI, { avgMs: 12345, samples: 10, slow: 3 }],
    ]);
    const rows = blogArticleList(pages, TAGS, TITLES, ORIGIN, null, speed);
    expect(rows.find((r) => r.id === ID_UNNEI)).toMatchObject({
      avgSpeedSec: 12.345,
      slowCount: 3,
    });
    // An article the map does not cover keeps both fields null.
    expect(rows.find((r) => r.id === ID_MULTI)).toMatchObject({
      avgSpeedSec: null,
      slowCount: null,
    });
  });

  it("rounds the completion rate to one decimal", () => {
    const scroll = new Map([
      [ID_CHINESE, { scroll25: 30, scroll50: 20, scroll75: 12, scroll100: 7 }],
    ]);
    const rows = blogArticleList(pages, TAGS, TITLES, ORIGIN, scroll);
    // 7 of 45 views: 15.555…% -> 15.6%.
    expect(rows.find((r) => r.id === ID_CHINESE).completion).toBe(15.6);
  });

  it("merges split article paths into one row, like the rollup", () => {
    const split = response([
      row(`/${ID_UNNEI}`, 30),
      row(`/blog/${ID_UNNEI}`, 12),
    ]);
    const rows = blogArticleList(split, TAGS, TITLES, ORIGIN);
    expect(rows).toHaveLength(1);
    expect(rows[0].views).toBe(42);
  });

  it("falls back to the article id when no title is known", () => {
    const rows = blogArticleList(pages, TAGS, new Map(), ORIGIN);
    expect(rows[0].title).toBe(ID_UNNEI);
  });

  it("keeps the articles but drops the genres when there is no tag map", () => {
    for (const noMap of [new Map(), null, undefined]) {
      const rows = blogArticleList(pages, noMap, TITLES, ORIGIN);
      expect(rows).toHaveLength(5);
      expect(rows.every((row) => row.tags.length === 0)).toBe(true);
    }
  });

  it("returns nothing for a missing response", () => {
    expect(blogArticleList(null, TAGS, TITLES, ORIGIN)).toEqual([]);
    expect(blogArticleList({ ok: false }, TAGS, TITLES, ORIGIN)).toEqual([]);
  });

  it("genre filter options agree with the rollup's counts", () => {
    const options = articleGenreOptions(
      blogArticleList(pages, TAGS, TITLES, ORIGIN),
    );
    const fromRollup = blogGenreStats(pages, TAGS, TITLES, ORIGIN).map(
      (row) => ({ genre: row.tag, count: row.count }),
    );
    expect(options).toEqual(fromRollup);
  });
});

describe("blogScrollMap", () => {
  const scrollRow = (path, percent, count) => ({
    dimensionValues: [{ value: path }, { value: String(percent) }],
    metricValues: [{ value: String(count) }],
  });

  it("builds the per-article depth map from the percent_scrolled rows", () => {
    const map = blogScrollMap(
      response([
        scrollRow(`/blog/${ID_UNNEI}`, 25, 80),
        scrollRow(`/blog/${ID_UNNEI}`, 50, 60),
        scrollRow(`/blog/${ID_UNNEI}`, 75, 40),
        scrollRow(`/blog/${ID_UNNEI}`, 100, 25),
        scrollRow(`/blog/${ID_CHINESE}`, 25, 30),
      ]),
    );
    expect(map.get(ID_UNNEI)).toEqual({
      scroll25: 80,
      scroll50: 60,
      scroll75: 40,
      scroll100: 25,
    });
    // Milestones a report does not carry read as zero reach,
    // not as missing: the article was measured.
    expect(map.get(ID_CHINESE)).toEqual({
      scroll25: 30,
      scroll50: 0,
      scroll75: 0,
      scroll100: 0,
    });
    expect(map.has(ID_MULTI)).toBe(false);
  });

  it("merges split article paths and sums the same milestone", () => {
    const map = blogScrollMap(
      response([
        scrollRow(`/${ID_UNNEI}`, 25, 30),
        scrollRow(`/blog/${ID_UNNEI}`, 25, 12),
      ]),
    );
    expect(map.get(ID_UNNEI).scroll25).toBe(42);
  });

  it("skips non-article pages and unknown milestones", () => {
    const map = blogScrollMap(
      response([
        scrollRow("/", 25, 900),
        scrollRow("/list-of-stuff/", 50, 200),
        scrollRow(`/blog/${ID_UNNEI}`, 10, 5),
        scrollRow(`/blog/${ID_UNNEI}`, 25, 7),
      ]),
    );
    expect(map.size).toBe(1);
    expect(map.get(ID_UNNEI)).toEqual({
      scroll25: 7,
      scroll50: 0,
      scroll75: 0,
      scroll100: 0,
    });
  });

  it("returns an empty map for a missing response", () => {
    expect(blogScrollMap(null).size).toBe(0);
    expect(blogScrollMap({ ok: false }).size).toBe(0);
    expect(blogScrollMap(response([])).size).toBe(0);
  });
});

describe("blogSpeedMap", () => {
  const speedRow = (path, total, samples, slow) => ({
    dimensionValues: [{ value: path }],
    metricValues: [
      { value: String(total) },
      { value: String(samples) },
      ...(slow === undefined ? [] : [{ value: String(slow) }]),
    ],
  });

  it("builds the per-article speed map with the ranking's average", () => {
    const map = blogSpeedMap(
      response([
        speedRow(`/blog/${ID_UNNEI}`, 25000, 10, 3),
        speedRow(`/blog/${ID_CHINESE}`, 4000, 4, 0),
      ]),
    );
    expect(map.get(ID_UNNEI)).toEqual({ avgMs: 2500, samples: 10, slow: 3 });
    expect(map.get(ID_CHINESE)).toEqual({ avgMs: 1000, samples: 4, slow: 0 });
    expect(map.has(ID_MULTI)).toBe(false);
  });

  it("merges split article paths, summing totals, samples and slow counts", () => {
    const map = blogSpeedMap(
      response([
        speedRow(`/${ID_UNNEI}`, 10000, 2, 1),
        speedRow(`/blog/${ID_UNNEI}`, 20000, 3, 2),
      ]),
    );
    // (10000 + 20000) / (2 + 3) = 6000ms across the merged forms.
    expect(map.get(ID_UNNEI)).toEqual({ avgMs: 6000, samples: 5, slow: 3 });
  });

  it("skips non-article pages and rows without samples", () => {
    const map = blogSpeedMap(
      response([
        speedRow("/", 90000, 90, 9),
        speedRow("/list-of-stuff/", 5000, 5, 1),
        speedRow(`/blog/${ID_UNNEI}`, 0, 0, 0),
        speedRow(`/blog/${ID_CHINESE}`, 3000, 3, 1),
      ]),
    );
    expect(map.size).toBe(1);
    expect(map.get(ID_CHINESE)).toEqual({ avgMs: 1000, samples: 3, slow: 1 });
  });

  it("reads a report without the slow-count value as zero slow", () => {
    const map = blogSpeedMap(
      response([speedRow(`/blog/${ID_UNNEI}`, 8000, 2, undefined)]),
    );
    expect(map.get(ID_UNNEI)).toEqual({ avgMs: 4000, samples: 2, slow: 0 });
  });

  it("returns an empty map for a missing response", () => {
    expect(blogSpeedMap(null).size).toBe(0);
    expect(blogSpeedMap({ ok: false }).size).toBe(0);
    expect(blogSpeedMap(response([])).size).toBe(0);
  });
});
