/* ============================================================
   views/bands.js: the size filter as bands on the radius axis,
   under the histogram of the catalogue's radii (bar sheet BAR_L2,
   shape 07). The histogram is the whole catalogue, every survey
   mixed, and shows no radius valley: the valley Fulton et al. 2017
   (AJ 154, 109) found is a dip in one survey's sample, and the
   radius against insolation diagram draws that sample. The words
   the histogram says are counted from the bins it draws
   (histWords), and tests/counts.test.mjs holds them to the bins.
   A band is chosen by pressing it, and shows it by the heavy rule
   under it (a lever, not a colour). Once chosen, or once a range of
   radius is set, its two edges can be dragged, or moved with the
   arrow keys, to any range: the radius range of Ranges.

   The axis runs from 0.5 to 25 Earth radii on a log scale. The
   bands are the size classes of config.js (1.5, 2, 4, 8 R⊕).
   ============================================================ */

import { SIZE_CLASSES, VALLEY } from '../config.js';
import { tokens, alpha, isNum, fmt, fmtInt, esc } from './common.js';

export const R_LO = 0.5, R_HI = 25;
const LN = Math.log(R_HI / R_LO);
/* where a radius falls on the axis, from 0 at 0.5 R⊕ to 1 at 25 R⊕; and back */
export const rx = (r) => Math.max(0, Math.min(1, Math.log(r / R_LO) / LN));
export const xr = (x) => R_LO * Math.exp(Math.max(0, Math.min(1, x)) * LN);
const SHORT = { rocky: 'Earth', super: 'Super', subnep: 'Sub-Nep.', nep: 'Neptune', giant: 'Giant' };
const edges = () => { let lo = R_LO; return SIZE_CLASSES.map((c) => { const e = { key: c.key, label: c.label, lo, hi: Math.min(c.max, R_HI) }; lo = c.max; return e; }); };

/* how many planets of the catalogue have a measured radius in each class */
export function classCounts(list) {
  const out = Object.fromEntries(SIZE_CLASSES.map((c) => [c.key, 0]));
  for (const p of list) {
    if (!isNum(p.R)) continue;
    const c = SIZE_CLASSES.find((k) => p.R < k.max);
    if (c) out[c.key]++;
  }
  return out;
}

export const BINS = 48;

/* The histogram's bins: how many planets have a radius in each 48th of the axis. A radius the roster says is not
   measured (measuredR false) is left out; one not yet known either way is kept. */
export function radiusBins(list, bins = BINS) {
  const n = new Array(bins).fill(0);
  for (const p of list) {
    if (!isNum(p.R)) continue;
    if (p.R < R_LO || p.R >= R_HI || p.measuredR === false) continue;
    n[Math.min(bins - 1, Math.floor(rx(p.R) * bins))]++;   // equivalent: a radius at or past R_HI is left out above, so no bin passes the last
  }
  return n;
}

/* What the histogram says, counted from its bins: how many it draws, and the bin that holds the most. Where the valley
   is shown is said in one sentence; this sample is not where it shows. */
export function histWords(n) {
  const total = n.reduce((a, b) => a + b, 0);
  const head = `How many planets have each radius, from ${fmt(R_LO, 1)} to ${fmt(R_HI, 2)} Earth radii on a log scale`;
  if (total === 0) return `${head}: none drawn yet.`;
  const top = n.indexOf(Math.max(...n));
  return `${head}: ${fmtInt(total)} planets, every survey together; the most, ${fmtInt(n[top])}, between ${fmt(xr(top / n.length), 2)} and ${fmt(xr((top + 1) / n.length), 2)}. `
    + `The radius valley, a dip near ${fmt(VALLEY.lo, 2)} to ${fmt(VALLEY.hi, 2)}, shows in the Kepler sample that the radius against insolation diagram draws.`;
}

/* the histogram of radii over the bands, every bin in one ink */
export function drawHist(canvas, list) {
  const T = tokens(), r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const n = radiusBins(list), bins = n.length;
  const top = Math.max(1, ...n);
  ctx.fillStyle = alpha(T.dim, 0.9);
  for (let i = 0; i < bins; i++) {
    const bh = (n[i] / top) * (h - 2);
    ctx.fillRect((i / bins) * w + 0.5, h - bh, Math.max(0.5, w / bins - 1), bh);
  }
  canvas.setAttribute('aria-label', histWords(n));
}

