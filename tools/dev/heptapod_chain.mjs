/* ============================================================
   tools/dev/heptapod_chain.mjs — from meaning to shape, one figure (film
   track F3; asked by Luis 2026-11-16: "how it translates to the shapes
   we see on the movie").

     node tools/dev/heptapod_chain.mjs <out dir> [--ref <film still>]

   1. the meaning: the graph's nodes and links, as E1 holds them;
   2. the shapes: E1's master, filled, no line drawn (H5);
   3. the words on the edges: every point of a lobe's rim carries a
      word of the code (topo/code.js) and a cell of it; the cell moves
      the edge out, holds it or moves it in by A_L code cells, smoothed
      over half a cell;
   4. a stretch of edge magnified, with the word boundaries marked in
      grey (an analysis view, BAR_F G11).
   The graph is randomHMR(mulberry32(1), { n: 6 }), as on the F1 sheet,
   until F8 turns typed English into a graph. The words are given to
   this figure's tokens by an interim rule: tokens sorted, then the
   words of their partition in order; the computed vocabulary is E9's.
   The film still, with --ref, is only a local file link (ip.md rule 6).
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mulberry32 } from '../../labs/assets/js/heptapod/topo/rng.js';
import { TOPO } from '../../labs/assets/js/heptapod/topo/config.js';
import { randomHMR } from '../../labs/assets/js/heptapod/topo/hmr.js';
import { encode } from '../../labs/assets/js/heptapod/topo/encode.js';
import { theCode, partition, digits, show, K } from '../../labs/assets/js/heptapod/topo/code.js';

const A_L = 0.45;   // the cell offset, in code cells l
const PANEL = 620;
const av = process.argv.slice(2);
const out = av[0];
if (!out || out.startsWith('--')) { console.error('usage: heptapod_chain.mjs <out dir> [--ref <film still>]'); process.exit(2); }
const ri = av.indexOf('--ref'), ref = ri > 0 ? av[ri + 1] : null;

const g = randomHMR(mulberry32(1), { n: 6 });
const dw = encode(g);
if (!dw.ok) { console.error('not drawn: ' + dw.reason); process.exit(1); }
const { pts, sym, cell } = dw.contour;
const m = pts.length / 2;

/* interim assignment of code words to this figure's tokens */
const { parts } = partition(theCode());
const PART_OF = { R: 'radical', D: 'radical', M: 'marker', I: 'inflection', F: 'inflection', L: 'letter', X: 'numeral', S: 'checksum', Z: 'filler' };
const tokens = [...new Set(sym.filter(Boolean))].sort();
const next = {}, wordOf = new Map();
for (const t of tokens) {
  const p = PART_OF[t.split(':')[0]] || 'filler';
  const i = next[p] = (next[p] ?? -1) + 1;
  const pool = parts[p];
  const w = p === 'radical' ? pool[i % pool.length][0] : pool[i % pool.length];
  if (i >= pool.length) console.warn(`interim assignment: ${p} reused for ${t}`);
  wordOf.set(t, w);
}

/* the offset of every point: (digit - 1) * A_L along the outward normal, smoothed over half a cell */
const raw = new Float64Array(m);
for (let k = 0; k < m; k++) if (sym[k]) raw[k] = (digits(wordOf.get(sym[k]))[cell[k]] - 1) * A_L;
const half = Math.max(1, Math.round(0.25 / TOPO.ds));
const off = new Float64Array(m);
for (let k = 0; k < m; k++) { let s = 0; for (let j = -half; j <= half; j++) s += raw[(k + j + m) % m]; off[k] = s / (2 * half + 1); }
let area = 0;
for (let k = 0; k < m; k++) { const j = (k + 1) % m; area += pts[2 * k] * pts[2 * j + 1] - pts[2 * j] * pts[2 * k + 1]; }
const sgn = area > 0 ? 1 : -1; // outward normal of a counter-clockwise loop is (ty, -tx)
const coded = new Float64Array(2 * m);
for (let k = 0; k < m; k++) {
  const a = (k - 1 + m) % m, b = (k + 1) % m;
  let tx = pts[2 * b] - pts[2 * a], ty = pts[2 * b + 1] - pts[2 * a + 1];
  const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
  coded[2 * k] = pts[2 * k] + sgn * ty * off[k];
  coded[2 * k + 1] = pts[2 * k + 1] - sgn * tx * off[k];
}

