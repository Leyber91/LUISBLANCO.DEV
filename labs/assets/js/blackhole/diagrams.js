/* ============================================================
   blackhole/diagrams.js — the linked views, drawn as SVG strings
   from model data. No state of their own; ui.js wires hover and
   scrubbing back into the store.
   ============================================================ */

import { ergosurface, s3, sci, dur, photonEnergy, TIDE_G } from './physics.js';

// f() places marks (SVG coordinates); every number a visitor reads is in physics.js's format for its kind
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Meridional cross-section to scale: horizon, ergosurface, photon orbits, ISCO, disk,
 * the camera's line of sight, and an optional traced ray (KS x, z projection).
 */
export function crossSection({ a, q = 0, rh, rph, rphr, ri, rout, incl, rcam, ray, R = null }) {
  const W = 300, H = 200, cx = W / 2, cy = H / 2;
  const span = R || Math.max(8, Math.min(rout + 3, 26));
  const s = (H / 2 - 12) / span;
  const X = (x) => cx + x * s, Y = (z) => cy - z * s;
  const parts = [];
  parts.push(`<line class="grid" x1="0" y1="${cy}" x2="${W}" y2="${cy}"/>`);
  parts.push(`<line class="grid" x1="${cx}" y1="0" x2="${cx}" y2="${H}"/>`);
  // the ergosurface, physics.js's (charge included), drawn in the x-z plane
  let erg = '';
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * 2 * Math.PI;
    const ct = Math.cos(t), st = Math.sin(t);
    const rE = ergosurface(a, q, t * 180 / Math.PI);
    const x = Math.sqrt(rE * rE + a * a) * st, z = rE * ct;
    erg += `${i ? 'L' : 'M'}${f(X(x))},${f(Y(z))}`;
  }
  parts.push(`<path class="dim" stroke-dasharray="2 3" d="${erg}Z"/>`);
  // horizon (an oblate spheroid in KS: x = sqrt(r^2 + a^2) sin, z = r cos)
  parts.push(`<ellipse class="hz" cx="${cx}" cy="${cy}" rx="${f(Math.sqrt(rh * rh + a * a) * s)}" ry="${f(rh * s)}"/>`);
  // equatorial photon orbits and ISCO as ticks on the plane
  const tick = (r, cls, lab, dy) => {
    const x1 = X(Math.sqrt(r * r + a * a)), x0 = X(-Math.sqrt(r * r + a * a));
    return `<line class="${cls}" x1="${f(x1)}" y1="${cy - 5}" x2="${f(x1)}" y2="${cy + 5}"/><line class="${cls}" x1="${f(x0)}" y1="${cy - 5}" x2="${f(x0)}" y2="${cy + 5}"/>` +
      (lab ? `<text x="${f(x1 + 3)}" y="${cy + dy}" class="${'lab'}">${lab}</text>` : '');
  };
  // disk: right side carries prograde gas toward the far side of the page
  parts.push(`<line class="ser" stroke-width="2" x1="${f(X(Math.sqrt(ri * ri + a * a)))}" y1="${cy}" x2="${f(X(Math.min(rout, span)))}" y2="${cy}"/>`);
  parts.push(`<line class="ser" stroke-width="2" x1="${f(X(-Math.sqrt(ri * ri + a * a)))}" y1="${cy}" x2="${f(X(-Math.min(rout, span)))}" y2="${cy}"/>`);
  parts.push(tick(rph, 'ink', 'r_ph', -8));
  parts.push(tick(ri, 'ser', 'ISCO', 16));
  if (rphr < span) parts.push(tick(rphr, 'dim', '', 0));
  // camera direction
  const it = incl * Math.PI / 180;
  const dx = Math.sin(it), dz = Math.cos(it);
  const rc = Math.min(rcam, span * 0.96);
  const camX = X(rc * dx), camY = Y(rc * dz);
  parts.push(`<line class="dim" x1="${cx}" y1="${cy}" x2="${f(camX)}" y2="${f(camY)}" stroke-dasharray="1 3"/>`);
  parts.push(`<rect class="nowf" x="${f(camX - 3)}" y="${f(camY - 3)}" width="6" height="6"/>`);   // the live position: gold
  parts.push(`<text x="${f(Math.min(camX + 6, W - 60))}" y="${f(Math.max(camY - 6, 12))}" class="lab">eye ${s3(rcam)} M${rcam > span ? ' (far)' : ''}</text>`);
  // the probed ray
  if (ray && ray.length > 1) {
    let d = '';
    let started = false;
    for (const p of ray) {
      const x = p[0], z = p[2];
      if (Math.abs(x) > span * 1.4 || Math.abs(z) > span * 1.4) { started = false; continue; }
      d += `${started ? 'L' : 'M'}${f(X(x))},${f(Y(z))}`;
      started = true;
    }
    parts.push(`<path class="ray" d="${d}"/>`);
  }
  parts.push(`<text x="6" y="${H - 6}">${s3(span * 2)} M across, to scale</text>`);
  return `<svg class="bh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cross-section of the hole to scale">${parts.join('')}</svg>`;
}

