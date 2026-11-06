import { describe, expect, it } from "vitest";
import {
  parseRssTitles,
  pageDisplay,
  canonicalPageKey,
  pageRanking,
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
