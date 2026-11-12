// Channel tiles for the overview tab, plus the genre treemap.
//
// The overview's channel map has one tile per channel —
// Instagram, the blog, YouTube, Threads and X — with the tile
// area proportional to the channel's size: follower counts for
// the SNS channels (subscribers for YouTube), and for the blog
// its GA user count over the last 28 days, which is the size
// figure the blog has. That figure is not a follower count, so
// the blog's tile and legend row always name it as such
// (利用者), and the blog stays out of the share percentages:
// each share is a share of the four SNS channels' combined
// followers, the same total the hero counts, so mixing a user
// count into that denominator would quietly move every other
// channel's percentage. The metrics differ per channel, so
// every tile and legend row names its metric alongside the
// number. Tile colour is the blue heat scale the genre tiles
// use (see genreHeatBackground), scaled by follower count: the
// largest channel is the bluest. The day-over-day change
// （前日比）, where the history offers one, rides along as a
// "前日比" line coloured by direction: up = green, down = red,
// flat or unknown = plain — the same delta the overview's KPI
// cards show.
//
// Every tile carries its name and figure, however small the
// tile: the layout below guarantees each tile a minimum size
// (see layoutWithLabelRoom) and the label levels fall back to
// micro type — tiny horizontal lines, a single line, or a
// vertical line on tall narrow tiles — rather than leaving a
// tile blank for the legend to speak for. The legend under
// the map still lists every channel's exact figures, as it
// does for the genre maps.
//
// The genre sections reuse the squarified treemap layout below,
// sized by each genre's per-item average: averages sit within
// an order of magnitude of each other, so tiles stay readable
// there, and the average is the axis the owner compares on.

import { formatCount, formatDelta, historyDailyDelta } from "./api.js";

const isNum = (value) => typeof value === "number" && Number.isFinite(value);

// One entry per channel, in fixed display order. value and delta
// are raw numbers or null; valueLabel / deltaLabel are the display
// strings ("—" when a value is missing, null deltaLabel when there
// is nothing to compare). Threads carries a "集計待ち" note while
// its follower count is not collected yet.
export function channelAudiences(detail, gaTotals, historyRows) {
  const ig = detail?.instagram ?? {};
  const yt = detail?.youtube ?? {};
  const th = detail?.threads ?? {};
  const x = detail?.x ?? {};
  const deltaFor = (key) => {
    const change = historyDailyDelta(historyRows, key);
    return change ? change.delta : null;
  };
  const entries = [
    {
      id: "instagram",
      name: "Instagram",
      metricLabel: "フォロワー",
      value: isNum(ig.freddiefujiwara) ? ig.freddiefujiwara : null,
      delta: deltaFor("ig_followers"),
    },
    {
      id: "blog",
      name: "ブログ",
      metricLabel: "ユーザー（直近28日）",
      value: gaTotals && isNum(gaTotals.users) ? gaTotals.users : null,
      delta: null,
    },
    {
      id: "youtube",
      name: "YouTube",
      metricLabel: "登録者",
      value: isNum(yt.subscribers) ? yt.subscribers : null,
      delta: deltaFor("youtube_subscribers"),
    },
    {
      id: "threads",
      name: "Threads",
      metricLabel: "フォロワー",
      value: isNum(th.followers) ? th.followers : null,
      delta: deltaFor("threads_followers"),
    },
    {
      id: "x",
      name: "X",
      metricLabel: "フォロワー",
      value: isNum(x.followers) ? x.followers : null,
      delta: deltaFor("x_followers"),
    },
  ];
  return entries.map((entry) => {
    const valueLabel = formatCount(entry.value);
    return {
      ...entry,
      valueLabel,
      // The figure as a tile shows it: the blog's number is a
      // user count, not followers, so its tile always carries
      // the word 利用者 in front of the number, at any size.
      valueText:
        entry.id === "blog" && entry.value !== null
          ? `利用者 ${valueLabel}`
          : valueLabel,
      deltaLabel: formatDelta(entry.delta),
      note:
        (entry.id === "threads" || entry.id === "x") && entry.value === null
          ? "集計待ち"
          : null,
    };
  });
}

// The colour class for a change: "up" (green), "down" (red), or
// "neutral" for zero / unknown changes.
export function deltaTone(delta) {
  if (!isNum(delta) || delta === 0) {
    return "neutral";
  }
  return delta > 0 ? "up" : "down";
}

