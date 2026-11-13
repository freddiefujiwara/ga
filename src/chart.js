// Minimal SVG line chart for the daily views series. Pure string
// building so it can be unit-tested without a DOM.
//
// The chart carries the data on its points: every day gets an
// invisible, finger-sized hit circle (class "chart-point", with
// data-date / data-views) that main.js turns into a tooltip on
// hover and tap. A handful of date labels under the axis give the
// 28 days a readable scale.
//
// Callers can ask for a y axis through options.yAxis: the chart
// then gains light gridlines and round-numbered tick labels on
// a data-following domain (see niceAxisScale), and the separate
// max label is dropped — the ticks carry the scale. The
// Instagram engagement trend and the overview's combined
// follower total use it; the other charts keep the zero-based,
// label-only treatment.
//
// Callers can mark days through options.markedDays (a Map of
// "YYYYMMDD" -> item count): a marked day gets a small triangle
// marker above its point (class "blog-post-marker", with the
// count beside it when the day carries more than one item) and a
// transparent, full-column hit rect (class "blog-day-hit", with
// data-date) so a tap anywhere on the day's column can jump to
// that day's entry below the chart — the blog daily chart's
// published-article overlay, mirroring the follow chart's
// posted-day treatment. The column boundaries are the midpoints
// between neighbouring points. Unmarked callers see no change.

// "20261102" -> "11/2"
export function formatDateLabel(yyyymmdd) {
  const m = String(yyyymmdd).slice(4);
  return `${Number(m.slice(0, 2))}/${Number(m.slice(2, 4))}`;
}

