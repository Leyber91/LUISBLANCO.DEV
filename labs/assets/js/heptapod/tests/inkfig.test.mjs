/* ============================================================
   heptapod/tests/inkfig.test.mjs — the inked ring figure (film track
   F4-ink, topo/inkfig.js).

     node labs/assets/js/heptapod/tests/inkfig.test.mjs

   The independent review of 2026-11-17 found the first version of this
   test restating the code's own counters (7 of 8 mutants survived).
   Each check below reads the raster, or the graph, by a route of its
   own:
   1. inkfig.js and every seeded module it calls (trig.js, topo/rng.js,
      kit/rng.js) call no engine-approximated function and no
      Math.random (BAR_F G5), read from source with comments removed.
   2. On 15 random texts of 1 to 5 clauses with clause sizes of 4 to 9
      nodes (none may fail), at 900 px:
      a. the graph: one filament drawn per node joined to a main event
         in its clause, one drop per entity that is not a main event,
         and NODE_DEG per node of each clause, squeezed by one factor
         at most 1; the masses partition the clauses, number at most
         MASS_MAX, keep clauses sharing a referent together and cover at
         most MASS_ARC;
      b. the gap: the detail suite (ring.js) reads a main gap of at
         least half of GAP_DEG on the raster, and the middle 60% of the
         drawn gap holds no ink in the carrier band (also on 4 texts of
         5 large clauses, where strokes reach furthest);
      c. the pools where the figure says: along the radius through each
         pool's middle half the deepest run of ink is at least 0.13 R,
         at least the carrier's widest (W_RING times 1.45; with 0.3.1 they
         are equal, so a mirrored figure is caught here only where the
         carrier is narrower, and always by the empty gap band of b2) (a mirrored or
         turned figure);
      d. the side: pooled over the texts, the share of filaments the
         suite (filaments.js) reads as pointing outward is within 0.2
         of the share drawn outward, and some are read inward;
      e. the drops: pooled, the suite reads at least 30% as many
         bulb-tipped filaments as drops drawn (at 1500 px).
   3. The order rule, placed again here from I8's text for every cyclic
      order of the masses of texts of 4 and 5 clauses of unequal sizes:
      none puts the centre of mass nearer the centre than the drawn one.
   4. The same text gives the same bytes; a copy with fresh node ids in
      another order gives the same bytes.
   Not caught (mutants, 2026-11-17): a constant role angle (the angle
   is read by the reader of an inked figure, the next slice); strokes
   unclipped at the gap, equivalent under MASS_ARC (0 ink in the gap
   band on 40 texts with the clip removed), kept as a guard.
   Exits 1 on any failure, and on a run that drew nothing (G2).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, fnv1a } from '../topo/rng.js';
import { permuteGraph } from '../topo/hmr.js';
import { sinK, cosK, PI } from '../topo/trig.js';
import { clausesOf, randomText } from '../topo/figure.js';
import { INK, inkFigure } from '../topo/inkfig.js';
import { ringTable } from '../detail/ring.js';
import { filaments } from '../detail/filaments.js';

let checks = 0, failures = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.log('FAIL ' + what); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const S = 900;
const DEG = PI / 180;

/* 1. G5 */
{
  const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt|random)\b|\*\*/;
  const strip = (f) => fs.readFileSync(path.join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const f of ['../topo/inkfig.js', '../topo/trig.js', '../topo/rng.js', '../topo/code.js']) {
    const m = strip(f).match(banned);
    ok(!m, `G5: ${f} calls ${m ? m[0] : ''}`);
  }
  // of the kit's generators, the path calls mulberry32 and fnv1a only (its normalFrom takes a logarithm, off the path)
  const kit = strip('../../kit/rng.js');
  for (const fn of ['mulberry32', 'fnv1a']) {
    const i = kit.indexOf(`export function ${fn}(`), j = kit.indexOf('export ', i + 1);
    const m = i < 0 ? null : kit.slice(i, j < 0 ? undefined : j).match(banned);
    ok(i >= 0 && !m, `G5: kit/rng.js ${fn} ${i < 0 ? 'not found' : 'calls ' + (m ? m[0] : '')}`);
  }
}

