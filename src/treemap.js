// Channel tiles for the overview tab, plus the genre treemap.
//
// The overview's channel map has one tile per SNS channel —
// Instagram, YouTube, Threads and X — with the tile area
// proportional to the channel's follower count (subscribers
// for YouTube). The metrics differ per channel, so every tile
// and legend row names its metric alongside the number. Tile
// colour is the blue heat scale the genre tiles use (see
// genreHeatBackground), scaled by follower count: the largest
// channel is the bluest. The change since the previous
// collection, where the history offers one, rides along as a
// "前回比" line coloured by direction: up = green, down = red,
// flat or unknown = plain — the same delta the overview's KPI
// cards show. The blog is not a tile: its GA user count is not
// a follower count, so it stays in the KPI cards below. The
// channels differ by orders of magnitude, so the smallest
// tiles cannot carry text; the legend under the map lists
// every channel's exact figures, as it does for the genre
// maps.
//
// The genre sections reuse the squarified treemap layout below,
// sized by each genre's per-item average: averages sit within
// an order of magnitude of each other, so tiles stay readable
// there, and the average is the axis the owner compares on.

import { formatCount, formatDelta, historyDelta } from "./api.js";

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
    const change = historyDelta(historyRows, key);
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
  return entries.map((entry) => ({
    ...entry,
    valueLabel: formatCount(entry.value),
    deltaLabel: formatDelta(entry.delta),
    note:
      (entry.id === "threads" || entry.id === "x") && entry.value === null
        ? "集計待ち"
        : null,
  }));
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

// A tile only carries its text label when it is big enough for the
// words to fit; smaller tiles stay blank and the legend below the
// map speaks for them. Coordinates are percentages of the map.
export function hasLabelRoom(rect) {
  return Boolean(rect) && rect.w >= 10 && rect.h >= 16;
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

// How much of its text a genre tile may carry, decided from the
// tile's own size so nothing is drawn that cannot fit: "full"
// (name + average + total), "value" (name + average), "name"
// (name only) or "none" (blank tile; the legend speaks for it).
// Coordinates are percentages of the map box, which is 5:2 with
// a 180px floor height. The thresholds come from the text stack
// at that floor: the tile's vertical padding is 16px, a name line
// ~21px, the big average figure ~30px and the small total line
// ~18px, so the full stack needs ~85px (~47% of 180) and even the
// name alone ~37px (~21%). The width floors keep the average
// figure (up to six glyphs, ~75px on a phone-width map) on one
// line. The checks run widest-and-tallest first; the map only
// grows past the floor on wider screens, so a level granted here
// still fits there, where the fonts cap out.
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
  return "none";
}

// Channel treemap for the overview tab: { tiles, legend }
// over the four SNS channels in their fixed order (the blog is
// left out — its GA user count is not a follower count; it
// stays in the KPI cards). Each channel carries its share of
// the four channels' combined followers, which is what the
// tile areas show: the share rides on every legend row and on
// roomy tiles. Tiles exist only for positive counts; each
// carries the blue heat background scaled across the counts on
// show (the genre tiles' scale, here on follower counts) and a
// labelLevel from tileLabelLevel, so the renderer draws only
// the lines that fit. The legend lists every channel,
// including zero / uncollected ones (集計待ち), in the
// fixed channel order.
export function channelTreemap(detail, historyRows) {
  const channels = channelAudiences(detail, null, historyRows).filter(
    (channel) => channel.id !== "blog",
  );
  const total = channels.reduce(
    (sum, channel) => sum + (isNum(channel.value) ? channel.value : 0),
    0,
  );
  const counts = channels
    .map((channel) => channel.value)
    .filter((value) => isNum(value) && value > 0);
  const heatMin = counts.length ? Math.min(...counts) : null;
  const heatMax = counts.length ? Math.max(...counts) : null;
  const legend = channels.map((channel) => {
    const share =
      isNum(channel.value) && total > 0
        ? Math.round((channel.value / total) * 1000) / 10
        : null;
    return {
      ...channel,
      share,
      shareLabel: share === null ? null : `全体の ${share}%`,
      tone: deltaTone(channel.delta),
    };
  });
  const byId = new Map(legend.map((channel) => [channel.id, channel]));
  const tiles = squarifiedLayout(
    legend
      .filter((channel) => isNum(channel.value) && channel.value > 0)
      .map((channel) => ({ id: channel.id, value: channel.value })),
    100,
    100,
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

// Genre treemap for the Instagram / blog genre sections: the
// same look as the channel map, one tile per genre row. `pick`
// maps a stat row to { name, avg, avgText, totalText } — the
// tile area is the per-item average (Instagram: avg views per
// post; blog: views per article), because the average is the
// axis genres are compared on; the total rides along as the
// tile's sub line and the legend's second figure. avgText is
// the worded average line ("平均再生 1,234" / "1記事あたり 56")
// and totalText the total line ("合計 12,345"). Tiles exist
// only for positive averages; each carries a labelLevel from
// tileLabelLevel, and the renderer draws only the lines that
// level allows, so no text is squeezed into a tile it cannot
// fit. Each tile also carries a heat background (see
// genreHeatBackground) scaled across the averages on show. The
// legend lists every row, in the rows' order, so a genre whose
// average is zero or missing — or whose tile is too small for
// its figures — still reads there.
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
  const tiles = squarifiedLayout(
    entries
      .map((entry, index) => ({ id: index, value: entry.avg }))
      .filter((item) => isNum(item.value) && item.value > 0),
    100,
    100,
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