/* drawing */
let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (let k = 0; k < m; k++) { x0 = Math.min(x0, pts[2 * k]); x1 = Math.max(x1, pts[2 * k]); y0 = Math.min(y0, pts[2 * k + 1]); y1 = Math.max(y1, pts[2 * k + 1]); }
const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
let R = 0;
for (let k = 0; k < m; k++) R = Math.max(R, Math.hypot(pts[2 * k] - cx, pts[2 * k + 1] - cy));
const sc = (0.7 * PANEL / 2) / R;
const P = (P2, k, s = sc, ox = cx, oy = cy, size = PANEL) => [(size / 2 + (P2[2 * k] - ox) * s).toFixed(2), (size / 2 - (P2[2 * k + 1] - oy) * s).toFixed(2)];
const pathOf = (P2, s, ox, oy, size) => { let d = ''; for (let k = 0; k < m; k++) { const [x, y] = P(P2, k, s, ox, oy, size); d += (k ? 'L' : 'M') + x + ' ' + y; } return d + 'Z'; };
const svg = (inner, size = PANEL) => `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${inner}</svg>`;

// the magnified stretch: the longest run of coded points on one rim, centred
let bestS = 0, bestL = 0;
for (let k = 0, run = 0; k < 2 * m; k++) { if (sym[k % m]) { run++; if (run > bestL) { bestL = run; bestS = k - run + 1; } } else run = 0; }
const mid = (bestS + Math.floor(Math.min(bestL, m) / 2)) % m;
const ZW = 22; // code cells shown across the magnified panel
const zs = PANEL / ZW, zx = coded[2 * mid], zy = coded[2 * mid + 1];
let ticks = '', labels = '';
for (let k = 0; k < m; k++) {
  const x = PANEL / 2 + (coded[2 * k] - zx) * zs, y = PANEL / 2 - (coded[2 * k + 1] - zy) * zs;
  if (x < -20 || x > PANEL + 20 || y < -20 || y > PANEL + 20) continue;
  if (sym[k] && cell[k] === 0 && (cell[(k - 1 + m) % m] !== 0 || sym[(k - 1 + m) % m] !== sym[k])) {
    ticks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#9a9a9a"/>`;
    labels += `<text x="${(x + 8).toFixed(1)}" y="${(y - 8).toFixed(1)}" font-size="13" fill="#555" font-family="ui-monospace,monospace">${sym[k]} ${show(wordOf.get(sym[k]))}</text>`;
  }
}
const nodes = Object.entries(g.nodes).map(([id, n]) => `<li><b>${id}</b>: ${n.k}${n.c ? ' ' + n.c.join('+') : ''}</li>`).join('');
const links = g.edges.map(([h, l, d]) => `<li>${h} &rarr; ${l} &rarr; ${d}</li>`).join('');
const cells = [];
if (ref) cells.push(`<figure><img src="${pathToFileURL(path.resolve(ref)).href}" width="${PANEL}" height="${PANEL}"><figcaption>The film: ${path.basename(ref)} (private, never committed)</figcaption></figure>`);
cells.push(`<figure><div class="meaning"><p>1. The meaning: ${Object.keys(g.nodes).length} nodes, ${g.edges.length} links (a seeded random graph until F8 reads English)</p><ul>${nodes}</ul><p>links</p><ul>${links}</ul></div><figcaption>1. The meaning</figcaption></figure>`);
cells.push(`<figure>${svg(`<path d="${pathOf(pts, sc, cx, cy, PANEL)}" fill="#111"/>`)}<figcaption>2. The shapes: one shape per idea, joined where they relate; no line drawn</figcaption></figure>`);
cells.push(`<figure>${svg(`<path d="${pathOf(coded, sc, cx, cy, PANEL)}" fill="#111"/>`)}<figcaption>3. The words on the edges: ${tokens.length} words, ${(m * TOPO.ds).toFixed(0)} cells of edge; at this size the code reads as edge texture</figcaption></figure>`);
cells.push(`<figure>${svg(`<path d="${pathOf(coded, zs, zx, zy, PANEL)}" fill="#111"/>${ticks}${labels}`)}<figcaption>4. One stretch of edge, ${ZW} cells wide: grey marks where a word starts (analysis view)</figcaption></figure>`);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Meaning to shape</title><style>body{margin:0;padding:20px;background:#fff;color:#222;font:14px/1.45 system-ui,sans-serif}
.row{display:flex;gap:14px;flex-wrap:wrap}figure{margin:0;border:1px solid #ddd}figcaption{padding:6px 8px;max-width:${PANEL - 16}px}
.meaning{width:${PANEL}px;height:${PANEL}px;overflow:auto;padding:14px;box-sizing:border-box;font-size:15px}.meaning ul{margin:4px 0 10px;padding-left:20px}
h1{font-size:18px;margin:0 0 12px}</style></head><body><h1>From meaning to shape, one figure (F3, before the ink). Steps 5 and 6, the brush and the ink, come in F5 and F6.</h1><div class="row">${cells.join('')}</div></body></html>`;
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'chain.html'), html);
console.log(`wrote ${path.join(out, 'chain.html')}: ${Object.keys(g.nodes).length} nodes, ${tokens.length} distinct words, ${m} edge points (${(m * TOPO.ds).toFixed(0)} cells)`);
