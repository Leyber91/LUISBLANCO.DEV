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
   - strandAt(world, lay, ms)  the ignition at a moment: each line's progress, each step's opacity
   - arrival(world, lay)       when the strand reaches the artifact
   - fogField(world, lay)      each cell's distance to each line, once per layout
   - fogDensity(field, prog)   the fog's density in every cell, for the strand's progress
   - needsOf, needPath         what a step needs, and the links from a step up to one it needs
   - needVerb(node)            "needs", or "grows from" for a seed of trouble: the one verb of every needs sentence
   - itemSets, item            the exercise's sets of steps, and a draw: item n's steps, shuffled by an attempt's seed
   - stepsOf, judge            an order in progress drawn again from its seed; the check as the record keeps it
   - checkOrder(world, order)  the check: right, or the first pair out of order and the links that order them
   - needLine(world, path)     those links in words
   - reasons(world)            every reason a wrong order of an item can be given: the footer is reserved for the longest
   - drillPlaces, drillFog     where an item's steps stand while they are ordered, and the fog around them
   - strandGold(state)         whether the strand is gold in a page state: the drawing and the legend both ask it
   ============================================================ */
import { mulberry32, seedOf, shuffle } from '../kit/rng.js';
import { EXERCISE, FOG, LAYOUT, ROLES, SOURCES, TIMING } from './config.js';

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
    if (!String(n.needs || '').trim()) out.push(`${n.id}: no line saying what it needs`);
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
    // while an order is given the role line gives way to what the step needs. Only the four steps are on the drawing
    // then, each in a band of its own, so the line wraps across the whole width on its side of the step's lane
    const needs = wrap(`${needVerb(n)} ${n.needs}`, anchor === 'start' ? chars(width - left) : chars(right - 4));
    boxes.set(n.id, { x, left, right, anchor, lines, role, needs });
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
  const natural = L.topPad + L.headH + pitch.reduce((a, b) => a + b, 0);
  if (height > natural) {
    const extra = (height - natural) / rowCount;
    for (let i = 0; i < rowCount; i++) pitch[i] += extra;
  }
  const rowY = [];
  let y = L.topPad + L.headH;
  for (let i = 0; i < rowCount; i++) { rowY.push(y); y += pitch[i]; }
  const nodes = world.nodes.map((n) => {
    const b = boxes.get(n.id);
    const r = rowOf.get(n.id);
    const top = rowY[r];
    const textW = Math.max(...b.lines.map((s) => s.length), b.role.length) * L.charW;
    const hitL = b.anchor === 'start' ? b.x - L.node : b.x - L.labelGap - textW - 4;
    const hitR = b.anchor === 'start' ? b.left + textW + 4 : b.x + L.node;
    const hitH = Math.max(44, (b.lines.length + (b.role ? 1 : 0)) * L.lineH + 8);
    // the target while an order is given covers the step's words and what it needs
    const drillW = Math.max(...b.lines.map((s) => s.length), ...b.needs.map((s) => s.length)) * L.charW;
    const dL = b.anchor === 'start' ? b.x - L.node : b.x - L.labelGap - drillW - 4;
    const dR = b.anchor === 'start' ? b.left + drillW + 4 : b.x + L.node;
    return {
      id: n.id, row: r, state: stateOf(world, n.id), role: n.role, x: b.x, y: top + L.node / 2,
      label: { x: b.anchor === 'start' ? b.left : b.x - L.labelGap, y: top + 9, anchor: b.anchor, lines: b.lines, role: b.role, needs: b.needs },
      hit: { x: Math.max(0, hitL), y: top - 6, w: Math.min(width, hitR) - Math.max(0, hitL), h: hitH },
      drillHit: { x: Math.max(0, dL), y: top - 6, w: Math.min(width, dR) - Math.max(0, dL), h: Math.max(44, (b.lines.length + b.needs.length) * L.lineH + 8) },
    };
  });
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  for (const n of world.nodes) {
    n.after.forEach((a, k) => {
      const p = pos.get(a), c = pos.get(n.id);
      const kind = n.branch === 'earth' ? 'earth' : stateOf(world, n.id) === 'pending' ? 'pending' : k === 0 && t.has(n.id) ? 'fired' : 'thread';
      // a line that turns toward its cause's label runs down past the label before it turns, so it never crosses it
      const toward = (c.x > p.x && p.label.anchor === 'start') || (c.x < p.x && p.label.anchor === 'end');
      const under = toward ? p.label.y - 10 + (p.label.lines.length + (p.label.role ? 1 : 0)) * L.lineH + 6 : 0;
      edges.push({ from: a, to: n.id, kind, d: edgePath(p, c, under), pts: edgePoints(p, c, under) });
    });
  }
  const lastY = rowY[rowCount - 1] + Math.max(blockH[rowCount - 1], L.lineH);
  const art = pos.get(world.artifact.node);
  const artBox = boxes.get(world.artifact.node);
  const leaderLine = leader ? {
    x1: Math.min(width, artBox.left + Math.max(...artBox.lines.map((s) => s.length), artBox.role.length) * L.charW + 10),
    x2: width, y: art.y,
  } : null;
  // the column heads name the two branches; each sits over its lane, its first letter on the lane's square
  const heads = [{ id: 'earth', text: 'Earth', x: E - L.node / 2, y: L.topPad + 9 }, { id: 'world', text: 'This world', x: T - L.node / 2, y: L.topPad + 9 }];
  return { width, height: Math.max(height, Math.ceil(lastY + 8)), lanes: { earth: E, side: S, trunk: T }, nodes, edges, leader: leaderLine, heads };
}

