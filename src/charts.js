/*
 * charts.js — Gráficos SVG propios (sin librerías): convergencia (eje log) y barras agrupadas.
 */
(function () {
  const HF = (globalThis.HF = globalThis.HF || {});
  const C = {};
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const EXP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (e) => String(e).split('').map((c) => (c === '-' ? '⁻' : EXP[+c])).join('');
  const pow10 = (e) => `10${sup(e)}`;

  function legend(items, x, y) {
    let cx = x;
    return items.map((it) => {
      const g = `<g transform="translate(${cx},${y})"><rect width="12" height="12" rx="3" class="lg ${it.cls}"/><text x="17" y="10.5" class="ax-t">${esc(it.name)}</text></g>`;
      cx += 30 + it.name.length * 6.4;
      return g;
    }).join('');
  }

  /** Residuo relativo vs iteración, eje Y logarítmico. series: [{name, cls, values}] */
  C.lineLog = (series, { tol = 1e-6, w = 680, h = 300, xlabel = 'Iteración k', ylabel = '‖rₖ‖₂ / ‖b‖₂' } = {}) => {
    const l = 62, r = 18, t = 34, b = 46;
    const maxK = Math.max(1, ...series.map((s) => s.values.length - 1));
    const lv = (v) => Math.log10(Math.max(v, 1e-17));
    const all = series.flatMap((s) => s.values.map(lv)).concat([Math.log10(tol)]);
    let ymin = Math.floor(Math.min(...all)), ymax = Math.max(0, Math.ceil(Math.max(...all)));
    if (ymax - ymin < 2) ymin = ymax - 2;
    const X = (k) => l + (k / maxK) * (w - l - r), Y = (v) => t + ((ymax - v) / (ymax - ymin)) * (h - t - b);
    const step = Math.max(1, Math.ceil((ymax - ymin) / 9));
    let grid = '';
    for (let e = ymax; e >= ymin; e -= step) grid += `<line x1="${l}" x2="${w - r}" y1="${Y(e)}" y2="${Y(e)}" class="grid"/><text x="${l - 8}" y="${Y(e) + 4}" text-anchor="end" class="ax-t">${pow10(e)}</text>`;
    const xs = Math.max(1, Math.ceil(maxK / 10));
    for (let k = 0; k <= maxK; k += xs) grid += `<line x1="${X(k)}" x2="${X(k)}" y1="${h - b}" y2="${h - b + 4}" class="axis"/><text x="${X(k)}" y="${h - b + 17}" text-anchor="middle" class="ax-t">${k}</text>`;
    const lines = series.map((s) => {
      const d = s.values.map((v, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)},${Y(lv(v)).toFixed(1)}`).join('');
      const dots = s.values.length <= 60 ? s.values.map((v, k) => `<circle cx="${X(k).toFixed(1)}" cy="${Y(lv(v)).toFixed(1)}" r="3.2" class="dot ${s.cls}"/>`).join('') : '';
      return `<path d="${d}" class="ln ${s.cls}"/>${dots}`;
    }).join('');
    const tolY = Y(Math.log10(tol));
    return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="Residuo relativo contra iteración en escala logarítmica">
      ${grid}<line x1="${l}" x2="${l}" y1="${t}" y2="${h - b}" class="axis"/><line x1="${l}" x2="${w - r}" y1="${h - b}" y2="${h - b}" class="axis"/>
      <line x1="${l}" x2="${w - r}" y1="${tolY}" y2="${tolY}" class="tol"/><text x="${w - r}" y="${tolY - 5}" text-anchor="end" class="ax-t tol-t">tol = ${tol.toExponential(0).replace('e-', '·10⁻').replace('e+', '·10')}</text>
      ${lines}
      <text x="${(l + w - r) / 2}" y="${h - 6}" text-anchor="middle" class="ax-t">${esc(xlabel)}</text>
      <text transform="translate(14,${(t + h - b) / 2}) rotate(-90)" text-anchor="middle" class="ax-t">${esc(ylabel)}</text>
      ${legend(series, l, 8)}</svg>`;
  };

  /** Barras agrupadas. categories: [str]; series: [{name, cls, values}] */
  C.barGroup = (categories, series, { w = 680, h = 300, log = false, yLabel = '', fmt = (v) => String(Math.round(v)) } = {}) => {
    const l = 66, r = 14, t = 34, b = 50;
    const tv = (v) => (log ? Math.log10(Math.max(v, 1e-18)) : v);
    const vals = series.flatMap((s) => s.values.map(tv));
    let ymin = 0, ymax;
    let ticks = [];
    if (log) {
      ymin = Math.floor(Math.min(...vals)); ymax = Math.ceil(Math.max(...vals)); if (ymax - ymin < 2) ymax = ymin + 2;
      const st = Math.max(1, Math.ceil((ymax - ymin) / 7));
      for (let e = ymin; e <= ymax; e += st) ticks.push(e);
    } else {
      const mx = Math.max(...vals, 1), mag = Math.pow(10, Math.floor(Math.log10(mx))), nm = [1, 2, 2.5, 5, 10].find((m) => m * mag >= mx) * mag;
      ymax = nm; for (let i = 0; i <= 5; i++) ticks.push((nm / 5) * i);
    }
    const Y = (v) => t + ((ymax - v) / (ymax - ymin)) * (h - t - b);
    const gw = (w - l - r) / categories.length, bw = Math.min(34, (gw * 0.8) / series.length);
    let g = ticks.map((e) => `<line x1="${l}" x2="${w - r}" y1="${Y(e)}" y2="${Y(e)}" class="grid"/><text x="${l - 8}" y="${Y(e) + 4}" text-anchor="end" class="ax-t">${log ? pow10(e) : fmt(e)}</text>`).join('');
    categories.forEach((c, ci) => {
      const gx = l + ci * gw + gw / 2;
      series.forEach((s, si) => {
        const v = tv(s.values[ci]), x = gx - (series.length * bw) / 2 + si * bw, y = Y(v);
        g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${Math.max(0, h - b - y).toFixed(1)}" rx="3" class="bar ${s.cls}"><title>${esc(s.name)} · ${esc(c)}: ${log ? s.values[ci].toExponential(2) : fmt(s.values[ci])}</title></rect>`;
        if (!log && bw > 18) g += `<text x="${(x + (bw - 3) / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" class="ax-t sm">${fmt(s.values[ci])}</text>`;
      });
      g += `<text x="${gx}" y="${h - b + 17}" text-anchor="middle" class="ax-t">${esc(c)}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img" aria-label="${esc(yLabel)}">${g}
      <line x1="${l}" x2="${l}" y1="${t}" y2="${h - b}" class="axis"/><line x1="${l}" x2="${w - r}" y1="${h - b}" y2="${h - b}" class="axis"/>
      <text transform="translate(14,${(t + h - b) / 2}) rotate(-90)" text-anchor="middle" class="ax-t">${esc(yLabel)}</text>
      ${legend(series, l, 8)}</svg>`;
  };

  HF.Charts = C;
})();
