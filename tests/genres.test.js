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

  it("buckets cafe/sweets words as グルメ (カフェ・スイーツ merged in)", () => {
    expect(
      classifyCaption(
        "今川焼き専門店がオープン。粒あんがぎっしり。#川口市 #今川焼き #浅草グルメ",
      ),
    ).toBe("グルメ");
    // (Body words only: a #川口グルメ hashtag would end the
    // classification at stage 1 — see the hashtag tests below.)
    expect(
      classifyCaption(
        "相談処カフェで、朝のモーニングをいただきました。川口グルメな朝。#川口市 #モーニング #カフェ巡り",
      ),
    ).toBe("グルメ");
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

  it("prefers the destination shop over cycling (店優先)", () => {
    // A ride to a curry shop is the shop's genre, not cycling:
    // the dish/venue words sit before the cycling rule.
    expect(
      classifyCaption("川口から自転車で約74分。神保町の人気カレー店に行ってきました"),
    ).toBe("グルメ");
    // The generic food words sit after cycling, so a ride that
    // only mentions eating at the destination stays cycling.
    expect(
      classifyCaption("川口から自転車で2時間。着いた先はフェア。現地の料理を食べた"),
    ).toBe("サイクリング");
    // With no ride involved, the generic words still bucket food.
    expect(classifyCaption("西川口の山東料理の店へ友人とごはん")).toBe("グルメ");
  });

  it("does not let passing places mis-bucket a ride", () => {
    // 公園 (the park a ride starts from) is in the late spot
    // rule, after cycling.
    expect(classifyCaption("川口市から自転車で何分？ 沼田公園から出発")).toBe(
      "サイクリング",
    );
    // A museum introduced as a spot still lands in 街歩き・スポット
    // via the 散歩 hashtag in the caption tail (early spot rule).
    expect(
      classifyCaption("川口に万華鏡の博物館があります … #川口散歩"),
    ).toBe("街歩き・スポット");
  });

  it("catches the outing spellings the account actually uses", () => {
    // The trampoline park is a spot even though the caption
    // mentions サイクリング as an aside.
    expect(
      classifyCaption(
        "川口のトランポリンパークで跳んできました。運動は街歩きとサイクリングだけ",
      ),
    ).toBe("街歩き・スポット");
    // Hiragana まつり, not just 祭り.
    expect(classifyCaption("今日は鳩ヶ谷商工まつりに行ってきました")).toBe(
      "街歩き・スポット",
    );
  });

  it("lets a genre hashtag override the body words", () => {
    // The body alone would say サイクリング (自転車, 公園); the
    // author's own hashtag wins.
    expect(
      classifyCaption("自転車で沼田公園から出発。帰りに町中華へ寄り道 #川口グルメ"),
    ).toBe("グルメ");
    expect(
      classifyCaption("自転車で公園のそばを通って、住宅街の店へ #川口カフェ"),
    ).toBe("グルメ");
    // #川口カフェ is a グルメ tag in its own right (the former
    // カフェ・スイーツ bucket merged into グルメ): it fires
    // even when the body carries no food words at all.
    expect(classifyCaption("住宅街を歩いて、新しい店へ #川口カフェ")).toBe(
      "グルメ",
    );
    // #Suno outranks the other genre tags: a song post carries
    // several tags at once.
    expect(
      classifyCaption("新曲を公開。自転車の帰りにカレー店へ #川口グルメ #Suno"),
    ).toBe("音楽");
  });

  it("matches hashtags exactly, never as bare body words", () => {
    // A different city's グルメ tag is not #川口グルメ: the body
    // rules decide (今川焼き → グルメ).
    expect(classifyCaption("浅草の今川焼き専門店 #浅草グルメ")).toBe(
      "グルメ",
    );
    // A longer tag that merely starts with a known one does not
    // match either; the body (自転車) decides.
    expect(classifyCaption("今日は自転車で出発 #川口グルメ巡り")).toBe(
      "サイクリング",
    );
    // The word Suno without "#" does not fire stage 1; it is
    // the stage-2 keyword rules that bucket this one as 音楽.
    expect(classifyCaption("Sunoで作った曲です")).toBe("音楽");
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
    // The cafe post (カフェでモーニング) lands in グルメ too:
    // カフェ・スイーツ was merged into グルメ.
    expect(rows.map((r) => r.genre)).toEqual(["グルメ", "日常・その他"]);
    const gourmet = rows[0];
    expect(gourmet.count).toBe(4);
    expect(gourmet.totalViews).toBe(3500);
    // The zero-view post counts toward the average but not the rates.
    expect(gourmet.avgViews).toBe(875);
    expect(gourmet.saveRate).toBeCloseTo(0.035);
    expect(gourmet.likeRate).toBeCloseTo(0.0567);
    expect(gourmet.top).toEqual({
      title: "カフェでモーニング",
      views: 2000,
      permalink: "https://www.instagram.com/reel/x/",
    });

    const daily = rows[1];
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
    { genre: "音楽", count: 1, totalViews: 2000, avgViews: 2000, saveRate: 0.005, likeRate: 0.02, top: { title: "b", views: 2000 } },
    { genre: "日常・その他", count: 1, totalViews: 0, avgViews: null, saveRate: null, likeRate: null, top: null },
  ];

  it("sorts numeric columns in both directions", () => {
    expect(sortGenreRows(rows, "totalViews", "desc").map((r) => r.genre)).toEqual([
      "音楽",
      "グルメ",
      "日常・その他",
    ]);
    expect(sortGenreRows(rows, "count", "asc").map((r) => r.genre)).toEqual([
      "音楽",
      "日常・その他",
      "グルメ",
    ]);
  });

  it("sorts the name column as text", () => {
    expect(sortGenreRows(rows, "genre", "asc").map((r) => r.genre)).toEqual([
      "グルメ",
      "日常・その他",
      "音楽",
    ]);
  });

  it("sorts the top column by the top post's views, missing tops last", () => {
    expect(sortGenreRows(rows, "top", "asc").map((r) => r.genre)).toEqual([
      "グルメ",
      "音楽",
      "日常・その他",
    ]);
  });

  it("sinks missing values to the bottom in both directions", () => {
    expect(sortGenreRows(rows, "avgViews", "asc").at(-1).genre).toBe("日常・その他");
    expect(sortGenreRows(rows, "avgViews", "desc").at(-1).genre).toBe("日常・その他");
    expect(sortGenreRows(rows, "likeRate", "desc").map((r) => r.genre)).toEqual([
      "音楽",
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
        { genre: "音楽", avgViews: 2000 },
        { genre: "日常・その他", avgViews: null },
      ],
      "avgViews",
    );
    expect(bars.map((b) => b.name)).toEqual([
      "音楽",
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
