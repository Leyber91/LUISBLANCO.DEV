/* ============================================================
   tools/dev/heptapod_figure.mjs — film track F4 slice 1: the ring
   figure of 1, 4 and 12 clauses, measured by the detail suite beside
   the film's 18 masters (BAR_F G12: no figure without its verdict).

     node tools/dev/heptapod_figure.mjs <out dir> --film <masks dir> [--stills <film stills dir>]

   The texts are randomText(mulberry32(100 + k), k) for k = 1, 4 and
   12: the first seeds tried, none chosen by its look.
   To <out dir> (private): the masks (PBM), the renders (PNG) and
   sheet.html, the renders beside the two masters BAR_F F4 names
   (ThereIsNoLinearTime1 and CowrittenLogogram1), linked as local
   files only (research/ip.md rule 6).
   To labs/assets/data/heptapod/f4-figures.json: numbers only. Every
   column of every figure, the film's range over its masters, and in
   or out; the layout's own numbers; the label the verdict gives.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mulberry32 } from '../../labs/assets/js/heptapod/topo/rng.js';
import { FIG, CALIBRATIONS, layoutFigure, rasterFigure, randomText } from '../../labs/assets/js/heptapod/topo/figure.js';
import { readPBM, ringTable } from '../../labs/assets/js/heptapod/detail/ring.js';
import { filaments } from '../../labs/assets/js/heptapod/detail/filaments.js';

const av = process.argv.slice(2);
const out = av[0];
const opt = (name) => { const i = av.indexOf(name); return i > 0 ? av[i + 1] : null; };
const filmDir = opt('--film'), stills = opt('--stills');
if (!out || out.startsWith('--') || !filmDir) { console.error('usage: heptapod_figure.mjs <out dir> --film <masks dir> [--stills <film stills dir>]'); process.exit(2); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '../../labs/assets/data/heptapod/f4-figures.json');
const S = 1100;

/* ---------- the columns: [key, what, how it is read from a measured row] ---------- */
const COLS = [
  ['ink_over_disc', 'ink over the disc', (r) => r.ink_over_disc],
  ['ring_closure', 'share of angles with carrier', (r) => r.ring_closure],
  ['main_gap_deg', 'main gap, degrees', (r) => r.gaps_deg[0] || 0],
  ['w_med_R', 'median carrier width / R', (r) => r.w_med_R],
  ['w_cv', 'carrier width CV', (r) => r.w_cv],
  ['clusters', 'blot clusters', (r) => r.blot_clusters.length],
  ['span_max_deg', 'widest cluster, degrees', (r) => Math.max(0, ...r.blot_clusters)],
  ['peak_depth_R', 'peak blot depth / R', (r) => Math.max(0, ...r.blots.map((b) => b.wmax))],
  ['out_reach_R', 'outward reach / R', (r) => r.out_reach_max_R],
  ['in_reach_R', 'inward reach / R', (r) => r.in_reach_max_R],
  ['wobble_R', 'centreline wobble / R', (r) => r.centerline_dev_R],
  ['filaments', 'filaments', (r) => r._filaments],
  ['droplets', 'droplets of 1% R or more', (r) => r.droplets_ge1u],
  ['boxdim', 'edge box dimension', (r) => r.boxdim],
];
// the columns of fine detail: below the film's least on any of them, a render is a skeleton (G12)
const DETAIL = ['filaments', 'droplets', 'boxdim'];

function measure(m) {
  const row = ringTable(m);
  const wm = row.w_med_R * row._ring.R;
  row._filaments = filaments(m, { minLen: wm, ring: { ...row._ring, w: wm } }).filaments.length;
  return Object.fromEntries(COLS.map(([k, , f]) => [k, +f(row).toFixed(4)]));
}

/* ---------- the film's ranges ---------- */
const film = fs.readdirSync(filmDir).filter((f) => f.startsWith('wolfram_') && f.endsWith('.pbm')).sort();
if (film.length < 18) { console.error(`${film.length} film masks in ${filmDir}; 18 expected`); process.exit(1); }
const filmRows = film.map((f) => measure(readPBM(fs.readFileSync(path.join(filmDir, f)))));
const range = Object.fromEntries(COLS.map(([k]) => { const v = filmRows.map((r) => r[k]).sort((a, b) => a - b); return [k, { min: v[0], median: v[v.length >> 1], max: v[v.length - 1] }]; }));

