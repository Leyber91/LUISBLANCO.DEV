/* ============================================================
   tools/dev/heptapod_skeleton.mjs — the plain skeleton of E1 (film track
   step F1): the master contour of a meaning graph drawn as one plain
   line, with no brush and no ink, at the frame size of a film still.

     node tools/dev/heptapod_skeleton.mjs <out dir> [--ref <film still>]

   Writes <out dir>/skeleton.html: one panel per size band of E1's pass
   test (2-10, 11-20, 21-40 nodes), then the smallest graph's master
   beside its 5 form synonyms. With --ref the film still is put first, as
   a file link that never leaves the machine; the film's images are
   never committed or published (research/ip.md rule 6).

   Nothing is chosen by hand. The graphs are randomHMR(mulberry32(1),
   { n }) at each band's midpoint, n = 6, 15 and 30 (the first rule
   tried, the first seed to fall in each band, gave a 2-node graph that
   shows nothing of a sentence); the synonyms are E1's own (random
   spanning tree, cyclic child order, reflections) from
   mulberry32(1001). Each panel is decoded back from its contour
   alone and says whether the graph came back. The figure is scaled so
   its enclosing circle spans FILL of the panel, which is the film ring's
   share of its frame on wolfram_OfferWeapon1.jpg (2 x 680 of 1932 px,
   read off the still on 2026-11-16). The line is LINE_L code cells wide,
   a constant (never drawn under MIN_PX): width, masses and filaments are
   E6 and E7, not E1.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mulberry32 } from '../../labs/assets/js/heptapod/topo/rng.js';
import { TOPO } from '../../labs/assets/js/heptapod/topo/config.js';
import { randomHMR, validateHMR } from '../../labs/assets/js/heptapod/topo/hmr.js';
import { canonicalGraph } from '../../labs/assets/js/heptapod/topo/tree.js';
import { encode } from '../../labs/assets/js/heptapod/topo/encode.js';
import { decodeContour } from '../../labs/assets/js/heptapod/topo/decode.js';

const FILL = 0.70;      // enclosing circle diameter / panel side
const LINE_L = 0.6;     // line width in code cells l
const MIN_PX = 1.5;     // floor of the drawn width, so a long line stays visible at panel size
const PANEL = 760;      // px
const BANDS = [[2, 10], [11, 20], [21, 40]];

const av = process.argv.slice(2);
const out = av[0];
if (!out || out.startsWith('--')) { console.error('usage: heptapod_skeleton.mjs <out dir> [--ref <film still>]'); process.exit(2); }
const ri = av.indexOf('--ref');
const ref = ri > 0 ? av[ri + 1] : null;
if (ri > 0 && (!ref || !fs.existsSync(ref))) { console.error(`--ref: no file at ${ref}`); process.exit(2); }

/* one graph per band, at the band's midpoint size, from seed 1 */
const picks = BANDS.map(([lo, hi], band) => {
  const want = Math.round((lo + hi) / 2), seed = 1;
  const g = randomHMR(mulberry32(seed), { n: want });
  const v = validateHMR(g);
  if (!v.ok) { console.error(`band ${lo}-${hi}: invalid graph: ${v.errors[0]}`); process.exit(1); }
  return { band, seed, want, g, n: Object.keys(g.nodes).length };
});

/* a drawing as an SVG path in a PANEL square, and what the reader got back from its contour */
function panel(dw, g) {
  const p = dw.contour.pts, m = p.length / 2;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < m; k++) { x0 = Math.min(x0, p[2 * k]); x1 = Math.max(x1, p[2 * k]); y0 = Math.min(y0, p[2 * k + 1]); y1 = Math.max(y1, p[2 * k + 1]); }
  // enclosing circle about the box centre (an upper bound of the minimal one, never smaller)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let R = 0;
  for (let k = 0; k < m; k++) R = Math.max(R, Math.hypot(p[2 * k] - cx, p[2 * k + 1] - cy));
  const sc = (FILL * PANEL / 2) / R;
  let d = '';
  for (let k = 0; k < m; k++) d += (k ? 'L' : 'M') + (PANEL / 2 + (p[2 * k] - cx) * sc).toFixed(2) + ' ' + (PANEL / 2 - (p[2 * k + 1] - cy) * sc).toFixed(2);
  d += 'Z';
  const res = decodeContour(dw.contour);
  const back = res.ok && canonicalGraph(res.graph).cert === canonicalGraph(g).cert;
  const svg = `<svg viewBox="0 0 ${PANEL} ${PANEL}" width="${PANEL}" height="${PANEL}"><path d="${d}" fill="none" stroke="#000" stroke-width="${Math.max(MIN_PX, LINE_L * sc).toFixed(2)}" stroke-linejoin="round"/></svg>`;
  return { svg, back, R, wRatio: (LINE_L / R), lobes: dw.lobes.length, necks: dw.necks.length, kisses: dw.kisses.length, echoes: dw.stats.echoes, len: m * TOPO.ds };
}

