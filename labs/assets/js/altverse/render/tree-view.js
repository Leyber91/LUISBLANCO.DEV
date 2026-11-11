/* ============================================================
   altverse/render/tree-view.js — the tree of worlds. The root on
   the left, forks to the right, the current world in gold. Each
   node opens its world; the fork text is the node's title.
   ============================================================ */

import { svg, text, trunc } from './svg.js';

export function renderTree(host, tree, onOpen) {
  host.innerHTML = '';
  if (!tree.rootId) return;
  const nodes = tree.all();
  if (nodes.length < 2) {
    host.innerHTML = '<span style="font-size:10.5px;color:var(--text-faint)">One world so far. Fork it from any event in the river below; forks appear here as a tree.</span>';
    return;
  }
  const depth = (n) => tree.depth(n.id);
  const leaves = [];
  const walk = (id) => { const kids = tree.children(id); if (!kids.length) leaves.push(id); kids.forEach((k) => walk(k.id)); };
  walk(tree.rootId);
  const y = new Map();
  leaves.forEach((id, i) => y.set(id, i));
  const fill = (id) => { const kids = tree.children(id); if (!kids.length) return y.get(id); const v = kids.map((k) => fill(k.id)).reduce((a, b) => a + b, 0) / kids.length; y.set(id, v); return v; };
  fill(tree.rootId);
  const maxD = Math.max(...nodes.map(depth));
  const colW = Math.min(170, Math.max(110, (host.clientWidth || 600) / (maxD + 1)));
  const rowH = 18;
  const W = (maxD + 1) * colW, H = leaves.length * rowH + 6;
  const root = svg('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Tree of worlds' }, host);
  const P = (n) => [6 + depth(n) * colW, 9 + y.get(n.id) * rowH];
  nodes.forEach((n) => { if (!n.parentId) return; const [x1, y1] = P(tree.get(n.parentId)), [x2, y2] = P(n); svg('path', { d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`, class: 'tr-link' }, root); });
  nodes.forEach((n) => {
    const [x, yy] = P(n);
    const g = svg('g', { class: `tr-node${n.id === tree.currentId ? ' cur' : ''}`, tabindex: 0, role: 'link', 'aria-label': `World ${n.name}: ${n.path[n.path.length - 1].text}` }, root);
    svg('circle', { cx: x, cy: yy, r: 3.5 }, g);
    text(g, x + 7, yy + 3.5, trunc(n.name, Math.floor((colW - 16) / 6)));
    const t = svg('title', {}, g); t.textContent = n.path[n.path.length - 1].text;
    g.addEventListener('click', () => onOpen(n.id));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') onOpen(n.id); });
  });
}
