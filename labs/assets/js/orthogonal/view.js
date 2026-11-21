/* ============================================================
   orthogonal/view.js: the Orthogonal plate's drawing.

   Material and motion (Contact: ink in fog; the world brief is
   _reference/labs/plans/alt-reality/world_brief.md).

   The plate is one drawing of one world. Its focal living element
   is the gold strand of the lineage, the branch this world took,
   grown from its changed driver down to the artifact at its tip.
   The artifact itself is a render of glowing fungus in fog, the
   world's own material, photographed as a long exposure records
   such light. Everything else is ink on the dark ground.

   Every mark is computed from the world's data (engine.js layout):
   a node's square sits on its lane and its row, a line runs only
   where a node grows from another, and a row holds the two steps,
   this world's and Earth's, that do the same job. Each line is a
   brush stroke (kit/brush.js) that lands wide at its cause and
   lifts to a point at its effect, so the drawing reads in the
   order things happened; its bristles, swell and wobble are seeded
   by the ids of the two steps it joins, so a refresh draws the same
   picture. Gold marks only what fired: the driver, the steps the
   artifact grew from and the threads that met in them.

   The fog is bound to state (engine.js fogDensity): it stands where
   the drawing is not real or has not happened. Earth's branch is
   history and is drawn in clear ink, with no fog within reach of
   it. This world's branch is invented: it condenses out of fog as
   it draws, and keeps a thin fog with a clear channel along its
   ink. The seed of trouble below the artifact stays in its fog.

   The one move that must land: on load the gold strand descends row
   by row from the driver, the fog it passes through condensing into
   it, and when it reaches the artifact the fog over the render
   lifts. At rest the fog drifts slowly where it stands and nowhere
   else (orthogonal/fogview.js, a Labs OS scene: paused off screen
   and in a hidden tab). prefers-reduced-motion and ?still get the
   finished frame at once, the fog still.

   Choosing a node (pointer, or the arrow keys inside the drawing)
   rings it in cold ink, rings the node on the other branch at the
   same step, joins the two with a dotted rule across the row, and
   writes the node's reading into the evidence footer, each claim
   tagged [REAL] with its source or [ILLUSTRATIVE].
   ============================================================ */
import { brushStroke } from '../kit/brush.js';
import { seedOf } from '../kit/rng.js';
import { INK, LAYOUT } from './config.js';
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
  for (const h of lay.heads) {
    const t = svgEl('text', { x: r1(h.x), y: r1(h.y), class: 'head-t', 'data-head': h.id }, svg);
    t.textContent = h.text;
  }
  const defs = svgEl('defs', {}, svg);
  const rowRule = svgEl('line', { class: 'pair-rule', x1: 0, x2: 0, y1: 0, y2: 0 }, svg);
  const gEdges = svgEl('g', { class: 'edges' }, svg);
  const reveals = [];
  lay.edges.forEach((e, i) => {
    const row = lay.nodes.find((n) => n.id === e.from).row;
    const g = svgEl('g', { class: `edge ${e.kind}`, 'data-row': row, 'data-from': e.from, 'data-to': e.to, 'data-p': 1 }, gEdges);
    // a brush stroke from the cause down to the effect, seeded by the two steps it joins. It is laid 5 px into both
    // squares, under them, so its blot sits in its cause and its tip reaches its effect's edge.
    const pts = [[e.pts[0][0], e.pts[0][1] - 5], ...e.pts, [e.pts[e.pts.length - 1][0], e.pts[e.pts.length - 1][1] + 5]];
    const { paths, alphas, blot } = brushStroke(pts, { width: INK[e.kind], seed: seedOf('orthogonal', e.from, e.to) });
    if (blot) svgEl('path', { d: blot, class: 'blot' }, g);
    paths.forEach((d, k) => svgEl('path', { d, 'fill-opacity': alphas[k] }, g));
    if (e.kind === 'fired' || e.kind === 'thread') {
      // the strand draws itself through a mask: a line along the stroke's centre, its dash run out as it draws
      const id = `orth-ink-${i}`;
      const m = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -20, y: -20, width: width + 40, height: lay.height + 40 }, defs);
      const line = svgEl('path', { d: `M${pts.map((q) => `${r1(q[0])} ${r1(q[1])}`).join(' L')}`, fill: 'none', stroke: '#fff', 'stroke-width': r1(INK[e.kind] * 2 + 4), 'stroke-linecap': 'round' }, m);
      const len = line.getTotalLength ? line.getTotalLength() : 0;
      line.setAttribute('stroke-dasharray', `${r1(len + 6)} ${r1(len + 6)}`);
      g.setAttribute('mask', `url(#${id})`);
      reveals[i] = { g, line, len: len + 6 };
    } else reveals[i] = { g, line: null, len: 0 };
  });
  if (lay.leader) {
    const leader = svgEl('line', { class: 'leader', x1: r1(lay.leader.x1), x2: lay.leader.x2, y1: r1(lay.leader.y), y2: r1(lay.leader.y), 'data-row': lay.nodes.find((n) => n.id === world.artifact.node).row }, svg);
    const len = lay.leader.x2 - lay.leader.x1;
    leader.setAttribute('stroke-dasharray', `${r1(len + 1)} ${r1(len + 1)}`);
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
  svg.__reveals = reveals;
  return { lay, groups };
}

