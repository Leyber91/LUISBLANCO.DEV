/* ============================================================
   orthogonal/engine.js: the computation of the Orthogonal plate.
   No DOM. Every rule the page states about a lineage lives in one
   function here, and the view and the tests call that function.

   - check(world)       every way a world's data breaks the lineage's rules, as sentences
   - trunk(world)       the branch this world took: the driver to the artifact, through each node's first parent
   - stateOf(world, id) what a node is: root, fired (the branch that happened, gold), earth, pending
   - wrap(text, chars)  a label broken into lines at word boundaries
   - layout(world, opt) every node's lane, row, box and label lines, and every edge's path, for a given width
   - reading(world, id) what the plate says of a node: its role, label, note, Earth's step beside it, its evidence
   - pairOf(world, id)  the node on the other branch that does the same job at the same step
   - step(world, id, k) the next node a key moves to
   ============================================================ */
import { LAYOUT, ROLES, SOURCES } from './config.js';

const byId = (world) => new Map(world.nodes.map((n) => [n.id, n]));

/* Every way the world breaks the rules, as sentences; an empty list when it holds. */
export function check(world) {
  const out = [];
  const ids = byId(world);
  if (ids.size !== world.nodes.length) out.push('two nodes share an id');
  const roots = world.nodes.filter((n) => n.role === 'root');
  if (roots.length !== 1) out.push(`a lineage has one root, and this one has ${roots.length}`);
  const drivers = world.nodes.filter((n) => n.role === 'driver');
  if (drivers.length !== 1) out.push(`a lineage has one driver, and this one has ${drivers.length}`);
  for (const n of world.nodes) {
    if (!ROLES[n.role]) out.push(`${n.id}: unknown role "${n.role}"`);
    if (!['both', 'world', 'earth'].includes(n.branch)) out.push(`${n.id}: unknown branch "${n.branch}"`);
    if ((n.role === 'earth') !== (n.branch === 'earth')) out.push(`${n.id}: an Earth node has the role earth, and only it`);
    if (n.role === 'root' && n.after.length) out.push(`${n.id}: the root grows from nothing`);
    if (n.role !== 'root' && !n.after.length) out.push(`${n.id}: grows from nothing and is not the root`);
    for (const a of n.after) {
      const p = ids.get(a);
      if (!p) { out.push(`${n.id}: grows from "${a}", which is not a node`); continue; }
      if (n.branch === 'world' && p.branch === 'earth') out.push(`${n.id}: a world node grows from an Earth node (${a})`);
      if (n.branch === 'earth' && p.branch === 'world') out.push(`${n.id}: an Earth node grows from a world node (${a})`);
    }
    if (n.branch === 'earth') {
      const q = ids.get(n.pair);
      if (!q || q.branch !== 'world') out.push(`${n.id}: an Earth node pairs with a world node, and "${n.pair}" is not one`);
    } else if (n.pair !== undefined) out.push(`${n.id}: only an Earth node names a pair`);
    if (!String(n.label || '').trim()) out.push(`${n.id}: no label`);
    if (!String(n.note || '').trim()) out.push(`${n.id}: no note`);
    if (!Array.isArray(n.evidence) || !n.evidence.length) out.push(`${n.id}: no evidence`);
    for (const e of n.evidence || []) {
      if (e.tag !== 'REAL' && e.tag !== 'ILLUSTRATIVE') out.push(`${n.id}: evidence tagged "${e.tag}"`);
      if (e.src !== undefined && !SOURCES[e.src]) out.push(`${n.id}: cites "${e.src}", which is not a source`);
      if (e.tag === 'REAL' && !e.src && !String(e.gap || '').trim()) out.push(`${n.id}: a REAL item with no source and no declared gap`);
    }
  }
  if (out.length) return out;
  // acyclic: a node's parents all come before it in some order
  const seen = new Set(), done = new Set();
  const visit = (id) => {
    if (done.has(id)) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const ok = ids.get(id).after.every(visit);
    done.add(id);
    return ok;
  };
  if (!world.nodes.every((n) => visit(n.id))) { out.push('the lineage has a cycle'); return out; }
  const t = trunk(world);
  if (!t) { out.push('no branch runs from the driver to the artifact through first parents'); return out; }
  const art = ids.get(world.artifact.node);
  if (!art || art.role !== 'artifact') out.push(`the artifact "${world.artifact.node}" is not a node with the role artifact`);
  const pairs = world.nodes.filter((n) => n.branch === 'earth').map((n) => n.pair);
  if (new Set(pairs).size !== pairs.length) out.push('two Earth nodes pair with one world node');
  for (const n of world.nodes.filter((x) => x.branch === 'earth')) {
    if (!t.includes(n.pair)) out.push(`${n.id}: pairs with "${n.pair}", which is not on the branch this world took`);
  }
  // Earth's steps keep the order of the world steps they pair with, so no Earth line runs upward
  const rowOfTrunk = new Map(t.map((id, i) => [id, i]));
  for (const n of world.nodes.filter((x) => x.branch === 'earth')) {
    for (const a of n.after) {
      const p = ids.get(a);
      if (p.branch === 'earth' && !(rowOfTrunk.get(p.pair) < rowOfTrunk.get(n.pair))) out.push(`${n.id}: pairs above its parent ${a}`);
    }
  }
  const earthArt = ids.get(world.earthArtifact.node);
  if (!earthArt || earthArt.branch !== 'earth' || earthArt.pair !== world.artifact.node) out.push(`Earth's artifact "${world.earthArtifact.node}" does not pair with this world's`);
  return out;
}