/** Disk temperature and flux against radius, with the ISCO and the hover radius marked. */
export function diskProfile({ tab, ri, rout, Tpeak, hl, tdispK }) {
  const W = 300, H = 150, L = 34, Rr = 8, T = 10, B = 26;
  const r0 = ri, r1 = rout;
  const X = (r) => L + (Math.log(r / r0) / Math.log(r1 / r0)) * (W - L - Rr);
  const Y = (v) => T + (1 - v) * (H - T - B);
  const peakF = Math.max(...tab.F);
  let dT = '', dF = '';
  for (let i = 0; i < tab.r.length; i += 2) {
    const r = tab.r[i];
    if (r <= r0) continue;
    const Fn = tab.F[i] / peakF, Tn = Math.pow(Math.max(0, Fn), 0.25);
    dT += `${dT ? 'L' : 'M'}${f(X(r))},${f(Y(Tn))}`;
    dF += `${dF ? 'L' : 'M'}${f(X(r))},${f(Y(Fn))}`;
  }
  const parts = [];
  for (const v of [0, 0.5, 1]) parts.push(`<line class="grid" x1="${L}" x2="${W - Rr}" y1="${f(Y(v))}" y2="${f(Y(v))}"/>`);
  parts.push(`<path class="ser" d="${dT}"/><path class="ink" stroke-dasharray="3 3" d="${dF}"/>`);
  parts.push(`<line class="ser" x1="${f(X(ri))}" x2="${f(X(ri))}" y1="${T}" y2="${H - B}"/>`);
  const ticks = [ri, 2 * ri, 4 * ri, rout].filter((r, i, arr) => r <= rout && (i === 0 || r - arr[i - 1] > 0.5));
  for (const r of ticks) parts.push(`<text x="${f(X(r) - 8)}" y="${H - 10}">${s3(r)}</text>`);
  parts.push(`<text x="${W - 40}" y="${H - 10}">r / M</text>`);
  parts.push(`<text x="2" y="${f(Y(1) + 4)}">1</text><text x="2" y="${f(Y(0) + 4)}">0</text>`);
  if (Tpeak > 0) parts.push(`<text x="${L + 4}" y="${T + 10}" class="lab">T peak ${sci(Tpeak)} K</text>`);
  else parts.push(`<text x="${L + 4}" y="${T + 10}" class="lab">display peak ${sci(tdispK)} K</text>`);
  if (hl > 0) parts.push(`<line class="ink" x1="${f(X(hl))}" x2="${f(X(hl))}" y1="${T}" y2="${H - B}"/><text x="${f(Math.min(X(hl) + 4, W - 70))}" y="${T + 24}" class="lab">r = ${s3(hl)} M</text>`);
  parts.push(`<rect class="hit" data-hit="profile" x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}"/>`);
  return { svg: `<svg class="bh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Disk temperature and flux against radius">${parts.join('')}</svg>`, X, r0, r1, L, W, Rr };
}

/** Observed nu F_nu of the visible disk, log-log, photon energy in eV. */
export function spectrumPlot(spec) {
  const W = 300, H = 130, L = 30, Rr = 8, T = 8, B = 24;
  if (!spec || !spec.length) return `<svg class="bh-svg" viewBox="0 0 ${W} ${H}"><text x="10" y="60">no thermal disk in this view</text></svg>`;
  const e0 = Math.log10(spec[0][0]), e1 = Math.log10(spec[spec.length - 1][0]);
  const X = (e) => L + (Math.log10(e) - e0) / (e1 - e0) * (W - L - Rr);
  const Y = (v) => T + (1 - (Math.log10(Math.max(v, 1e-4)) + 4) / 4) * (H - T - B);
  let d = '', peak = spec[0];
  for (const [e, v] of spec) { if (v >= 1e-4) d += `${d ? 'L' : 'M'}${f(X(e))},${f(Y(v))}`; if (v > peak[1]) peak = [e, v]; }
  const parts = [];
  for (let k = Math.ceil(e0); k <= Math.floor(e1); k += 2) {
    parts.push(`<line class="grid" x1="${f(X(10 ** k))}" x2="${f(X(10 ** k))}" y1="${T}" y2="${H - B}"/>`);
    const lab = k >= 3 ? `${10 ** (k - 3)} keV` : k >= 0 ? `${10 ** k} eV` : `1e${k}`;
    parts.push(`<text x="${f(X(10 ** k) - 10)}" y="${H - 9}">${lab}</text>`);
  }
  parts.push(`<path class="ser" d="${d}"/>`);
  parts.push(`<circle class="serf" cx="${f(X(peak[0]))}" cy="${f(Y(peak[1]))}" r="2.5"/>`);
  const pe = peak[0];
  parts.push(`<text x="${f(Math.min(X(pe) + 6, W - 110))}" y="${T + 12}" class="lab">peak ${photonEnergy(pe)}</text>`);
  parts.push(`<text x="2" y="${T + 8}">νFν</text>`);
  return `<svg class="bh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Observed spectrum of the disk">${parts.join('')}</svg>`;
}

