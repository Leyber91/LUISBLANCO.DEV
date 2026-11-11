/* ============================================================
   workout-plans/charts.js — the load curves and the calendar heat
   strip. One shared day axis: the strip under the curves IS the
   x-axis, one cell per day of the block.

   Panels, top to bottom:
     fitness and fatigue (same AU scale)
     form = fitness - fatigue, the gold line, with the plan's form
       as a dashed ghost once the lived week differs from it
     daily session load (session RPE x minutes)
   ============================================================ */

import { svg, el, clear, fmt } from './dom.js';
import { DAY_NAMES } from './constants.js';

const PAD_L = 48, PAD_R = 14;
const ROWS = { top: 18, aH: 100, gap1: 18, bH: 92, gap2: 16, cH: 40 };
const yA0 = ROWS.top, yB0 = yA0 + ROWS.aH + ROWS.gap1, yC0 = yB0 + ROWS.bH + ROWS.gap2;
const HEIGHT = yC0 + ROWS.cH + 4;

const linePath = (xs, ys) => xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join('');
const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 0.5);

export class LoadChart {
  constructor({ svgHost, stripHost, readout, onSelect }) {
    this.svgHost = svgHost;
    this.stripHost = stripHost;
    this.readout = readout;
    this.onSelect = onSelect;
    this.hoverDay = null;
    this.first = true;
    this.ro = new ResizeObserver(() => { if (this.data) this.draw(); });
    this.ro.observe(svgHost);
    svgHost.addEventListener('pointermove', (e) => this.pointer(e));
    svgHost.addEventListener('pointerleave', () => { this.hoverDay = null; this.cursor(); this.writeReadout(); });
    svgHost.addEventListener('click', (e) => { const d = this.dayAt(e); if (d != null) this.onSelect(d); });
    stripHost.addEventListener('keydown', (e) => this.key(e));
    stripHost.addEventListener('click', (e) => { const b = e.target.closest('.st'); if (b) this.onSelect(Number(b.dataset.d), { focusStrip: true }); });
  }

  dayAt(e) {
    if (!this.geom) return null;
    const box = this.svgHost.getBoundingClientRect();
    const x = e.clientX - box.left;
    const { cw, D } = this.geom;
    const d = Math.floor((x - PAD_L) / cw);
    return d >= 0 && d < D ? d : null;
  }

  pointer(e) {
    const d = this.dayAt(e);
    if (d === this.hoverDay) return;
    this.hoverDay = d;
    this.cursor();
    this.writeReadout();
  }