/* The branch this world took: from the artifact back through each node's first parent to the driver, in order from
   the driver down. Null when that walk does not reach the driver. */
export function trunk(world) {
  const ids = byId(world);
  const path = [];
  let n = ids.get(world.artifact.node);
  const guard = world.nodes.length + 1;
  while (n && path.length < guard) {
    path.unshift(n.id);
    if (n.role === 'driver') return path;
    n = ids.get(n.after[0]);
  }
  return null;
}

/* What a node is. Gold marks only what has fired: every world node from the driver down to the artifact, the trunk and
   the threads that met in it. What grows after the artifact has not happened yet (pending); Earth's branch is the
   ghost beside it; the root belongs to both. */
export function stateOf(world, id) {
  const ids = byId(world);
  const n = ids.get(id);
  if (!n) return null;
  if (n.role === 'root') return 'root';
  if (n.branch === 'earth') return 'earth';
  return firedSet(world).has(id) ? 'fired' : 'pending';
}

/* The world nodes the artifact grew from: everything upstream of it on the world branch, the artifact included. */
function firedSet(world) {
  const ids = byId(world);
  const out = new Set();
  const walk = (id) => {
    const n = ids.get(id);
    if (!n || n.branch !== 'world' || out.has(id)) return;
    out.add(id);
    n.after.forEach(walk);
  };
  walk(world.artifact.node);
  return out;
}

/* A label broken into lines of at most `chars` characters, at spaces; a word longer than a line is kept whole. */
export function wrap(text, chars) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= chars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* The order nodes are drawn in, one row each, parents always above: the root, then whichever world node is ready,
   a side thread before a trunk node (so a thread leaves the trunk as soon as it can, and runs beside it down to where
   it joins), and what has not happened yet last. Ties keep the data's order. Earth nodes take their pair's row. */
function rowOrder(world) {
  const t = new Set(trunk(world));
  const rank = (n) => (stateOf(world, n.id) === 'pending' ? 2 : t.has(n.id) ? 1 : 0);
  const todo = world.nodes.filter((n) => n.branch !== 'earth');
  const rows = [];
  const placed = new Set();
  while (todo.length) {
    const ready = todo.filter((n) => n.after.every((a) => placed.has(a)));
    if (!ready.length) break;   // check() refuses a cycle before any layout
    ready.sort((a, b) => rank(a) - rank(b) || todo.indexOf(a) - todo.indexOf(b));
    const n = ready[0];
    rows.push(n.id);
    placed.add(n.id);
    todo.splice(todo.indexOf(n), 1);
  }
  return rows;
}

