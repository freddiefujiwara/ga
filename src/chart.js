// Minimal SVG line chart for the daily views series. Pure string
// building so it can be unit-tested without a DOM.
//
// The chart carries the data on its points: every day gets an
// invisible, finger-sized hit circle (class "chart-point", with
// data-date / data-views) that main.js turns into a tooltip on
// hover and tap. A handful of date labels under the axis give the
// 28 days a readable scale.

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
  const innerW = width - pad * 2;
  const innerH = height - pad - padBottom;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + stepX * i;
    const y = pad + innerH - (p.views / max) * innerH;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const polyline = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const dots = coords
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5"></circle>`)
    .join("");
  const hits = coords
    .map(
      ([x, y], i) =>
        `<circle class="chart-point" cx="${x}" cy="${y}" r="12" data-date="${points[i].date}" data-views="${points[i].views}"></circle>`,
    )
    .join("");
  const axisLabels = tickIndices(points.length)
    .map((i) => {
      const [x] = coords[i];
      const anchor =
        i === 0 ? "start" : i === points.length - 1 ? "end" : "middle";
      return `<text class="chart-axis-label" x="${x}" y="${height - 6}" text-anchor="${anchor}">${formatDateLabel(points[i].date)}</text>`;
    })
    .join("");
  // The max label is a raw count, so it carries the plain
  // .chart-max-label class: while masking, the stylesheet
  // hides it outright (SVG text does not blur reliably).
  const maxLabel = `<text class="chart-max-label" x="${pad}" y="${pad - 8}" font-size="11">最大 ${max}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${ariaLabel}"><polyline points="${polyline}" fill="none" stroke-width="2"/>${dots}${hits}${axisLabels}${maxLabel}</svg>`;
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
