/* ============================================================
   exoplanet/tours.js — guided tours. Each tour chooses its stops
   from the live catalogue by a stated rule, so it stays true when
   the data changes, and writes each stop's caption from numbers.
   ============================================================ */

import { TOURS, VALLEY } from './config.js';
import { earthLikeness, insolation, transitGeometry, density, isNum } from './science.js';
import { fmt, fmtInt } from './views/common.js';

const top = (arr, n, key, desc = true) =>
  arr.filter((p) => isNum(key(p))).sort((a, b) => (desc ? key(b) - key(a) : key(a) - key(b))).slice(0, n);

export function tourStops(key, list) {
  const measured = list.filter((p) => p.measuredR);
  const t = TOURS.find((x) => x.key === key);
  if (key === 'earthlike') {
    return top(measured, t.n, (p) => earthLikeness(p)).map((p) => ({
      p, cap: `Earth-likeness ${earthLikeness(p).toFixed(2)} [ILLUSTRATIVE measure]: ${fmt(p.R, 3)} R⊕ and ${fmt(insolation(p).S, 3)} S⊕.`,
    }));
  }
  if (key === 'hottest') {
    return top(list, t.n, (p) => p.Teq).map((p) => ({
      p, cap: `Published equilibrium temperature ${fmtInt(p.Teq)} K, ${isNum(p.P) ? `on a ${fmt(p.P, 3)}-day orbit` : 'orbit unknown'}.`,
    }));
  }
  if (key === 'extreme') {
    const stops = [];
    const add = (p, cap) => { if (p && !stops.some((s) => s.p === p)) stops.push({ p, cap }); };
    const shortest = top(measured, 1, (p) => p.P, false)[0];
    add(shortest, `The shortest period here: one orbit every ${fmt(shortest.P * 24, 3)} hours.`);
    const ecc = top(measured, 1, (p) => p.ecc)[0];
    if (ecc) add(ecc, `The most eccentric orbit with a measured radius: e = ${fmt(ecc.ecc, 2)}.`);
    const hug = top(measured, 1, (p) => { const g = transitGeometry(p); return g ? g.aRs : null; }, false)[0];
    if (hug) add(hug, `Orbits ${fmt(transitGeometry(hug).aRs, 3)} stellar radii from its star's centre.`);
    const wide = top(measured, 1, (p) => p.a)[0];
    if (wide) add(wide, `The widest orbit with a measured radius: ${fmtInt(wide.a)} AU.`);
    const longT = top(measured.filter((p) => p.method === 'Transit'), 1, (p) => p.P)[0];
    if (longT) add(longT, `The longest period caught in transit: ${fmtInt(longT.P)} days.`);
    return stops.slice(0, t.n);
  }
  if (key === 'nearest') {
    return top(measured, t.n, (p) => p.dist, false).map((p) => ({
      p, cap: `${fmt(p.dist * 3.26156, 3)} light-years away, ${fmt(p.R, 3)} R⊕.`,
    }));
  }
  if (key === 'valley') {
    // precisely measured radius AND mass, across the valley, small to large
    const good = measured.filter((p) => isNum(p.R) && isNum(p.Rerr) && p.Rerr / p.R < 0.06 && p.Mprov === 'Mass' && !p.Mlim
      && isNum(p.Merr1) && p.Merr1 / p.M < 0.25 && isNum(p.P) && p.P < 100);
    const targets = [1.2, 1.45, 1.75, 2.1, 2.5, 3.2];
    const stops = [];
    for (const R of targets) {
      const p = good.filter((q) => !stops.some((s) => s.p === q)).sort((a, b) => Math.abs(a.R - R) - Math.abs(b.R - R))[0];
      if (!p) continue;
      const rho = density(p.R, p.M);
      const where = p.R < VALLEY.lo ? 'below the valley' : p.R <= VALLEY.hi ? 'in the valley' : 'above the valley';
      stops.push({ p, cap: `${fmt(p.R, 3)} R⊕, ${where}. Measured mass ${fmt(p.M, 3)} M⊕ gives ${fmt(rho, 2)} g/cm³; Earth is 5.51.` });
    }
    return stops;
  }
  return [];
}

/* The tours as lines with their stops, as a metro line is drawn (Beck, 1933): the stops seen in this run are filled,
   the current one is ringed, and the running line is drawn heavier. Its ends are the keys back and on, which the
   page moves to the running line (keys: the element that holds them). counts: the number of stops of each tour in
   the catalogue as loaded. */
const NS = 'http://www.w3.org/2000/svg';
export function createTours(host, store, actions) {
  host.replaceChildren();
  const rows = new Map();
  let counts = Object.fromEntries(TOURS.map((t) => [t.key, t.n]));
  for (const t of TOURS) {
    const row = document.createElement('div'); row.className = 'tour'; row.dataset.row = t.key;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tour-name'; b.dataset.tour = t.key; b.textContent = t.label;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('aria-hidden', 'true');
    const slot = document.createElement('span'); slot.className = 'tour-keys-slot';
    row.append(b, svg, slot); host.append(row); rows.set(t.key, { row, b, svg, slot });
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    actions.startTour(b.dataset.tour);
  });
  const step = () => (window.matchMedia('(max-width: 700px)').matches ? 28 : 32);
  function line(key) {
    const { svg, row, b } = rows.get(key), t = store.state.tour, n = Math.max(1, counts[key] || 1), run = !!t && t.key === key;
    const st = step(), w = st * (n - 1) + 16, y = 13;
    svg.setAttribute('width', w); svg.setAttribute('height', 26); svg.setAttribute('viewBox', `0 0 ${w} 26`);
    svg.replaceChildren();
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
    mk('line', { class: 'rail', x1: 8, y1: y, x2: 8 + st * (n - 1), y2: y });
    for (let i = 0; i < n; i++) {
      const cx = 8 + i * st;
      if (run && i === t.i) { mk('circle', { class: 'stop-now', cx, cy: y, r: 6.5 }); mk('circle', { class: 'stop-now-dot', cx, cy: y, r: 2.6 }); }
      else mk('circle', { class: run && t.seen && t.seen.has(i) ? 'stop stop-seen' : 'stop', cx, cy: y, r: 3.4 });
    }
    row.classList.toggle('run', run);
    b.setAttribute('aria-pressed', String(run));
    b.setAttribute('aria-label', run ? `${TOURS.find((x) => x.key === key).label}, stop ${t.i + 1} of ${t.stops.length}` : `${TOURS.find((x) => x.key === key).label}, a tour of ${n} worlds`);
  }
  return {
    setCounts(c) { counts = { ...counts, ...c }; for (const k of rows.keys()) line(k); },
    /* draw every line again, and move the keys to the end of the running line (or back to the bar, for a tour of results) */
    sync(keys, home) {
      for (const k of rows.keys()) line(k);
      const t = store.state.tour, r = t && rows.get(t.key);
      if (keys) (r ? r.slot : home).append(keys);
    },
  };
}
