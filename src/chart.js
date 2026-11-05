// Minimal SVG line chart for the daily views series. Pure string
// building so it can be unit-tested without a DOM.

export function buildLineChartSvg(points, options = {}) {
  const width = options.width || 720;
  const height = options.height || 180;
  const padding = options.padding || 24;
  if (!points || points.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="日別表示回数"></svg>`;
  }
  const max = Math.max(...points.map((p) => p.views), 1);
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = padding + stepX * i;
    const y = padding + innerH - (p.views / max) * innerH;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const polyline = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const dots = coords
    .map(
      ([x, y], i) =>
        `<circle cx="${x}" cy="${y}" r="2.5"><title>${points[i].date}: ${points[i].views}</title></circle>`,
    )
    .join("");
  const maxLabel = `<text x="${padding}" y="${padding - 8}" font-size="11">最大 ${max}</text>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="日別表示回数"><polyline points="${polyline}" fill="none" stroke-width="2"/>${dots}${maxLabel}</svg>`;
}
