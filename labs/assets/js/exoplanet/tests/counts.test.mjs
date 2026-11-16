/* ============================================================
   The numbers the survey writes about the catalogue as a whole
   are counted by code, and these checks hold the words to the
   count. Run from the repository root:
     node labs/assets/js/exoplanet/tests/counts.test.mjs

   Why it exists: on 2026-11-16 the independent review of pull
   request 42 found two such sentences false. The title block said
   "6,464, 4,874 with a radius" (6,409 of the 6,464 have a radius;
   4,874 is how many names the roster lists), and the histogram of
   radii said "the fewest between 1.5 and 2, the radius valley"
   over the whole catalogue, whose bins there hold about 200 each,
   as many as either side. Each is now produced by a function that
   counts (catalog.js countLine, views/bands.js histWords), and
   checked here against a count made here, on made-up lists and on
   the committed snapshot with the weekly roster.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { countLine, loadSnapshot, joinRoster, provisionalMeasured } from '../catalog.js';
import { radiusBins, histWords, xr, BINS, R_LO, R_HI } from '../views/bands.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const digits = (s) => [...String(s).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, '')));

/* ---- the title block ---- */
const P = (R, measuredR) => ({ R, measuredR });
yes('before the roster, the planets alone', countLine([P(1, true), P(2, null), P(null, false)], false) === '3 planets', countLine([P(1, true), P(2, null), P(null, false)], false));
yes('one planet is said in the singular', countLine([P(1, true)], false) === '1 planet' && countLine([P(1, true)], true) === '1 planet, 1 with a measured radius', countLine([P(1, true)], true));
yes('after it, how many have a measured radius: a radius the roster does not list, or none, is not one', countLine([P(1, true), P(2, false), P(null, true), P(3, null), P(NaN, true), P(Infinity, true), P('2', true), P(4, true)], true) === '8 planets, 2 with a measured radius', countLine([P(1, true), P(2, false), P(null, true), P(3, null), P(NaN, true), P(Infinity, true), P('2', true), P(4, true)], true));
yes('thousands are grouped', countLine(Array.from({ length: 6464 }, (_, i) => P(1, i < 4874)), true) === '6,464 planets, 4,874 with a measured radius', countLine(Array.from({ length: 6464 }, (_, i) => P(1, i < 4874)), true));

/* ---- the histogram ---- */
const at = (i) => xr((i + 0.5) / BINS);   // the middle of bin i
yes('the histogram has 48 bins on its axis from 0.5 to 25 Earth radii', BINS === 48 && radiusBins([]).length === 48 && R_LO === 0.5 && R_HI === 25);
yes('a radius falls in the bin of its place on the axis, and the ends of the axis hold', (() => { const n = radiusBins([{ R: R_LO }, { R: at(10) }, { R: at(10) }, { R: R_HI * 0.999 }]); return n[0] === 1 && n[10] === 2 && n[BINS - 1] === 1 && n.reduce((a, b) => a + b, 0) === 4; })());
yes('a radius off the axis, none, one that is not a number, or one the roster says is not measured, is not drawn; one not yet known is', radiusBins([{ R: R_LO * 0.99 }, { R: R_HI }, { R: null }, { R: '2' }, { R: at(5), measuredR: false }, { R: at(5), measuredR: null }]).reduce((a, b) => a + b, 0) === 1);
const sample = [...Array(7).fill(at(12)), ...Array(3).fill(at(20)), ...Array(2).fill(at(30))].map((R) => ({ R }));
const words = histWords(radiusBins(sample));
const got = digits(words);
yes('the words count what is drawn, and name the bin with the most', words.startsWith('How many planets have each radius, from 0.5 to 25 Earth radii on a log scale: 12 planets, every survey together; the most, 7, between'), words);
yes('the bin with the most is named by its two edges on the axis', words.includes(`between ${xr(12 / BINS).toFixed(2)} and ${xr(13 / BINS).toFixed(2)}`) || words.includes(`between ${xr(12 / BINS).toFixed(1)} and ${xr(13 / BINS).toFixed(1)}`), `${xr(12 / BINS)} ${xr(13 / BINS)} | ${got.join(' ')}`);
yes('nothing drawn says so', /none drawn yet\.$/.test(histWords(new Array(BINS).fill(0))), histWords(new Array(BINS).fill(0)));
yes('the histogram never says the valley is its own: the one sentence about it says where it shows', !/fewest/.test(words) && (words.match(/valley/g) || []).length === 1 && /The radius valley, a dip near 1\.5 to 2\.0, shows in the Kepler sample that the radius against insolation diagram draws\.$/.test(words), words);

