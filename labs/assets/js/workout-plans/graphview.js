/* ============================================================
   workout-plans/graphview.js — draws one substitution walk: the
   nodes the planner's breadth-first search visited, laid out by
   hop from the template's first choice, each rejected node with
   the constraint that rejected it, and the chosen path in gold.
   ============================================================ */

import { svg, el, clear } from './dom.js';
import { EX, PATTERNS, edgeReason } from './library.js';

const NW = 168, NH = 38, CG = 46, RG = 14, PAD = 8;

export function walkLabel(wk) {
  const from = EX[wk.start]?.name || wk.start;
  const to = wk.chosen ? EX[wk.chosen].name : 'nothing passes';
  return `${PATTERNS[wk.pattern] || wk.pattern}: ${from} to ${to}`;
}

export class GraphView {
  constructor(host, picker, caption) {
    this.host = host;
    this.picker = picker;
    this.caption = caption;
    this.walks = [];
    this.cur = null;
  }

  setWalks(walks, preferKey) {
    // distinct walks that did something: a swap, or a slot left empty
    const seen = new Map();
    for (const wk of walks) {
      if (wk.chosen === wk.start) continue;
      const key = wk.start + '>' + (wk.chosen || 'none');
      if (!seen.has(key)) seen.set(key, wk);
    }
    this.walks = [...seen.entries()];
    clear(this.picker);
    if (!this.walks.length) {
      this.picker.appendChild(el('span', { class: 'gv-none' }, 'Every first choice passes your equipment and flags; no walk was needed.'));
      clear(this.host);
      this.caption.textContent = '';
      return;
    }
    const key = preferKey && seen.has(preferKey) ? preferKey : (this.cur && seen.has(this.cur) ? this.cur : this.walks[0][0]);
    for (const [k, wk] of this.walks) {
      const b = el('button', { type: 'button', class: 'chip sm', 'aria-pressed': String(k === key), dataset: { k } }, walkLabel(wk));
      b.addEventListener('click', () => this.show(k));
      this.picker.appendChild(b);
    }
    this.show(key);
  }

  show(key) {
    this.cur = key;
    const wk = this.walks.find(([k]) => k === key)?.[1];
    this.picker.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === key)));
    if (!wk) return;
    // layers by BFS over the walk's own edges
    const layer = new Map([[wk.start, 0]]);
    const q = [wk.start];
    while (q.length) {
      const id = q.shift();
      for (const [a, b] of wk.edges) if (a === id && !layer.has(b)) { layer.set(b, layer.get(id) + 1); q.push(b); }
    }
    for (const id of wk.visited) if (!layer.has(id)) layer.set(id, 0);
    const frontier = wk.frontier || [];
    for (const [a, b] of wk.farEdges || []) if (layer.has(a) && !layer.has(b)) layer.set(b, layer.get(a) + 1);
    const cols = [];
    for (const id of wk.visited.concat(frontier)) if (layer.has(id)) (cols[layer.get(id)] ||= []).push(id);
    const pos = {};
    cols.forEach((ids, c) => ids.forEach((id, r) => { pos[id] = { x: PAD + c * (NW + CG), y: PAD + r * (NH + RG) }; }));
    const W = PAD * 2 + cols.length * NW + (cols.length - 1) * CG;
    const H = PAD * 2 + Math.max(...cols.map((c) => c.length)) * (NH + RG) - RG;
    const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'gv', role: 'img',
      'aria-label': `Substitution walk. ${walkLabel(wk)}. ` + wk.visited.map((id) => `${EX[id].name}: ${wk.rejected[id] ? 'rejected, ' + wk.rejected[id].map((r) => r.text).join(', ') : id === wk.chosen ? 'chosen' : 'visited'}`).join('. ') });
    const onPath = new Set();
    for (let i = 0; i < wk.path.length - 1; i++) onPath.add(wk.path[i] + '>' + wk.path[i + 1]);
    for (const [a, b] of wk.edges.concat((wk.farEdges || []).map((e) => [...e, 'far']))) {
      if (!pos[a] || !pos[b]) continue;
      const x1 = pos[a].x + NW, y1 = pos[a].y + NH / 2, x2 = pos[b].x, y2 = pos[b].y + NH / 2;
      if (x2 <= x1) continue;
      const mx = (x1 + x2) / 2;
      const far = frontier.includes(b) && !wk.visited.includes(b);
      const edge = svg('path', { d: `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: 'gv-e' + (onPath.has(a + '>' + b) ? ' on' : '') + (far ? ' far' : '') });
      edge.appendChild(svg('title', {}, `${EX[a].name} to ${EX[b].name}: ${edgeReason(a, b)}`));
      root.appendChild(edge);
    }
    for (const id of frontier) {
      const p = pos[id];
      if (!p || wk.visited.includes(id)) continue;
      const v = wk.far?.[id] || [];
      const g = svg('g', { class: 'gv-n far', transform: `translate(${p.x},${p.y})` });
      g.appendChild(svg('rect', { width: NW, height: NH, rx: 2 }));
      const name = EX[id].name;
      g.appendChild(svg('text', { x: 8, y: 15, class: 'gv-t' }, name.length > 27 ? name.slice(0, 26) + '.' : name));
      g.appendChild(svg('text', { x: 8, y: 29, class: 'gv-r' }, ('not reached; ' + (v.length ? 'would fail: ' + v[0].text : 'would pass')).slice(0, 34)));
      root.appendChild(g);
    }
    for (const id of wk.visited) {
      const p = pos[id];
      const rej = wk.rejected[id];
      const chosen = id === wk.chosen;
      const g = svg('g', { class: 'gv-n' + (chosen ? ' chosen' : rej ? ' rej' : '') + (wk.path.includes(id) ? ' path' : ''), transform: `translate(${p.x},${p.y})` });
      g.appendChild(svg('rect', { width: NW, height: NH, rx: 2 }));
      const name = EX[id].name;
      g.appendChild(svg('text', { x: 8, y: 15, class: 'gv-t' }, name.length > 27 ? name.slice(0, 26) + '.' : name));
      g.appendChild(svg('text', { x: 8, y: 29, class: 'gv-r' }, chosen ? 'chosen' : rej ? rej.map((r) => r.text).join('; ').slice(0, 34) : 'visited'));
      if (rej) g.appendChild(svg('line', { x1: 8, x2: Math.min(NW - 8, 8 + name.length * 6.3), y1: 11, y2: 11, class: 'gv-x' }));
      root.appendChild(g);
    }
    clear(this.host).appendChild(root);
    const hops = wk.path.length ? wk.path.length - 1 : 0;
    const nf = frontier.filter((id) => !wk.visited.includes(id)).length;
    const why = wk.chosen && wk.path.length > 1 ? ` Last edge: ${edgeReason(wk.path[wk.path.length - 2], wk.chosen)}.` : '';
    this.caption.textContent = (wk.chosen
      ? `${wk.visited.length} node${wk.visited.length === 1 ? '' : 's'} visited, ${hops} hop${hops === 1 ? '' : 's'} on the chosen path${nf ? `, ${nf} queued but never reached` : ''}. Breadth-first over edges ordered by similarity, so the nearest allowed substitute wins.`
      : `${wk.visited.length} nodes visited and none passes. The slot is left out of the plan.`) + why;
  }
}