function worstRatio(row, side) {
  const areas = row.map((item) => item.area);
  const sum = areas.reduce((total, area) => total + area, 0);
  const max = Math.max(...areas);
  const min = Math.min(...areas);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

// Squarified treemap layout. items: [{ id, value }] with positive
// values; returns [{ id, value, x, y, w, h }] in the coordinate
// space of the width x height box, larger values first. Rectangles
// never overlap, stay inside the box, and their areas are
// proportional to the values (so they add up to the box area).
// Empty input, or input with no positive value, yields [].
export function squarifiedLayout(items, width = 100, height = 100) {
  if (!Array.isArray(items) || !(width > 0) || !(height > 0)) {
    return [];
  }
  const valid = items.filter((item) => item && isNum(item.value) && item.value > 0);
  if (!valid.length) {
    return [];
  }
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  const scale = (width * height) / total;
  const sorted = valid
    .map((item) => ({ id: item.id, value: item.value, area: item.value * scale }))
    .sort((a, b) => b.area - a.area);

  const rects = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row = [];

  const layoutRow = () => {
    const sum = row.reduce((totalArea, item) => totalArea + item.area, 0);
    if (w >= h) {
      const rowWidth = sum / h;
      let cy = y;
      for (const item of row) {
        const rectHeight = item.area / rowWidth;
        rects.push({ id: item.id, value: item.value, x, y: cy, w: rowWidth, h: rectHeight });
        cy += rectHeight;
      }
      x += rowWidth;
      w -= rowWidth;
    } else {
      const rowHeight = sum / w;
      let cx = x;
      for (const item of row) {
        const rectWidth = item.area / rowHeight;
        rects.push({ id: item.id, value: item.value, x: cx, y, w: rectWidth, h: rowHeight });
        cx += rectWidth;
      }
      y += rowHeight;
      h -= rowHeight;
    }
    row = [];
  };

  for (const item of sorted) {
    if (w <= 0 || h <= 0) {
      break;
    }
    const side = Math.min(w, h);
    if (!row.length || worstRatio([...row, item], side) <= worstRatio(row, side)) {
      row.push(item);
    } else {
      layoutRow();
      row = [item];
    }
  }
  if (row.length && w > 0 && h > 0) {
    layoutRow();
  }
  return rects;
}

// --- Minimum tile sizes ---------------------------------------
// Every tile carries its name and figure, however small: the
// owner asked for the words on the tile itself, in type as
// small as it takes, instead of a blank tile only the legend
// speaks for. A micro label fits a tile in one of three
// shapes — two tiny horizontal lines, one horizontal line, or
// one vertical line down a tall narrow tile — and the sizes
// below are what each shape needs on the smallest map the
// page serves: a phone-width box, ~350px wide and at its
// 180px floor height, so 1% of width ≈ 3.5px and 1% of
// height ≈ 1.8px. Two micro lines (a 9px name over a 10px
// figure) plus the tile's padding need ~39 × 25px; a single
// line needs a ~70px run; a vertical line needs a ~28px-wide
// column at least ~50px tall to run down. On wider screens
// the box grows in both axes, so a tile that fits at the
// floor fits there too. Coordinates are percentages.
export const TILE_MIN_W = 11;
export const TILE_MIN_H = 14;
export const TILE_MIN_V_W = 8;
export const TILE_MIN_V_H = 28;
export const TILE_MIN_LINE_W = 20;
export const TILE_MIN_LINE_H = 10;

// Whether a rectangle can carry a micro label in one of the
// three shapes above.
export function tileLabelFits(rect) {
  if (!rect || !isNum(rect.w) || !isNum(rect.h)) {
    return false;
  }
  if (rect.w >= TILE_MIN_W && rect.h >= TILE_MIN_H) {
    return true;
  }
  if (
    rect.w >= TILE_MIN_V_W &&
    rect.h >= TILE_MIN_V_H &&
    rect.h >= rect.w * 2
  ) {
    return true;
  }
  return rect.w >= TILE_MIN_LINE_W && rect.h >= TILE_MIN_LINE_H;
}

// The value shares tried as a floor under the layout values,
// smallest first. Raising the floor lifts the smallest values
// towards it, which widens the strip they share and lengthens
// their slice of it; the order of the values — and so of the
// tile sizes — never changes, only the contrast softens.
const TILE_FLOOR_SHARES = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1];