/**
 * The fall: proper time (bright ink) and far time (horizon ink) to reach r, in seconds for the mass,
 * on log axes; tidal stretch across 2 m along the bottom; the current radius marked.
 */
export function fallChart({ rows, tg, rcur, rh, ri, rph, tidalScale, tide10g }) {
  const W = 300, H = 170, L = 38, Rr = 8, T = 10, B = 40;
  const r0 = rows[0].r, r1 = rows[rows.length - 1].r;
  const X = (r) => L + (1 - Math.log((r - rh * 0.999) / (r1 - rh * 0.999)) / Math.log((r0 - rh * 0.999) / (r1 - rh * 0.999))) * (W - L - Rr);
  const tmax = rows[rows.length - 1].t;
  const Y = (t) => T + (1 - t / tmax) * (H - T - B);
  let dTau = '', dT = '';
  for (const row of rows) { dTau += `${dTau ? 'L' : 'M'}${f(X(row.r))},${f(Y(row.tau))}`; dT += `${dT ? 'L' : 'M'}${f(X(row.r))},${f(Y(row.t))}`; }
  const parts = [];
  parts.push(`<path class="ser" d="${dTau}"/><path class="ink" d="${dT}"/>`);
  const mark = (r, lab, cls) => r > r1 && r < r0 ? `<line class="${cls}" stroke-dasharray="2 3" x1="${f(X(r))}" x2="${f(X(r))}" y1="${T}" y2="${H - B}"/><text x="${f(X(r) + 2)}" y="${H - B + 12}" class="${'lab'}">${lab}</text>` : '';
  parts.push(mark(ri, 'ISCO', 'ser'), mark(rph, 'r_ph', 'ink'));
  if (tide10g > rh) parts.push(mark(tide10g, `${TIDE_G} g`, 'dim'));
  // tidal strip: log10 of acceleration in g across 2 m
  let dTid = '';
  const tmin = -12, tmx = 12;
  for (const row of rows) {
    const g = row.tidal * tidalScale;
    const yv = H - 6 - (Math.log10(Math.max(g, 1e-30)) - tmin) / (tmx - tmin) * (B - 20);
    dTid += `${dTid ? 'L' : 'M'}${f(X(row.r))},${f(Math.max(H - B + 14, Math.min(H - 4, yv)))}`;
  }
  parts.push(`<path class="dim" d="${dTid}"/>`);
  if (rcur) {
    const xc = X(Math.max(r1, Math.min(r0, rcur)));
    parts.push(`<line class="now" x1="${f(xc)}" x2="${f(xc)}" y1="${T}" y2="${H - 4}"/>`);   // the faller's radius now: gold
  }
  // the time axis in the readouts' own format (physics.js dur), not a table of units of its own
  parts.push(`<line class="grid" x1="${L}" x2="${W - Rr}" y1="${f(Y(tmax))}" y2="${f(Y(tmax))}"/><text x="2" y="${f(Y(tmax) + 4)}">${dur(tmax * tg)}</text><text x="2" y="${f(Y(0))}">0</text>`);
  parts.push(`<text x="${W - 92}" y="${H - B + 12}">r → horizon</text>`);
  parts.push(`<rect class="hit" data-hit="fall" x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - 4}"/>`);
  return { svg: `<svg class="bh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Proper time and far time during the fall">${parts.join('')}</svg>`, X, L, W, Rr, r0, r1, rh };
}