/* 2. the raster against the graph */
const sizes = [4, 9, 6, 5, 8, 7];
const texts = [];
for (let i = 0; i < 15; i++) texts.push(randomText(mulberry32(900 + i), 1 + (i % 5), sizes.slice(i % 6).concat(sizes.slice(0, i % 6))));
let drawn = 0, outDrawn = 0, filDrawn = 0, outRead = 0, inRead = 0, filRead = 0, dropsDrawn = 0;
for (const [i, g] of texts.entries()) {
  const f = inkFigure(g, { S });
  ok(f.ok, `text ${i}: ${f.reason}`);
  if (!f.ok) continue;
  drawn++;
  const { cg, mains, member, origo } = clausesOf(g);
  const isMain = new Set(mains);
  let fil = 0, ent = 0;
  for (const m of mains) {
    const nb = new Set();
    for (const e of cg.edges) {
      const w = e.h === m ? e.d : e.d === m ? e.h : -1;
      if (w >= 0 && w !== origo && member[w] === member[m]) nb.add(w);
    }
    fil += nb.size;
  }
  for (let v = 0; v < cg.n; v++) if (v !== origo && !isMain.has(v) && cg.nodes[v].k === 'entity') ent++;
  ok(f.filamentsDrawn === fil, `text ${i}: ${f.filamentsDrawn} filaments drawn, ${fil} nodes joined to a main event in its clause`);
  ok(f.bulbs === ent, `text ${i}: ${f.bulbs} drops drawn, ${ent} entities that are not main events`);
  // spans: NODE_DEG per node of the clause, counted here from the graph, all squeezed by one factor at most 1
  const want = mains.map((m) => { let n = 0; for (let v = 0; v < cg.n; v++) if (v !== origo && member[v] === member[m]) n++; return INK.NODE_DEG * n; }).sort((x, y) => x - y);
  const got = f.spansDeg.slice().sort((x, y) => x - y);
  const fac = got[0] / want[0];
  ok(fac <= 1 + 1e-9 && got.every((x, j) => Math.abs(x - want[j] * fac) < 0.02), `text ${i}: spans ${got.join(' ')} against ${want.join(' ')} times one factor at most 1 (${fac.toFixed(3)})`);
  // I9, from the graph: the masses partition the clauses, at most MASS_MAX of them, and clauses sharing a referent
  // (a coreference link between them, counted here) share a mass
  const massOf = new Map();
  f.masses.forEach((m, j) => m.forEach((c) => massOf.set(c, j)));
  ok(massOf.size === mains.length && f.masses.reduce((a, m) => a + m.length, 0) === mains.length, `text ${i}: masses ${JSON.stringify(f.masses)} do not partition ${mains.length} clauses`);
  ok(f.masses.length <= INK.MASS_MAX, `text ${i}: ${f.masses.length} masses, at most ${INK.MASS_MAX}`);
  for (const e of cg.edges) {
    const cls = { 'same-entity': 1, 'same-event': 1, 'subset-of': 1 }[e.label];
    if (cls && member[e.h] >= 0 && member[e.d] >= 0 && member[e.h] !== member[e.d])
      ok(massOf.get(member[e.h]) === massOf.get(member[e.d]), `text ${i}: clauses ${member[e.h]} and ${member[e.d]} share a referent (${e.label}) and lie in different masses`);
  }
  ok(f.massSpansDeg.reduce((a, b) => a + b, 0) <= INK.MASS_ARC + 0.01, `text ${i}: masses cover ${f.massSpansDeg.reduce((a, b) => a + b, 0).toFixed(1)} degrees, at most ${INK.MASS_ARC}`);
  // b. the gap, read by the suite
  const row = ringTable({ W: f.W, H: f.H, d: f.d });
  ok(row && (row.gaps_deg[0] || 0) >= 0.5 * INK.GAP_DEG, `text ${i}: the suite reads a main gap of ${row ? (row.gaps_deg[0] || 0).toFixed(1) : '?'} degrees, ${f.gapDeg} drawn`);
  // b2. the gap's middle 60%, in the carrier band (|r - R| < 0.12 R), holds almost no ink: nothing bridges it
  {
    let inkPx = 0, all = 0;
    for (let a = -0.3; a <= 0.3; a += 0.01) {
      const phi = (f.gapMidDeg + a * f.gapDeg) * DEG;
      for (let r = 0.88 * f.R; r <= 1.12 * f.R; r += 1) {
        const x = Math.round(f.cx + r * cosK(phi)), y = Math.round(f.cy - r * sinK(phi));
        all++; if (f.d[y * f.W + x]) inkPx++;
      }
    }
    ok(inkPx === 0, `text ${i}: ${inkPx} of ${all} samples in the gap's carrier band are ink`);
  }
  // c. ink along the radii through each pool's middle half: the deepest is a pool's, deeper than any carrier
  for (const [j, th] of f.centresDeg.entries()) {
    let best = 0;
    for (let a = -0.5; a <= 0.5; a += 0.05) {
      const phi = (th + a * f.spansDeg[j] / 2) * DEG;
      let run = 0;
      for (let r = 0.4 * f.R; r <= 1.6 * f.R; r += 1) {
        const x = Math.round(f.cx + r * cosK(phi)), y = Math.round(f.cy - r * sinK(phi));
        if (x >= 0 && y >= 0 && x < f.W && y < f.H && f.d[y * f.W + x]) run++;
      }
      best = Math.max(best, run);
    }
    ok(best >= 0.13 * f.R, `text ${i}: pool ${j} at ${th} degrees has at most ${best} px of ink on a radius (${(0.13 * f.R).toFixed(0)} needed; the carrier is at most ${(INK.W_RING * 1.45 * f.R).toFixed(0)})`);
  }
  // d. the side, read by the suite
  const wm = row.w_med_R * row._ring.R;
  const F = filaments({ W: f.W, H: f.H, d: f.d }, { minLen: wm, ring: { ...row._ring, w: wm } }).filaments;
  const dist = (p) => Math.sqrt((p[0] - row._ring.cx) * (p[0] - row._ring.cx) + (p[1] - row._ring.cy) * (p[1] - row._ring.cy));
  for (const x of F) { filRead++; if (dist(x.tipXY) > dist(x.baseXY)) outRead++; else inRead++; }
  filDrawn += f.filamentsDrawn; outDrawn += f.outward;
}
ok(filRead > 0 && Math.abs(outRead / filRead - outDrawn / filDrawn) <= 0.2, `side: the suite reads ${outRead} of ${filRead} filaments outward, ${outDrawn} of ${filDrawn} drawn outward`);
ok(inRead > 0 && filDrawn - outDrawn > 0, `side: ${inRead} read inward, ${filDrawn - outDrawn} drawn inward`);
// e. the drops, at 1500 px
{
  let bulbsRead = 0;
  for (const g of texts.slice(0, 5)) {
    const f = inkFigure(g, { S: 1500 });
    dropsDrawn += f.bulbs;
    const row = ringTable({ W: f.W, H: f.H, d: f.d });
    const wm = row.w_med_R * row._ring.R;
    bulbsRead += filaments({ W: f.W, H: f.H, d: f.d }, { minLen: wm, ring: { ...row._ring, w: wm } }).filaments.filter((x) => x.tip === 'bulb').length;
  }
  ok(dropsDrawn > 0 && bulbsRead >= 0.3 * dropsDrawn, `drops: the suite reads ${bulbsRead} bulb-tipped filaments, ${dropsDrawn} drops drawn`);
}