/* A branch line from a parent's square to a child's: straight down a lane, and where the lanes differ, an S-curve over
   the last LAYOUT.curve px before the child. */
function edgePath(p, c, under = 0) {
  const h = LAYOUT.node / 2;
  const y0 = p.y + h, y1 = c.y - h;
  if (p.x === c.x) return `M${p.x} ${y0} L${c.x} ${y1}`;
  const ya = turnAt(y0, y1, under);
  const ym = (ya + y1) / 2;
  return `M${p.x} ${y0} L${p.x} ${ya} C${p.x} ${ym} ${c.x} ${ym} ${c.x} ${y1}`;
}

/* Where a line between lanes starts to turn: LAYOUT.curve px above the child, and never above `under` (the foot of its
   cause's label, when it turns toward it), while leaving at least 14 px to turn in. */
function turnAt(y0, y1, under) {
  return Math.max(y0, Math.min(Math.max(y1 - LAYOUT.curve, under), y1 - 14));
}

/* The same line as points, from the parent down to the child: the brush is laid along these, and the fog's distance
   fields are measured from them. */
export function edgePoints(p, c, under = 0) {
  const h = LAYOUT.node / 2;
  const y0 = p.y + h, y1 = c.y - h;
  if (p.x === c.x) return [[p.x, y0], [c.x, y1]];
  const ya = turnAt(y0, y1, under);
  const ym = (ya + y1) / 2;
  const out = [[p.x, y0]];
  if (ya > y0) out.push([p.x, ya]);
  const n = 16;
  for (let i = 1; i <= n; i++) {   // the cubic from (p.x, ya) through (p.x, ym) and (c.x, ym) to (c.x, y1)
    const t = i / n, u = 1 - t;
    const x = u * u * u * p.x + 3 * u * u * t * p.x + 3 * u * t * t * c.x + t * t * t * c.x;
    const y = u * u * u * ya + 3 * u * u * t * ym + 3 * u * t * t * ym + t * t * t * y1;
    out.push([x, y]);
  }
  return out;
}

