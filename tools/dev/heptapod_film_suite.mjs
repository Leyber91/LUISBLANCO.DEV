/* ============================================================
   tools/dev/heptapod_film_suite.mjs — runs the film-detail suite
   (labs/assets/js/heptapod/detail/) on the film's masters (film track
   F2, experiment E7a).

     node tools/dev/heptapod_film_suite.mjs <masks dir> <out.json> [--against measure.json]

   <masks dir> holds the PBM masks that _reference/.../film-tools/masks.py
   writes from the private masters. Only numbers leave this script; no
   image does (research/ip.md rule 6). With --against, every column of
   research/film.md 5.1 is compared with the earlier Python measurement
   (film-tools/measure.json): a continuous column passes within 10% of
   that value, a count within 10% or 1, whichever is larger. The exit
   code is 1 when any column of any master is outside.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPBM, ringTable, percentile } from '../../labs/assets/js/heptapod/detail/ring.js';
import { filaments } from '../../labs/assets/js/heptapod/detail/filaments.js';

const av = process.argv.slice(2);
const [dir, out] = av;
if (!dir || !out) { console.error('usage: heptapod_film_suite.mjs <masks dir> <out.json> [--against measure.json] [--overlay <html> --stills <dir>]'); process.exit(2); }
const opt = (k) => { const i = av.indexOf(k); return i > 0 ? av[i + 1] : null; };
const ai = av.indexOf('--against');
const against = ai > 0 ? JSON.parse(fs.readFileSync(av[ai + 1], 'utf8')) : null;
// the overlay sheet puts the private masters under what was measured; it is written for Luis's eyes only
const overlay = opt('--overlay'), stills = opt('--stills');
if (overlay && !stills) { console.error('--overlay needs --stills <dir of the masters>'); process.exit(2); }
const ALL = [], sheets = [];

const files = fs.readdirSync(dir).filter((f) => f.startsWith('wolfram_') && f.endsWith('.pbm')).sort();
if (!files.length) { console.error(`no wolfram_*.pbm masks in ${dir}`); process.exit(2); }

const COLS = [
  // [our key, measure.json key or path, kind]
  ['R_over_canvas', 'R_over_canvas', 'cont'],
  ['ring_closure', 'ring_closure', 'cont'],
  ['w_p25_R', 'w_p25_R', 'cont'],
  ['w_med_R', 'w_med_R', 'cont'],
  ['w_max_R', 'w_max_R', 'cont'],
  ['ink_over_disc', 'ink_over_disc', 'cont'],
  ['n_blots', 'n_blots', 'count'],
  ['droplets_ge1u', ['droplets', '>=1u'], 'count'],
  ['probes.1.1', ['probes', '1.1'], 'count'], ['probes.1.2', ['probes', '1.2'], 'count'], ['probes.1.35', ['probes', '1.35'], 'count'],
  ['probes.0.9', ['probes', '0.9'], 'count'], ['probes.0.8', ['probes', '0.8'], 'count'], ['probes.0.7', ['probes', '0.7'], 'count'],
  ['out_reach_max_R', 'out_reach_max_R', 'cont'],
  ['in_reach_max_R', 'in_reach_max_R', 'cont'],
  ['boxdim', 'boxdim', 'cont'],
];
/* the "blot clusters" column of research/film.md 5.1, as printed there (2026-11-11) */
const TABLE_CLUSTERS = { Abbott: 2, Costello: 1, CowrittenLogogram: 0, Earth: 2, HepWritesRealTime: 2, Heptapod: 1, Human: 4, Humanity: 1, Ian: 1,
  Louise: 1, OfferWeapon: 3, Solve: 1, ThereIsNoLinearTime: 3, Time: 3, Walk: 1, Weapon: 2, WeaponToolDuality: 5, YouHaveChooseLife: 5 };
const get = (o, k) => (Array.isArray(k) ? k.reduce((x, s) => (x == null ? x : x[s]), o) : o[k]);
const ours = (row, k) => (k.startsWith('probes.') ? row.probes[k.slice(7)] : row[k]);

