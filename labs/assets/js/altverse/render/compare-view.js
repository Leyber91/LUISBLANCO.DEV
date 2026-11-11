/* ============================================================
   altverse/render/compare-view.js — two worlds side by side.
   Any node of the tree, or ours. Two plates on the same seed, a
   table of the numbers that differ, and the chronology difference.
   ============================================================ */

import { drawPlate } from './map-view.js';
import { fmtYear } from '../classify.js';
import { esc, el } from './svg.js';
import { fmtNum } from './dossier.js';

const OURS = '__ours__';

function stats(w) {
  if (!w) return {};
  const c = w.ctx, ter = c.ter, h = w.stages.history;
  const tl = (w.stages.technology && w.stages.technology.ladder) || [];
  return {
    'surface gravity (m/s2)': 9.81 * w.knobs.gFactor,
    'mean temperature (C)': c.clim && !c.clim.runaway ? c.clim.Tmean : null,
    'permanent ice line (deg)': c.clim && !c.clim.runaway ? (c.clim.iceFree ? 90 : c.clim.iceN) : null,
    'land / surface': ter ? ter.stats.landFrac : 0,
    'ice / surface': ter ? ter.stats.iceFrac : 0,
    'sea level (m)': ter ? ter.sea : null,
    'tallest peak (km)': ter ? ter.stats.maxElev / 1000 : null,
    'toolmakers': c.bio.observers ? 'yes' : 'no',
    'settlements': c.geo ? c.geo.settlements.length : 0,
    'routes': c.geo ? c.geo.routes.length : 0,
    'orbital flight': (() => { const r = tl.find((x) => x.tech === 'orbit'); return r ? (r.theirs == null ? 'never' : fmtYear(r.theirs)) : 'never'; })(),
    'events of ours that do not happen': h.removed.length,
  };
}

export class CompareView {
  constructor(host, { ours }) { this.host = host; this.ours = ours; this.a = OURS; this.b = null; this.tree = null; }

  setTree(tree, currentId, oursWorld) {
    this.tree = tree; this.oursWorld = oursWorld;
    if (!this.b || !tree.get(this.b)) this.b = currentId;
    if (this.a !== OURS && !tree.get(this.a)) this.a = OURS;
    if (this.b !== currentId && this.a !== currentId) this.b = currentId;
    this.render();
  }

  pick(id) { return id === OURS ? this.oursWorld : this.tree.get(id); }

  render() {
    const host = this.host; host.innerHTML = '';
    const opts = [[OURS, 'our world (same seed)'], ...this.tree.all().map((w) => [w.id, `${w.name}${w.path.length > 1 ? ' (fork ' + (w.path.length - 1) + ')' : ''}`])];
    const sel = (val, on) => { const s = el('select'); opts.forEach(([v, l]) => { const o = el('option', null, esc(l)); o.value = v; if (v === val) o.selected = true; s.appendChild(o); }); s.addEventListener('change', () => on(s.value)); return s; };
    const pick = el('div', 'cmp-pick');
    const la = el('label', null, 'A '); const sa = sel(this.a, (v) => { this.a = v; this.render(); }); sa.setAttribute('aria-label', 'World A'); la.appendChild(sa);
    const lb = el('label', null, 'B '); const sb = sel(this.b, (v) => { this.b = v; this.render(); }); sb.setAttribute('aria-label', 'World B'); lb.appendChild(sb);
    pick.append(la, lb, el('span', null, 'Fork a world from the river to add it here.'));
    host.appendChild(pick);
    const A = this.pick(this.a), B = this.pick(this.b);
    if (!A || !B) return;
    const grid = el('div', 'cmp-grid');
    [A, B].forEach((w, i) => {
      const col = el('div', 'cmp-col');
      col.appendChild(el('h4', null, `${esc(w.name)} <span>${esc(w === this.oursWorld ? 'no divergence' : w.path[w.path.length - 1].text)}</span>`));
      const cv = document.createElement('canvas');
      col.appendChild(cv);
      grid.appendChild(col);
      requestAnimationFrame(() => {
        const cw = cv.clientWidth || 500, dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(cw * dpr); cv.height = Math.round(cw * dpr / 2);
        drawPlate(cv.getContext('2d'), w, cv.width, cv.height, { small: cw < 420 });
        cv.setAttribute('aria-label', `Map of ${w.name}`);
        cv.setAttribute('role', 'img');
      });
    });
    host.appendChild(grid);
    const sA = stats(A), sB = stats(B);
    const rows = Object.keys(sB).map((k) => {
      const a = sA[k], b = sB[k];
      const num = typeof a === 'number' && typeof b === 'number';
      const d = num ? b - a : a === b ? '' : 'differs';
      const f = (v) => (typeof v === 'number' ? (k.includes('/ surface') ? Math.round(v * 100) + '%' : fmtNum(v)) : v == null ? '-' : esc(v));
      return `<tr><td>${esc(k)}</td><td>${f(a)}</td><td>${f(b)}</td><td class="d">${num ? (Math.abs(d) < 1e-9 ? '' : (d > 0 ? '+' : '') + (k.includes('/ surface') ? Math.round(d * 100) + ' pts' : fmtNum(d))) : esc(d)}</td></tr>`;
    }).join('');
    const tab = el('div', 'scroll-x');
    tab.innerHTML = `<table class="cmp-tab"><thead><tr><th>measure</th><th>A</th><th>B</th><th>B - A</th></tr></thead><tbody>${rows}</tbody></table>`;
    host.appendChild(tab);
    const evA = new Map(A.stages.history.events.map((e) => [e.id, e])), evB = new Map(B.stages.history.events.map((e) => [e.id, e]));
    const onlyB = [...evB.values()].filter((e) => !evA.has(e.id) || Math.abs(evA.get(e.id).year - e.year) > 0.5 || evA.get(e.id).title !== e.title).slice(0, 12);
    const onlyA = [...evA.values()].filter((e) => !evB.has(e.id)).slice(0, 12);
    const li = (e, other) => `<li><span>${esc(fmtYear(e.year))}</span>${esc(e.title)}${other && other.get(e.id) && other.get(e.id).year !== e.year ? ` <span>(was ${esc(fmtYear(other.get(e.id).year))})</span>` : ''}</li>`;
    const evs = el('div', 'cmp-ev');
    evs.innerHTML = `<div><h5>in B, not in A (or moved)</h5><ul>${onlyB.map((e) => li(e, evA)).join('') || '<li>nothing</li>'}</ul></div><div><h5>in A, gone from B</h5><ul>${onlyA.map((e) => li(e)).join('') || '<li>nothing</li>'}</ul></div>`;
    host.appendChild(evs);
  }
}