/* ---------------------------------------------------------------- the ignition, as a function of time

   The strand draws itself from the driver down: each line of this world's branch starts when the row of its parent
   comes (TIMING.perRow a row) and takes TIMING.edge to draw, eased out (a quintic, close to the cubic-bezier
   .16, 1, .3, 1 the plate used before). A step appears as its line reaches it. What has not happened fades in after
   the line above it. Earth's branch and the root were always there. Every frame of the drawing and of the fog is read
   from strandAt, so the tests read the same clock the visitor sees. */
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 5);

/* The ms at which the strand reaches the artifact; the render surfaces from its fog then. */
export function arrival(world, lay) {
  const artRow = lay.nodes.find((n) => n.id === world.artifact.node).row;
  return (artRow - 1) * TIMING.perRow + TIMING.edge;
}

/* When the whole ignition is over, in ms. */
export function ignitionEnd(world, lay) {
  let end = 0;
  for (const e of lay.edges) {
    const row = lay.nodes.find((n) => n.id === e.from).row;
    if (e.kind === 'fired' || e.kind === 'thread') end = Math.max(end, row * TIMING.perRow + TIMING.edge);
    if (e.kind === 'pending') end = Math.max(end, row * TIMING.perRow + 2 * TIMING.edge);
  }
  for (const n of lay.nodes) if (n.state === 'fired' || n.state === 'pending') end = Math.max(end, Math.max(0, n.row - 1) * TIMING.perRow + TIMING.edge * 0.6 + TIMING.appear);
  if (lay.leader) end = Math.max(end, arrival(world, lay) + TIMING.edge);
  return end;
}

/* The drawing at `ms` after the ignition began: each edge's progress (0 undrawn to 1 drawn; for a line that has not
   happened, its opacity), each node's opacity, and the leader's progress. */
export function strandAt(world, lay, ms) {
  const rowOf = new Map(lay.nodes.map((n) => [n.id, n.row]));
  const edges = lay.edges.map((e) => {
    const row = rowOf.get(e.from);
    if (e.kind === 'fired' || e.kind === 'thread') return easeOut((ms - row * TIMING.perRow) / TIMING.edge);
    if (e.kind === 'pending') return Math.min(1, Math.max(0, (ms - row * TIMING.perRow - TIMING.edge) / TIMING.edge));
    return 1;
  });
  const nodes = new Map(lay.nodes.map((n) => {
    if (n.state !== 'fired' && n.state !== 'pending') return [n.id, 1];
    const delay = Math.max(0, n.row - 1) * TIMING.perRow + TIMING.edge * 0.6;
    return [n.id, easeOut((ms - delay) / TIMING.appear)];
  }));
  const leader = lay.leader ? easeOut((ms - arrival(world, lay)) / TIMING.edge) : 0;
  return { edges, nodes, leader, done: ms >= ignitionEnd(world, lay) };
}

/* ---------------------------------------------------------------- the fog, as a function of state

   The fog encodes what has not happened or is not real (the world brief, _reference/labs/plans/alt-reality/
   world_brief.md). One function, fogDensity, gives its density in every cell of the drawing, for the canvas and for
   the tests:
   - around each line of this world's branch, FOG.full before the strand reaches a point of it and FOG.rest after,
     with a clear channel along the drawn ink (FOG.channel): the ink came out of the fog, and the branch is invented,
     so its fog never clears;
   - around what has not happened, FOG.pending, always;
   - Earth's branch and the root both worlds share push every fog back to 0 within FOG.earthReach: history is clear;
   - every fog thins to 0 over FOG.edge px at the drawing's edges, so the box never cuts a cloud off square.
   fogField builds, once per layout, each cell's distance to each line and how far along the line its nearest point
   is; fogDensity combines them with the strand's progress, so a frame costs one pass over the cells. */
const gauss = (d, r) => Math.exp(-(d * d) / (r * r));
/* How much of the fog history pushes back at a distance d from Earth's ink: all of it within FOG.earthClear, so a cell
   on Earth's branch holds none, then a gaussian falloff over FOG.earthReach. */