/* Every node's position and every edge's path, for a drawing `width` px wide. `height`, when given, spreads the rows
   to fill it; the rows are never closer than LAYOUT.minPitch. `leader` draws a line from the artifact's label to the
   right edge, where the render sits beside the drawing. */
export function layout(world, { width, height = 0, leader = false } = {}) {
  const L = LAYOUT;
  const ids = byId(world);
  const t = new Set(trunk(world));
  const E = L.edgeLane;
  const T = Math.round(width * L.trunkShare);
  const S = T - L.sideOffset;
  const order = rowOrder(world);
  const rowOf = new Map(order.map((id, i) => [id, i]));
  for (const n of world.nodes) if (n.branch === 'earth') rowOf.set(n.id, rowOf.get(n.pair));
  // the trunk and what grows after the artifact continue down one lane; a thread that joins the trunk runs beside it
  const laneOf = (n) => (n.role === 'root' ? S : n.branch === 'earth' ? E : t.has(n.id) || stateOf(world, n.id) === 'pending' ? T : S);
  const chars = (px) => Math.max(6, Math.floor(px / L.charW));
  const boxes = new Map();
  for (const n of world.nodes) {
    const x = laneOf(n);
    let left, right, anchor;
    if (n.role === 'root') { left = x + L.labelGap; right = width; anchor = 'start'; }
    else if (n.branch === 'earth') { left = x + L.labelGap; right = S - 20; anchor = 'start'; }
    else if (x === T) { left = x + L.labelGap; right = width; anchor = 'start'; }
    else { left = E + L.labelGap; right = x - L.labelGap + 1; anchor = 'end'; }   // a side thread's label sits left of its lane
    const lines = wrap(n.label, chars(right - left));
    const role = n.branch === 'earth' ? '' : ROLES[n.role];
    boxes.set(n.id, { x, left, right, anchor, lines, role });
  }
  const rowCount = order.length;
  const blockH = new Array(rowCount).fill(0);
  for (const n of world.nodes) {
    const b = boxes.get(n.id);
    const h = (b.lines.length + (b.role ? 1 : 0)) * L.lineH;
    const r = rowOf.get(n.id);
    blockH[r] = Math.max(blockH[r], h);
  }
  const pitch = blockH.map((h) => Math.max(L.minPitch, h + L.rowGap));
  const natural = L.topPad + pitch.reduce((a, b) => a + b, 0);
  if (height > natural) {
    const extra = (height - natural) / rowCount;
    for (let i = 0; i < rowCount; i++) pitch[i] += extra;
  }
  const rowY = [];
  let y = L.topPad;
  for (let i = 0; i < rowCount; i++) { rowY.push(y); y += pitch[i]; }
  const nodes = world.nodes.map((n) => {
    const b = boxes.get(n.id);
    const r = rowOf.get(n.id);
    const top = rowY[r];
    const textW = Math.max(...b.lines.map((s) => s.length), b.role.length) * L.charW;
    const hitL = b.anchor === 'start' ? b.x - L.node : b.x - L.labelGap - textW - 4;
    const hitR = b.anchor === 'start' ? b.left + textW + 4 : b.x + L.node;
    const hitH = Math.max(44, (b.lines.length + (b.role ? 1 : 0)) * L.lineH + 8);
    return {
      id: n.id, row: r, state: stateOf(world, n.id), role: n.role, x: b.x, y: top + L.node / 2,
      label: { x: b.anchor === 'start' ? b.left : b.x - L.labelGap, y: top + 9, anchor: b.anchor, lines: b.lines, role: b.role },
      hit: { x: Math.max(0, hitL), y: top - 6, w: Math.min(width, hitR) - Math.max(0, hitL), h: hitH },
    };
  });
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const n of world.nodes) {
    n.after.forEach((a, k) => {
      const p = pos.get(a), c = pos.get(n.id);
      const kind = n.branch === 'earth' ? 'earth' : stateOf(world, n.id) === 'pending' ? 'pending' : k === 0 && t.has(n.id) ? 'fired' : 'thread';
      edges.push({ from: a, to: n.id, kind, d: edgePath(p, c) });
    });
  }
  const lastY = rowY[rowCount - 1] + Math.max(blockH[rowCount - 1], L.lineH);
  const art = pos.get(world.artifact.node);
  const artBox = boxes.get(world.artifact.node);
  const leaderLine = leader ? {
    x1: Math.min(width, artBox.left + Math.max(...artBox.lines.map((s) => s.length), artBox.role.length) * L.charW + 10),
    x2: width, y: art.y,
  } : null;
  return { width, height: Math.max(height, Math.ceil(lastY + 8)), lanes: { earth: E, side: S, trunk: T }, nodes, edges, leader: leaderLine };
}