const result = {};
const misses = [];
let compared = 0, outside = 0;
const t0 = Date.now();
for (const f of files) {
  const m = readPBM(fs.readFileSync(path.join(dir, f)));
  const row = ringTable(m);
  if (!row) { misses.push(`${f}: no ring fitted`); continue; }
  const name = f.replace(/\.pbm$/, '');
  result[name] = Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')));
  const ref = against && (against[name + '.jpg'] || against[name]);
  if (against && !ref) misses.push(`${name}: not in the earlier measurement`);
  if (ref) {
    const short = name.replace(/^wolfram_/, '').replace(/1$/, '');
    if (short in TABLE_CLUSTERS) {
      compared++;
      const want = TABLE_CLUSTERS[short], got = row.blot_clusters.length;
      // the same rule on the same masters: exact, not within a tolerance
      if (got !== want) outside++, misses.push(`${name} blot clusters: ${got} against ${want} in film.md 5.1`);
    } else misses.push(`${name}: not in film.md 5.1's cluster column`);
    for (const [k, rk, kind] of COLS) {
      const a = ours(row, k), b = get(ref, rk);
      if (typeof b !== 'number') { misses.push(`${name} ${k}: no earlier value`); continue; }
      compared++;
      const tol = kind === 'count' ? Math.max(0.1 * Math.abs(b), 1) : 0.1 * Math.abs(b);
      if (!(Math.abs(a - b) <= tol)) outside++, misses.push(`${name} ${k}: ${+a.toFixed(4)} against ${b} (allowed ${+tol.toFixed(4)})`);
    }
  }
  /* part 2a: filaments, in units of R and of the master's own w_med */
  const { R, cx, cy } = row._ring, wm = row.w_med_R * R;
  // shorter than the line is wide is roughness, not a filament; a branch along the ring is the carrier
  const F = filaments(m, { minLen: wm, ring: { ...row._ring, w: wm } }).filaments;
  const tips = {};
  let outward = 0;
  for (const f of F) {
    tips[f.tip] = (tips[f.tip] || 0) + 1;
    const out = Math.hypot(f.tipXY[0] - cx, f.tipXY[1] - cy) > Math.hypot(f.baseXY[0] - cx, f.baseXY[1] - cy);
    if (out) outward++;
    ALL.push({ len_w: f.length / wm, len_R: f.length / R, shaft_w: f.shaft / wm, shaft_R: f.shaft / R, shaftCV: f.shaftCV, straightness: f.straightness, turnDeg: f.turnDeg, tipRatio: f.tipRatio, taper: f.taper });
  }
  result[name].filaments = { n: F.length, tips, outward };
  if (overlay) {
    const d = (p) => p.filter((_, k) => k % 3 === 0 || k === p.length - 1).map((i, k) => `${k ? 'L' : 'M'}${i % m.W} ${(i / m.W) | 0}`).join('');
    sheets.push({ name, W: m.W, R, cx, cy, F: F.map((f) => ({ d: d(f.path), tip: f.tip })), tips, n: F.length });
  }
  console.log(`${name}: R ${row.R_over_canvas.toFixed(3)}, closure ${row.ring_closure.toFixed(2)}, w_med ${row.w_med_R.toFixed(3)} R, ink/disc ${row.ink_over_disc.toFixed(2)}, blots ${row.n_blots}, droplets ${row.droplets_ge1u}, box dim ${row.boxdim.toFixed(3)}; filaments ${F.length} (${outward} outward) ${JSON.stringify(tips)}`);
}
/* the film's filament distribution, all masters pooled: the reference of BAR_F G9 */
const Q = [1, 5, 25, 50, 75, 95, 99];
const dist = {};
for (const k of ['len_w', 'len_R', 'shaft_w', 'shaft_R', 'shaftCV', 'straightness', 'turnDeg', 'tipRatio', 'taper']) {
  const s = Float64Array.from(ALL.map((x) => x[k])).sort();
  dist[k] = Object.fromEntries(Q.map((q) => [`p${q}`, +percentile(s, q).toFixed(4)]));
}
const tipsAll = {};
for (const r of Object.values(result)) for (const [t, n] of Object.entries(r.filaments.tips)) tipsAll[t] = (tipsAll[t] || 0) + n;
const filamentSummary = { n: ALL.length, perMaster: Object.fromEntries(Object.entries(result).map(([k, r]) => [k.replace(/^wolfram_/, ''), r.filaments.n])), tips: tipsAll, dist };
fs.writeFileSync(out, JSON.stringify({ suite: 'heptapod-detail ring 0.1, filaments 0.1', masters: files.length, filaments: filamentSummary, result }, null, 1));
console.log(`filaments: ${ALL.length} on ${files.length} masters, tips ${JSON.stringify(tipsAll)}`);
for (const [k, v] of Object.entries(dist)) console.log(`  ${k.padEnd(13)} ${Object.entries(v).map(([q, x]) => `${q} ${x}`).join('  ')}`);
if (overlay) {
  const COL = { bulb: '#e8590c', flat: '#1c7ed6', pointed: '#c2255c' };
  const P = 520;
  const cells = sheets.map((s) => `<figure><div class="p"><img src="${pathToFileURL(path.join(stills, s.name + '.jpg')).href}" width="${P}" height="${P}">` +
    `<svg viewBox="0 0 ${s.W} ${s.W}" width="${P}" height="${P}"><circle cx="${s.cx}" cy="${s.cy}" r="${s.R}" fill="none" stroke="#1c7ed6" stroke-width="5" stroke-dasharray="30 30" opacity="0.6"/>` +
    s.F.map((f) => `<path d="${f.d}" fill="none" stroke="${COL[f.tip]}" stroke-width="16" stroke-linecap="round" opacity="0.85"/>`).join('') +
    `</svg></div><figcaption>${s.name.replace(/^wolfram_/, '')}: ${s.n} filaments ${JSON.stringify(s.tips).replace(/[{}"]/g, '').replace(/,/g, ', ')}</figcaption></figure>`).join('');
  fs.mkdirSync(path.dirname(overlay), { recursive: true });
  fs.writeFileSync(overlay, `<!doctype html><html><head><meta charset="utf-8"><title>F2 filaments</title><style>body{margin:0;padding:20px;background:#fff;font:14px system-ui,sans-serif;color:#222}` +
    `.g{display:grid;grid-template-columns:repeat(6,${P}px);gap:14px}.p{position:relative;width:${P}px;height:${P}px}.p svg{position:absolute;left:0;top:0}figure{margin:0}` +
    `figcaption{padding:4px 2px}h1{font-size:17px;margin:0 0 12px}</style></head><body><h1>F2 part 2a: every filament the suite found, by tip: ` +
    `<span style="color:${COL.bulb}">bulb</span>, <span style="color:${COL.flat}">flat</span>, <span style="color:${COL.pointed}">pointed</span>; the fitted ring dashed. Private: the masters are the film's.</h1><div class="g">${cells}</div></body></html>`);
  console.log(`overlay: ${overlay} (private)`);
}
for (const x of misses) console.log('MISS ' + x);
console.log(`${files.length} masters in ${((Date.now() - t0) / 1000).toFixed(0)} s` + (against ? `; ${compared - outside} of ${compared} columns within tolerance of the earlier measurement` : ''));
process.exit(misses.length ? 1 : 0);