/* ---- the committed catalogue, with the weekly roster ---- */
const files = {
  'pscomppars-snapshot.json': join(here, '../../../data/exomania/pscomppars-snapshot.json'),
  'exoplanet_data.json': join(here, '../../../../exoplanet_data.json'),
};
globalThis.fetch = async (url) => {
  const f = Object.entries(files).find(([k]) => String(url).endsWith(k));
  if (!f) return { ok: false, status: 404 };
  const json = JSON.parse(readFileSync(f[1], 'utf8'));
  return { ok: true, status: 200, body: null, json: async () => json, headers: { get: () => null } };
};
const { list } = await loadSnapshot();
provisionalMeasured(list);
const before = countLine(list, false);
yes('before the roster, the title block counts the snapshot', digits(before)[0] === list.length && digits(before).length === 1, before);
await joinRoster(list);
const line = countLine(list, true), [nAll, nMeasured] = digits(line);
const measured = list.filter((p) => p.measuredR === true && Number.isFinite(p.R)).length;
yes('after it, the title block says how many planets there are and how many radii are measured, as counted here', nAll === list.length && nMeasured === measured && nMeasured < nAll, `${line} (counted ${list.length}, ${measured})`);
yes('and the radii it calls measured are fewer than the radii the list has', measured < list.filter((p) => Number.isFinite(p.R)).length, `${measured} measured of ${list.filter((p) => Number.isFinite(p.R)).length} with a radius`);

const n = radiusBins(list), say = histWords(n), nums = digits(say);
const top = n.indexOf(Math.max(...n));
yes('on the catalogue, the histogram\'s words count its bins', nums.includes(n.reduce((a, b) => a + b, 0)) && nums.includes(n[top]), `${say} | total ${n.reduce((a, b) => a + b, 0)}, most ${n[top]} in bin ${top}`);
/* A dip between 1.5 and 2 Earth radii: the emptiest bin there against the mean of the bins on each side (1.1 to 1.5,
   and 2 to 3), the lower of the two. 1 is no dip; 0.9 is a dip of 10%. On the committed catalogue it is 1.11 (the
   emptiest bin, 190, against a mean of 172 below and 290 above, 2026-11-16); a dip of 10% or more fails, so the
   bound sits at 0.95, between the two. */
const DIP_BOUND = 0.95;
const dip = (bins) => {
  const at2 = (i) => xr((i + 0.5) / bins.length);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const valley = bins.filter((_, i) => at2(i) >= 1.5 && at2(i) <= 2);
  const below = mean(bins.filter((_, i) => at2(i) >= 1.1 && at2(i) < 1.5)), above = mean(bins.filter((_, i) => at2(i) > 2 && at2(i) <= 3));
  return Math.min(...valley) / Math.min(below, above);
};
const flat = new Array(BINS).fill(100), dipped = flat.map((c, i) => (at(i) >= 1.5 && at(i) <= 2 ? 90 : c));
yes('the dip measure reads a flat histogram as no dip and a 10% dip as one past the bound', dip(flat) === 1 && dip(dipped) < DIP_BOUND && Math.abs(dip(dipped) - 0.9) < 1e-9, `${dip(flat)} ${dip(dipped)}`);
const real = dip(n);
yes('and the whole catalogue shows no valley of its own, which is why the words do not claim one', real >= DIP_BOUND, `emptiest bin between 1.5 and 2 over the lower side's mean: ${real.toFixed(3)} (bound ${DIP_BOUND})`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
