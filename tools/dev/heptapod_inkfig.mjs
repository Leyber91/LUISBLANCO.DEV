/* ============================================================
   tools/dev/heptapod_inkfig.mjs — film track F4-ink: the inked ring
   figures measured by the detail suite against the film's 18 masters,
   by distribution (p10 to p90 over the masters, never min to max:
   PROCESS 2026-11-17, lesson 1), and the outcomes of F4-P4 and F4-P5.

     node tools/dev/heptapod_inkfig.mjs <out dir> --film <masks dir> [--stills <film stills dir>] [--corpus 30]

   Figures: randomText(mulberry32(100 + k), k) for k = 1, 4 and 12, the
   same texts as F4 slice 1. Corpus (F4-P4): randomText(mulberry32(500
   + i), 1 + i mod 5), i = 0 to 29, as committed in predictions.json.
   To <out dir> (private): the renders (PNG at 1100 px, the mask at
   3300 px as PBM) and sheet.html, the renders beside two film masters
   linked as local files only (research/ip.md rule 6).
   To labs/assets/data/heptapod/f4-ink.json: numbers only.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mulberry32 } from '../../labs/assets/js/heptapod/topo/rng.js';
import { randomText } from '../../labs/assets/js/heptapod/topo/figure.js';
import { INK, INK_CALIBRATIONS, inkFigure } from '../../labs/assets/js/heptapod/topo/inkfig.js';
import { readPBM, ringTable, percentile } from '../../labs/assets/js/heptapod/detail/ring.js';
import { filaments } from '../../labs/assets/js/heptapod/detail/filaments.js';

const av = process.argv.slice(2);
const out = av[0];
const opt = (name) => { const i = av.indexOf(name); return i > 0 ? av[i + 1] : null; };
const filmDir = opt('--film'), stills = opt('--stills');
const NC = Number(opt('--corpus') ?? 30);
if (!out || out.startsWith('--') || !filmDir || !(NC >= 0)) { console.error('usage: heptapod_inkfig.mjs <out dir> --film <masks dir> [--stills <dir>] [--corpus 30]'); process.exit(2); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '../../labs/assets/data/heptapod/f4-ink.json');

/* ---------- the columns ---------- */
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
  ['filaments', 'filaments', (r) => r._F.length],
  ['fil_len_R', 'filament length / R, median', (r) => med(r._F.map((f) => f.length / r._ring.R))],
  ['fil_shaft_R', 'filament shaft / R, median', (r) => med(r._F.map((f) => f.shaft / r._ring.R))],
  ['fil_turn_deg', 'filament turning, degrees, median', (r) => med(r._F.map((f) => f.turnDeg))],
  ['outward_share', 'share of filaments pointing outward', (r) => (r._F.length ? r._F.filter((f) => out_(f, r._ring)).length / r._F.length : 0)],
  ['droplets', 'droplets of 1% R or more', (r) => r.droplets_ge1u],
  ['boxdim', 'edge box dimension', (r) => r.boxdim],
];
const DETAIL = ['filaments', 'droplets', 'boxdim'];
function med(a) { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return percentile(s, 50); }
function out_(f, ring) { const d = (p) => Math.sqrt((p[0] - ring.cx) * (p[0] - ring.cx) + (p[1] - ring.cy) * (p[1] - ring.cy)); return d(f.tipXY) > d(f.baseXY); }

function measure(m) {
  const row = ringTable(m);
  const wm = row.w_med_R * row._ring.R;
  row._F = filaments(m, { minLen: wm, ring: { ...row._ring, w: wm } }).filaments;
  return { cols: Object.fromEntries(COLS.map(([k, , f]) => [k, +(+f(row)).toFixed(4)])), F: row._F };
}

