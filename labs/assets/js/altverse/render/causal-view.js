/* ============================================================
   altverse/render/causal-view.js — the causal record as a graph.
   Columns are stages in the order the multipath runs them; every
   consequence is a node, every "cause" an edge. Hover, focus or tap
   a node: its path back to the divergence lights gold and what it
   leads to lights bright. Model items are drawn dashed.
   ============================================================ */

import { STAGE_ORDER } from '../config.js';
import { svg, text, trunc, esc } from './svg.js';
import { fmtYear } from '../classify.js';

export class CausalView {
  constructor(host, detail) {
    this.host = host; this.detail = detail; this.w = null;
    this._ro = new ResizeObserver(() => { const wd = host.clientWidth; if (Math.abs(wd - (this._lw || 0)) > 30) this.render(); });
    this._ro.observe(host);
  }

  setWorld(w) { this.w = w; this.render(); this.show(null); }

  graph() {
    const w = this.w;
    const all = new Map();   // every id with its cause, for walking past hidden nodes
    all.set('dv', { id: 'dv', cause: null, stage: 'divergence', text: w.spec.text, ladder: 'ESTABLISHED', origin: 'engine' });
    const nodes = [all.get('dv')];
    for (const s of STAGE_ORDER) {
      const st = w.stages[s]; if (!st || s === 'divergence') continue;
      (st.items || []).forEach((i) => { const n = { ...i, stage: s }; all.set(i.id, n); nodes.push(n); });
      if (s === 'history') (st.events || []).forEach((e) => {
        const n = { ...e, stage: s, text: `${fmtYear(e.year)}: ${e.title}` };
        if (!all.has(e.id)) all.set(e.id, n);
        if (!['inherited', 'kept'].includes(e.kind) && e.id !== 'ev-dv') nodes.push(n);
      });
    }
    const shown = new Set(nodes.map((n) => n.id));
    const edges = [];
    nodes.forEach((n) => {
      let c = n.cause, guard = 0;
      while (c && !shown.has(c) && all.has(c) && guard++ < 12) c = all.get(c).cause;
      if (c && shown.has(c) && c !== n.id) edges.push({ from: c, to: n.id });
    });
    return { nodes, edges };
  }