/* 2f. the gap on texts of 5 large clauses, where a pool's strokes reach furthest toward it */
{
  const gapInk = (f) => {
    let inkPx = 0;
    for (let a = -0.3; a <= 0.3; a += 0.01) {
      const phi = (f.gapMidDeg + a * f.gapDeg) * DEG;
      for (let r = 0.88 * f.R; r <= 1.12 * f.R; r += 1) { const x = Math.round(f.cx + r * cosK(phi)), y = Math.round(f.cy - r * sinK(phi)); if (f.d[y * f.W + x]) inkPx++; }
    }
    return inkPx;
  };
  for (const seed of [524, 529, 534, 539]) {
    const f = inkFigure(randomText(mulberry32(seed), 5, [9, 8, 9, 7, 9]), { S });
    ok(f.ok && gapInk(f) === 0, `large clauses ${seed}: ${f.ok ? gapInk(f) : f.reason} ink samples in the gap's carrier band`);
  }
}

/* 2g. a ring's capacity on texts of 8 clauses, where coreference alone leaves more masses than a ring holds */
{
  let beyond = 0;
  for (let seed = 1100; seed < 1105; seed++) {
    const g = randomText(mulberry32(seed), 8, [5, 9, 6, 8]);
    const f = inkFigure(g, { S: 200 });
    ok(f.ok && f.masses.length <= INK.MASS_MAX, `8 clauses, seed ${seed}: ${f.ok ? f.masses.length : f.reason} masses, at most ${INK.MASS_MAX}`);
    // counted here: the groups coreference alone makes (union of clauses sharing a referent)
    const { cg, member, mains } = clausesOf(g);
    const up = mains.map((_, c) => c);
    const root = (c) => (up[c] === c ? c : (up[c] = root(up[c])));
    for (const e of cg.edges) if ({ 'same-entity': 1, 'same-event': 1, 'subset-of': 1 }[e.label] && member[e.h] >= 0 && member[e.d] >= 0) up[root(member[e.h])] = root(member[e.d]);
    if (new Set(mains.map((_, c) => root(c))).size > INK.MASS_MAX) beyond++;
  }
  ok(beyond > 0, `capacity: ${beyond} of 5 texts of 8 clauses leave more than ${INK.MASS_MAX} groups by coreference alone, so the cap is exercised`);
}

