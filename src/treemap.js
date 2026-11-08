// Channel sizes for the overview tab, plus the genre treemap.
//
// Each channel contributes one entry whose size is its audience.
// The metrics differ per channel (followers for Instagram /
// Threads, subscribers for YouTube, the blog's last-28-days
// users from GA), so every entry names its metric alongside the
// number. The overview shows the sizes as horizontal bars — the
// channels differ by orders of magnitude, which a treemap's
// tiles squeezed into unreadable slivers. Bar / tile colour
// follows the change since the previous SNS collection, where
// the history offers one: up = green, down = red, flat or
// unknown = neutral. The blog has no history, so it is always
// neutral.
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
  ];
  return entries.map((entry) => ({
    ...entry,
    valueLabel: formatCount(entry.value),
    deltaLabel: formatDelta(entry.delta),
    note: entry.id === "threads" && entry.value === null ? "集計待ち" : null,
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

// Bar rows for the overview's channel sizes: the channel
// audiences in their fixed order, each with pct (the bar length,
// scaled so the largest channel is 100) and tone (the colour of
// the change since the previous collection). A channel without a
// value yet — Threads while its followers are not collected —
// gets an empty bar (pct 0) and keeps its "集計待ち" note; once a
// value arrives it takes its place among the bars.
export function channelBars(detail, gaTotals, historyRows) {
  const channels = channelAudiences(detail, gaTotals, historyRows);
  const max = channels.reduce(
    (biggest, channel) =>
      isNum(channel.value) && channel.value > biggest ? channel.value : biggest,
    0,
  );
  return channels.map((channel) => ({
    ...channel,
    pct:
      isNum(channel.value) && max > 0
        ? Math.round((channel.value / max) * 1000) / 10
        : 0,
    tone: deltaTone(channel.delta),
  }));
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
// only for positive averages; the legend lists every row, in
// the rows' order, so a genre whose average is zero or missing
// still reads there.
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
  const tiles = squarifiedLayout(
    entries
      .map((entry, index) => ({ id: index, value: entry.avg }))
      .filter((item) => isNum(item.value) && item.value > 0),
    100,
    100,
  ).map((rect) => {
    const entry = byIndex.get(rect.id);
    return {
      ...entry,
      avgLabel: formatCount(entry.avg),
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      labelRoom: hasLabelRoom(rect),
    };
  });
  const legend = entries.map((entry) => ({
    ...entry,
    avgLabel: formatCount(entry.avg),
  }));
  return { tiles, legend };
}