/* The band buttons and, when a band or a range of radius is chosen, its two edges. f: the page's filter.
   counts: classCounts of the catalogue. Text is escaped. */
export function bandsHTML(f, counts) {
  const R = f.ranges && f.ranges.R;
  const span = f.cls !== 'all' ? edges().find((e) => e.key === f.cls) : R ? { lo: isNum(R[0]) ? R[0] : R_LO, hi: isNum(R[1]) ? R[1] : R_HI } : null;
  const pc = (x) => `${(x * 100).toFixed(3)}%`;
  const bands = edges().map((e) => {
    const on = f.cls === e.key;
    return `<button type="button" class="band" data-cls="${e.key}" aria-pressed="${on}" style="left:${pc(rx(e.lo))};width:${pc(rx(e.hi) - rx(e.lo))}"
      aria-label="${esc(e.label)}, ${fmt(e.lo, 2)} to ${e.hi >= R_HI ? 'more than ' + fmt(R_HI, 2) : fmt(e.hi, 2)} Earth radii, ${fmtInt(counts[e.key] || 0)} planets" title="${esc(e.label)}: ${fmtInt(counts[e.key] || 0)} planets">${esc(SHORT[e.key])}</button>`;
  }).join('');
  const handle = (end, r) => `<button type="button" class="band-edge" id="edge-${end}" data-edge="${end}" role="slider" aria-label="${end === 'lo' ? 'Smallest' : 'Largest'} radius of the range"
    aria-valuemin="${R_LO}" aria-valuemax="${R_HI}" aria-valuenow="${fmt(r, 3)}" aria-valuetext="${fmt(r, 3)} Earth radii" style="left:${pc(rx(r))}"></button>`;
  return `<div class="band-row">${bands}${span ? handle('lo', span.lo) + handle('hi', span.hi) : ''}</div>`;
}

/* Drag an edge, or move it with the arrow keys, Home and End, and say the new range: onRange([lo, hi]) once the drag
   ends or a key is pressed. A step of the arrows is a fiftieth of the axis; Home and End go as far as the edge can. */
export function bindEdges(host, getRange, onRange) {
  let drag = null;
  host.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.band-edge'); if (!h) return;
    e.preventDefault();
    drag = { end: h.dataset.edge, h, row: h.parentElement.getBoundingClientRect(), range: getRange().slice() };
    try { h.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = (e.clientX - drag.row.left) / Math.max(1, drag.row.width);
    const r = xr(x);
    if (drag.end === 'lo') drag.range[0] = Math.min(r, drag.range[1] * 0.98); else drag.range[1] = Math.max(r, drag.range[0] * 1.02);
    drag.h.style.left = `${(rx(drag.end === 'lo' ? drag.range[0] : drag.range[1]) * 100).toFixed(3)}%`;
  });
  const end = () => { if (!drag) return; const r = drag.range; drag = null; onRange([+fmt(r[0], 3), +fmt(r[1], 3)]); };
  host.addEventListener('pointerup', end);
  host.addEventListener('pointercancel', () => { drag = null; });
  host.addEventListener('keydown', (e) => {
    const h = e.target.closest('.band-edge'); if (!h) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault(); e.stopPropagation();
    const r = getRange().slice(), i = h.dataset.edge === 'lo' ? 0 : 1;
    // Home and End take the edge as far as it goes: the end of the axis, or the other edge
    if (e.key === 'Home') r[i] = i === 0 ? R_LO : r[0] * 1.02;
    else if (e.key === 'End') r[i] = i === 0 ? r[1] * 0.98 : R_HI;
    else r[i] = xr(rx(r[i]) + d / 50);
    if (r[0] >= r[1]) return;
    onRange([+fmt(r[0], 3), +fmt(r[1], 3)]);
  });
}

/* sheet C's table: each class, its radii, how many of the catalogue and how many of the filter */
export function classTable(counts, matches) {
  return `<div class="twin-wrap"><table><thead><tr><th>class</th><th>radius, R⊕</th><th class="num">planets</th><th class="num">shown now</th></tr></thead><tbody>${edges().map((e) =>
    `<tr><td>${esc(e.label)}</td><td>${fmt(e.lo, 2)} to ${e.hi >= R_HI ? 'more' : fmt(e.hi, 2)}</td><td class="num">${fmtInt(counts[e.key] || 0)}</td><td class="num">${fmtInt(matches[e.key] || 0)}</td></tr>`).join('')}</tbody></table></div>`;
}
