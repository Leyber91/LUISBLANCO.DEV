/* ============================================================
   orthogonal/view.js: the Orthogonal plate's drawing.

   Material and motion (Contact: ink in fog).

   The plate is one drawing of one world. Its focal living element
   is the gold strand of the lineage, the branch this world took,
   grown from its changed driver down to the artifact at its tip.
   The artifact itself is a render of glowing fungus in fog, the
   world's own material: everything else on the plate is ink on
   the dark ground, and stays quiet around those two.

   Every mark is computed from the world's data (engine.js layout):
   a node's square sits on its lane and its row, a line runs only
   where a node grows from another, and a row holds the two steps,
   this world's and Earth's, that do the same job. Gold marks only
   what fired: the driver, the steps the artifact grew from and the
   threads that met in them. Earth's branch is the ghost beside it,
   dotted in faint ink; the step after the artifact, the seed of
   the next era's trouble, is dashed because it has not happened.

   The one move that must land: on load the gold strand draws itself
   row by row from the driver down, and when it reaches the artifact
   the render surfaces out of the fog (opacity and a blur that
   settle), as ink blooms and settles. Then nothing moves; the plate
   at rest is the finished drawing. prefers-reduced-motion and ?still
   get that finished frame at once.

   Choosing a node (pointer, or the arrow keys inside the drawing)
   rings it in cold ink, rings the node on the other branch at the
   same step, joins the two with a dotted rule across the row, and
   writes the node's reading into the evidence footer, each claim
   tagged [REAL] with its source or [ILLUSTRATIVE].
   ============================================================ */
import { LAYOUT, TIMING } from './config.js';
import { layout, pairOf, reading } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent = null) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
};
const r1 = (v) => Math.round(v * 10) / 10;

/* Draw the lineage into `svg` for a box `width` x `height` (0: its natural height). Returns the layout and a map from
   node id to its <g>. */
export function drawLineage(svg, world, { width, height, leader }) {
  const lay = layout(world, { width, height, leader });
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${lay.height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(lay.height));
  const rowRule = svgEl('line', { class: 'pair-rule', x1: 0, x2: 0, y1: 0, y2: 0 }, svg);
  const gEdges = svgEl('g', { class: 'edges' }, svg);
  for (const e of lay.edges) {
    const row = lay.nodes.find((n) => n.id === e.from).row;
    svgEl('path', { d: e.d, class: `edge ${e.kind}`, 'data-row': row, 'data-to': e.to }, gEdges);
  }
  if (lay.leader) {
    svgEl('line', { class: 'leader', x1: r1(lay.leader.x1), x2: lay.leader.x2, y1: r1(lay.leader.y), y2: r1(lay.leader.y), 'data-row': lay.nodes.find((n) => n.id === world.artifact.node).row }, svg);
  }
  const gNodes = svgEl('g', { class: 'nodes' }, svg);
  const groups = new Map();
  const h = LAYOUT.node / 2;
  for (const n of lay.nodes) {
    const r = reading(world, n.id);
    const g = svgEl('g', {
      class: `node ${n.state} role-${n.role}`, 'data-id': n.id, 'data-row': n.row, role: 'button', tabindex: -1,
      'aria-pressed': 'false', 'aria-label': `${r.role}: ${r.label}`,
    }, gNodes);
    svgEl('rect', { class: 'hit', x: r1(n.hit.x), y: r1(n.hit.y), width: r1(n.hit.w), height: r1(n.hit.h) }, g);
    svgEl('rect', { class: 'ring', x: n.x - h - 4, y: r1(n.y - h - 4), width: LAYOUT.node + 8, height: LAYOUT.node + 8 }, g);
    svgEl('rect', { class: 'sq', x: n.x - h, y: r1(n.y - h), width: LAYOUT.node, height: LAYOUT.node }, g);
    const t = svgEl('text', { x: r1(n.label.x), y: r1(n.label.y), 'text-anchor': n.label.anchor, class: 'lbl' }, g);
    n.label.lines.forEach((line, i) => {
      const s = svgEl('tspan', { x: r1(n.label.x), dy: i ? LAYOUT.lineH : 0 }, t);
      s.textContent = line;
    });
    if (n.label.role) {
      const s = svgEl('tspan', { x: r1(n.label.x), dy: LAYOUT.lineH, class: 'role' }, t);
      s.textContent = n.label.role;
    }
    groups.set(n.id, g);
  }
  svg.__lay = lay;
  svg.__rowRule = rowRule;
  return { lay, groups };
}

/* Mark `id` as chosen: its ring, its pair's ring, the dotted rule across their row, the roving tab stop. */
export function markChosen(svg, world, groups, id) {
  const pair = pairOf(world, id);
  for (const [nid, g] of groups) {
    g.classList.toggle('chosen', nid === id);
    g.classList.toggle('paired', nid === pair);
    g.setAttribute('aria-pressed', nid === id ? 'true' : 'false');
    g.setAttribute('tabindex', nid === id ? '0' : '-1');
  }
  const rule = svg.__rowRule;
  const a = svg.__lay.nodes.find((n) => n.id === id);
  const b = pair ? svg.__lay.nodes.find((n) => n.id === pair) : null;
  if (a && b) {
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    // the rule starts after the left node's first label line, so it never runs through its words
    const start = l.label.anchor === 'start' ? l.label.x + l.label.lines[0].length * LAYOUT.charW + 8 : l.x + LAYOUT.node;
    rule.setAttribute('x1', String(r1(start)));
    rule.setAttribute('x2', String(r.x - LAYOUT.node));
    rule.setAttribute('y1', String(r1(a.y)));
    rule.setAttribute('y2', String(r1(a.y)));
    rule.classList.add('on');
  } else rule.classList.remove('on');
}

