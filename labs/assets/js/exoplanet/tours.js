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

export function createTours(host, store, actions) {
  host.innerHTML = `<span class="view-k">Tours</span>${TOURS.map((t) => `<button type="button" class="chip" data-tour="${t.key}">${t.label}</button>`).join('')}`;
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    actions.startTour(b.dataset.tour);
  });
  return {
    sync() {
      const t = store.state.tour;
      host.querySelectorAll('[data-tour]').forEach((b) => b.classList.toggle('on', !!t && t.key === b.dataset.tour));
    },
  };
}
