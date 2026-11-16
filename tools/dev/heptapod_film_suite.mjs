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
import { readPBM, ringTable } from '../../labs/assets/js/heptapod/detail/ring.js';

const av = process.argv.slice(2);
const [dir, out] = av;
if (!dir || !out) { console.error('usage: heptapod_film_suite.mjs <masks dir> <out.json> [--against measure.json]'); process.exit(2); }
const ai = av.indexOf('--against');
const against = ai > 0 ? JSON.parse(fs.readFileSync(av[ai + 1], 'utf8')) : null;

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
  console.log(`${name}: R ${row.R_over_canvas.toFixed(3)}, closure ${row.ring_closure.toFixed(2)}, w_med ${row.w_med_R.toFixed(3)} R, ink/disc ${row.ink_over_disc.toFixed(2)}, blots ${row.n_blots}, droplets ${row.droplets_ge1u}, box dim ${row.boxdim.toFixed(3)}`);
}
fs.writeFileSync(out, JSON.stringify({ suite: 'heptapod-detail ring 0.1', masters: files.length, result }, null, 1));
for (const x of misses) console.log('MISS ' + x);
console.log(`${files.length} masters in ${((Date.now() - t0) / 1000).toFixed(0)} s` + (against ? `; ${compared - outside} of ${compared} columns within tolerance of the earlier measurement` : ''));
process.exit(misses.length ? 1 : 0);