const clearing = (d) => (d <= FOG.earthClear ? 1 : gauss(d - FOG.earthClear, FOG.earthReach));
const ramp = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* The nearest point of a polyline to (x, y): its distance, and its share of the line's length from the start. */
function nearest(pts, len, x, y) {
  let best = Infinity, at = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) { best = d; at = acc + t * L; }
    acc += L;
  }
  return [best, len > 0 ? at / len : 0];
}
const lengthOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };

export function fogField(world, lay, cell = FOG.cell) {
  const cols = Math.max(1, Math.ceil(lay.width / cell)), rows = Math.max(1, Math.ceil(lay.height / cell)), N = cols * rows;
  const centre = (i) => [((i % cols) + 0.5) * cell, (Math.floor(i / cols) + 0.5) * cell];
  const lines = [], pending = new Float32Array(N), clear = new Float32Array(N), edge = new Float32Array(N);
  // how far each cell lies inside the drawing: the outermost cells hold no fog, and it comes in over FOG.edge px
  for (let i = 0; i < N; i++) {
    const [x, y] = centre(i);
    edge[i] = ramp(0, FOG.edge, Math.min(x, lay.width - x, y, lay.height - y) - cell / 2);
  }
  // each cell's distance to a line, within `reach` of the line's box (farther cells stay Infinity)
  const measure = (pts, reach, fn) => {
    const len = lengthOf(pts);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - reach) / cell)), c1 = Math.min(cols - 1, Math.ceil((Math.max(...xs) + reach) / cell));
    const r0 = Math.max(0, Math.floor((Math.min(...ys) - reach) / cell)), r1 = Math.min(rows - 1, Math.ceil((Math.max(...ys) + reach) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * cols + c, [x, y] = centre(i);
      const [d, s] = nearest(pts, len, x, y);
      fn(i, d, s);
    }
  };
  lay.edges.forEach((e, k) => {
    if (e.kind === 'fired' || e.kind === 'thread') {
      const dist = new Float32Array(N).fill(Infinity), along = new Float32Array(N);
      measure(e.pts, 3 * FOG.reach, (i, d, s) => { dist[i] = d; along[i] = s; });
      lines.push({ edge: k, dist, along });
    } else if (e.kind === 'pending') {
      // the line leaves a step that happened, so its fog thickens along it, from none at its start
      measure(e.pts, 3 * FOG.pendingReach, (i, d, s) => { pending[i] = Math.max(pending[i], FOG.pending * gauss(d, FOG.pendingReach) * ramp(0, 0.7, s)); });
    } else if (e.kind === 'earth') {
      measure(e.pts, 3 * FOG.earthReach, (i, d) => { clear[i] = Math.max(clear[i], clearing(d)); });
    }
  });
  for (const n of lay.nodes) {
    const dot = [[n.x, n.y], [n.x, n.y + 0.01]];
    if (n.state === 'pending') {
      // what has not happened is in fog with its words: the fog runs from its square across its label
      const w = Math.max(...n.label.lines.map((s) => s.length), n.label.role.length) * LAYOUT.charW;
      const x1 = n.label.anchor === 'start' ? n.label.x + w : n.label.x - w;
      const y1 = n.label.y - 10 + (n.label.lines.length + (n.label.role ? 1 : 0)) * LAYOUT.lineH / 2;
      measure([[n.x, n.y], [x1, y1]], 3 * FOG.pendingReach, (i, d) => { pending[i] = Math.max(pending[i], FOG.pending * gauss(d, FOG.pendingReach * 0.8)); });
    }
    if (n.state === 'earth' || n.state === 'root') measure(dot, 3 * FOG.earthReach, (i, d) => { clear[i] = Math.max(clear[i], clearing(d)); });
  }
  return { cols, rows, cell, lines, pending, clear, edge };
}