/* The ignition: each fired line draws from its parent's row down, in row order; nodes appear as their line reaches them.
   Returns the ms at which the line reaches the artifact. */
export function ignite(svg, world) {
  const lay = svg.__lay;
  const artRow = lay.nodes.find((n) => n.id === world.artifact.node).row;
  const ease = 'cubic-bezier(.16, 1, .3, 1)';
  for (const p of svg.querySelectorAll('.edge.fired, .edge.thread, .leader')) {
    const len = p.getTotalLength();
    const delay = Number(p.getAttribute('data-row')) * TIMING.perRow + (p.classList.contains('leader') ? TIMING.edge : 0);
    p.style.strokeDasharray = `${r1(len + 1)}px ${r1(len + 1)}px`;
    // fill backwards: the line is undrawn through its delay, and drawn from its parent down once the delay ends
    p.animate([{ strokeDashoffset: `${r1(len + 1)}px` }, { strokeDashoffset: '0px' }], { duration: TIMING.edge, delay, easing: ease, fill: 'backwards' });
  }
  for (const p of svg.querySelectorAll('.edge.pending')) {
    p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TIMING.edge, delay: Number(p.getAttribute('data-row')) * TIMING.perRow + TIMING.edge, fill: 'backwards' });
  }
  for (const g of svg.querySelectorAll('.node.fired, .node.pending')) {
    const delay = Math.max(0, Number(g.getAttribute('data-row')) - 1) * TIMING.perRow + TIMING.edge * 0.6;
    g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay, easing: ease, fill: 'backwards' });
  }
  const arrive = (artRow - 1) * TIMING.perRow + TIMING.edge;
  // the rule across the chosen row waits for the strand: it joins two steps, and one of them is not drawn before
  if (svg.__rowRule.classList.contains('on')) svg.__rowRule.animate([{ opacity: 0 }, { opacity: 0.8 }], { duration: 360, delay: arrive, fill: 'backwards' });
  return arrive;
}

/* End what ignite started, so a redraw or a resize mid-ignition shows the finished frame. */
export function settle(svg) {
  for (const a of svg.getAnimations({ subtree: true })) a.finish();
}

/* The reading of node `id`, written into `root` as text (never as markup). */
export function writeReading(root, world, id) {
  const r = reading(world, id);
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const head = make('p', 'rd-head');
  head.append(make('span', 'rd-role', r.role), make('span', 'rd-sep', ' · '), make('b', 'rd-label', r.label));
  const note = make('p', 'rd-note', r.note);
  const parts = [head, note];
  if (r.beside) {
    const b = make('p', 'rd-beside');
    b.append(make('span', null, `${r.beside.side}: `), make('span', 'rd-pair', r.beside.label));
    parts.push(b);
  }
  const list = make('ul', 'rd-evidence');
  for (const e of r.evidence) {
    const li = make('li');
    li.append(make('b', `t ${e.tag === 'REAL' ? 'real' : 'ill'}`, `[${e.tag}]`), document.createTextNode(` ${e.text}`));
    if (e.source) li.append(document.createTextNode(' '), make('cite', null, e.source + '.'));
    if (e.gap) li.append(document.createTextNode(' '), make('span', 'rd-gap', e.gap));
    list.append(li);
  }
  parts.push(list);
  root.replaceChildren(...parts);
  root.dataset.node = id;
}

/* The ghost of Earth's artifact: a coal-gas street lamp in faint ink, drawn into a 200 x 320 box. [ILLUSTRATIVE] The
   outline is a common form of the lamp, drawn from general knowledge; no measured drawing was opened. */
export function drawEarthLamp(svg) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', '0 0 200 330');
  const g = svgEl('g', { class: 'ghost' }, svg);
  const p = (d, cls = '') => svgEl('path', { d, class: cls }, g);
  p('M50 60 L150 60 L135 155 L65 155 Z');                       // the glazed lantern
  p('M40 60 L100 18 L160 60');                                   // its roof
  p('M100 2 L100 18');                                           // the finial
  p('M68 60 L78 155 M132 60 L122 155');                          // the glazing bars
  p('M60 155 L140 155 L132 172 L68 172 Z');                      // the lantern's foot
  p('M100 136 C92 126 94 112 100 102 C106 112 108 126 100 136 Z', 'flame');   // the gas jet
  p('M94 172 L90 290 M106 172 L110 290');                        // the post
  p('M60 230 L140 230');                                         // the ladder bar
  p('M76 290 L124 290 L132 316 L68 316 Z');                      // the base
  p('M0 326 L200 326', 'main');                                  // the gas main under the street
  p('M100 316 L100 326');
}