  key(e) {
    const D = this.data?.plan.days.length || 0;
    const cur = this.data?.sel ?? 0;
    const map = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    let next = null;
    if (e.key in map) next = cur + map[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = D - 1;
    if (next == null) return;
    e.preventDefault();
    next = Math.max(0, Math.min(D - 1, next));
    this.onSelect(next, { focusStrip: true });
  }

  /** data: { plan, lived, sel, log } */
  render(data) {
    this.data = data;
    this.draw();
    this.drawStrip();
    this.writeReadout();
  }

  draw() {
    const { plan, lived } = this.data;
    const W = Math.max(280, this.svgHost.clientWidth);
    const D = plan.days.length;
    const cw = (W - PAD_L - PAD_R) / D;
    const x = (d) => PAD_L + (d + 0.5) * cw;
    this.geom = { W, cw, D, x };

    const P = plan.model.plan, L = lived.model.live;
    const changed = differs(P.form, L.form);
    const hiA = Math.max(...P.fit, ...L.fit, ...P.fat, ...L.fat, 1);
    const loA = Math.min(...P.fit, ...L.fit, ...P.fat, ...L.fat);
    const padA = (hiA - loA) * 0.08 || 1;
    const a0 = Math.max(0, loA - padA), a1 = hiA + padA;
    const yA = (v) => yA0 + ROWS.aH - ((v - a0) / (a1 - a0)) * ROWS.aH;
    const fMin = Math.min(0, ...P.form, ...L.form), fMax = Math.max(1, ...P.form, ...L.form);
    const yB = (v) => yB0 + ROWS.bH - ((v - fMin) / (fMax - fMin)) * ROWS.bH;
    const maxC = Math.max(...plan.loads, ...lived.lived, 1);
    const yC = (v) => yC0 + ROWS.cH - (v / maxC) * ROWS.cH;
    this.geom.yB = yB;

    const root = svg('svg', { width: W, height: HEIGHT, viewBox: `0 0 ${W} ${HEIGHT}`, class: 'lc', role: 'img',
      'aria-label': this.summary(plan, lived) });
    const defs = svg('defs');
    defs.innerHTML = '<filter id="lc-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>' +
      '<linearGradient id="lc-formfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D4A24C" stop-opacity=".16"/><stop offset="1" stop-color="#D4A24C" stop-opacity="0"/></linearGradient>';
    root.appendChild(defs);

    // week bands and labels
    const weeks = lived.weeks;
    for (let w = 0; w < weeks.length; w++) {
      const x0 = PAD_L + w * 7 * cw, x1 = x0 + 7 * cw;
      const ph = weeks[w].phase;
      if (ph === 'deload' || ph === 'taper') root.appendChild(svg('rect', { x: x0, y: yA0 - 2, width: 7 * cw, height: HEIGHT - yA0 - 2, class: 'lc-band ' + ph }));
      root.appendChild(svg('line', { x1: x0, x2: x0, y1: yA0 - 6, y2: HEIGHT - 2, class: 'lc-wk' }));
      const short = ph === 'deload' ? 'DL' : ph === 'taper' ? 'TP' : ph === 'accumulation' ? 'AC' : ph === 'transmutation' ? 'TR' : '';
      const lab = svg('text', { x: x0 + 4, y: 10, class: 'lc-wl' + (weeks[w].repeated ? ' rep' : '') }, `W${w + 1}${cw * 7 > 46 && short ? ' ' + short : ''}`);
      root.appendChild(lab);
      if (w === weeks.length - 1) root.appendChild(svg('line', { x1: x1, x2: x1, y1: yA0 - 6, y2: HEIGHT - 2, class: 'lc-wk' }));
    }
    // axes labels
    const axis = (y, t, cls = '') => root.appendChild(svg('text', { x: PAD_L - 6, y: y + 3, class: 'lc-ax ' + cls, 'text-anchor': 'end' }, t));
    const k = (v) => fmt(v / 1000, 1) + 'k';
    axis(yA(a1) + 4, k(a1));
    axis(yA(a0) - 2, k(a0));
    axis(yB(fMax) + 4, k(fMax));
    if (yB(0) - yB(fMax) > 14 && yB(fMin) - yB(0) > 12) axis(yB(0), '0', 'zero');
    if (fMin < 0) axis(yB(fMin) - 2, k(fMin));
    axis(yC0 + 6, fmt(maxC, 0));
    axis(yC0 + ROWS.cH - 1, '0');
    root.appendChild(svg('text', { x: PAD_L + 4, y: yB0 + 9, class: 'lc-pl gold' }, 'FORM = FITNESS - FATIGUE'));
    root.appendChild(svg('text', { x: PAD_L + 4, y: yC0 + 7, class: 'lc-pl' }, 'SESSION LOAD, AU'));
    root.appendChild(svg('text', { x: PAD_L + 4, y: yA0 + 7, class: 'lc-pl' }, 'AU'));
    root.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: yB(0), y2: yB(0), class: 'lc-zero' }));
    root.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: yA0 + ROWS.aH, y2: yA0 + ROWS.aH, class: 'lc-base' }));
    root.appendChild(svg('line', { x1: PAD_L, x2: W - PAD_R, y1: yC0 + ROWS.cH, y2: yC0 + ROWS.cH, class: 'lc-base' }));

    const xs = P.fit.map((_, i) => x(i));
    const anim = this.first && !this.still ? ' draw' : '';
    // fitness and fatigue
    if (changed) {
      root.appendChild(svg('path', { d: linePath(xs, P.fit.map(yA)), class: 'lc-fit ghost' }));
      root.appendChild(svg('path', { d: linePath(xs, P.fat.map(yA)), class: 'lc-fat ghost' }));
    }
    root.appendChild(svg('path', { d: linePath(xs, L.fit.map(yA)), class: 'lc-fit' + anim, pathLength: 1 }));
    root.appendChild(svg('path', { d: linePath(xs, L.fat.map(yA)), class: 'lc-fat' + anim, pathLength: 1 }));
    root.appendChild(svg('text', { x: W - PAD_R - 2, y: yA(L.fit[D - 1]) - 5, class: 'lc-tag fit', 'text-anchor': 'end' }, 'fitness'));
    root.appendChild(svg('text', { x: W - PAD_R - 2, y: yA(L.fat[D - 1]) + 12, class: 'lc-tag fat', 'text-anchor': 'end' }, 'fatigue'));
    // form
    const formD = linePath(xs, L.form.map(yB));
    root.appendChild(svg('path', { d: formD + `L${xs[D - 1].toFixed(1)},${yB(fMin).toFixed(1)}L${xs[0].toFixed(1)},${yB(fMin).toFixed(1)}Z`, class: 'lc-formfill' }));
    if (changed) root.appendChild(svg('path', { d: linePath(xs, P.form.map(yB)), class: 'lc-form ghost' }));
    root.appendChild(svg('path', { d: formD, class: 'lc-form glow', filter: 'url(#lc-glow)' }));
    root.appendChild(svg('path', { d: formD, class: 'lc-form' + anim, pathLength: 1 }));
    root.appendChild(svg('path', { d: formD, class: 'lc-form trace', pathLength: 1 }));
    // loads
    const bw = Math.max(1.5, cw * 0.62);
    for (let d = 0; d < D; d++) {
      const pl = plan.loads[d], lv = lived.lived[d];
      const day = lived.days[d];
      const entry = this.data.log[d];
      if (!pl && !lv) continue;
      if (Math.abs(pl - lv) > 0.5) root.appendChild(svg('rect', { x: x(d) - bw / 2, y: yC(pl), width: bw, height: Math.max(0.5, yC0 + ROWS.cH - yC(pl)), class: 'lc-bar ghost' }));
      if (entry?.kind === 'missed') {
        const cx = x(d), cy = yC0 + ROWS.cH - 5;
        root.appendChild(svg('path', { d: `M${cx - 3},${cy - 3}L${cx + 3},${cy + 3}M${cx + 3},${cy - 3}L${cx - 3},${cy + 3}`, class: 'lc-miss' }));
        continue;
      }
      const cls = entry?.kind === 'hard' ? ' hard' : (lived.changed.has(d) ? ' eased' : '');
      root.appendChild(svg('rect', { x: x(d) - bw / 2, y: yC(lv), width: bw, height: Math.max(0.5, yC0 + ROWS.cH - yC(lv)), class: 'lc-bar' + cls + (day.s ? '' : ' rest') }));
    }
    // cursor layer
    this.cur = svg('g', { class: 'lc-cur' });
    root.appendChild(this.cur);
    clear(this.svgHost).appendChild(root);
    this.svg = root;
    this.cursor();
    if (this.first) this.first = false;
  }

  cursor() {
    if (!this.cur || !this.geom) return;
    clear(this.cur);
    const { x, yB } = this.geom;
    const L = this.data.lived.model.live;
    const put = (d, cls) => {
      if (d == null) return;
      this.cur.appendChild(svg('line', { x1: x(d), x2: x(d), y1: yA0 - 4, y2: HEIGHT - 2, class: 'lc-cl ' + cls }));
      if (cls === 'sel') {
        this.cur.appendChild(svg('circle', { cx: x(d), cy: yB(L.form[d]), r: 7, class: 'lc-halo' }));
        this.cur.appendChild(svg('circle', { cx: x(d), cy: yB(L.form[d]), r: 2.8, class: 'lc-dot' }));
      }
    };
    put(this.data.sel, 'sel');
    if (this.hoverDay != null && this.hoverDay !== this.data.sel) put(this.hoverDay, 'hov');
  }

  drawStrip() {
    const { plan, lived, sel, log } = this.data;
    const host = this.stripHost;
    const D = plan.days.length;
    const maxL = Math.max(...plan.loads, ...lived.lived, 1);
    if (host.childElementCount !== D) {
      clear(host);
      for (let d = 0; d < D; d++) host.appendChild(el('button', { type: 'button', class: 'st', dataset: { d } }));
    }
    host.style.setProperty('--days', D);
    host.style.marginLeft = PAD_L + 'px';
    host.style.marginRight = PAD_R + 'px';
    [...host.children].forEach((b, d) => {
      const day = lived.days[d];
      const e = log[d];
      const s = day.s;
      const k = e?.kind;
      b.className = 'st' + (s ? ' on' : ' rest') + (k ? ' ' + k : '') + (lived.changed.has(d) ? ' changed' : '') + (d === sel ? ' sel' : '') + (day.dow === 0 ? ' mon' : '');
      b.style.setProperty('--h', s ? (0.18 + 0.82 * (lived.lived[d] / maxL)).toFixed(3) : 0);
      b.style.setProperty('--i', d);
      b.tabIndex = d === sel ? 0 : -1;
      const what = s ? `${s.name}, ${s.minutes} min, session RPE ${s.srpe}, ${lived.lived[d]} AU` : 'rest day';
      const status = k === 'missed' ? ', logged missed' : k === 'hard' ? ', logged hard' : k === 'easy' ? ', logged easy' : k === 'done' ? ', logged as planned' : '';
      b.setAttribute('aria-label', `Week ${day.w + 1} ${DAY_NAMES[day.dow]}: ${what}${status}${lived.changed.has(d) ? ', re-planned' : ''}`);
      b.setAttribute('aria-current', d === sel ? 'date' : 'false');
    });
  }

  focusSel() { this.stripHost.querySelector('.st.sel')?.focus(); }

  /* another view (a day card) points at a day */
  setHover(d) {
    if (!this.data) return;
    this.hoverDay = d;
    this.cursor();
    this.writeReadout();
  }

  writeReadout() {
    const { plan, lived } = this.data;
    const d = this.hoverDay ?? this.data.sel;
    const day = lived.days[d];
    const P = plan.model.plan, L = lived.model.live;
    const s = day.s;
    const parts = [
      ['day', `W${day.w + 1} ${DAY_NAMES[day.dow]}`],
      ['session', s ? s.name + (this.data.log[d]?.kind === 'missed' ? ' (missed)' : s.eased ? ' (eased)' : '') : 'rest'],
      ['load', `${fmt(lived.lived[d])} AU` + (Math.abs(lived.lived[d] - plan.loads[d]) > 0.5 ? ` (plan ${fmt(plan.loads[d])})` : '')],
      ['fitness', fmt(L.fit[d])],
      ['fatigue', fmt(L.fat[d])],
      ['form', fmt(L.form[d]) + (Math.abs(L.form[d] - P.form[d]) > 0.5 ? ` (plan ${fmt(P.form[d])})` : '')],
    ];
    clear(this.readout);
    for (const [k, v] of parts) {
      const it = el('span', { class: 'ro-i' + (k === 'form' ? ' gold' : '') });
      it.append(el('b', {}, k), document.createTextNode(' ' + v));
      this.readout.appendChild(it);
    }
  }

  summary(plan, lived) {
    const L = lived.model.live.form;
    let peak = 0, low = 0;
    for (let i = 1; i < L.length; i++) { if (L[i] > L[peak]) peak = i; if (L[i] < L[low]) low = i; }
    return `Load curves over ${plan.days.length / 7} weeks. Form is lowest in week ${Math.floor(low / 7) + 1} at ${fmt(L[low])} AU and highest in week ${Math.floor(peak / 7) + 1} at ${fmt(L[peak])} AU.`;
  }
}