/* The fog's density, 0 to 1, in every cell, for the strand's progress (strandAt's edges). `out` is reused. */
export function fogDensity(field, progress, out = new Float32Array(field.cols * field.rows)) {
  const N = field.cols * field.rows;
  const P = field.lines.map((l) => (progress[l.edge] > 0 ? progress[l.edge] : -0.08));   // a line not begun is all fog
  for (let i = 0; i < N; i++) {
    let base = 0, chan = 0;
    for (let k = 0; k < field.lines.length; k++) {
      const d = field.lines[k].dist[i];
      if (d === Infinity) continue;
      const undrawn = ramp(P[k], P[k] + 0.06, field.lines[k].along[i]);
      base = Math.max(base, (FOG.rest + (FOG.full - FOG.rest) * undrawn) * gauss(d, FOG.reach));
      chan = Math.max(chan, FOG.channel * (1 - undrawn) * gauss(d, FOG.channelReach));
    }
    out[i] = Math.max(base - chan, field.pending[i], 0) * (1 - field.clear[i]) * field.edge[i];
  }
  return out;
}

/* The density at a point of the drawing, read from a field computed by fogDensity. */
export function fogAt(field, density, x, y) {
  const c = Math.min(field.cols - 1, Math.max(0, Math.floor(x / field.cell)));
  const r = Math.min(field.rows - 1, Math.max(0, Math.floor(y / field.cell)));
  return density[r * field.cols + c];
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

/* ---------------------------------------------------------------- the exercise: order these steps by what each needs

   The necessity unit, on the lineage itself. An item is EXERCISE.size steps of the world's lineage, and the visitor
   presses them in the order they must come. The check reads the parent links of the world's data and nothing else:
   a step must come after every step it needs (its parents, theirs, up to the root). Where the links leave two steps
   unordered, either order is right, so the check accepts every order the links allow and never one answer key. */

/* Every step `id` needs: the nodes it grows from, and theirs, up to the root. */
export function needsOf(world, id) {
  const ids = byId(world);
  const out = new Set();
  const todo = [...((ids.get(id) || {}).after || [])];
  while (todo.length) {
    const a = todo.shift();
    if (out.has(a) || !ids.has(a)) continue;
    out.add(a);
    todo.push(...ids.get(a).after);
  }
  return out;
}

/* The links from step `a` up to a step it needs, `b`: [a, ..., b], each one a node the one before it grows from. The
   shortest such chain, a first parent before a second on a tie. Null when `a` does not need `b`. */
export function needPath(world, a, b) {
  const ids = byId(world);
  if (!ids.has(a) || !ids.has(b) || a === b) return null;
  const prev = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const id = queue.shift();
    for (const p of ids.get(id).after) {
      if (prev.has(p)) continue;
      prev.set(p, id);
      if (p === b) {
        const path = [b];
        for (let at = id; at !== null; at = prev.get(at)) path.unshift(at);
        return path;
      }
      queue.push(p);
    }
  }
  return null;
}

/* The sets the exercise draws from, in the data's order: every EXERCISE.size nodes of the lineage among which at most
   EXERCISE.free pairs are left unordered by the links. A set of steps with no order to find is never an item. */
export function itemSets(world, size = EXERCISE.size, free = EXERCISE.free) {
  const ids = world.nodes.map((n) => n.id);
  const need = new Map(ids.map((id) => [id, needsOf(world, id)]));
  const ordered = (a, b) => need.get(a).has(b) || need.get(b).has(a);
  const out = [];
  const pick = [];
  const walk = (from) => {
    if (pick.length === size) {
      let loose = 0;
      for (let i = 0; i < size; i++) for (let j = i + 1; j < size; j++) if (!ordered(pick[i], pick[j])) loose++;
      if (loose <= free) out.push(pick.slice());
      return;
    }
    for (let k = from; k <= ids.length - (size - pick.length); k++) { pick.push(ids[k]); walk(k + 1); pick.pop(); }
  };
  walk(0);
  return out;
}