/* ---------- the film, by distribution ---------- */
const film = fs.readdirSync(filmDir).filter((f) => f.startsWith('wolfram_') && f.endsWith('.pbm')).sort();
if (film.length !== 18) { console.error(`${film.length} film masks in ${filmDir}; exactly 18 expected`); process.exit(1); }
const filmRows = [], bulbRatios = [];
for (const f of film) {
  const { cols, F } = measure(readPBM(fs.readFileSync(path.join(filmDir, f))));
  filmRows.push(cols);
  for (const x of F) if (x.tip === 'bulb') bulbRatios.push(x.tipRatio);
  console.log(`film ${f}: filaments ${cols.filaments}`);
}
const Q = (vals, q) => percentile(Float64Array.from(vals).sort(), q);
const dist = Object.fromEntries(COLS.map(([k]) => { const v = filmRows.map((r) => r[k]); return [k, { p10: +Q(v, 10).toFixed(4), p50: +Q(v, 50).toFixed(4), p90: +Q(v, 90).toFixed(4) }]; }));
const where = (k, x) => (x < dist[k].p10 ? 'below' : x > dist[k].p90 ? 'above' : 'in');

/* ---------- raster outputs ---------- */
const crc32 = (() => { const T = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }); return (b) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
function png(W, H, d) {
  const raw = Buffer.alloc((W + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw[y * (W + 1) + 1 + x] = d[y * W + x] ? 17 : 255;
  const chunk = (t, data) => { const L = Buffer.alloc(4); L.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(t), data]); const C = Buffer.alloc(4); C.writeUInt32BE(crc32(td)); return Buffer.concat([L, td, C]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function pbm(m) {
  const rb = Math.ceil(m.W / 8), b = Buffer.alloc(rb * m.H);
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (m.d[y * m.W + x]) b[y * rb + (x >> 3)] |= 0x80 >> (x & 7);
  return Buffer.concat([Buffer.from(`P4\n${m.W} ${m.H}\n`), b]);
}
/* 3 to 1, ink where at least 5 of the 9 pixels are */
function down3(m) {
  const s = Math.floor(m.W / 3), d = new Uint8Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let c = 0;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) c += m.d[(3 * y + dy) * m.W + 3 * x + dx];
    d[y * s + x] = c >= 5 ? 1 : 0;
  }
  return { s, d };
}

/* ---------- the three figures ---------- */
fs.mkdirSync(out, { recursive: true });
const figures = [], strip = [];
for (const k of [1, 4, 12]) {
  const f = inkFigure(randomText(mulberry32(100 + k), k));
  if (!f.ok) { console.error(`${k} clauses: ${f.reason}`); process.exit(1); }
  const { cols } = measure(f);
  const small = down3(f);
  fs.writeFileSync(path.join(out, `ink-${k}.png`), png(small.s, small.s, small.d));
  fs.writeFileSync(path.join(out, `ink-${k}.pbm`), pbm(f));
  strip.push(small);
  const verdict = Object.fromEntries(COLS.map(([c]) => [c, where(c, cols[c])]));
  figures.push({
    clauses: k, seed: 100 + k, nodes: f.nodes, columns: cols, verdict,
    // G12: a skeleton when any detail column is below the film's p10; a figure candidate only when every column is inside
    label: DETAIL.some((c) => verdict[c] === 'below') ? 'skeleton' : COLS.every(([c]) => verdict[c] === 'in') ? 'figure candidate' : "outside the film's range",
    outOfRange: COLS.filter(([c]) => verdict[c] !== 'in').map(([c]) => c),
    drawn: { filaments: f.filamentsDrawn, outward: f.outward, threads: f.threads, bulbs: f.bulbs, drops: f.satellites, spikes: f.spikes, spansDeg: f.spansDeg, gapDeg: f.gapDeg, squeeze: f.squeeze },
  });
  console.log(`${k} clauses: ${figures.at(-1).label}; outside p10 to p90: ${figures.at(-1).outOfRange.map((c) => `${c} ${cols[c]} (${verdict[c]} ${dist[c].p10} to ${dist[c].p90})`).join(', ') || 'none'}`);
}
{
  const s = strip[0].s, W = 3 * s, d = new Uint8Array(W * s);
  strip.forEach((m, i) => { for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) d[y * W + i * s + x] = m.d[y * s + x]; });
  fs.writeFileSync(path.join(out, 'ink-1-4-12.png'), png(W, s, d));
}