/* One frame of the ignition (engine.js strandAt): each stroke drawn as far as the strand has come, each step as
   visible as it is, what has not happened faded in after the line above it, the leader last. The rule across a chosen
   row waits for the strand, since it joins two steps and one of them may not be drawn yet. Each stroke's progress is
   written on it (data-p), so a drive reads what the visitor sees. */
export function applyStrand(svg, frame, groups) {
  const lay = svg.__lay;
  svg.__reveals.forEach((r, i) => {
    const p = frame.edges[i];
    r.g.setAttribute('data-p', String(Math.round(p * 1000) / 1000));
    if (r.line) r.line.setAttribute('stroke-dashoffset', String(r1(r.len * (1 - p))));
    else if (r.g.classList.contains('pending')) r.g.style.opacity = p >= 1 ? '' : String(Math.round(p * 1000) / 1000);
  });
  // a step the strand has not reached stands in the fog as a faint square with no words; when the line reaches it, its
  // square and its words come in (a CSS transition, orthogonal.css .unreached, so a reader of contrast measures the
  // words once they have arrived, not mid-fade)
  for (const n of lay.nodes) {
    const g = groups.get(n.id), o = frame.nodes.get(n.id);
    if (g) g.classList.toggle('unreached', o <= 0);
  }
  const leader = svg.querySelector('.leader');
  if (leader) {
    const len = lay.leader.x2 - lay.leader.x1;
    leader.setAttribute('stroke-dashoffset', String(r1((len + 1) * (1 - frame.leader))));
  }
  svg.__rowRule.classList.toggle('held', !frame.done);
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
  head.append(make('b', 'rd-label', r.label), make('span', 'rd-sep', ' · '), make('span', 'rd-role', r.role));
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

/* A viewBox (in the drawing's own units, y down) that puts `top` and `ground` on the frame's two lines (shares of its
   height from the top: where render_artifact.py put the instrument's top and foot, held in the world's data and checked
   against the render's record by tests.mjs) of a box `aspect` wide for each unit of height, centred on x = cx. So
   Earth's lamp and the ink drawing stand on the render's ground. */
function frameBox(frame, top, ground, aspect, cx) {
  const h = (ground - top) / (frame.ground - frame.top);
  const y0 = top - frame.top * h;
  const w = h * aspect;
  return `${r1k(cx - w / 2)} ${r1k(y0)} ${r1k(w)} ${r1k(h)}`;
}
const r1k = (v) => Math.round(v * 1000) / 1000;

/* The ghost of Earth's artifact: a coal-gas street lamp in faint ink, standing on the render's ground line and as tall
   as the render's lamp. [ILLUSTRATIVE] The outline is a common form of the lamp, drawn from general knowledge; no
   measured drawing was opened, and the two lamps are not to one scale. */
export function drawEarthLamp(svg, supply, frame) {
  svg.replaceChildren();
  svg.setAttribute('viewBox', frameBox(frame, 2, 316, 180 / 338, 100));
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
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
  p('M-40 316 L240 316', 'ground');                              // the street, on the render's ground line
  p('M-40 323 L240 323', 'main');                                // the gas main under the street
  p('M100 316 L100 323');
  if (supply) {
    const view = svg.parentElement;
    let tag = view.querySelector('.earth-main');
    if (!tag) { tag = document.createElement('span'); tag.className = 'earth-main'; view.appendChild(tag); }
    tag.textContent = supply;
  }
}

/* The artifact in ink, computed from its parameter file: an elevation of the shelf-culture lamp (plinth, glass column,
   spindle, brim, louvers, finial, flask) with its front caps as fans on alternate sides, for when the render does not
   load. [ILLUSTRATIVE] An outline from the same numbers the render was built from, not the render. */
export function drawArtifactInk(svg, P, frame) {
  const I = P.instrument, C = P.culture;
  const ph = I.plinth_height_m, pr = I.column_radius_m + I.plinth_overhang_m, cr = I.column_radius_m, ch = I.column_height_m;
  const top = ph + ch, br = cr + I.brim_overhang_m, kh = br / 0.43;
  const hoodTop = Math.max(...I.louvers.map((l) => l[1]));
  const finial = top + hoodTop + 0.12;
  svg.replaceChildren();
  svg.setAttribute('viewBox', frameBox(frame, -(finial + 0.055), 0, P.render.width / P.render.height, 0));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const add = (tag, a, cls) => svgEl(tag, cls ? { ...a, class: cls } : a, svg);
  const n = (v) => r1k(v);
  add('line', { x1: n(-1.2), x2: n(1.2), y1: 0, y2: 0 });                                            // the ground
  add('rect', { x: n(-pr), y: n(-ph), width: n(2 * pr), height: n(ph) });                             // the plinth
  add('rect', { x: n(-cr), y: n(-top), width: n(2 * cr), height: n(ch) }, 'glass');                   // the glass column
  add('line', { x1: 0, x2: 0, y1: n(-ph), y2: n(-top) });                                             // the spindle
  add('rect', { x: n(-br), y: n(-(top + 0.035)), width: n(2 * br), height: 0.035 });                  // the brim
  // the louvered hood as one stepped profile: each louver a slat across, its ends joined up the hood's two sides
  const lv = [...I.louvers].sort((a, b) => a[1] - b[1]).map(([rr, dz]) => [rr * kh + 0.026, top + dz]);
  const side = (s) => lv.map(([rr, z], k) => `${k ? 'L' : 'M'}${n(s * rr)} ${n(-z)}`).join(' ');
  add('path', { d: `${side(-1)} M${side(1).slice(1)}` });
  for (const [rr, z] of lv) add('line', { x1: n(-rr), x2: n(rr), y1: n(-z), y2: n(-z) });
  add('circle', { cx: 0, cy: n(-finial), r: 0.055 });                                                 // the finial
  if (I.flask_radius_m > 0) {
    const fx = pr + I.flask_radius_m + 0.02;
    add('circle', { cx: n(fx), cy: n(-(ph + 0.14)), r: n(I.flask_radius_m) }, 'glass');                // the flask
    add('line', { x1: n(cr), x2: n(fx - I.flask_radius_m), y1: n(-(ph + 0.14)), y2: n(-(ph + 0.14)) });
  }
  const R = (C.front_radius_m[0] + C.front_radius_m[1]) / 2, sr = I.spindle_radius_m;
  const lo = ph + C.floor_m, hi = top - C.ceiling_m;
  for (let i = 0; i < C.front_caps; i++) {
    const z = C.front_caps > 1 ? lo + (hi - lo) * i / (C.front_caps - 1) : (lo + hi) / 2;
    const s = i % 2 === 0 ? -1 : 1;
    const fan = `M${n(s * sr)} ${n(-z)} C${n(s * R * 0.3)} ${n(-(z + R * 0.3))} ${n(s * R * 0.9)} ${n(-(z + R * 0.2))} ${n(s * R)} ${n(-(z + 0.02))}`
      + ` C${n(s * R * 0.85)} ${n(-(z - R * 0.12))} ${n(s * R * 0.3)} ${n(-(z - R * 0.1))} ${n(s * sr)} ${n(-(z - 0.01))} Z`;
    add('path', { d: fan }, 'cap');
    for (const k of [0.4, 0.55, 0.7, 0.85]) {                                                         // gills under it
      add('line', { x1: n(s * sr * 2), y1: n(-(z - 0.005)), x2: n(s * R * k), y2: n(-(z - R * 0.1 * Math.sin(Math.PI * k))) }, 'cap');
    }
  }
}