  render() {
    const w = this.w; if (!w) return;
    const host = this.host; host.innerHTML = '';
    const Wd = host.clientWidth || 1100; this._lw = Wd;
    const V = Wd < 640;
    const { nodes, edges } = this.graph();
    const cols = STAGE_ORDER.filter((s) => nodes.some((n) => n.stage === s));
    const byCol = cols.map((s) => nodes.filter((n) => n.stage === s));
    // barycentric order: each column sorted by the mean row of its parents
    const row = new Map();
    byCol.forEach((list, ci) => {
      if (ci > 0) list.sort((a, b) => {
        const pa = edges.filter((e) => e.to === a.id).map((e) => row.get(e.from) ?? 0), pb = edges.filter((e) => e.to === b.id).map((e) => row.get(e.from) ?? 0);
        const ma = pa.length ? pa.reduce((x, y) => x + y, 0) / pa.length : 0, mb = pb.length ? pb.reduce((x, y) => x + y, 0) / pb.length : 0;
        return ma - mb;
      });
      list.forEach((n, i) => row.set(n.id, i / Math.max(1, list.length - 1)));
    });
    const pos = new Map();
    let W, H;
    if (!V) {
      const rowH = 21, maxN = Math.max(...byCol.map((l) => l.length));
      W = Wd; H = 30 + maxN * rowH + 10;
      const colW = (W - 150) / Math.max(1, cols.length - 1);
      byCol.forEach((list, ci) => {
        const top = 30 + (maxN - list.length) * rowH / 2;
        list.forEach((n, i) => pos.set(n.id, { x: 8 + ci * colW, y: top + i * rowH + 6, colW }));
      });
    } else {
      W = Wd; const perLine = Math.max(6, Math.floor((W - 20) / 24));
      let y = 22; H = 0;
      byCol.forEach((list) => {
        const lines = Math.ceil(list.length / perLine);
        list.forEach((n, i) => pos.set(n.id, { x: 14 + (i % perLine) * 24 + (Math.floor(i / perLine) % 2) * 12, y: y + 16 + Math.floor(i / perLine) * 22, colW: 0 }));
        y += 30 + lines * 22;
      });
      H = y + 6;
    }
    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': `Causal graph of ${nodes.length} consequences` }, host);
    // column / band headers
    cols.forEach((s, ci) => {
      const first = pos.get(byCol[ci][0].id);
      if (!V) text(root, first.x, 12, s, { class: 'cg-col' });
      else text(root, 4, first.y - 12, s, { class: 'cg-col' });
    });
    const eg = svg('g', {}, root);
    this.edgeEls = edges.map((e) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      const d = V ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + (b.x - a.x) * 0.5},${a.y} ${a.x + (b.x - a.x) * 0.5},${b.y} ${b.x},${b.y}`;
      // the edge carries the certainty of the claim it leads to
      const lad = (nodes.find((n) => n.id === e.to) || {}).ladder || 'SPECULATIVE';
      return { ...e, lad, el: svg('path', { d, class: 'cg-edge', 'data-lad': lad }, eg) };
    });
    this.nodeEls = new Map();
    nodes.forEach((n) => {
      const p = pos.get(n.id);
      const g = svg('g', { class: `cg-node${n.origin === 'model' ? ' model' : ''}${n.id === 'dv' ? ' root' : ''}`, tabindex: 0, role: 'button', 'aria-label': `${n.stage}: ${n.text}` }, root);
      svg('circle', { cx: p.x, cy: p.y, r: n.id === 'dv' ? 5 : 3.5 }, g);
      if (!V) text(g, p.x + 8, p.y + 3.5, trunc(n.id === 'dv' ? 'the divergence' : n.title || n.text, Math.floor((p.colW - 14) / 5.8)));
      const on = () => { this.light(n.id); this.show(n); };
      g.addEventListener('mouseenter', on); g.addEventListener('focus', on); g.addEventListener('click', on);
      g.addEventListener('mouseleave', () => { if (document.activeElement !== g) this.light(null); });
      this.nodeEls.set(n.id, g);
    });
    this.edges = edges; this.nodes = nodes;
    const lg = document.createElement('div');
    lg.className = 'cg-legend';
    lg.innerHTML = ['ESTABLISHED', 'THEORETICAL', 'SPECULATIVE', 'SF'].map((l) => `<span><svg width="26" height="6" aria-hidden="true"><path d="M0,3 L26,3" class="cg-edge" data-lad="${l}"/></svg>${l.toLowerCase()}</span>`).join('') + '<span><svg width="10" height="10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" class="cg-m"/></svg>written by the model</span>';
    host.appendChild(lg);
  }

  light(id) {
    if (!this.edges) return;
    const up = new Set(), down = new Set();
    if (id) {
      const walkUp = (x) => this.edges.forEach((e) => { if (e.to === x && !up.has(e.from)) { up.add(e.from); walkUp(e.from); } });
      const walkDown = (x) => this.edges.forEach((e) => { if (e.from === x && !down.has(e.to)) { down.add(e.to); walkDown(e.to); } });
      walkUp(id); walkDown(id); up.add(id);
    }
    this.nodeEls.forEach((g, nid) => {
      const base = g.getAttribute('class').replace(/ (up|down|fade)/g, '');
      g.setAttribute('class', !id ? base : base + (up.has(nid) ? ' up' : down.has(nid) ? ' down' : ' fade'));
    });
    this.edgeEls.forEach((e) => e.el.setAttribute('class', 'cg-edge' + (!id ? '' : up.has(e.to) && up.has(e.from) ? ' up' : (down.has(e.to) && (down.has(e.from) || e.from === id)) ? ' down' : ' fade')));
  }

  highlight(id) {
    if (!this.nodeEls || !this.nodeEls.has(id)) return;
    this.light(id);
    this.show(this.nodes.find((n) => n.id === id));
  }

  show(n) {
    if (!this.detail) return;
    if (!n) { this.detail.innerHTML = `<span class="meta">${this.nodes ? this.nodes.length : 0} consequences, ${this.edges ? this.edges.length : 0} causal links. Pick one.</span>`; return; }
    const chain = []; let c = n.cause; const all = new Map(this.nodes.map((x) => [x.id, x])); let guard = 0;
    while (c && guard++ < 10) { chain.push(c); c = all.get(c) ? all.get(c).cause : null; }
    this.detail.innerHTML = `${esc(n.text)}<div class="meta">${esc(n.id)} &middot; ${esc(n.stage)} &middot; ${esc(n.ladder || '')} &middot; ${n.origin === 'model' ? 'written by the model, checked' : 'engine'}${chain.length ? ' &middot; path: ' + chain.map(esc).join(' &larr; ') : ''}</div>`;
  }
}
