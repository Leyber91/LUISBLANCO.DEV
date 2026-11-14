/* ============================================================
   heptapod/bench.mjs — the noise bench behind the page's curves.

     node labs/assets/js/heptapod/bench.mjs [propositions per level]

   For each noise type (jitter, dropout, blots) and each level, ink
   N random propositions (seeded, so the run is repeatable), read
   each page back, and count exact recoveries of the whole graph.
   Writes bench.json next to this file; the page plots it. The
   breaking point is where exact recovery first falls below 50%,
   interpolated between the two levels around it.
   ============================================================ */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { randomGraph, diffGraphs } from './grammar.js';
import { graphSpec } from './geometry.js';
import { inkPage, readPage, Raster } from './codec.js';
import { SCRIPT_VERSION } from './script.js';

const N = Number(process.argv[2]) || 200;
const TYPES = {
  jitter: { unit: 'peak tremor, % of ring radius', scale: 100, levels: [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06] },
  dropout: { unit: '% of stroke length erased', scale: 100, levels: [0, 0.025, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4] },
  blots: { unit: 'ink blots on the page', scale: 1, levels: [0, 5, 10, 20, 30, 40, 60, 80, 100, 120] },
};

let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const props = Array.from({ length: N }, () => { const g = randomGraph(rnd); return [g, graphSpec(g)]; });
const rs = new Raster();
const out = { script: SCRIPT_VERSION, date: new Date().toISOString().slice(0, 10), propositions: N, types: {} };
const t0 = Date.now();
for (const [type, cfg] of Object.entries(TYPES)) {
  const rows = [];
  for (const level of cfg.levels) {
    let exact = 0;
    const fields = {};
    props.forEach(([g, spec], i) => {
      inkPage(spec, { [type]: level }, 1000 + i, rs);
      const d = diffGraphs(g, readPage(rs).graph);
      if (!d.diffs.length) exact++;
      for (const x of d.diffs) { const k = x.field.replace(/^(a|b)\./, '').replace(/patient\./, 'clause.'); fields[k] = (fields[k] || 0) + 1; }
    });
    rows.push({ level, value: +(level * cfg.scale).toFixed(2), exact: exact / N, fields });
    process.stdout.write(`${type} ${level}: ${(100 * exact / N).toFixed(1)}%\n`);
  }
  let brk = null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (a.exact >= 0.5 && b.exact < 0.5) { brk = +(a.value + (b.value - a.value) * (a.exact - 0.5) / (a.exact - b.exact)).toFixed(2); break; }
  }
  out.types[type] = { unit: cfg.unit, rows, breaking: brk };
}
out.seconds = Math.round((Date.now() - t0) / 1000);
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'bench.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote bench.json: ${N} propositions per level, ${out.seconds} s`);
