import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_GENRE_RULES,
  classifyCaption,
  filterMediaByPeriod,
  formatRate,
  genreAverageBars,
  genreStatsForMedia,
  instagramGenreStats,
  mediaDateRange,
  sortGenreRows,
} from "../src/genres.js";

// Captions in the shape of the account's real posts (shortened),
// one per genre the rules are tuned for.
describe("classifyCaption", () => {
  it("buckets a restaurant post as グルメ", () => {
    expect(
      classifyCaption(
        "本格インド料理で、チーズナンが主役のランチ。カレーはほうれん草チキンを選びました。#川口市 #インドカレー #川口グルメ #川口ランチ",
      ),
    ).toBe("グルメ");
    expect(
      classifyCaption(
        "住宅街の店で、琉球料理ランチをいただきました。#川口市 #沖縄料理 #川口グルメ",
      ),
    ).toBe("グルメ");
  });

  it("buckets a barber post as 理容・リラクゼーション", () => {
    expect(
      classifyCaption(
        "川口・幸町の理容室で、丸刈りにしてきました。丁寧なサロンでした。#川口市 #理容室 #バーバー #丸刈り",
      ),
    ).toBe("理容・リラクゼーション");
  });

  it("prefers カフェ・スイーツ over グルメ when both match", () => {
    expect(
      classifyCaption(
        "今川焼き専門店がオープン。粒あんがぎっしり。#川口市 #今川焼き #浅草グルメ",
      ),
    ).toBe("カフェ・スイーツ");
    expect(
      classifyCaption(
        "相談処カフェで、朝のモーニングをいただきました。#川口市 #モーニング #カフェ巡り #川口グルメ",
      ),
    ).toBe("カフェ・スイーツ");
  });

  it("buckets cycling, music and spot posts", () => {
    expect(classifyCaption("川口から御茶ノ水まで、自転車で何分？")).toBe(
      "サイクリング",
    );
    expect(classifyCaption("川口の歌、全7曲をまとめました。Sunoで制作。")).toBe(
      "音楽",
    );
    expect(classifyCaption("川口花火大会に行ってきました")).toBe(
      "街歩き・スポット",
    );
    expect(classifyCaption("近所の銭湯で朝風呂。")).toBe("街歩き・スポット");
  });

  it("falls back to 日常・その他 when nothing matches", () => {
    expect(
      classifyCaption("中国語の交流イベントに参加してみます🇹🇼 #中国語学習"),
    ).toBe("日常・その他");
    expect(classifyCaption("朝イチ、映画を観てきます。#映画")).toBe(
      "日常・その他",
    );
    expect(classifyCaption("")).toBe("日常・その他");
    expect(classifyCaption(null)).toBe("日常・その他");
    expect(classifyCaption(undefined)).toBe("日常・その他");
  });

  it("matches latin keywords case-insensitively", () => {
    expect(classifyCaption("made with suno")).toBe("音楽");
    expect(classifyCaption("HELLO CYCLINGで出発")).toBe("サイクリング");
  });

  it("honours a caller-supplied rule set", () => {
    const rules = [{ genre: "テスト", keywords: ["カフェ"] }];
    expect(classifyCaption("近所のカフェ", rules)).toBe("テスト");
    expect(classifyCaption("近所の公園", rules)).toBe("日常・その他");
    expect(INSTAGRAM_GENRE_RULES.length).toBeGreaterThan(0);
  });
});

describe("formatRate", () => {
  it("renders a fraction as a one-decimal percent", () => {
    expect(formatRate(0.075)).toBe("7.5%");
    expect(formatRate(0)).toBe("0.0%");
    expect(formatRate(1)).toBe("100.0%");
  });

  it("renders missing values as an em dash", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
    expect(formatRate(NaN)).toBe("—");
  });
});

