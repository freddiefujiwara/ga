import { describe, expect, it } from "vitest";
import {
  INSTAGRAM_GENRE_RULES,
  articleGenreOptions,
  classifyCaption,
  classifyXText,
  filterArticlesByGenre,
  filterMediaByGenre,
  filterMediaByPeriod,
  filterThreadsByGenre,
  filterXByGenre,
  formatRate,
  genreAverageBars,
  genreStatsForMedia,
  genreStatsForThreads,
  genreStatsForX,
  instagramGenreStats,
  mediaDateRange,
  mediaGenreOptions,
  sortGenreRows,
  threadsGenreOptions,
  threadsGenreStats,
  xGenreOptions,
  xGenreStats,
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

describe("mediaGenreOptions / filterMediaByGenre", () => {
  const post = (caption, views) => ({ type: "REELS", caption, views });
  const media = [
    post("インド料理のランチ #グルメ", 1000),
    post("カレーの店に行った", 500),
    post("カフェでモーニング", 2000),
    post("川口から御茶ノ水まで、自転車で何分？", 3000),
    post("今日の空", 100),
    null,
  ];

  it("lists only the genres that have posts, with their counts", () => {
    // Order follows the rollup: total views, biggest first. The
    // cafe post lands in グルメ since カフェ・スイーツ was merged
    // into it (ga #24), so グルメ leads with 3 posts / 3,500 views.
    expect(mediaGenreOptions(media)).toEqual([
      { genre: "グルメ", count: 3 },
      { genre: "サイクリング", count: 1 },
      { genre: "日常・その他", count: 1 },
    ]);
    expect(mediaGenreOptions(null)).toEqual([]);
    expect(mediaGenreOptions([])).toEqual([]);
  });

  it("counts add up to the number of usable posts", () => {
    const total = mediaGenreOptions(media).reduce(
      (sum, option) => sum + option.count,
      0,
    );
    expect(total).toBe(5);
  });

  it("a null genre keeps every usable post (the すべて filter)", () => {
    expect(filterMediaByGenre(media, null)).toHaveLength(5);
    expect(filterMediaByGenre(media, undefined)).toHaveLength(5);
    expect(filterMediaByGenre(null, null)).toEqual([]);
  });

  it("keeps only the posts of the chosen genre", () => {
    const gourmet = filterMediaByGenre(media, "グルメ");
    // "カフェでモーニング" is グルメ too since the merge (ga #24).
    expect(gourmet.map((p) => p.caption)).toEqual([
      "インド料理のランチ #グルメ",
      "カレーの店に行った",
      "カフェでモーニング",
    ]);
    expect(filterMediaByGenre(media, "サイクリング")).toHaveLength(1);
    expect(filterMediaByGenre(media, "音楽")).toEqual([]);
  });

  it("classifies through the hashtag stage too", () => {
    // No body keyword for グルメ here: the #川口グルメ hashtag
    // alone puts the post in グルメ, so the filter must see it.
    const tagged = [post("新しい店がオープン #川口グルメ", 10)];
    expect(filterMediaByGenre(tagged, "グルメ")).toHaveLength(1);
    expect(mediaGenreOptions(tagged)).toEqual([
      { genre: "グルメ", count: 1 },
    ]);
  });
});

describe("threads genre rollup / filter", () => {
  // Threads posts in the shape ga-gas collects: the words live
  // in `text`, the numbers are lifetime counts, and there is no
  // saves figure.
  const post = (text, views, likes = null) => ({
    type: "TEXT_POST",
    text,
    views,
    likes,
    permalink: "https://www.threads.net/t/example",
  });
  const posts = [
    post("川口でラーメン450円 #川口グルメ", 9000, 90),
    post("カレーの店に行った", 1000, 10),
    post("川口から御茶ノ水まで、自転車で何分？", 3000, 30),
    post("朝の散歩、芝川沿い", 2000, null),
    post("新しい曲を作りました #Suno", 500, 5),
    post("今日の空", 100, 1),
    null,
  ];

  it("rolls the posts up by genre over their text", () => {
    const rows = genreStatsForThreads(posts);
    // Order follows the shared rollup: total views, biggest first.
    expect(rows.map((row) => row.genre)).toEqual([
      "グルメ",
      "サイクリング",
      "街歩き・スポット",
      "音楽",
      "日常・その他",
    ]);
    const gourmet = rows[0];
    expect(gourmet.count).toBe(2);
    expect(gourmet.totalViews).toBe(10000);
    expect(gourmet.avgViews).toBe(5000);
    // likeRate averages likes/views over the posts that have both.
    expect(gourmet.likeRate).toBeCloseTo((90 / 9000 + 10 / 1000) / 2);
    // Threads posts carry no saves, so saveRate stays null.
    expect(gourmet.saveRate).toBeNull();
    // The top post is titled by the head of its text.
    expect(gourmet.top.views).toBe(9000);
    expect(gourmet.top.title).toContain("川口でラーメン450円");
    expect(gourmet.top.permalink).toBe("https://www.threads.net/t/example");
  });

  it("threadsGenreStats reads the snapshot's threads section", () => {
    const detail = { threads: { recent_posts: posts } };
    expect(threadsGenreStats(detail)).toEqual(genreStatsForThreads(posts));
    expect(threadsGenreStats(null)).toEqual([]);
    expect(threadsGenreStats({})).toEqual([]);
    expect(threadsGenreStats({ threads: {} })).toEqual([]);
    expect(genreStatsForThreads(null)).toEqual([]);
    expect(genreStatsForThreads([])).toEqual([]);
  });

  it("classifies with the shared rules: hashtags first, shop before cycling", () => {
    // A genre hashtag wins over the body words, like Instagram.
    const tagged = [post("ラーメンを食べた #サイクリング", 10)];
    expect(filterThreadsByGenre(tagged, "サイクリング")).toHaveLength(1);
    expect(filterThreadsByGenre(tagged, "グルメ")).toEqual([]);
    // A ride to a curry shop is グルメ, not サイクリング.
    const ride = [post("自転車でカレーの店へ行った", 10)];
    expect(filterThreadsByGenre(ride, "グルメ")).toHaveLength(1);
  });

  it("button counts always match the genre rollup", () => {
    const options = threadsGenreOptions(posts);
    const stats = genreStatsForThreads(posts);
    expect(options).toEqual(
      stats.map((row) => ({ genre: row.genre, count: row.count })),
    );
    expect(threadsGenreOptions(null)).toEqual([]);
    expect(threadsGenreOptions([])).toEqual([]);
  });

  it("the filter keeps exactly the posts each button counts", () => {
    for (const option of threadsGenreOptions(posts)) {
      expect(filterThreadsByGenre(posts, option.genre)).toHaveLength(
        option.count,
      );
    }
    const total = threadsGenreOptions(posts).reduce(
      (sum, option) => sum + option.count,
      0,
    );
    expect(total).toBe(6);
    expect(filterThreadsByGenre(posts, null)).toHaveLength(6);
    expect(filterThreadsByGenre(posts, undefined)).toHaveLength(6);
    expect(filterThreadsByGenre(null, null)).toEqual([]);
  });

  it("a post without a view count still counts, with a null average share", () => {
    const rows = genreStatsForThreads([post("今日の空", null)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(1);
    expect(rows[0].totalViews).toBe(0);
    expect(rows[0].avgViews).toBeNull();
    expect(rows[0].top).toBeNull();
  });
});

describe("classifyXText", () => {
  // Texts in the shape of the account's real posts — the
  // representative cases of the split the owner hand-classified
  // (2026-11-10), plus the traps the tuning surfaced.
  it("buckets a quoted QA-industry post as QA・テスト", () => {
    expect(
      classifyXText(
        "\u201c丹下大社長は「（主力事業(ソフトウェアテスト！？)需要は）なくなる可能性がある」と言い切った。\u201d https://t.co/rfLNbAvfcL",
      ),
    ).toBe("QA・テスト");
    expect(
      classifyXText(
        "個人開発のテストのリアル。作るのも直すのも自分ひとりで、第三者の目が入らない。本番で6回壊して、そのたびに学びを仕組みに残したら、1,000本超のテストと毎朝の見回りになっていました。",
      ),
    ).toBe("QA・テスト");
  });

  it("judges a blog update by its subject: a tech article is 技術・AI", () => {
    expect(
      classifyXText(
        "ブログを更新しました｜ノートパソコンの起動が1分41秒→24秒になりました。速くしたのではなく、起動時に走るものを減らしただけです。重かった内訳と対策をまとめました。",
      ),
    ).toBe("技術・AI");
    // The trap: this one mentions 用意したテスト for its blog
    // pipeline, but the post is about the pipeline — 技術・AI,
    // not QA・テスト.
    expect(
      classifyXText(
        "ホームページとブログの裏側を、「壊れにくい仕組み」という観点で書きました。Googleドキュメント→GASで変換→GitHub Pagesで表示。小さく保ち、変換にはテストを用意しています。",
      ),
    ).toBe("技術・AI");
  });

  it("buckets a follower milestone as ブログ・サイト更新", () => {
    expect(
      classifyXText(
        "Instagramのフォロワーさんが2,000人になりました。ありがとうございます。記念にストーリーで「皆さんの川口のおすすめは？」を募集中です。",
      ),
    ).toBe("ブログ・サイト更新");
    // The trap: the relaunch post carries the byline
    // QAエンジニア — the letters QA alone must not make it a
    // QA post.
    expect(
      classifyXText(
        "ホームページを新しくしました。https://t.co/m6aZ7tC7WU を「川口を歩くQAエンジニア」のページにリニューアル。ブログも同じデザインに統一しました。",
      ),
    ).toBe("ブログ・サイト更新");
  });

  it("buckets the Singapore arrival as 旅行", () => {
    expect(
      classifyXText(
        "3年ぶりのシンガポール🇸🇬 昨夜は線状降水帯で京成線が運転見合わせ。一度空港へ向かうも断念して帰宅。ダメ元で朝5:45のスカイライナーを予約したら、奇跡的に運転再開！",
      ),
    ).toBe("旅行");
    // The homeward leg never names the country; Changi does it.
    expect(
      classifyXText(
        "昨日19時頃、アモイフードセンターで3日間アテンドしてくれた友人とお別れ ホテルで荷物を回収してチャンギへ→夜行便で成田→朝9時過ぎに自宅着",
      ),
    ).toBe("旅行");
  });

  it("keeps a Kawaguchi day in 川口・地域 even when a QA book rides along", () => {
    // The trap: the diary mentions 『ソフトウェア品質保証ガイド』
    // read on a train — the day itself is Kawaguchi life.
    expect(
      classifyXText(
        "朝5:30から坐禅で始まった日曜日 布団を洗って、電車で『ソフトウェア品質保証ガイド』を読み、大島でストレッチ。西川口でガチ中華を食べ、所沢までドライブして角川武蔵野ミュージアムへ 最後はお決まりの川口の喜楽湯♨️",
      ),
    ).toBe("川口・地域");
    // And the Saturday that opens with 「旅行では無い」 is no trip.
    expect(
      classifyXText(
        "久しぶりの旅行では無い土曜日 午前は自転車で20kmサイクリングしたあと。初めてストレッチ専門店へ。",
      ),
    ).toBe("川口・地域");
  });

  it("leaves a bare URL unclassifiable: 日常・その他", () => {
    expect(classifyXText("https://t.co/aAloXXrDU8")).toBe("日常・その他");
    expect(classifyXText("")).toBe("日常・その他");
    expect(classifyXText(null)).toBe("日常・その他");
  });
});

describe("x genre rollup / filter", () => {
  // X posts in the shape social-gas collects (via tweet-gas):
  // the words live in `text`, the link in `url`, the numbers
  // are lifetime counts, and there is no saves figure. The
  // texts are the account's real posts, one or two per genre
  // of the X taxonomy.
  const post = (text, views, likes = null, url = "https://x.com/i/web/status/2001") => ({
    text,
    views,
    likes,
    reposts: 0,
    replies: 0,
    url,
  });
  const posts = [
    post(
      "3年ぶりのシンガポール🇸🇬 一度空港へ向かうも断念して帰宅。ダメ元で朝5:45のスカイライナーを予約したら、奇跡的に運転再開！",
      3011,
      30,
      "https://x.com/i/web/status/2014",
    ),
    post(
      "\u201c丹下大社長は「（主力事業(ソフトウェアテスト！？)需要は）なくなる可能性がある」と言い切った。\u201d",
      1969,
      20,
    ),
    post("個人開発のテストのリアル。本番で6回壊して、そのたびに学びを仕組みに残しました。", 318, null),
    post(
      "ブログを更新しました｜ノートパソコンの起動が1分41秒→24秒になりました。起動時に走るものを減らしただけです。",
      114,
      1,
    ),
    post(
      "Instagramのフォロワーさんが2,000人になりました。記念にストーリーで川口のおすすめを募集中です。",
      119,
      1,
    ),
    post("今日も朝から川口を満喫 AZELでトルコ朝食ビュッフェ 喜楽湯で朝風呂", 304, 3),
    post("https://t.co/aAloXXrDU8", 267, null),
    null,
  ];

  it("rolls the posts up by the X genres over their text", () => {
    const rows = genreStatsForX(posts);
    // Order follows the shared rollup: total views, biggest first.
    expect(rows.map((row) => row.genre)).toEqual([
      "旅行",
      "QA・テスト",
      "川口・地域",
      "日常・その他",
      "ブログ・サイト更新",
      "技術・AI",
    ]);
    const qa = rows[1];
    expect(qa.count).toBe(2);
    expect(qa.totalViews).toBe(2287);
    expect(qa.avgViews).toBe(1144);
    // likeRate averages likes/views over the posts that have both.
    expect(qa.likeRate).toBeCloseTo(20 / 1969);
    // X posts carry no saves, so saveRate stays null.
    expect(qa.saveRate).toBeNull();
    // The top post is titled by the head of its text, and its
    // link is the post's url (X posts carry no permalink).
    const travel = rows[0];
    expect(travel.top.views).toBe(3011);
    expect(travel.top.title).toContain("3年ぶりのシンガポール");
    expect(travel.top.permalink).toBe("https://x.com/i/web/status/2014");
  });

  it("xGenreStats reads the snapshot's x section", () => {
    const detail = { x: { recent_posts: posts } };
    expect(xGenreStats(detail)).toEqual(genreStatsForX(posts));
    expect(xGenreStats(null)).toEqual([]);
    expect(xGenreStats({})).toEqual([]);
    expect(xGenreStats({ x: {} })).toEqual([]);
    expect(genreStatsForX(null)).toEqual([]);
    expect(genreStatsForX([])).toEqual([]);
  });

  it("classifies with the X rules, not the Instagram ones", () => {
    // The old shared judgement would have made the ramen post
    // グルメ and the Suno post 音楽; the X taxonomy has neither
    // genre — a Kawaguchi ramen post is 川口・地域 here, and a
    // bare song announcement matches nothing.
    const ramen = [post("川口でラーメン450円 #川口グルメ", 10)];
    expect(filterXByGenre(ramen, "川口・地域")).toHaveLength(1);
    const song = [post("新しい曲を作りました #Suno", 10)];
    expect(filterXByGenre(song, "日常・その他")).toHaveLength(1);
    // The Instagram classifier itself is untouched.
    expect(classifyCaption("川口でラーメン450円 #川口グルメ")).toBe("グルメ");
  });

  it("button counts always match the genre rollup", () => {
    const options = xGenreOptions(posts);
    const stats = genreStatsForX(posts);
    expect(options).toEqual(
      stats.map((row) => ({ genre: row.genre, count: row.count })),
    );
    expect(xGenreOptions(null)).toEqual([]);
    expect(xGenreOptions([])).toEqual([]);
  });

  it("the filter keeps exactly the posts each button counts", () => {
    for (const option of xGenreOptions(posts)) {
      expect(filterXByGenre(posts, option.genre)).toHaveLength(option.count);
    }
    const total = xGenreOptions(posts).reduce(
      (sum, option) => sum + option.count,
      0,
    );
    expect(total).toBe(7);
    expect(filterXByGenre(posts, null)).toHaveLength(7);
    expect(filterXByGenre(posts, undefined)).toHaveLength(7);
    expect(filterXByGenre(null, null)).toEqual([]);
  });

  it("a post without a view count still counts, with a null average share", () => {
    const rows = genreStatsForX([post("今日の空", null)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].genre).toBe("日常・その他");
    expect(rows[0].count).toBe(1);
    expect(rows[0].totalViews).toBe(0);
    expect(rows[0].avgViews).toBeNull();
    expect(rows[0].top).toBeNull();
  });
});

describe("articleGenreOptions / filterArticlesByGenre", () => {
  const article = (title, views, tags) => ({ title, views, tags });
  const rows = [
    article("運営の記事", 100, ["運営"]),
    article("運営と技術の記事", 60, ["運営", "技術"]),
    article("中国語の記事", 45, ["中国語"]),
    article("タグなしの記事", 10, ["タグなし"]),
    article("ジャンル不明の記事", 5, []),
    null,
  ];

  it("lists only the genres that have articles, with their counts", () => {
    // Order follows the blog rollup: total views, biggest
    // first. The multi-tag article counts under both of its
    // tags; the genre-less article offers no button.
    expect(articleGenreOptions(rows)).toEqual([
      { genre: "運営", count: 2 },
      { genre: "技術", count: 1 },
      { genre: "中国語", count: 1 },
      { genre: "タグなし", count: 1 },
    ]);
    expect(articleGenreOptions(null)).toEqual([]);
    expect(articleGenreOptions([])).toEqual([]);
  });

  it("a null genre keeps every usable article (the すべて filter)", () => {
    expect(filterArticlesByGenre(rows, null)).toHaveLength(5);
    expect(filterArticlesByGenre(rows, undefined)).toHaveLength(5);
    expect(filterArticlesByGenre(null, null)).toEqual([]);
  });

  it("keeps the articles carrying the chosen genre, multi-tag ones included", () => {
    expect(
      filterArticlesByGenre(rows, "運営").map((row) => row.title),
    ).toEqual(["運営の記事", "運営と技術の記事"]);
    expect(
      filterArticlesByGenre(rows, "技術").map((row) => row.title),
    ).toEqual(["運営と技術の記事"]);
    expect(filterArticlesByGenre(rows, "川口")).toEqual([]);
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