/* 3. the order rule, placed again from I8's text */
{
  // free arcs: the gap kept first, ARC_MIN_DEG each, the rest by the neighbours' spans; the gap joins the largest
  const placeHere = (sp) => {
    const k = sp.length, free = 360 - sp.reduce((a, b) => a + b, 0) - INK.GAP_DEG;
    const share = sp.map((s, j) => s + sp[(j + 1) % k]), tot = share.reduce((a, b) => a + b, 0);
    const arcs = share.map((x) => INK.ARC_MIN_DEG + ((free - k * INK.ARC_MIN_DEG) * x) / tot);
    let jg = 0; arcs.forEach((a, j) => { if (a > arcs[jg] + 1e-9) jg = j; });
    arcs[jg] += INK.GAP_DEG;
    const c = [0];
    for (let j = 1; j < k; j++) c.push(c[j - 1] + sp[j - 1] / 2 + arcs[j - 1] + sp[j] / 2);
    return c;
  };
  const com = (sp, c) => { let x = 0, y = 0, M = 0; sp.forEach((s, j) => { x += s * cosK(c[j] * DEG); y += s * sinK(c[j] * DEG); M += s; }); return Math.sqrt(x * x + y * y) / M; };
  let tried = 0, worse = 0, texts45 = 0;
  // the first seeds from 950 whose texts (4 and 5 clauses in turn) lie in 4 masses: with 3, the two cyclic orders
  // are mirror images and score alike, so the rule has nothing to choose
  const picked = [];
  for (let seed = 950; picked.length < 4 && seed < 1050; seed++) {
    const k = 4 + (picked.length % 2);
    const f = inkFigure(randomText(mulberry32(seed), k, [3, 9, 5, 8, 4]), { S: 200 });
    if (f.ok && f.masses.length >= 4) picked.push([seed, k, f]);
  }
  ok(picked.length === 4, `order: ${picked.length} of 4 texts in 4 masses found in seeds 950 to 1049`);
  for (const [i, k, f] of picked) {
    texts45++;
    const sp = f.massSpansDeg;
    const chosen = com(sp, f.massCentresDeg.map((c) => c - f.massCentresDeg[0]));
    const rest = [...Array(k).keys()].slice(1);
    const perm = (pre, left) => {
      if (!left.length) { const o = [0, ...pre].map((j) => sp[j]); tried++; if (com(o, placeHere(o)) < chosen - 1e-6) worse++; return; }
      for (let q = 0; q < left.length; q++) perm([...pre, left[q]], [...left.slice(0, q), ...left.slice(q + 1)]);
    };
    perm([], rest);
    ok(sp.length >= 4 && new Set(sp).size > 1, `order text ${i}: ${sp.length} masses of spans ${sp.join(' ')}, 4 and unequal`);
  }
  ok(texts45 === 4 && tried > 0 && worse === 0, `order: ${worse} of ${tried} cyclic orders put the centre of mass nearer the centre than the drawn one`);
}