// "20261102" -> "2026年11月2日"
export function formatDateFull(yyyymmdd) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}年${Number(s.slice(4, 6))}月${Number(s.slice(6, 8))}日`;
}

export function tooltipText(point) {
  return `${formatDateFull(point.date)} · ${Number(point.views).toLocaleString()}回`;
}

// --- Y axis scale (options.yAxis on buildLineChartSvg) ---
// The axis domain follows the data instead of starting at zero:
// the trend series are large rolling totals (hundreds of
// thousands), whose day-to-day movement a zero baseline would
// flatten into a straight line. The domain snaps outward to
// round steps so the ticks land on "nice" values, aiming at
// about five ticks.

function niceStep(rawStep) {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const factor = norm < 1.3 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return factor * magnitude;
}

// Round away binary floating point noise from step arithmetic
// (0.30000000000000004 and friends) without touching real data.
function cleanTick(value) {
  return Math.round(value * 1e6) / 1e6;
}

// { lo, hi, ticks } for the value range, or null when the range
// is unusable. lo / hi are the outermost ticks; the caller maps
// the points against a slightly widened domain so the line
// keeps headroom inside the outermost gridlines.
export function niceAxisScale(min, max, targetTicks = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return null;
  }
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const spread = Math.max(Math.abs(lo) * 0.05, 1);
    lo -= spread;
    hi += spread;
  }
  const step = niceStep((hi - lo) / (targetTicks - 1));
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (min >= 0 && lo < 0) {
    lo = 0;
  }
  if (hi <= lo) {
    hi = lo + step;
  }
  const count = Math.round((hi - lo) / step);
  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    cleanTick(lo + step * i),
  );
  return { lo: cleanTick(lo), hi: cleanTick(hi), ticks };
}

// The y tick labels: large counts in 万 units ("49万", "12.5万"),
// smaller ones grouped as usual ("4,400"), fractions trimmed to
// one decimal.
export function formatAxisValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }
  if (Math.abs(num) >= 10000) {
    const man = num / 10000;
    const text = Number.isInteger(man)
      ? String(man)
      : String(Math.round(man * 10) / 10);
    return `${text}万`;
  }
  return Number.isInteger(num)
    ? num.toLocaleString("ja-JP")
    : String(Math.round(num * 10) / 10);
}

// Indices of up to `count` evenly spaced ticks, always including
// the first and last point.
export function tickIndices(length, count = 5) {
  if (length <= 0) {
    return [];
  }
  if (length <= count) {
    return Array.from({ length }, (_, i) => i);
  }
  const indices = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i * (length - 1)) / (count - 1));
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }
  return indices;
}

export function buildLineChartSvg(points, options = {}) {
  const width = options.width || 720;
  const height = options.height || 196;
  const pad = options.padding || 24;
  const padBottom = pad + 22; // room for the date labels
  const ariaLabel = options.label || "日別表示回数";
  if (!points || points.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}"></svg>`;
  }
  const max = Math.max(...points.map((p) => p.views), 1);
  const scale =
    options.yAxis === true
      ? niceAxisScale(
          Math.min(...points.map((p) => p.views)),
          Math.max(...points.map((p) => p.views)),
        )
      : null;
  const padLeft = scale ? pad + 38 : pad;
  // With an axis, the points map against the tick domain widened
  // a touch, so the line keeps headroom inside the outermost
  // gridlines instead of sitting on them.
  const domainSpan = scale ? scale.hi - scale.lo : 0;
  const domainLo = scale ? scale.lo - domainSpan * 0.04 : 0;
  const domainHi = scale ? scale.hi + domainSpan * 0.04 : 0;
  const innerW = width - padLeft - pad;
  const innerH = height - pad - padBottom;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padLeft + stepX * i;
    const y = scale
      ? pad +
        innerH -
        ((p.views - domainLo) / (domainHi - domainLo)) * innerH
      : pad + innerH - (p.views / max) * innerH;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const polyline = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const markedDays =
    options.markedDays instanceof Map ? options.markedDays : new Map();
  const round = (n) => Number(n.toFixed(1));
  // Full-column hit rects for the marked days, drawn before the
  // points so the tooltip's hit circles stay on top at the point
  // itself; the rest of the column still lands on the rect.
  const columnHits = coords
    .map(([x], i) => {
      const date = points[i].date;
      if (!markedDays.has(date)) {
        return "";
      }
      const left = i === 0 ? padLeft : round((coords[i - 1][0] + x) / 2);
      const right =
        i === coords.length - 1 ? width - pad : round((x + coords[i + 1][0]) / 2);
      return `<rect class="blog-day-hit" data-date="${date}" x="${left}" y="0" width="${round(right - left)}" height="${height}"/>`;
    })
    .join("");
  const dots = coords
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5"></circle>`)
    .join("");
  const hits = coords
    .map(
      ([x, y], i) =>
        `<circle class="chart-point" cx="${x}" cy="${y}" r="12" data-date="${points[i].date}" data-views="${points[i].views}"></circle>`,
    )
    .join("");
  // The marked days' triangles (and their counts, when a day
  // carries more than one item), drawn last so they sit on top.
  const markers = coords
    .map(([x, y], i) => {
      const date = points[i].date;
      if (!markedDays.has(date)) {
        return "";
      }
      const count = markedDays.get(date);
      const my = Math.max(round(y) - 15, 2);
      const triangle = `<path class="blog-post-marker" data-date="${date}" d="M ${round(x - 5)},${my} L ${round(x + 5)},${my} L ${round(x)},${my + 6} Z"/>`;
      const label =
        count > 1
          ? `<text class="blog-post-count" x="${round(x + 7)}" y="${my + 6}">${count}</text>`
          : "";
      return triangle + label;
    })
    .join("");
  const axisLabels = tickIndices(points.length)
    .map((i) => {
      const [x] = coords[i];
      const anchor =
        i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
      return `<text class="chart-axis-label" x="${x}" y="${height - 6}" text-anchor="${anchor}">${formatDateLabel(points[i].date)}</text>`;
    })
    .join("");
  // The y axis gridlines and tick labels, drawn first so the
  // line sits on top. The labels are raw counts like the max
  // label, so they carry .chart-y-label and the stylesheet
  // hides them while masking; the gridlines carry no numbers
  // and stay.
  const grid = scale
    ? scale.ticks
        .map((tick) => {
          const y = round(
            pad +
              innerH -
              ((tick - domainLo) / (domainHi - domainLo)) * innerH,
          );
          return `<line class="chart-gridline" x1="${padLeft}" y1="${y}" x2="${width - pad}" y2="${y}"/><text class="chart-y-label" x="${padLeft - 6}" y="${round(y + 3.5)}" text-anchor="end">${formatAxisValue(tick)}</text>`;
        })
        .join("")
    : "";
  // The max label is a raw count, so it carries the plain
  // .chart-max-label class: while masking, the stylesheet
  // hides it outright (SVG text does not blur reliably). With a
  // y axis the ticks carry the scale, so the label is dropped.
  const maxLabel = scale
    ? ""
    : `<text class="chart-max-label" x="${pad}" y="${pad - 8}" font-size="11">最大 ${max}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">${grid}<polyline points="${polyline}" fill="none" stroke-width="2"/>${columnHits}${dots}${hits}${markers}${axisLabels}${maxLabel}</svg>`;
}