/* The sets, once per world: a draw is made again on every press. */
const setsMemo = new WeakMap();
function setsOf(world) {
  let s = setsMemo.get(world);
  if (!s) {
    const sets = itemSets(world);
    s = { sets, deal: shuffle(sets.map((_, i) => i), mulberry32(seedOf('orthogonal', world.id, 'deal'))) };
    setsMemo.set(world, s);
  }
  return s;
}

/* A draw of item `index` (a whole number from 0) for an attempt's `seed`: its steps, in the order they are shown. The
   sets are dealt in an order seeded by the world, so no set comes back before every set has come once. The steps are
   shuffled by a generator seeded by the item and the seed, and the seed is the record's attempt counter (record.js
   withStart), one more for every order started: the same four steps come in new places on each attempt, and an order
   in progress, which keeps its seed, is drawn again as it was after a reload. Every order of the four is as likely,
   the right ones included, so no fixed way of pressing (top to bottom, any one pattern of places, the last answer's)
   is right more often than pressing at random: tests.mjs measures each (hub lesson L17). */
export function item(world, index, seed) {
  const { sets, deal } = setsOf(world);
  if (!sets.length || !Number.isInteger(index) || index < 0 || !Number.isInteger(seed) || seed < 0) return null;
  const rng = mulberry32(seedOf('orthogonal', world.id, 'draw', index, seed));
  return { index, seed, steps: shuffle(sets[deal[index % sets.length]], rng) };
}

/* The steps of an order in progress (the record's open: its item and its seed), drawn again; null when it is none. */
export function stepsOf(world, open) {
  const it = open ? item(world, open.item, open.seed) : null;
  return it ? it.steps : null;
}

/* The check as the record keeps it: right or not, and when not, the pair out of order (the step, what it needs). */
export function judge(world, order) {
  const r = checkOrder(world, order);
  return { right: r.right, needs: r.pair ? [r.pair.step, r.pair.needs] : null };
}

/* The check, against the parent links. Right when no step comes before a step it needs. When wrong: the first step,
   in the visitor's order, that comes before something it needs, and of what it needs that comes after it, the one
   fewest links away, with those links ([step, ..., needed]). An order that is not a list of distinct steps of the
   world is refused, never marked. */
export function checkOrder(world, order) {
  const ids = byId(world);
  if (!Array.isArray(order) || !order.length || new Set(order).size !== order.length || order.some((id) => !ids.has(id))) {
    return { right: false, pair: null, refused: 'an order is a list of distinct steps of this world' };
  }
  for (let i = 0; i < order.length; i++) {
    let best = null;
    for (let j = i + 1; j < order.length; j++) {
      const path = needPath(world, order[i], order[j]);
      if (path && (!best || path.length < best.length)) best = path;
    }
    if (best) return { right: false, pair: { step: order[i], needs: best[best.length - 1], path: best } };
  }
  return { right: true, pair: null };
}

/* The verb of every sentence that says what a step needs. A seed of trouble does not need the success that plants it;
   it grows from it, and is said so. */
export const needVerb = (n) => (n.role === 'trouble' ? 'grows from' : 'needs');

/* The links that order a pair, in words: "Fungi farmed needs Fungi eat lignin", then ", which needs ..." for each step
   between them. */
export function needLine(world, path) {
  const ids = byId(world);
  const label = (id) => ids.get(id).label;
  const verb = (id) => needVerb(ids.get(id));
  let s = `${label(path[0])} ${verb(path[0])} ${label(path[1])}`;
  for (let k = 2; k < path.length; k++) s += `, which ${verb(path[k - 1])} ${label(path[k])}`;
  return s;
}

/* Every reason a wrong order of an item can be given in this world, once each: the links checkOrder names for every
   order of every set. The page reserves the footer's height for the tallest of these, not for the longest chain of
   the lineage, which no item of four steps can show. */
export function reasons(world) {
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
  const out = new Set();
  for (const set of setsOf(world).sets) for (const o of perms(set)) {
    const r = checkOrder(world, o);
    if (!r.right) out.add(needLine(world, r.pair.path));
  }
  return [...out];
}

