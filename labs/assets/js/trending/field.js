/* ============================================================
   trending/field.js — the signal field.

   Three panels, one per kind of source, each with its own two data
   axes on log scales:
     forum       x age since posting (h)       y points per hour
     code        x age since created_at (h)    y stars per day
     readership  x views over weekday median   y views on the day
   Mark shape = source, mark area = the third quantity (comments,
   forks, 28-day views), whisker = 95% interval of the rise score,
   gold = called rising (fired) or selected. Earlier stored positions
   trail behind each mark; cross-source topics draw dashed edges with
   their label. Marks keep their element between scans and move over
   --t-slow (object constancy); under reduced motion they jump.
   ============================================================ */

import { SOURCES, KINDS, TUNING } from './constants.js';
import { svgEl, glyph } from './marks.js';
import { num, ageText } from './explain.js';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const PANELS = ['forum', 'code', 'readership'];
const M = { l: 46, r: 12, t: 24, b: 38 };

function logDomain(vals, minFloor) {
  const v = vals.filter((x) => x > 0 && Number.isFinite(x));
  if (!v.length) return [minFloor, minFloor * 100];
  let lo = Math.pow(10, Math.floor(Math.log10(Math.min(...v)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...v))));
  if (hi / lo < 100) { lo /= 3.1623; hi *= 3.1623; lo = Math.pow(10, Math.floor(Math.log10(lo))); hi = Math.pow(10, Math.ceil(Math.log10(hi))); }
  return [Math.max(lo, minFloor), hi];
}
function logTicks([lo, hi], px) {
  const out = [];
  const decades = Math.log10(hi / lo);
  const steps = px / Math.max(1, decades) > 120 ? [1, 2, 5] : px / Math.max(1, decades) > 46 ? [1] : null;
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    const base = Math.pow(10, e);
    if (!steps && e % 2 !== 0) continue;
    for (const m of steps || [1]) { const v = base * m; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  }
  return out;
}
const tickLabel = (v) => (v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}k` : v >= 1 ? String(v) : String(Number(v.toPrecision(1))));

export class FieldView {
  constructor(host, { onSelect, onOpen } = {}) {
    this.host = host;
    this.onSelect = onSelect || (() => {});
    this.onOpen = onOpen || (() => {});
    this.svg = svgEl('svg', { role: 'group', 'aria-label': 'Signal field: every scored signal on its source\'s axes' }, host);
    this.tip = document.createElement('div');
    this.tip.className = 'tip';
    this.tip.hidden = true;
    host.appendChild(this.tip);
    // breathing halos live in HTML so the browser composites their opacity; an SVG animation repaints the whole field each frame
    this.halos = document.createElement('div');
    this.halos.className = 'halos';
    this.halos.setAttribute('aria-hidden', 'true');
    host.appendChild(this.halos);
    this.marks = new Map();       // key -> <g>
    this.state = null;
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._resize()) : null;
    this._ro?.observe(host);
    this._w = 0;
  }

  _resize() {
    const w = Math.round(this.host.clientWidth);
    if (!this.state || Math.abs(w - this._w) < 8) return;
    this.render({ ...this.state, animate: 'none' });
  }

  _layout(w) {
    if (w >= 620) {
      const h1 = Math.round(Math.min(330, Math.max(250, w * 0.4)));
      const h2 = Math.round(Math.min(300, Math.max(230, w * 0.36)));
      const g = 14, wf = Math.round(w * 0.57);
      return { H: h1 + g + h2, p: { forum: { x: 0, y: 0, w: wf, h: h1 }, code: { x: wf + g, y: 0, w: w - wf - g, h: h1 }, readership: { x: 0, y: h1 + g, w, h: h2 } } };
    }
    const h = 236, g = 12;
    return { H: 3 * h + 2 * g, p: { forum: { x: 0, y: 0, w, h }, code: { x: 0, y: h + g, w, h }, readership: { x: 0, y: 2 * (h + g), w, h } } };
  }

  /* Data position of an item in its panel, from its score. */
  static quant(it) {
    const k = SOURCES[it.src].kind;
    if (k === 'readership') return { x: it.sc.isNew ? null : it.sc.rate, y: it.sc.total, ylo: it.sc.total, yhi: it.sc.total, xlo: it.sc.lo, xhi: it.sc.hi };
    return { x: Math.max(0.05, it.sc.ageH || 0.05), y: it.sc.rate, ylo: it.sc.lo, yhi: it.sc.hi };
  }

  /**
   * state: { items (ranked, with .key), topics, fired:Set, selected, trails: Map(key -> [{x, y}]),
   *          enabled:Set, notes: { kind: text }, animate: 'ignite'|'move'|'none' }
   */
  render(state) {
    this.state = state;
    const w = Math.max(300, Math.round(this.host.clientWidth || 720));
    this._w = w;
    const { H, p } = this._layout(w);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
    this.svg.setAttribute('height', H);
    const animate = reduced() ? 'none' : state.animate || 'move';
    // fast path (the replay scrubber): same size and axes, so only mark positions change
    const key = `${w}|${H}|${(state.domainItems || state.items).length}`;
    const fast = !!state.fast && this._key === key;
    this._key = key;

    // static layers are rebuilt; marks are kept by key
    if (!fast) for (const n of [...this.svg.querySelectorAll('.static')]) n.remove();
    const back = svgEl('g', { class: 'static' });
    const edgesG = svgEl('g', { class: 'static', 'aria-hidden': 'true' });
    const trailsG = svgEl('g', { class: 'static', 'aria-hidden': 'true' });
    const labelsG = svgEl('g', { class: 'static', 'aria-hidden': 'true' });
    if (!fast) {
      this.svg.insertBefore(back, this.svg.firstChild);
      this.svg.insertBefore(edgesG, back.nextSibling);
      this.svg.insertBefore(trailsG, edgesG.nextSibling);
    }
    let marksG = this.svg.querySelector('g.marks');
    if (!marksG) marksG = svgEl('g', { class: 'marks' }, this.svg);
    if (!fast) this.svg.appendChild(labelsG);

    const pos = new Map();
    const scales = {};
    for (const kind of PANELS) {
      const P = p[kind];
      const its = state.items.filter((it) => SOURCES[it.src].kind === kind);
      const qs = its.map((it) => FieldView.quant(it));
      const domIts = (state.domainItems || state.items).filter((it) => SOURCES[it.src].kind === kind);
      const qd = [...qs, ...domIts.map((it) => FieldView.quant(it))];
      const trailQ = [...its, ...domIts].flatMap((it) => (state.domainTrails || state.trails)?.get(it.key) || []);
      const xd = kind === 'readership'
        ? logDomain([...qd.map((q) => q.x), ...qd.map((q) => q.xlo), 1], 0.1)
        : logDomain([...qd.map((q) => q.x), ...trailQ.map((q) => q.x), kind === 'forum' ? 0.4 : 6], 0.01);
      const yd = logDomain([...qd.map((q) => q.y), ...qd.map((q) => q.ylo), ...qd.map((q) => q.yhi), ...trailQ.map((q) => q.y)], kind === 'readership' ? 100 : 0.01);
      const iw = P.w - M.l - M.r, ih = P.h - M.t - M.b;
      const sx = (v) => P.x + M.l + ((Math.log10(Math.min(Math.max(v, xd[0]), xd[1])) - Math.log10(xd[0])) / Math.log10(xd[1] / xd[0])) * iw;
      const sy = (v) => P.y + M.t + ih - ((Math.log10(Math.min(Math.max(v, yd[0]), yd[1])) - Math.log10(yd[0])) / Math.log10(yd[1] / yd[0])) * ih;
      scales[kind] = { sx, sy, xd, yd, P };

      // frame, ticks, axis names
      svgEl('rect', { x: P.x + M.l, y: P.y + M.t, width: iw, height: ih, class: 'frame' }, back);
      const srcs = Object.values(SOURCES).filter((s) => s.kind === kind).map((s) => s.short).join(' ');
      const title = svgEl('text', { x: P.x + M.l, y: P.y + 14, class: 'ptitle' }, back);
      title.textContent = `${KINDS[kind].label} · ${srcs}`;
      for (const v of logTicks(xd, iw)) {
        const g = svgEl('g', { class: 'tick' }, back);
        svgEl('line', { x1: sx(v), x2: sx(v), y1: P.y + M.t, y2: P.y + M.t + ih }, g);
        const t = svgEl('text', { x: sx(v), y: P.y + M.t + ih + 14, 'text-anchor': 'middle' }, g);
        t.textContent = tickLabel(v) + (kind === 'readership' ? 'x' : '');
      }
      for (const v of logTicks(yd, ih)) {
        const g = svgEl('g', { class: 'tick' }, back);
        svgEl('line', { x1: P.x + M.l, x2: P.x + M.l + iw, y1: sy(v), y2: sy(v) }, g);
        const t = svgEl('text', { x: P.x + M.l - 6, y: sy(v) + 4, 'text-anchor': 'end' }, g);
        t.textContent = tickLabel(v);
      }
      const xl = svgEl('text', { x: P.x + M.l + iw, y: P.y + P.h - 6, 'text-anchor': 'end', class: 'ax' }, back);
      xl.textContent = KINDS[kind].x;
      const yl = svgEl('text', { x: P.x + M.l + 4, y: P.y + M.t + 12, class: 'ax' }, back);
      yl.textContent = KINDS[kind].y;
      if (kind === 'readership') {
        const one = svgEl('line', { x1: sx(1), x2: sx(1), y1: P.y + M.t, y2: P.y + M.t + ih, class: 'frame', 'stroke-dasharray': '2 3' }, back);
        one.setAttribute('aria-hidden', 'true');
      }
      if (!its.length) {
        const t = svgEl('text', { x: P.x + M.l + iw / 2, y: P.y + M.t + ih / 2, 'text-anchor': 'middle', class: 'empty' }, back);
        t.textContent = state.notes?.[kind] || 'no items in this scan';
      }

      // positions and sizes
      const thirds = its.map((it) => it.sc.third || it.third || 0);
      const maxT = Math.max(1, ...thirds);
      its.forEach((it, i) => {
        const q = qs[i];
        const r = 3 + 8 * Math.sqrt((thirds[i] || 0) / maxT);
        const x = q.x == null ? P.x + M.l + iw - 8 : sx(q.x);
        pos.set(it.key, { x, y: sy(q.y), r, kind, q, wy0: sy(q.ylo), wy1: sy(q.yhi), wx0: q.xlo != null ? sx(q.xlo) : x, wx1: q.xhi != null ? sx(q.xhi) : x });
      });

      // trails
      for (const it of its) {
        const tr = state.trails?.get(it.key);
        if (!tr || !tr.length) continue;
        const pts = [...tr.map((q) => [sx(q.x), sy(q.y)]), [pos.get(it.key).x, pos.get(it.key).y]];
        const g = svgEl('g', { class: 'trail' + (state.fired?.has(it.key) ? ' fired' : '') }, trailsG);
        svgEl('path', { d: pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join('') }, g);
        tr.forEach((q, i) => svgEl('circle', { cx: sx(q.x).toFixed(1), cy: sy(q.y).toFixed(1), r: 2, opacity: (0.25 + 0.5 * (i + 1) / (tr.length + 1)).toFixed(2) }, g));
      }
    }

    // topic edges: cross-source topics, hub = first member in rank order
    const rankOf = new Map(state.items.map((it, i) => [it.key, i]));
    const placed = [];
    const fits = (b) => !placed.some((a) => b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y);
    for (const t of (state.topics || []).filter((x) => x.sources.length > 1).slice(0, 8)) {
      const mem = t.members.filter((k) => pos.has(k)).sort((a, b) => rankOf.get(a) - rankOf.get(b));
      if (mem.length < 2) continue;
      const on = state.selected && t.members.includes(state.selected);
      const hub = pos.get(mem[0]);
      for (const k of mem.slice(1)) {
        const b = pos.get(k);
        const mx = (hub.x + b.x) / 2, my = (hub.y + b.y) / 2;
        const dx = b.x - hub.x, dy = b.y - hub.y, len = Math.hypot(dx, dy) || 1;
        const cx = mx - (dy / len) * Math.min(60, len * 0.25), cy = my + (dx / len) * Math.min(60, len * 0.25);
        svgEl('path', { d: `M${hub.x.toFixed(1)} ${hub.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, class: 'edge' + (on ? ' on' : '') }, edgesG);
      }
      const lw = Math.min(180, t.label.length * 6.8 + 6);
      const box = { x: hub.x + 10, y: hub.y - 22, w: lw, h: 14 };
      if (box.x + box.w > w) box.x = hub.x - 10 - lw;
      if (fits(box)) {
        placed.push(box);
        const tx = svgEl('text', { x: box.x + 3, y: box.y + 11, class: 'elabel' + (on ? ' on' : '') }, labelsG);
        tx.textContent = t.label.length > 26 ? t.label.slice(0, 25) + '.' : t.label;
      }
    }

    // marks, kept by key for object constancy
    const seen = new Set();
    const ordered = [...state.items].reverse();          // best drawn last, on top
    const labelBudget = { forum: 3, code: 2, readership: 3 };
    for (const it of ordered) {
      const P = pos.get(it.key);
      if (!P) continue;
      seen.add(it.key);
      let g = this.marks.get(it.key);
      const isNew = !g;
      if (!g) {
        g = svgEl('g', { class: 'mark', tabindex: '0', role: 'button', 'data-key': it.key });
        this._wire(g);
        this.marks.set(it.key, g);
      }
      if (fast && !isNew) {
        const wh = g.querySelector('.wh');
        if (wh && P.kind !== 'readership') { wh.setAttribute('y1', (P.wy0 - P.y).toFixed(1)); wh.setAttribute('y2', (P.wy1 - P.y).toFixed(1)); }
        g.style.display = '';
        g.style.transform = `translate(${P.x.toFixed(1)}px, ${P.y.toFixed(1)}px)`;
        continue;
      }
      if (!fast) marksG.appendChild(g);
      while (g.firstChild) g.firstChild.remove();
      g.style.display = '';
      const fired = state.fired?.has(it.key);
      g.setAttribute('class', 'mark' + (fired ? ' fired' : '') + (state.selected === it.key ? ' sel' : '') + (state.dimmed?.has(it.key) ? ' dim' : ''));
      g.setAttribute('aria-label', state.describe ? state.describe(it) : it.title);
      if (P.kind === 'readership') svgEl('line', { x1: (P.wx0 - P.x).toFixed(1), x2: (P.wx1 - P.x).toFixed(1), y1: 0, y2: 0, class: 'wh' }, g);
      else svgEl('line', { x1: 0, x2: 0, y1: (P.wy0 - P.y).toFixed(1), y2: (P.wy1 - P.y).toFixed(1), class: 'wh' }, g);
      svgEl('circle', { r: (P.r + 4).toFixed(1), class: 'halo' }, g);
      glyph(it.src, P.r, g, 'g');
      const x0 = `${P.x.toFixed(1)}px`, y0 = `${P.y.toFixed(1)}px`;
      if (isNew && animate === 'ignite') {
        const S = scales[P.kind].P;
        g.style.transition = 'none';
        g.style.opacity = '0';
        g.style.transform = `translate(${(S.x + M.l).toFixed(1)}px, ${(S.y + S.h - M.b).toFixed(1)}px)`;
        const delay = Math.min(480, (rankOf.get(it.key) || 0) * 9);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          g.style.transition = '';
          g.style.transitionDelay = `${delay}ms`;
          g.style.opacity = '1';
          g.style.transform = `translate(${x0}, ${y0})`;
        }));
      } else {
        if (animate === 'none') g.style.transition = 'none';
        else { g.style.transition = ''; g.style.transitionDelay = '0ms'; }
        g.style.opacity = '1';
        g.style.transform = `translate(${x0}, ${y0})`;
        if (animate === 'none') requestAnimationFrame(() => { g.style.transition = ''; });
      }
      // labels for the best few per panel
      if (labelBudget[P.kind] > 0 && (fired || state.selected === it.key)) {
        const text = it.title.length > 24 ? it.title.slice(0, 23).trimEnd() : it.title;
        const lw = text.length * 6.6;
        let bx = P.x + P.r + 6;
        if (bx + lw > w - 2) bx = P.x - P.r - 6 - lw;
        const box = { x: bx, y: P.y - 7, w: lw, h: 13 };
        if (fits(box)) {
          placed.push(box);
          labelBudget[P.kind]--;
          const t = svgEl('text', { x: (bx - P.x).toFixed(1), y: 4, class: 'lbl' }, g);
          t.textContent = text;
        }
      }
    }
    for (const [k, g] of this.marks) {
      if (seen.has(k)) continue;
      if (fast) g.style.display = 'none';
      else { g.remove(); this.marks.delete(k); }
    }
    while (this.halos.firstChild) this.halos.firstChild.remove();
    this.halos.style.aspectRatio = `${w} / ${H}`;
    for (const k of state.fired || []) {
      const P = pos.get(k);
      if (!P) continue;
      const d = document.createElement('span');
      const r = P.r + 5;
      d.style.left = `${((P.x - r) / w) * 100}%`;
      d.style.top = `${((P.y - r) / H) * 100}%`;
      d.style.width = `${(2 * r / w) * 100}%`;
      this.halos.appendChild(d);
    }
    this.order = state.items.map((it) => it.key).filter((k) => pos.has(k));
    this.pos = pos;
  }

  select(key) {
    if (!this.state) return;
    this.state.selected = key;
    for (const [k, g] of this.marks) g.classList.toggle('sel', k === key);
  }

  focus(key) { this.marks.get(key)?.focus({ preventScroll: true }); }

  _wire(g) {
    const key = () => g.dataset.key;
    g.addEventListener('click', () => this.onSelect(key(), { from: 'field' }));
    g.addEventListener('keydown', (e) => {
      const i = this.order.indexOf(key());
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.focus(this.order[Math.min(this.order.length - 1, i + 1)]); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.focus(this.order[Math.max(0, i - 1)]); }
      else if (e.key === 'Home') { e.preventDefault(); this.focus(this.order[0]); }
      else if (e.key === 'End') { e.preventDefault(); this.focus(this.order[this.order.length - 1]); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onOpen(key(), g); }
    });
    const show = () => this._tipFor(key());
    const hide = () => { this.tip.hidden = true; };
    g.addEventListener('pointerenter', show);
    g.addEventListener('pointerleave', hide);
    g.addEventListener('focus', () => { show(); this.onSelect(key(), { from: 'focus' }); });
    g.addEventListener('blur', hide);
  }

  _tipFor(k) {
    const it = this.state?.items.find((x) => x.key === k);
    const P = this.pos?.get(k);
    if (!it || !P) return;
    const s = SOURCES[it.src];
    this.tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = it.title;
    this.tip.appendChild(b);
    const lines = s.kind === 'readership'
      ? [`${s.label} · ${num(it.sc.total)} views on ${it.day}`, it.sc.isNew ? 'new: no weekday baseline' : `${num(it.sc.rate)}x weekday median (95%: ${num(it.sc.lo)} to ${num(it.sc.hi)})`]
      : [`${s.label} · ${num(it.sc.total)} ${s.total} in ${ageText(it.sc.ageH)}`, `${num(it.sc.rate)} ${s.unit} (95%: ${num(it.sc.lo)} to ${num(it.sc.hi)})`, `${s.third}: ${num(it.third || 0)}`];
    for (const l of lines) { const d = document.createElement('div'); d.textContent = l; this.tip.appendChild(d); }
    const rect = this.svg.getBoundingClientRect();
    const scale = rect.width / this._w;
    let left = P.x * scale + 14, top = P.y * scale + 10;
    if (left + 300 > rect.width) left = Math.max(4, P.x * scale - 314);
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
    this.tip.hidden = false;
  }
}

/* Earlier positions of an item from stored observations, in the field's data units. */
export function trailOf(it, earlier) {
  const s = SOURCES[it.src];
  if (s.kind === 'readership' || !it.created) return [];
  const floor = s.kind === 'forum' ? TUNING.hnAgeFloorH : TUNING.ghAgeFloorH;
  const per = s.kind === 'forum' ? 1 : 24;
  return earlier.filter((e) => e.t > it.created && e.t < it.t).slice(-6).map((e) => {
    const ageH = (e.t - it.created) / 3.6e6;
    return { x: Math.max(0.05, ageH), y: (e.c / Math.max(floor, ageH)) * per };
  });
}