/* A branch line from a parent's square to a child's: straight down a lane, and where the lanes differ, an S-curve over
   the last LAYOUT.curve px before the child. */
function edgePath(p, c) {
  const h = LAYOUT.node / 2;
  const y0 = p.y + h, y1 = c.y - h;
  if (p.x === c.x) return `M${p.x} ${y0} L${c.x} ${y1}`;
  const ya = Math.max(y0, y1 - LAYOUT.curve);
  const ym = (ya + y1) / 2;
  return `M${p.x} ${y0} L${p.x} ${ya} C${p.x} ${ym} ${c.x} ${ym} ${c.x} ${y1}`;
}

/* The node on the other branch at the same step: an Earth node's pair, or the Earth node that pairs with a world node. */
export function pairOf(world, id) {
  const n = byId(world).get(id);
  if (!n) return null;
  if (n.branch === 'earth') return n.pair;
  const e = world.nodes.find((x) => x.branch === 'earth' && x.pair === id);
  return e ? e.id : null;
}

/* What the plate says of a node. Evidence comes back with each source written out, or with its declared gap. */
export function reading(world, id) {
  const ids = byId(world);
  const n = ids.get(id);
  if (!n) return null;
  const p = pairOf(world, id);
  const q = p ? ids.get(p) : null;
  return {
    id, role: n.branch === 'earth' ? 'Earth' : ROLES[n.role], label: n.label, note: n.note, state: stateOf(world, id),
    beside: q ? { id: q.id, label: q.label, side: q.branch === 'earth' ? 'Earth, same step' : 'This world, same step' } : null,
    evidence: n.evidence.map((e) => ({ tag: e.tag, text: e.text, source: e.src ? SOURCES[e.src] : null, gap: e.gap || null })),
  };
}

/* The node a key moves to from `id`: up and down walk the rows of the drawing, left and right cross to the node on the
   other branch at the same step. Home and End go to the root and to the last row. Null for any other key, or when
   there is nowhere to go. */
export function step(world, id, key) {
  const order = rowOrder(world);   // one row per node of the world's branch, the root first
  const n = byId(world).get(id);
  if (!n) return null;
  if (key === 'Home') return order[0];
  if (key === 'End') return order[order.length - 1];
  if (key === 'ArrowLeft' || key === 'ArrowRight') return pairOf(world, id);
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const dir = key === 'ArrowDown' ? 1 : -1;
  if (n.branch !== 'earth') {
    const i = order.indexOf(id) + dir;
    return i >= 0 && i < order.length ? order[i] : null;
  }
  // along Earth's branch: the next Earth node in that direction; above the first, the root both branches share
  const earth = order.map((w) => pairOf(world, w)).filter((e) => e && byId(world).get(e).branch === 'earth');
  const j = earth.indexOf(id) + dir;
  if (j < 0) return order[0];
  return j < earth.length ? earth[j] : null;
}