// Squarified layout with a minimum tile size: lays the items
// out plainly, and while any tile is too small for a micro
// label, retries with the next floor share. The first layout
// whose tiles all fit wins; if none fits everywhere (ratios
// past ~30:1 can defeat every floor), the last layout — the
// one with the largest small tiles — is used and the labels
// still render in micro type as a best effort. The rects
// carry the floored value; callers read their display
// figures from their own entries, never from the rect.
export function layoutWithLabelRoom(items) {
  const valid = (Array.isArray(items) ? items : []).filter(
    (item) => item && isNum(item.value) && item.value > 0,
  );
  if (!valid.length) {
    return [];
  }
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  let rects = squarifiedLayout(valid, 100, 100);
  for (const share of TILE_FLOOR_SHARES) {
    if (rects.every(tileLabelFits)) {
      break;
    }
    const floor = total * share;
    rects = squarifiedLayout(
      valid.map((item) => ({ ...item, value: Math.max(item.value, floor) })),
      100,
      100,
    );
  }
  return rects;
}

// Heat colour for a genre tile, scaled by where its average sits
// between the smallest and largest average on show: the smallest
// average keeps the plain tile colour, the largest gets the
// strongest blue (the same blue as the bar charts below, the
// --primary of the dark theme), and values in between shade
// smoothly. The scale is relative to what is on show, so
// changing the period window recolours the tiles. The mix
// percentage is capped well short of solid blue so the tile's
// white text stays readable on the strongest tile. null means
// "no heat colour": a missing average, or nothing to scale
// against (a lone genre, or every average equal), and the tile
// keeps the plain colour.
export const GENRE_HEAT_MAX_MIX = 55;
const GENRE_HEAT_BLUE = "#3b82f6";

export function genreHeatMix(avg, min, max) {
  if (!isNum(avg) || !isNum(min) || !isNum(max) || max <= min) {
    return null;
  }
  const ratio = (avg - min) / (max - min);
  return Math.round(Math.min(1, Math.max(0, ratio)) * GENRE_HEAT_MAX_MIX);
}

export function genreHeatBackground(avg, min, max) {
  const mix = genreHeatMix(avg, min, max);
  if (mix === null || mix <= 0) {
    return null;
  }
  return `color-mix(in srgb, ${GENRE_HEAT_BLUE} ${mix}%, var(--surface-elevated))`;
}

// How much of its text a tile carries, decided from the
// tile's own size: "full" (name + figure + sub line), "value"
// (name + the big figure), "name" (name + figure in compact
// type), then the micro shapes for tiles too small for the
// compact stack — "micro-v" (one vertical line, name and
// figure together, down a tall narrow tile), "micro-h" (one
// horizontal line on a wide flat tile) and "micro" (two tiny
// lines). Every real tile earns at least a micro level, so
// no tile is left blank; "none" remains only for junk input.
// Coordinates are percentages of the map box, which is 5:2
// with a 180px floor height. The full / value / name
// thresholds come from the text stack at that floor: the
// tile's vertical padding is 16px, a name line ~21px, the
// big figure ~30px and the small sub line ~18px, so the full
// stack needs ~85px (~47% of 180) and even the name alone
// ~37px (~21%). The width floors keep the big figure (up to
// six glyphs, ~75px on a phone-width map) on one line. The
// micro thresholds are the minimum sizes the layout works
// to guarantee (see tileLabelFits). The checks run
// widest-and-tallest first; the map only grows past the
// floor on wider screens, so a level granted here still
// fits there, where the fonts cap out.
export function tileLabelLevel(rect) {
  if (!rect || !isNum(rect.w) || !isNum(rect.h)) {
    return "none";
  }
  if (rect.w >= 24 && rect.h >= 42) {
    return "full";
  }
  if (rect.w >= 22 && rect.h >= 30) {
    return "value";
  }
  if (rect.w >= 14 && rect.h >= 20) {
    return "name";
  }
  if (
    rect.w < TILE_MIN_W &&
    rect.w >= TILE_MIN_V_W &&
    rect.h >= TILE_MIN_V_H &&
    rect.h >= rect.w * 2
  ) {
    return "micro-v";
  }
  if (rect.h < TILE_MIN_H && rect.w >= TILE_MIN_LINE_W) {
    return "micro-h";
  }
  return "micro";
}