/* 3b. the crown is the code (I2d), counted from the code's words by this test's own route: a figure grows no more
   tendrils and stubs than its main events' words have cells of 2 and 1, and, over the texts, at least half of the
   cells of 2 grow a tendril (some fall where a leg drains the rim) */
{
  const { buildCode, partition, digits, CODE_SEED } = await import('../topo/code.js');
  const { RADICALS } = await import('../topo/hmr.js');
  const rad = partition(buildCode({ seed: CODE_SEED })).parts.radical;
  const word = (r) => Array.from(digits(rad[RADICALS.indexOf(r)][0]));
  let twos = 0, grown = 0, over = 0;
  for (const g of texts.slice(0, 8)) {
    const f = inkFigure(g, { S: 300 });
    const { cg, mains } = clausesOf(g);
    let t2 = 0, t1 = 0;
    for (const m of mains) for (const r of cg.nodes[m].c || []) { const w = word(r); t2 += w.filter((x) => x === 2).length; t1 += w.filter((x) => x === 1).length; }
    if (f.crownTendrils > t2 || f.crownStubs > t1) over++;
    twos += t2; grown += f.crownTendrils;
  }
  ok(over === 0, `crown: ${over} of 8 texts grow more tendrils or stubs than their words have cells of 2 or 1`);
  ok(twos > 0 && grown >= 0.5 * twos, `crown: ${grown} tendrils grown of ${twos} cells of 2 in the words`);
}

/* 4. determinism and node ids */
{
  let same = 0, perm = 0;
  const h = (m) => fnv1a(Buffer.from(m.d).toString('latin1'));
  for (const g of texts.slice(0, 5)) {
    const a = h(inkFigure(g, { S }));
    if (h(inkFigure(g, { S })) === a) same++;
    if (h(inkFigure(permuteGraph(g, mulberry32(7)), { S })) === a) perm++;
  }
  ok(same === 5, `determinism: ${same} of 5 texts give the same bytes twice`);
  ok(perm === 5, `node ids: ${perm} of 5 texts give the same bytes with fresh ids in another order`);
}

ok(drawn > 0, 'G2: no figure was drawn');
console.log(failures ? `inkfig: ${failures} of ${checks} checks FAILED` : `inkfig: ${checks} of ${checks} checks pass (${drawn} texts drawn)`);
process.exit(failures ? 1 : 0);
