/* ============================================================
   heptapod/tests/inkfig.test.mjs — the inked ring figure (film track
   F4-ink, topo/inkfig.js).

     node labs/assets/js/heptapod/tests/inkfig.test.mjs

   1. inkfig.js calls no engine-approximated function (BAR_F G5), read
      from its source with comments removed.
   2. On 15 random texts of 1 to 5 clauses (none may fail), counted here
      from the graph by an independent route: one filament is drawn for
      each node joined to a clause's main event inside its clause (I3),
      one drop for each entity that is not a main event (I4); the pools'
      spans and free arcs fill the circle; the gap is no larger than
      GAP_DEG; every pool's span is NODE_DEG per node unless the ring
      was squeezed, and then all by the same factor.
   3. The same text gives the same bytes; a copy with fresh node ids in
      another order gives the same bytes.
   Exits 1 on any failure, and on a run that drew nothing (G2).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32, fnv1a } from '../topo/rng.js';
import { permuteGraph } from '../topo/hmr.js';
import { clausesOf, randomText } from '../topo/figure.js';
import { INK, inkFigure } from '../topo/inkfig.js';

let checks = 0, failures = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.log('FAIL ' + what); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const S = 900;

/* 1. G5 */
{
  const src = fs.readFileSync(path.join(here, '../topo/inkfig.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const banned = /Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt)\b|\*\*/;
  const m = src.match(banned);
  ok(!m, `G5: inkfig.js calls ${m ? m[0] : ''}, which each engine approximates its own way`);
}

/* 2. what is drawn, against the graph */
const texts = [];
for (let i = 0; i < 15; i++) texts.push(randomText(mulberry32(900 + i), 1 + (i % 5)));
let drawn = 0;
for (const [i, g] of texts.entries()) {
  const f = inkFigure(g, { S });
  ok(f.ok, `text ${i}: ${f.reason}`);
  if (!f.ok) continue;
  drawn++;
  const cl = clausesOf(g);
  const { cg, mains, member, origo } = cl;
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
  ok(f.bulbs === ent, `text ${i}: ${f.bulbs} drops at thread tips, ${ent} entities that are not main events`);
  const total = f.spansDeg.reduce((a, b) => a + b, 0) + f.arcsDeg.reduce((a, b) => a + b, 0);
  ok(Math.abs(total - 360) < 0.05, `text ${i}: spans and free arcs sum to ${total.toFixed(2)} degrees`);
  ok(f.gapDeg <= INK.GAP_DEG + 1e-9 && f.gapDeg > 0, `text ${i}: gap ${f.gapDeg} degrees`);
  const sizes = mains.map((m) => { let n = 0; for (let v = 0; v < cg.n; v++) if (member[v] === member[m] && v !== origo) n++; return n; });
  const ratios = f.spansDeg.map((s) => s).sort((a, b) => a - b);
  const want = sizes.map((n) => INK.NODE_DEG * n * f.squeeze).sort((a, b) => a - b);
  ok(ratios.every((s, j) => Math.abs(s - want[j]) < 0.02), `text ${i}: spans ${ratios.join(' ')} against ${want.map((x) => x.toFixed(2)).join(' ')}`);
  ok(f.squeeze <= 1, `text ${i}: squeeze ${f.squeeze}`);
}

/* 3. determinism and node ids */
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