// Channel treemap for the overview tab: { tiles, legend }
// over the channels in their fixed order — the four SNS
// channels plus the blog, whose tile is sized by its 28-day
// user count, the size figure it has (see the header
// comment). Each SNS channel carries its share of the four
// channels' combined followers: the share rides on every SNS
// legend row and on roomy tiles. The blog carries no share —
// its figure is a different unit, so a percentage would mix
// units into the follower total the hero counts. Tiles exist
// only for positive counts and are laid out with a minimum
// size (layoutWithLabelRoom), so even the smallest tile
// carries its name and figure in micro type; each tile also
// carries the blue heat background scaled across the counts
// on show (the genre tiles' scale, here on the figures) and
// a labelLevel from tileLabelLevel, so the renderer draws
// only the lines that fit. The legend lists every channel,
// including zero / uncollected ones (集計待ち), in the
// fixed channel order.
export function channelTreemap(detail, gaTotals, historyRows) {
  const channels = channelAudiences(detail, gaTotals, historyRows);
  const snsTotal = channels.reduce(
    (sum, channel) =>
      channel.id === "blog"
        ? sum
        : sum + (isNum(channel.value) ? channel.value : 0),
    0,
  );
  const counts = channels
    .map((channel) => channel.value)
    .filter((value) => isNum(value) && value > 0);
  const heatMin = counts.length ? Math.min(...counts) : null;
  const heatMax = counts.length ? Math.max(...counts) : null;
  const legend = channels.map((channel) => {
    const share =
      channel.id !== "blog" && isNum(channel.value) && snsTotal > 0
        ? Math.round((channel.value / snsTotal) * 1000) / 10
        : null;
    return {
      ...channel,
      share,
      shareLabel: share === null ? null : `全体の ${share}%`,
      tone: deltaTone(channel.delta),
    };
  });
  const byId = new Map(legend.map((channel) => [channel.id, channel]));
  const tiles = layoutWithLabelRoom(
    legend
      .filter((channel) => isNum(channel.value) && channel.value > 0)
      .map((channel) => ({ id: channel.id, value: channel.value })),
  ).map((rect) => {
    const channel = byId.get(rect.id);
    const labelLevel = tileLabelLevel(rect);
    return {
      ...channel,
      heat: genreHeatBackground(channel.value, heatMin, heatMax),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      labelLevel,
      labelRoom: labelLevel !== "none",
    };
  });
  return { tiles, legend };
}

// Genre treemap for the genre sections (Instagram, blog,
// Threads, X): the same look as the channel map, one tile per
// genre row. `pick` maps a stat row to { name, avg, avgText,
// totalText } — the tile area is the per-item average
// (Instagram: avg views per post; blog: views per article),
// because the average is the axis genres are compared on; the
// total rides along as the tile's sub line and the legend's
// second figure. avgText is the worded average line
// ("平均再生 1,234" / "1記事あたり 56") and totalText the
// total line ("合計 12,345"). Tiles exist only for positive
// averages and are laid out with a minimum size
// (layoutWithLabelRoom); each carries a labelLevel from
// tileLabelLevel, and the renderer draws the lines that level
// allows — down to micro type, never blank. Each tile also
// carries a heat background (see genreHeatBackground) scaled
// across the averages on show. The legend lists every row,
// in the rows' order, so a genre whose average is zero or
// missing still reads there in full.
export function genreTreemap(rows, pick) {
  const entries = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const picked = row ? pick(row) : null;
      return picked
        ? {
            name: picked.name,
            avg: isNum(picked.avg) ? picked.avg : null,
            avgText: picked.avgText ?? "",
            totalText: picked.totalText ?? "",
          }
        : null;
    })
    .filter(Boolean);
  const byIndex = new Map(entries.map((entry, index) => [index, entry]));
  const tileAverages = entries
    .map((entry) => entry.avg)
    .filter((avg) => isNum(avg) && avg > 0);
  const heatMin = tileAverages.length ? Math.min(...tileAverages) : null;
  const heatMax = tileAverages.length ? Math.max(...tileAverages) : null;
  const tiles = layoutWithLabelRoom(
    entries
      .map((entry, index) => ({ id: index, value: entry.avg }))
      .filter((item) => isNum(item.value) && item.value > 0),
  ).map((rect) => {
    const entry = byIndex.get(rect.id);
    const labelLevel = tileLabelLevel(rect);
    return {
      ...entry,
      avgLabel: formatCount(entry.avg),
      heat: genreHeatBackground(entry.avg, heatMin, heatMax),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      labelLevel,
      labelRoom: labelLevel !== "none",
    };
  });
  const legend = entries.map((entry) => ({
    ...entry,
    avgLabel: formatCount(entry.avg),
  }));
  return { tiles, legend };
}