describe("instagramGenreStats", () => {
  const post = (caption, views, likes, saves, extra = {}) => ({
    type: "REELS",
    caption,
    permalink: "https://www.instagram.com/reel/x/",
    views,
    likes,
    saves,
    ...extra,
  });
  const detail = (recent_media) => ({ instagram: { recent_media } });

  it("aggregates counts, view totals/averages and rates per genre", () => {
    const rows = instagramGenreStats(
      detail([
        post("インド料理のランチ #グルメ", 1000, 100, 50, {
          permalink: "https://www.instagram.com/reel/a/",
        }),
        post("カレーの店に行った", 500, 25, 25),
        post("ゼロ再生のランチ", 0, 0, 0),
        post("カフェでモーニング", 2000, 40, 10),
        post("今日の空", null, 3, 1),
      ]),
    );
    expect(rows.map((r) => r.genre)).toEqual([
      "カフェ・スイーツ",
      "グルメ",
      "日常・その他",
    ]);
    const cafe = rows[0];
    expect(cafe.count).toBe(1);
    expect(cafe.totalViews).toBe(2000);
    expect(cafe.avgViews).toBe(2000);
    expect(cafe.saveRate).toBeCloseTo(0.005);
    expect(cafe.likeRate).toBeCloseTo(0.02);
    expect(cafe.top.views).toBe(2000);

    const gourmet = rows[1];
    expect(gourmet.count).toBe(3);
    expect(gourmet.totalViews).toBe(1500);
    // The zero-view post counts toward the average but not the rates.
    expect(gourmet.avgViews).toBe(500);
    expect(gourmet.saveRate).toBeCloseTo(0.05);
    expect(gourmet.likeRate).toBeCloseTo(0.075);
    expect(gourmet.top).toEqual({
      title: "インド料理のランチ #グルメ",
      views: 1000,
      permalink: "https://www.instagram.com/reel/a/",
    });

    const daily = rows[2];
    expect(daily.count).toBe(1);
    expect(daily.totalViews).toBe(0);
    expect(daily.avgViews).toBeNull();
    expect(daily.saveRate).toBeNull();
    expect(daily.likeRate).toBeNull();
    expect(daily.top).toBeNull();
  });

  it("omits genres with no posts", () => {
    const rows = instagramGenreStats(detail([post("ラーメン屋", 10, 1, 1)]));
    expect(rows).toHaveLength(1);
    expect(rows[0].genre).toBe("グルメ");
  });

  it("tolerates missing data", () => {
    expect(instagramGenreStats(null)).toEqual([]);
    expect(instagramGenreStats({})).toEqual([]);
    expect(instagramGenreStats(detail([]))).toEqual([]);
    expect(instagramGenreStats(detail([null]))).toEqual([]);
  });

  it("genreStatsForMedia rolls up a caller-supplied list the same way", () => {
    const media = [
      post("インド料理のランチ #グルメ", 1000, 100, 50),
      post("カフェでモーニング", 2000, 40, 10),
    ];
    expect(genreStatsForMedia(media)).toEqual(
      instagramGenreStats(detail(media)),
    );
    expect(genreStatsForMedia(null)).toEqual([]);
    expect(genreStatsForMedia(undefined)).toEqual([]);
  });
});

describe("filterMediaByPeriod", () => {
  const now = new Date("2026-11-09T12:00:00+09:00");
  const media = [
    { posted_at: "2026-11-08T10:00:00+09:00", caption: "昨日" },
    { posted_at: "2026-11-03T10:00:00+09:00", caption: "6日前" },
    { posted_at: "2026-10-20T10:00:00+09:00", caption: "20日前" },
    { posted_at: "2026-10-01T10:00:00+09:00", caption: "39日前" },
    { caption: "日付なし" },
  ];

  it("keeps everything for 取得分すべて and unknown keys", () => {
    expect(filterMediaByPeriod(media, "all", now)).toHaveLength(5);
    expect(filterMediaByPeriod(media, "bogus", now)).toHaveLength(5);
  });

  it("keeps only the posts inside the 30-day window", () => {
    const kept = filterMediaByPeriod(media, "30d", now);
    expect(kept.map((p) => p.caption)).toEqual(["昨日", "6日前", "20日前"]);
  });

  it("keeps only the posts inside the 7-day window", () => {
    const kept = filterMediaByPeriod(media, "7d", now);
    expect(kept.map((p) => p.caption)).toEqual(["昨日", "6日前"]);
  });

  it("tolerates missing input", () => {
    expect(filterMediaByPeriod(null, "7d", now)).toEqual([]);
    expect(filterMediaByPeriod(undefined, "all", now)).toEqual([]);
  });
});