/* ---------- the corpus: F4-P4 ---------- */
const corpus = [];
for (let i = 0; i < NC; i++) {
  const k = 1 + (i % 5);
  const f = inkFigure(randomText(mulberry32(500 + i), k));
  if (!f.ok) { corpus.push({ i, k, error: f.reason }); console.log(`corpus ${i}: ${f.reason}`); continue; }
  const { cols } = measure(f);
  corpus.push({ i, k, drawn: f.filamentsDrawn, read: cols.filaments, cols });
  console.log(`corpus ${i} (${k} clauses): drawn ${f.filamentsDrawn}, read ${cols.filaments}`);
}
const okC = corpus.filter((c) => !c.error);
// a text that fails to draw counts against both parts: the denominator is every text of the corpus
const within30 = okC.filter((c) => Math.abs(c.read - c.drawn) <= 0.3 * c.drawn).length;
const inFilm = okC.filter((c) => where('filaments', c.read) === 'in').length;
const N = corpus.length;
const P4 = {
  id: 'F4-P4', texts: okC.length, errors: corpus.length - okC.length,
  a: { readWithin30pctOfDrawn: within30, share: +(within30 / Math.max(1, N)).toFixed(3), needed: 0.8 },
  b: { insideFilmP10toP90: inFilm, share: +(inFilm / Math.max(1, N)).toFixed(3), needed: 2 / 3, filmP10: dist.filaments.p10, filmP90: dist.filaments.p90 },
  byClauses: [1, 2, 3, 4, 5].map((k) => { const r = okC.filter((c) => c.k === k); return { clauses: k, drawn: r.map((c) => c.drawn), read: r.map((c) => c.read) }; }),
};
const held = within30 >= 0.8 * N && 3 * inFilm >= 2 * N;
// the prediction's outcome is its first run, on the code committed before it (5241298, inkfig-0.1); a later version reports how it does now
P4.firstOutcome = 'missed (bb8f228, inkfig-0.1: a 0.4, b 0.667)';
P4.thisRun = NC !== 30 ? 'not the committed corpus' : `${INK.version}: ${held ? 'would hold' : 'would miss'}`;
P4.outcome = INK.version === 'inkfig-0.1' ? (NC === 30 ? (held ? 'confirmed' : 'missed') : 'not the committed corpus') : 'missed (first outcome stands)';
const corpusShare = Object.fromEntries(COLS.map(([c]) => [c, +(okC.filter((x) => where(c, x.cols[c]) === 'in').length / Math.max(1, okC.length)).toFixed(3)]));

/* ---------- F4-P5: the film's bulbs ---------- */
const bm = med(bulbRatios);
// post-hoc by G13: the film's filaments were measured (runs/f4ink/film-suite.json, 14:07:26) before the prediction was
// committed (b062158, 14:09:12), research/ink.md had 1.5 to 2.5, and the band's lower edge sits at the bulb class's floor
// (1.5), so the median could not fall below it: the band could not miss on its low side (independent review, 2026-11-17)
const lo = 0.8 * 1.89, hi = 1.2 * 1.89;
const P5 = { id: 'F4-P5', bulbTipped: bulbRatios.length, medianTipRatio: +bm.toFixed(3), predicted: 1.89, band: [+lo.toFixed(3), +hi.toFixed(3)], inBand: bm >= lo && bm <= hi, outcome: 'post-hoc, not a test (G13): the film was measured before the prediction was committed, and the band could not miss below', p25: +Q(bulbRatios, 25).toFixed(3), p75: +Q(bulbRatios, 75).toFixed(3) };

const data = {
  about: 'F4-ink (BAR_F order of 2026-11-17): the inked ring figures of 1, 4 and 12 clauses and a corpus of 30 texts, measured by the detail suite at 3300 px beside the 18 film masters by distribution (p10 to p90 over the masters). Outcomes of F4-P4 and F4-P5 (predictions.json) are here; predictions.results.json is rewritten whole by heptapod_predictions.mjs and is not touched. Numbers only (research/ip.md rule 6). Written by tools/dev/heptapod_inkfig.mjs.',
  version: INK.version, ranOn: new Date().toISOString().slice(0, 10), filmMasters: film.length, calibrations: INK_CALIBRATIONS,
  columns: Object.fromEntries(COLS.map(([k, what]) => [k, what])), detailColumns: DETAIL, film: dist,
  figures, corpus: { texts: okC.length, shareInsideFilmP10toP90: corpusShare }, predictions: [P4, P5],
  readBack: 'deferred to the next slice, declared in BAR_F before this run',
};
fs.writeFileSync(DATA, JSON.stringify(data, null, 1));