// Diverging bar chart for one account's daily follows and
// unfollows: follow bars grow up from a centre baseline, unfollow
// bars grow down, and both sides share one scale (the larger of
// the two maxima) so a day's gain and loss stay comparable. A
// null value draws no bar — a gap, not a zero. Days carrying
// posts get a small triangle marker above the follow bar, so a
// follow spike can be eyeballed against what was posted that
// day; those days also get a transparent, full-column hit rect
// (class "follow-day-hit", with data-date) drawn last in the
// column so main.js can turn a tap anywhere on the column into
// a jump to that day's entry in the posted-days list below.
// Days are the followChartDays shape:
// { date: "YYYYMMDD", follows, unfollows, posts }.
// Pure string building, like buildLineChartSvg.
export function buildFollowChartSvg(days, options = {}) {
  const width = options.width || 720;
  const height = options.height || 220;
  const pad = options.padding || 24;
  const padBottom = pad + 22; // room for the date labels
  const ariaLabel = options.label || "日ごとのフォロー・フォロー解除";
  if (!days || days.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}"></svg>`;
  }
  const maxFollows = Math.max(...days.map((d) => d.follows ?? 0), 0);
  const maxUnfollows = Math.max(...days.map((d) => d.unfollows ?? 0), 0);
  const max = Math.max(maxFollows, maxUnfollows, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad - padBottom;
  const halfH = innerH / 2;
  const baseY = pad + halfH;
  const slot = innerW / days.length;
  const barW = Math.max(2, Math.min(18, slot * 0.6));
  const round = (n) => Number(n.toFixed(1));
  const parts = [
    `<line class="follow-baseline" x1="${pad}" y1="${round(baseY)}" x2="${width - pad}" y2="${round(baseY)}"/>`,
  ];
  days.forEach((day, i) => {
    const cx = pad + slot * i + slot / 2;
    const x = round(cx - barW / 2);
    let barTop = baseY;
    if (typeof day.follows === "number" && day.follows > 0) {
      const h = (day.follows / max) * halfH;
      barTop = baseY - h;
      parts.push(
        `<rect class="follow-bar" x="${x}" y="${round(barTop)}" width="${round(barW)}" height="${round(h)}"/>`,
      );
    }
    if (typeof day.unfollows === "number" && day.unfollows > 0) {
      const h = (day.unfollows / max) * halfH;
      parts.push(
        `<rect class="unfollow-bar" x="${x}" y="${round(baseY)}" width="${round(barW)}" height="${round(h)}"/>`,
      );
    }
    if (Array.isArray(day.posts) && day.posts.length > 0) {
      const my = Math.max(round(barTop) - 11, 2);
      parts.push(
        `<path class="follow-post-marker" data-date="${day.date}" d="M ${round(cx - 5)},${my} L ${round(cx + 5)},${my} L ${round(cx)},${my + 6} Z"/>`,
      );
      parts.push(
        `<rect class="follow-day-hit" data-date="${day.date}" x="${round(pad + slot * i)}" y="0" width="${round(slot)}" height="${height}"/>`,
      );
    }
  });
  const axisLabels = tickIndices(days.length)
    .map((i) => {
      const x = pad + slot * i + slot / 2;
      const anchor =
        i === 0 ? "start" : i === days.length - 1 ? "end" : "middle";
      return `<text class="chart-axis-label" x="${round(x)}" y="${height - 6}" text-anchor="${anchor}">${formatDateLabel(days[i].date)}</text>`;
    })
    .join("");
  const maxLabels =
    `<text class="chart-max-label" x="${pad}" y="${pad - 8}" font-size="11">最大フォロー ${maxFollows}</text>` +
    `<text class="chart-max-label" x="${pad}" y="${height - padBottom + 13}" font-size="11">最大解除 ${maxUnfollows}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}">${parts.join("")}${axisLabels}${maxLabels}</svg>`;
}