describe("mediaDateRange", () => {
  it("returns the oldest and newest post dates", () => {
    expect(
      mediaDateRange([
        { posted_at: "2026-11-08T10:00:00+09:00" },
        { posted_at: "2026-10-20T10:00:00+09:00" },
        { posted_at: "2026-11-01T10:00:00+09:00" },
      ]),
    ).toEqual({
      from: "2026-10-20T10:00:00+09:00",
      to: "2026-11-08T10:00:00+09:00",
    });
  });

  it("ignores posts without a usable date", () => {
    expect(mediaDateRange([{ caption: "x" }, { posted_at: "junk" }])).toBeNull();
    expect(mediaDateRange([])).toBeNull();
    expect(mediaDateRange(null)).toBeNull();
  });
});

describe("sortGenreRows", () => {
  const rows = [
    { genre: "グルメ", count: 3, totalViews: 1500, avgViews: 500, saveRate: 0.05, likeRate: null, top: { title: "a", views: 1000 } },
    { genre: "カフェ・スイーツ", count: 1, totalViews: 2000, avgViews: 2000, saveRate: 0.005, likeRate: 0.02, top: { title: "b", views: 2000 } },
    { genre: "日常・その他", count: 1, totalViews: 0, avgViews: null, saveRate: null, likeRate: null, top: null },
  ];

  it("sorts numeric columns in both directions", () => {
    expect(sortGenreRows(rows, "totalViews", "desc").map((r) => r.genre)).toEqual([
      "カフェ・スイーツ",
      "グルメ",
      "日常・その他",
    ]);
    expect(sortGenreRows(rows, "count", "asc").map((r) => r.genre)).toEqual([
      "カフェ・スイーツ",
      "日常・その他",
      "グルメ",
    ]);
  });

  it("sorts the name column as text", () => {
    expect(sortGenreRows(rows, "genre", "asc").map((r) => r.genre)).toEqual([
      "カフェ・スイーツ",
      "グルメ",
      "日常・その他",
    ]);
  });

  it("sorts the top column by the top post's views, missing tops last", () => {
    expect(sortGenreRows(rows, "top", "asc").map((r) => r.genre)).toEqual([
      "グルメ",
      "カフェ・スイーツ",
      "日常・その他",
    ]);
  });

  it("sinks missing values to the bottom in both directions", () => {
    expect(sortGenreRows(rows, "avgViews", "asc").at(-1).genre).toBe("日常・その他");
    expect(sortGenreRows(rows, "avgViews", "desc").at(-1).genre).toBe("日常・その他");
    expect(sortGenreRows(rows, "likeRate", "desc").map((r) => r.genre)).toEqual([
      "カフェ・スイーツ",
      "グルメ",
      "日常・その他",
    ]);
  });

  it("tolerates junk input and does not mutate the rows", () => {
    expect(sortGenreRows(null)).toEqual([]);
    const before = rows.map((r) => r.genre);
    sortGenreRows(rows, "count", "asc");
    expect(rows.map((r) => r.genre)).toEqual(before);
  });
});

describe("genreAverageBars", () => {
  it("scales bars to the biggest average and sorts by it", () => {
    const bars = genreAverageBars(
      [
        { genre: "グルメ", avgViews: 500 },
        { genre: "カフェ・スイーツ", avgViews: 2000 },
        { genre: "日常・その他", avgViews: null },
      ],
      "avgViews",
    );
    expect(bars.map((b) => b.name)).toEqual([
      "カフェ・スイーツ",
      "グルメ",
      "日常・その他",
    ]);
    expect(bars[0]).toMatchObject({ value: 2000, valueLabel: "2,000", pct: 100 });
    expect(bars[1].pct).toBe(25);
    expect(bars[2]).toMatchObject({ value: null, valueLabel: "—", pct: 0 });
  });

  it("reads the blog flavour's tag and perArticle", () => {
    const bars = genreAverageBars(
      [
        { tag: "運営", perArticle: 120 },
        { tag: "川口", perArticle: 60 },
      ],
      "perArticle",
    );
    expect(bars.map((b) => b.name)).toEqual(["運営", "川口"]);
    expect(bars[0].pct).toBe(100);
    expect(bars[1].pct).toBe(50);
  });

  it("tolerates junk input", () => {
    expect(genreAverageBars(null, "avgViews")).toEqual([]);
    expect(genreAverageBars([], "avgViews")).toEqual([]);
  });
});