/* ---------- the sheet (private) ---------- */
const fmt = (x) => (Math.abs(x) >= 10 ? x.toFixed(0) : Math.abs(x) >= 1 ? x.toFixed(2) : x.toFixed(3));
const refs = stills ? ['wolfram_ThereIsNoLinearTime1.jpg', 'wolfram_CowrittenLogogram1.jpg', 'wolfram_WeaponToolDuality1.jpg'].map((f) => path.join(stills, f)).filter((f) => fs.existsSync(f)) : [];
const cell = (src, cap) => `<figure><img src="${src}" width="520" height="520"><figcaption>${cap}</figcaption></figure>`;
const rows = COLS.map(([k, what]) => `<tr><td>${what}</td><td>${fmt(dist[k].p10)} to ${fmt(dist[k].p90)} (median ${fmt(dist[k].p50)})</td>${figures.map((F) => `<td class="${F.verdict[k]}">${fmt(F.columns[k])} ${F.verdict[k] === 'in' ? '' : F.verdict[k]}</td>`).join('')}<td>${Math.round(100 * corpusShare[k])}%</td></tr>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>F4 ink figures</title><style>
body{margin:0;padding:20px;background:#fff;color:#222;font:14px/1.45 system-ui,sans-serif}h1{font-size:18px;margin:0 0 6px}p{max-width:1100px}
.row{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}figure{margin:0;border:1px solid #ddd}figcaption{padding:6px 8px;max-width:504px}
table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left}.below,.above{background:#f3e3e0}
</style></head><body>
<h1>F4-ink: the ring figure in ink, with the suite's verdict (BAR_F G12)</h1>
<p>Each clause is a pool laid along the ring by brush strokes; each node other than a clause's main event is a filament (an entity's ends in a drop 1.89 times its thread); the carrier is a hairy brush that dries away from the pools. The film's range is p10 to p90 over its 18 masters. Reading the inked figure back is the next slice. Labels: ${figures.map((F) => `${F.clauses} clause${F.clauses > 1 ? 's' : ''}: ${F.label}`).join('; ')}.</p>
<div class="row">${figures.map((F) => cell(`ink-${F.clauses}.png`, `${F.clauses} clause${F.clauses > 1 ? 's' : ''}: ${F.nodes} nodes; ${F.drawn.filaments} filaments drawn, ${F.columns.filaments} read`)).join('')}</div>
${refs.length ? `<div class="row">${refs.map((f) => cell(pathToFileURL(path.resolve(f)).href, `The film: ${path.basename(f)} (private, never committed)`)).join('')}</div>` : ''}
<table><tr><th>column</th><th>film, ${film.length} masters, p10 to p90</th>${figures.map((F) => `<th>${F.clauses} clause${F.clauses > 1 ? 's' : ''}</th>`).join('')}<th>corpus of ${okC.length} inside</th></tr>${rows}</table>
<p>F4-P4 (filaments from the grammar): ${P4.outcome}; this run ${P4.thisRun}: read within 30% of drawn in ${Math.round(100 * P4.a.share)}% (80% needed), inside the film's p10 to p90 in ${Math.round(100 * P4.b.share)}% (67% needed). F4-P5 (bulbs from a breaking thread): ${P5.outcome}; median ${P5.medianTipRatio} over ${P5.bulbTipped} bulb-tipped film filaments, against 1.89. The negative controls of G3 are not run here (owed).</p>
<p>Calibrations: ${INK_CALIBRATIONS.map((c) => `${c.name} = ${+(+c.value).toFixed(4)} (${c.source})`).join('; ')}.</p>
</body></html>`;
fs.writeFileSync(path.join(out, 'sheet.html'), html);
console.log(`F4-P4 ${P4.outcome}; this run ${P4.thisRun}: a ${P4.a.share}, b ${P4.b.share}; F4-P5 ${P5.outcome}: median ${P5.medianTipRatio} (n ${P5.bulbTipped})`);
console.log(`wrote ${DATA} and ${path.join(out, 'sheet.html')}`);
