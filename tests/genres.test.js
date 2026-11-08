import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_GENRE_RULES,
  classifyCaption,
  formatRate,
  instagramGenreStats,
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
});
