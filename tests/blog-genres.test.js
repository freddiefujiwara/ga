import { describe, expect, it, vi } from "vitest";
import {
  parseBlogMeta,
  fetchBlogMeta,
  articlePageViews,
  blogGenreStats,
  blogArticleList,
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

  it("lists every viewed article with title, link, views and tags, biggest first", () => {
    expect(blogArticleList(pages, TAGS, TITLES, ORIGIN)).toEqual([
      {
        id: ID_UNNEI,
        title: "ブログ運営の裏側：運用費の話",
        href: `${ORIGIN}/blog/${ID_UNNEI}`,
        views: 100,
        tags: ["運営"],
      },
      {
        id: ID_MULTI,
        title: "ブログ運営の裏側：壊さない仕組み",
        href: `${ORIGIN}/blog/${ID_MULTI}`,
        views: 60,
        tags: ["運営", "技術"],
      },
      {
        id: ID_CHINESE,
        title: "中国語レッスン5回目",
        href: `${ORIGIN}/blog/${ID_CHINESE}`,
        views: 45,
        tags: ["中国語"],
      },
      {
        id: ID_KAWAGUCHI,
        title: "川口の行きたい店まとめ",
        href: `${ORIGIN}/blog/${ID_KAWAGUCHI}`,
        views: 40,
        tags: ["川口"],
      },
      {
        id: ID_UNTAGGED,
        title: "nginxのログで家電を動かす",
        href: `${ORIGIN}/blog/${ID_UNTAGGED}`,
        views: 10,
        tags: [UNTAGGED_LABEL],
      },
    ]);
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
