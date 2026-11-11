/* ============================================================
   altverse/render/pipeline-view.js — the multipath, drawn.
   Stages are nodes at their depth in the graph; edges are what each
   stage consumes. A stage lights gold while it runs, turns bright
   when done, carries a gold tick when the validator repaired or
   rejected part of a model reply, and goes dashed when pruned.
   Horizontal on wide screens, vertical on narrow ones.
   ============================================================ */

import { STAGES, STAGE_BY_ID } from '../config.js';
import { svg, text } from './svg.js';

function depthOf() {
  const d = {};
  const f = (id) => { if (d[id] != null) return d[id]; const s = STAGE_BY_ID[id]; d[id] = s.deps.length ? 1 + Math.max(...s.deps.map(f)) : 0; return d[id]; };
  STAGES.forEach((s) => f(s.id));
  return d;
}

export class PipelineView {
  constructor(host, { onPick, reduced } = {}) {
    this.host = host; this.onPick = onPick; this.reduced = reduced;
    this.state = {}; this.meta = {};
    this.depth = depthOf();
    this.build();
    this._ro = new ResizeObserver(() => { const v = this.host.clientWidth < 300; if (v !== this.vertical) this.build(); });
    this._ro.observe(host);
  }

  build() {
    this.vertical = this.host.clientWidth < 300 && this.host.clientWidth > 0;
    this.host.innerHTML = '';
    const maxD = Math.max(...Object.values(this.depth));
    const V = this.vertical;
    const W = V ? 330 : 380, H = V ? 300 : 178;
    const pos = {};
    STAGES.forEach((s) => {
      const d = this.depth[s.id], lane = s.lane;
      pos[s.id] = V ? { x: 50 + lane * 115, y: 18 + d * ((H - 40) / maxD) } : { x: 26 + d * ((W - 52) / maxD), y: 40 + lane * 50 };
    });
    this.pos = pos;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'The stage graph' }, this.host);
    this.svg = root;
    const edges = svg('g', {}, root);
    this.edges = [];
    STAGES.forEach((s) => s.deps.forEach((dp) => {
      const a = pos[dp], b = pos[s.id];
      const d = V ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}` : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
      const p = svg('path', { d, class: 'pg-edge' }, edges);
      this.edges.push({ from: dp, to: s.id, el: p });
    }));
    this.dots = svg('g', {}, root);
    this.nodes = {};
    STAGES.forEach((s) => {
      const g = svg('g', { class: 'pg-node', tabindex: 0, role: 'button', 'aria-label': `${s.label}: ${s.role}`, transform: `translate(${pos[s.id].x},${pos[s.id].y})` }, root);
      svg('circle', { class: 'halo', r: 7 }, g);
      svg('circle', { class: 'r', r: 6.5 }, g);
      svg('path', { class: 'tick', d: 'M-3,0 L-1,2.5 L3.5,-2.5', opacity: 0 }, g);
      // labels above or below so neighbours never collide: lane 0 above, lane 2 below, lane 1 alternating by depth
      const up = s.lane === 0 || (s.lane === 1 && this.depth[s.id] % 2 === 0);
      const lx = V ? 11 : 0, ly = V ? 3.5 : up ? -11 : 18;
      text(g, lx, ly, s.label, { 'text-anchor': V ? 'start' : 'middle' });
      const st = text(g, V ? 11 : 0, V ? 14 : up ? -21 : 28, '', { class: 'st', 'text-anchor': V ? 'start' : 'middle' });
      g.addEventListener('click', () => this.onPick && this.onPick(s.id));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPick && this.onPick(s.id); } });
      this.nodes[s.id] = { g, st };
    });
    for (const [id, st] of Object.entries(this.state)) this.set(id, st, this.meta[id], true);
  }

  reset() { this.state = {}; this.meta = {}; for (const id of Object.keys(this.nodes)) this.set(id, 'idle', {}, true); this.edges.forEach((e) => e.el.setAttribute('class', 'pg-edge')); }

  set(id, state, meta = {}, quiet = false) {
    const n = this.nodes[id]; if (!n) return;
    this.state[id] = state; this.meta[id] = meta;
    n.g.setAttribute('class', `pg-node ${state}`);
    n.g.querySelector('.tick').setAttribute('opacity', state === 'repaired' ? 1 : 0);
    let s = '';
    if (state === 'pruned') s = 'pruned';
    else if (meta.route && state !== 'idle' && (meta.route !== 'engine' || state === 'active')) {
      const r = meta.route === 'engine' ? 'engine' : meta.route === 'ollama' ? 'local' : meta.route === 'own-key' ? 'key' : meta.route === 'pollinations' ? 'public' : meta.route;
      s = state === 'queued' ? 'queued' : state === 'active' ? r : `${r}${meta.accepted != null ? ` +${meta.accepted}` : ''}${meta.rejected ? ` -${meta.rejected}` : ''}`;
    }
    n.st.textContent = s;
    this.edges.forEach((e) => {
      if (e.to !== id) return;
      const cls = ['pg-edge'];
      if (state === 'active') cls.push('hot'); else if (state === 'done' || state === 'repaired') cls.push('lit'); else if (state === 'pruned') cls.push('cut');
      e.el.setAttribute('class', cls.join(' '));
    });
    if (state === 'active' && !quiet && !this.reduced) this.pulse(id);
  }

  pulse(id) {
    this.edges.filter((e) => e.to === id).forEach((e) => {
      const len = e.el.getTotalLength();
      const dot = svg('circle', { r: 2, class: 'pg-dot' }, this.dots);
      const t0 = performance.now();
      const step = (t) => {
        const f = Math.min(1, (t - t0) / 240);
        const p = e.el.getPointAtLength(len * f);
        dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
        if (f < 1) requestAnimationFrame(step); else dot.remove();
      };
      requestAnimationFrame(step);
    });
  }
}