/**
 * Equatorial effective potentials of Kerr-Newman (Boyer-Lindquist r):
 *   photons: the impact parameter b(r) = L/E of a turning point, prograde branch,
 *            from (r^2 + a^2 - a b)^2 = Delta (b - a)^2; its minimum is the photon orbit
 *   massive: V(r) = E at a turning point for L = L_ISCO, the upper root of
 *            E^2 [(r^2+a^2)^2 - a^2 Delta] - 2 a L E (r^2 + a^2 - Delta) + a^2 L^2 - Delta (r^2 + L^2) = 0;
 *            at L = L_ISCO its extremum and inflection merge at the ISCO
 * The extrema are located numerically on the drawn curves, for comparison with the readouts.
 */
export function potentialPlot({ a, q = 0, rh, rph, ri, Lisco, mark }) {
  const W = 300, H = 150, L = 34, Rr = 8, T = 10, B = 26;
  const r0 = Math.max(rh * 1.02, 1.01), r1 = Math.max(12, ri * 2.4);
  const Delta = (r) => r * r - 2 * r + a * a + q * q;
  const bph = (r) => { const sD = Math.sqrt(Math.max(Delta(r), 0)); return (r * r + a * a + a * sD) / (a + sD); };
  const V = (r) => {
    const D = Delta(r), A = (r * r + a * a) ** 2 - a * a * D, Bc = -2 * a * Lisco * (r * r + a * a - D), C = a * a * Lisco * Lisco - D * (r * r + Lisco * Lisco);
    return (-Bc + Math.sqrt(Math.max(Bc * Bc - 4 * A * C, 0))) / (2 * A);
  };
  const N = 400, rs = [], bs = [], vs = [];
  for (let i = 0; i <= N; i++) { const r = r0 * Math.pow(r1 / r0, i / N); rs.push(r); bs.push(bph(r)); vs.push(V(r)); }
  // numerical extrema: min of b; for V, where dV/dr is closest to zero beyond the potential peak
  let ib = 0; for (let i = 1; i <= N; i++) if (bs[i] < bs[ib]) ib = i;
  let iv = -1, best = Infinity;
  for (let i = 2; i < N - 1; i++) { const dv = Math.abs(vs[i + 1] - vs[i - 1]) / (rs[i + 1] - rs[i - 1]); if (rs[i] > rph * 1.05 && dv < best) { best = dv; iv = i; } }
  const X = (r) => L + Math.log(r / r0) / Math.log(r1 / r0) * (W - L - Rr);
  const bmin = bs[ib], bmax = Math.min(Math.max(...bs.filter(Number.isFinite)), bmin * 2.2);
  const vmin = Math.min(...vs.slice(Math.floor(N * 0.1))), vmax = 1.0;
  const Yb = (b) => T + (1 - (Math.min(b, bmax) - bmin * 0.9) / (bmax - bmin * 0.9)) * (H - T - B);
  const Yv = (v) => T + (1 - (Math.max(Math.min(v, vmax), vmin) - vmin) / (vmax - vmin)) * (H - T - B);
  let db = '', dv2 = '';
  rs.forEach((r, i) => { db += `${i ? 'L' : 'M'}${f(X(r))},${f(Yb(bs[i]))}`; dv2 += `${i ? 'L' : 'M'}${f(X(r))},${f(Yv(vs[i]))}`; });
  const parts = [`<path class="ink" d="${db}"/><path class="ser" d="${dv2}"/>`];
  parts.push(`<circle class="serf" cx="${f(X(rs[ib]))}" cy="${f(Yb(bs[ib]))}" r="2.5"/>`);
  if (iv > 0) parts.push(`<circle class="serf" cx="${f(X(rs[iv]))}" cy="${f(Yv(vs[iv]))}" r="2.5"/>`);
  parts.push(`<text x="${L + 4}" y="${T + 10}" class="lab">photon b(r): min at ${s3(rs[ib])} M</text>`);
  if (iv > 0) parts.push(`<text x="${L + 4}" y="${T + 24}" class="lab">massive V(r), L = L_ISCO: flat at ${s3(rs[iv])} M</text>`);
  for (const r of [r0, ri, r1].filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.6)) parts.push(`<text x="${f(X(r) - 8)}" y="${H - 10}">${s3(r)}</text>`);
  parts.push(`<text x="${W - 40}" y="${H - 10}">r / M</text>`);
  if (mark) parts.push(`<line class="dim" x1="${f(X(mark))}" x2="${f(X(mark))}" y1="${T}" y2="${H - B}"/>`);
  return { svg: `<svg class="bh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Effective potentials">${parts.join('')}</svg>`, rPh: rs[ib], rIsco: iv > 0 ? rs[iv] : null };
}

export { esc };