const cell = (inner, cap) => `<figure>${inner}<figcaption>${cap}</figcaption></figure>`;
const cells = [];
if (ref) cells.push(cell(`<img src="${pathToFileURL(path.resolve(ref)).href}" width="${PANEL}" height="${PANEL}">`, `film: ${path.basename(ref)} (private, never committed)`));
const rows = [];
for (const pk of picks) {
  const dw = encode(pk.g);
  if (!dw.ok) { console.error(`seed ${pk.seed}: not drawn: ${dw.reason}`); process.exit(1); }
  const P = panel(dw, pk.g);
  rows.push({ seed: pk.seed, n: pk.n, ...P });
  cells.push(cell(P.svg, `E1 master, seed ${pk.seed}: ${pk.n} nodes, ${P.lobes} lobes, ${P.necks} necks, ${P.kisses} kisses, ${P.echoes} echo lobes; ` +
    `line ${(P.len).toFixed(0)} l long; ${P.back ? 'decoded back to the graph from the contour alone' : 'DID NOT DECODE BACK'}`));
}
const syn = [];
{
  const pk = picks[0];
  const rnd = mulberry32(1000 + pk.seed);
  for (let s = 0; s <= 5; s++) {
    const dw = encode(pk.g, s === 0 ? {} : { rnd });
    if (!dw.ok) { console.error(`seed ${pk.seed} synonym ${s}: not drawn: ${dw.reason}`); process.exit(1); }
    const P = panel(dw, pk.g);
    syn.push(cell(P.svg.replace(`width="${PANEL}" height="${PANEL}"`, `width="${PANEL / 2}" height="${PANEL / 2}"`),
      `${s === 0 ? 'master' : 'synonym ' + s}: ${P.lobes} lobes; ${P.back ? 'decodes back' : 'DID NOT DECODE BACK'}`));
  }
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>E1 skeleton</title><style>
body{margin:0;padding:24px;background:#fff;color:#222;font:15px/1.4 system-ui,sans-serif}
.row{display:flex;gap:16px;align-items:flex-start;margin-bottom:28px}
figure{margin:0;border:1px solid #ddd}
figcaption{padding:8px 10px;max-width:${PANEL - 20}px;font-size:14px;color:#333}
.half figcaption{max-width:${PANEL / 2 - 20}px;font-size:13px}
h1{font-size:18px;font-weight:600;margin:0 0 14px}
</style></head><body>
<h1>F1: the plain skeleton of E1 (topology ${TOPO.version}), line ${LINE_L} l wide, enclosing circle ${FILL} of the frame</h1>
<div class="row">${cells.join('')}</div>
<h1>One meaning, six forms: the ${picks[0].n}-node graph's master and its 5 form synonyms</h1>
<div class="row half">${syn.join('')}</div>
</body></html>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'skeleton.html'), html);
for (const r of rows) console.log(`seed ${r.seed}: ${r.n} nodes, ${r.lobes} lobes, line ${r.len.toFixed(0)} l, enclosing radius ${r.R.toFixed(1)} l, line width ${(100 * r.wRatio).toFixed(1)}% of R (film ring about 6%), decoded back: ${r.back}`);
console.log(`wrote ${path.join(out, 'skeleton.html')}${ref ? ' (with the film still: keep it private)' : ''}`);
