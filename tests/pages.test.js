import { describe, expect, it } from "vitest";
import {
  parseRssTitles,
  pageDisplay,
  canonicalPageKey,
  pageRanking,
  pageSpeedRanking,
  mergeBlogTitles,
  blogArticleDateKey,
  blogArticlesByDate,
} from "../src/api.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>藤原史和｜川口を歩くQAエンジニア</title>
    <item>
      <title>2026-11-02 Museのご紹介 &amp; 使い方</title>
      <link>https://freddiefujiwara.com/blog/1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8</link>
      <pubDate>Mon, 02 Nov 2026 00:00:00 +0900</pubDate>
    </item>
    <item>
      <title>2026-10-31 川口の行きたい店まとめ</title>
      <link>https://freddiefujiwara.com/blog/1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A</link>
    </item>
    <item>
      <title>リンク欠けのアイテム</title>
    </item>
  </channel>
</rss>`;

describe("parseRssTitles", () => {
  it("maps article ids to unescaped titles", () => {
    const titles = parseRssTitles(RSS);
    expect(titles.get("1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8")).toBe(
      "2026-11-02 Museのご紹介 & 使い方",
    );
    expect(titles.get("1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A")).toBe(
      "2026-10-31 川口の行きたい店まとめ",
    );
    expect(titles.size).toBe(2);
  });

  it("returns an empty map for junk", () => {
    expect(parseRssTitles("").size).toBe(0);
    expect(parseRssTitles(null).size).toBe(0);
    expect(parseRssTitles("<html>nope</html>").size).toBe(0);
  });
});

describe("pageDisplay", () => {
  const titles = parseRssTitles(RSS);
  const origin = "https://freddiefujiwara.com";

  it("labels the top page and links to the site root", () => {
    expect(pageDisplay("/", titles, origin)).toEqual({
      label: "トップページ",
      href: "https://freddiefujiwara.com/",
    });
  });

  it("resolves a bare article path to its title and canonical blog URL", () => {
    expect(
      pageDisplay("/1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8", titles, origin),
    ).toEqual({
      label: "2026-11-02 Museのご紹介 & 使い方",
      href: "https://freddiefujiwara.com/blog/1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8",
    });
  });

  it("resolves a /blog/-prefixed article path the same way", () => {
    const d = pageDisplay(
      "/blog/1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A",
      titles,
      origin,
    );
    expect(d.label).toBe("2026-10-31 川口の行きたい店まとめ");
    expect(d.href).toBe(
      "https://freddiefujiwara.com/blog/1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A",
    );
  });

  it("labels known app pages", () => {
    expect(pageDisplay("/list-of-stuff/", titles, origin)).toEqual({
      label: "持ち物リスト",
      href: "https://freddiefujiwara.com/list-of-stuff/",
    });
  });

  it("labels the dashboard under both its current and former paths", () => {
    expect(pageDisplay("/social/", titles, origin)).toEqual({
      label: "アクセス解析",
      href: "https://freddiefujiwara.com/social/",
    });
    expect(pageDisplay("/ga/", titles, origin)).toEqual({
      label: "アクセス解析",
      href: "https://freddiefujiwara.com/ga/",
    });
  });

  it("falls back to the raw path for unknown pages", () => {
    expect(pageDisplay("/unknown/path/", titles, origin)).toEqual({
      label: "/unknown/path/",
      href: "https://freddiefujiwara.com/unknown/path/",
    });
  });

  it("falls back gracefully when titles are unavailable", () => {
    const d = pageDisplay(
      "/1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8",
      new Map(),
      origin,
    );
    expect(d.label).toBe("/1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8");
  });
});

describe("canonicalPageKey", () => {
  it("merges the bare and /blog/-prefixed article paths", () => {
    const id = "1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8";
    expect(canonicalPageKey(`/${id}`)).toBe(`/blog/${id}`);
    expect(canonicalPageKey(`/blog/${id}`)).toBe(`/blog/${id}`);
  });

  it("leaves app pages and the top page untouched", () => {
    expect(canonicalPageKey("/")).toBe("/");
    expect(canonicalPageKey("/blog/")).toBe("/blog/");
    expect(canonicalPageKey("/list-of-stuff/")).toBe("/list-of-stuff/");
    expect(canonicalPageKey("/ga/")).toBe("/ga/");
    expect(canonicalPageKey("/social/")).toBe("/social/");
  });
});

describe("pageRanking", () => {
  const titles = parseRssTitles(RSS);
  const origin = "https://freddiefujiwara.com";
  const row = (path, views) => ({
    dimensionValues: [{ value: path }],
    metricValues: [{ value: String(views) }],
  });
  const response = (rows) => ({ ok: true, data: { rows } });

  it("sums split article paths into one row and re-sorts", () => {
    const idA = "1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8";
    const idB = "1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A";
    const ranking = pageRanking(
      response([
        row(`/${idA}`, 300),
        row(`/blog/${idB}`, 120),
        row("/", 100),
        row(`/blog/${idA}`, 86),
      ]),
      titles,
      origin,
      10,
    );
    expect(ranking).toEqual([
      {
        label: "2026-11-02 Museのご紹介 & 使い方",
        href: `${origin}/blog/${idA}`,
        views: 386,
      },
      {
        label: "2026-10-31 川口の行きたい店まとめ",
        href: `${origin}/blog/${idB}`,
        views: 120,
      },
      { label: "トップページ", href: `${origin}/`, views: 100 },
    ]);
  });

  it("labels articles from the titles payload when the RSS map is empty", () => {
    // Regression: the ranking used to read the RSS titles alone,
    // so one failed RSS fetch showed raw paths for every article
    // even though the titles payload had arrived. loadDashboard
    // now hands pageRanking the merged map.
    const idB = "1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A";
    const payloadTitles = new Map([[idB, "2026-10-31 川口の行きたい店まとめ"]]);
    const ranking = pageRanking(
      response([row(`/blog/${idB}`, 270), row("/", 880)]),
      mergeBlogTitles(payloadTitles, new Map()),
      origin,
      10,
    );
    expect(ranking).toEqual([
      { label: "トップページ", href: `${origin}/`, views: 880 },
      {
        label: "2026-10-31 川口の行きたい店まとめ",
        href: `${origin}/blog/${idB}`,
        views: 270,
      },
    ]);
  });

  it("keeps different articles and app pages separate", () => {
    const ranking = pageRanking(
      response([row("/list-of-stuff/", 50), row("/blog/", 40)]),
      titles,
      origin,
      10,
    );
    expect(ranking).toEqual([
      { label: "持ち物リスト", href: `${origin}/list-of-stuff/`, views: 50 },
      { label: "ブログ トップ", href: `${origin}/blog/`, views: 40 },
    ]);
  });
});

describe("pageSpeedRanking", () => {
  const titles = parseRssTitles(RSS);
  const origin = "https://freddiefujiwara.com";
  const row = (path, total, samples) => ({
    dimensionValues: [{ value: path }],
    metricValues: [{ value: String(total) }, { value: String(samples) }],
  });
  const response = (rows) => ({ ok: true, data: { rows } });

  it("merges split paths, averages, and sorts slowest first", () => {
    const idA = "1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8";
    const idB = "1ORcobKE3DfRrSUV6yMUodfVQgiL1ouKaCTWKTEFUR6A";
    const ranking = pageSpeedRanking(
      response([
        row(`/${idA}`, 30000, 10),
        row(`/blog/${idA}`, 10000, 10),
        row(`/blog/${idB}`, 9000, 3),
      ]),
      titles,
      origin,
      10,
    );
    expect(ranking).toEqual([
      {
        label: "2026-10-31 川口の行きたい店まとめ",
        href: `${origin}/blog/${idB}`,
        avgMs: 3000,
        samples: 3,
      },
      {
        label: "2026-11-02 Museのご紹介 & 使い方",
        href: `${origin}/blog/${idA}`,
        avgMs: 2000,
        samples: 20,
      },
    ]);
  });

  it("skips zero-sample rows and tolerates a missing response", () => {
    const idA = "1m40NeOkTYxG3bEpLY6ZYfNq9C-9yRLZptON9iFsXwM8";
    expect(
      pageSpeedRanking(response([row(`/blog/${idA}`, 0, 0)]), titles, origin, 10),
    ).toEqual([]);
    expect(pageSpeedRanking(null, titles, origin, 10)).toEqual([]);
    expect(pageSpeedRanking({ ok: false }, titles, origin, 10)).toEqual([]);
  });
});

describe("blogArticleDateKey", () => {
  it("reads the publication day off the title's leading date", () => {
    expect(blogArticleDateKey("2026-11-02 Museのご紹介 & 使い方")).toBe(
      "20261102",
    );
    expect(blogArticleDateKey("2021-02-16 持ち物リスト")).toBe("20210216");
    // A title that is only a date still yields its day.
    expect(blogArticleDateKey("2026-11-02")).toBe("20261102");
  });

  it("returns null when the title carries no leading date", () => {
    expect(blogArticleDateKey("検証用の記事タイトル")).toBeNull();
    expect(blogArticleDateKey("")).toBeNull();
    expect(blogArticleDateKey(null)).toBeNull();
    expect(blogArticleDateKey(undefined)).toBeNull();
  });

  it("rejects malformed dates instead of placing them on the chart", () => {
    expect(blogArticleDateKey("2026-13-01 月がおかしい")).toBeNull();
    expect(blogArticleDateKey("2026-11-32 日がおかしい")).toBeNull();
    expect(blogArticleDateKey("2026-1-02 桁が足りない")).toBeNull();
    // A date that does not lead the title is not a publication date.
    expect(blogArticleDateKey("速報 2026-11-02 記事")).toBeNull();
  });
});

describe("blogArticlesByDate", () => {
  const origin = "https://freddiefujiwara.com";

  it("groups articles by publication day, ascending, with article links", () => {
    const titles = new Map([
      ["idB", "2026-11-02 二本目の記事"],
      ["idA", "2026-11-02 一本目の記事"],
      ["idC", "2026-10-31 前の記事"],
      ["idD", "日付のない記事"],
    ]);
    expect(blogArticlesByDate(titles, origin)).toEqual([
      {
        date: "20261031",
        articles: [
          {
            id: "idC",
            title: "2026-10-31 前の記事",
            href: `${origin}/blog/idC`,
          },
        ],
      },
      {
        date: "20261102",
        articles: [
          {
            id: "idA",
            title: "2026-11-02 一本目の記事",
            href: `${origin}/blog/idA`,
          },
          {
            id: "idB",
            title: "2026-11-02 二本目の記事",
            href: `${origin}/blog/idB`,
          },
        ],
      },
    ]);
  });

  it("tolerates an empty or missing title map", () => {
    expect(blogArticlesByDate(new Map(), origin)).toEqual([]);
    expect(blogArticlesByDate(null, origin)).toEqual([]);
    expect(blogArticlesByDate(undefined, origin)).toEqual([]);
  });
});