/* ---------- our figures ---------- */
const crc32 = (() => { const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function png(m) {
  const { W, H, d } = m, raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = d[y * W + x] ? 17 : 255;
  const chunk = (t, data) => { const L = Buffer.alloc(4); L.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(t), data]); const C = Buffer.alloc(4); C.writeUInt32BE(crc32(td)); return Buffer.concat([L, td, C]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 0; // 8-bit grey
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function pbm(m) {
  const rb = Math.ceil(m.W / 8), b = Buffer.alloc(rb * m.H);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.d[y * m.W + x]) b[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
  return Buffer.concat([Buffer.from(`P4\n${m.W} ${m.H}\n`), b]);
}

fs.mkdirSync(out, { recursive: true });
const figures = [];
for (const k of [1, 4, 12]) {
  const g = randomText(mulberry32(100 + k), k);
  const f = layoutFigure(g);
  if (!f.ok) { console.error(`${k} clauses: ${f.reason}`); process.exit(1); }
  const m = rasterFigure(f, S);
  fs.writeFileSync(path.join(out, `f4-${k}.pbm`), pbm(m));
  fs.writeFileSync(path.join(out, `f4-${k}.png`), png(m));
  const cols = measure(m);
  const verdict = Object.fromEntries(COLS.map(([c]) => [c, cols[c] >= range[c].min && cols[c] <= range[c].max ? 'in' : cols[c] < range[c].min ? 'below' : 'above']));
  const skeleton = DETAIL.some((c) => cols[c] < range[c].min);
  figures.push({
    clauses: k, seed: 100 + k, nodes: f.nodes, columns: cols, verdict, label: skeleton ? 'skeleton' : 'figure candidate',
    layout: {
      R_l: +f.R.toFixed(2), gap_deg: +f.gap.deg.toFixed(1), arcs_deg: f.arcsDeg.map((x) => +x.toFixed(1)),
      spans_deg: f.clusters.map((c) => +((c.T / f.R) * (180 / Math.PI)).toFixed(1)), depths_R: f.clusters.map((c) => +(c.D / f.R).toFixed(3)),
      code_kept: f.clusters.map((c) => +c.codeKept.toFixed(3)), pockets_filled_px: m.pocketsFilled, components: m.components,
      links_between_clauses_not_drawn: f.crossLinks,
    },
  });
}
const data = {
  about: 'F4 slice 1 (BAR_F G12): the ring figures of 1, 4 and 12 clauses measured by the detail suite, beside the range of the same columns over the 18 film masters. Numbers only (research/ip.md rule 6). Written by tools/dev/heptapod_figure.mjs.',
  version: FIG.version, ranOn: new Date().toISOString().slice(0, 10), filmMasters: film.length, calibrations: CALIBRATIONS,
  columns: Object.fromEntries(COLS.map(([k, what]) => [k, what])), detailColumns: DETAIL, filmRange: range, figures,
};
fs.writeFileSync(DATA, JSON.stringify(data, null, 1));

/* ---------- the sheet (private) ---------- */
const fmt = (x) => (Math.abs(x) >= 10 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(1) : x.toFixed(3));
const refs = stills ? ['wolfram_ThereIsNoLinearTime1.jpg', 'wolfram_CowrittenLogogram1.jpg'].map((f) => path.join(stills, f)).filter((f) => fs.existsSync(f)) : [];
const cell = (src, cap) => `<figure><img src="${src}" width="520" height="520"><figcaption>${cap}</figcaption></figure>`;
const rows = COLS.map(([k, what]) => `<tr><td>${what}</td><td>${fmt(range[k].min)} to ${fmt(range[k].max)} (median ${fmt(range[k].median)})</td>${figures.map((F) => `<td class="${F.verdict[k]}">${fmt(F.columns[k])} ${F.verdict[k] === 'in' ? '' : F.verdict[k]}</td>`).join('')}</tr>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>F4 ring figures</title><style>
body{margin:0;padding:20px;background:#fff;color:#222;font:14px/1.45 system-ui,sans-serif}h1{font-size:18px;margin:0 0 6px}p{max-width:1100px}
.row{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}figure{margin:0;border:1px solid #ddd}figcaption{padding:6px 8px;max-width:504px}
table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left}.below,.above{background:#f3e3e0}
</style></head><body>
<h1>F4 slice 1: the ring figure, as skeletons (BAR_F G12)</h1>
<p>One ring per speaker, one gathered mass per main clause, one gap in the largest free arc. The ring has constant width and the masses smooth edges: the ink (width profile, striations, filaments, droplets) is F5's. Label by the suite: ${figures.map((F) => `${F.clauses} clause${F.clauses > 1 ? 's' : ''}: ${F.label}`).join('; ')}.</p>
<div class="row">${figures.map((F) => cell(`f4-${F.clauses}.png`, `${F.clauses} clause${F.clauses > 1 ? 's' : ''}: ${F.nodes} nodes, gap ${F.layout.gap_deg} deg, code kept on the outline ${F.layout.code_kept.map((x) => Math.round(100 * x) + '%').join(' ')}`)).join('')}</div>
${refs.length ? `<div class="row">${refs.map((f) => cell(pathToFileURL(path.resolve(f)).href, `The film: ${path.basename(f)} (private, never committed)`)).join('')}</div>` : ''}
<table><tr><th>column</th><th>film, ${film.length} masters</th>${figures.map((F) => `<th>${F.clauses} clause${F.clauses > 1 ? 's' : ''}</th>`).join('')}</tr>${rows}</table>
<p>Calibrations: ${CALIBRATIONS.map((c) => `${c.name} = ${+c.value.toFixed(3)} (${c.source})`).join('; ')}.</p>
</body></html>`;
fs.writeFileSync(path.join(out, 'sheet.html'), html);
for (const F of figures) console.log(`${F.clauses} clauses: ${F.label}; out of the film's range: ${COLS.filter(([k]) => F.verdict[k] !== 'in').map(([k]) => `${k} ${F.columns[k]} (${F.verdict[k]} ${range[k].min} to ${range[k].max})`).join(', ') || 'none'}`);
console.log(`wrote ${DATA} and ${path.join(out, 'sheet.html')}`);