/* Where the steps of an item stand while they are ordered: out of their rows, one to a slot down the drawing in the
   order the item shows them, each on its own lane with its words as the lineage set them and what it needs under them
   in place of its role, so the rows give nothing away and the words give the reasons. Each step's shift down the
   drawing (dy) and its slot. */
export function drillPlaces(lay, steps) {
  const top0 = LAYOUT.topPad + LAYOUT.headH;
  const nodes = steps.map((id) => lay.nodes.find((x) => x.id === id));
  // each step takes the height of its words and what it needs (never less than its 44 px target less the 8 px the
  // target reaches past the words), and the room left over is shared as equal gaps, half a gap above the first and
  // below the last: a step that says more takes more of the drawing, and none runs into the next
  const block = nodes.map((n) => Math.max(36, (n.label.lines.length + n.label.needs.length) * LAYOUT.lineH));
  const gap = Math.max(0, (lay.height - top0 - 4 - block.reduce((a, b) => a + b, 0)) / steps.length);
  const out = new Map();
  let top = top0 + gap / 2;
  nodes.forEach((n, k) => {
    out.set(n.id, { dy: top - (n.y - LAYOUT.node / 2), slot: k });
    top += block[k] + gap;
  });
  return out;
}

/* A step's square and words as one box, moved down by dy: its label and role line, or with `drill`, its label and what
   it needs, as it stands while an order is given. */
export function stepBox(n, dy = 0, drill = false) {
  const under = drill ? n.label.needs : (n.label.role ? [n.label.role] : []);
  const w = Math.max(...n.label.lines.map((s) => s.length), ...under.map((s) => s.length)) * LAYOUT.charW;
  const h = (n.label.lines.length + under.length) * LAYOUT.lineH;
  const lx0 = n.label.anchor === 'start' ? n.label.x : n.label.x - w;
  return {
    x0: Math.min(n.x - LAYOUT.node / 2, lx0), x1: Math.max(n.x + LAYOUT.node / 2, lx0 + w),
    y0: Math.min(n.y - LAYOUT.node / 2, n.label.y - 10) + dy, y1: Math.max(n.y + LAYOUT.node / 2, n.label.y - 10 + h) + dy,
  };
}

/* The fog while an order is being given: the fog of the lineage before the strand drew it (fogDensity at the clock's
   0, the branch in full fog), because while the visitor orders the steps the links are not known again; and clear
   about each step being ordered, where it stands (drillPlaces). */
export function drillFog(world, lay, places, field) {
  const N = field.cols * field.rows;
  const out = fogDensity(field, strandAt(world, lay, 0).edges);
  const boxes = [...places].map(([id, p]) => stepBox(lay.nodes.find((x) => x.id === id), p.dy, true));
  for (let i = 0; i < N; i++) {
    if (!out[i]) continue;
    const x = ((i % field.cols) + 0.5) * field.cell, y = (Math.floor(i / field.cols) + 0.5) * field.cell;
    let c = 0;
    for (const b of boxes) {
      const d = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
      c = Math.max(c, d <= FOG.drillClear ? 1 : gauss(d - FOG.drillClear, FOG.drillReach));
    }
    out[i] *= 1 - c;
  }
  return out;
}

/* ---------------------------------------------------------------- gold, for a page state

   Whether the strand (the branch this world took, its steps and the leader to the render) is drawn gold, for a page
   state ({ mode }: 'read', 'order' or 'checked'). Gold marks what fired, so it is gold in the reading. While an order
   is given its lines are in fog, and gold on the steps would say which are on the branch; once an order is checked the
   verdict is the one decision on the drawing, so the strand is ink. The drawing and the legend's sample both read this
   one function (main.js paintGold), so the legend never shows a gold the drawing does not. */
export const strandGold = (state) => !!state && state.mode === 'read';
