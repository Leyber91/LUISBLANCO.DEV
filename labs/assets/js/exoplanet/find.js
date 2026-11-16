/* ============================================================
   exoplanet/find.js — finding worlds by what they are like.
   Pure functions, no DOM: the page's filter and its list of
   results call these, and so do the tests.

   A kind is the renderer's own reading of a planet (data.js
   lookOf), so a world found as "airless" is drawn airless.
   ============================================================ */

import { classify } from './data.js';
import { equilibriumTemp, insolation, earthLikeness, sizeClassOf } from './science.js';
import { PHYS } from './config.js';
import { int } from '../kit/format.js';

const isNum = (v) => typeof v === 'number' && isFinite(v);

/* "cold" is an equilibrium temperature under COLD_K and "hot" one of HOT_K or more. */
export const COLD_K = 200, HOT_K = 1000;
/* A published temperature more than this many times what the starlight gives is the planet's own heat. */
export const OWN_HEAT = 2;

/* The kind of world the picture draws for a planet, kept once per planet: its look, whether it is drawn
   with one face to its star, the label the page prints, and whether the archive holds a radius for it
   at all (without one the picture uses a stand-in size and the world has no kind to be found by). */
const kinds = new WeakMap();
export function kindOf(p) {
  let k = kinds.get(p);
  if (!k) { const c = classify(p); k = { look: c.look, locked: c.locked, label: c.label, drawn: c.physics.radiusKnown }; kinds.set(p, k); }
  return k;
}

/* The equilibrium temperature a world is found by: the published one, else the one this page computes from
   the starlight at Bond albedo 0.3 (science.js equilibriumTemp), which needs the star's temperature and
   radius and the orbit, or the archive's insolation. Null when neither exists: a world with no published
   value whose star lacks a temperature or a radius is not given one.
   Null too for a planet seen by its own heat. Those are young giants, most of them found by direct imaging
   far from their stars: the starlight would leave them at a few kelvin while they glow at a thousand, and
   the temperature the archive lists for them is their own. Two tests find them: the method is imaging, or
   the published value is more than OWN_HEAT times what the starlight gives (bet Pic c, found by radial
   velocity, is listed at 1,250 K where the starlight gives 268 K; on 2026-11-15 the archive had 64 such
   worlds). Neither number is an equilibrium with starlight, so such a planet is not cold, not hot, and comes
   last in an order by temperature. */
export function tempOf(p) {
  if (p.method === 'Imaging') return null;
  const t = equilibriumTemp(p, 0.3);
  if (isNum(p.Teq) && isNum(t) && p.Teq > OWN_HEAT * t) return null;
  if (isNum(p.Teq)) return { T: p.Teq, published: true };
  return isNum(t) ? { T: t, published: false } : null;
}

export function isCold(p) {
  const t = tempOf(p);
  return !!t && t.T < COLD_K;
}
export function isHot(p) {
  const t = tempOf(p);
  return !!t && t.T >= HOT_K;
}
/* One of the kinds asked for, by the picture's own rule. */
export const hasKind = (p, looks) => { const k = kindOf(p); return k.drawn && looks.includes(k.look); };
/* Drawn with one face to its star: from the orbit and the star's mass, so it needs no radius. */
export const isLocked = (p) => kindOf(p).locked;

/* ---------- the order of a list of results ---------- */

export const sortValue = (p, key) => (key === 'earthlike' ? earthLikeness(p) : key === 'S' ? insolation(p).S : key === 'dist' ? p.dist
  : key === 'T' ? (tempOf(p) || {}).T : p[key]);

/* The order a question asked for; nearest first for a question that named none; most Earth-like first
   for a filter set with the chips alone. */
export const orderFor = (querySort, hasQuestion) => querySort || (hasQuestion ? { key: 'dist', dir: 1 } : { key: 'earthlike', dir: -1 });

export const sortWords = (s) => ({ dist: s.dir > 0 ? 'nearest first' : 'farthest first', earthlike: s.dir < 0 ? 'most Earth-like first' : 'least Earth-like first',
  T: s.dir > 0 ? 'coldest first' : 'hottest first',
  R: s.dir > 0 ? 'smallest first' : 'largest first', P: s.dir > 0 ? 'shortest year first' : 'longest year first',
  year: s.dir < 0 ? 'most recently found first' : 'earliest found first', S: s.dir > 0 ? 'least starlight first' : 'most starlight first' })[s.key];

/* The worlds that pass, in order. Worlds with no value to order by come last, in catalogue order. `known` is
   how many of them have a value: with none, the order asked for was not applied to anything. */
export function rank(list, passes, sort, limit) {
  const pool = list.filter(passes);
  const val = (p) => sortValue(p, sort.key);
  const known = pool.filter((p) => isNum(val(p))).length;
  pool.sort((a, b) => { const x = val(a), y = val(b); return isNum(x) && isNum(y) ? sort.dir * (x - y) : isNum(x) ? -1 : isNum(y) ? 1 : 0; });
  return { sort, total: pool.length, known, hits: limit ? pool.slice(0, limit) : pool };
}
/* The words for the order of a ranked list: the order itself, or that none of the worlds has the value. */
export const orderWords = (r) => (r.total > 0 && r.known === 0 ? 'in catalogue order, since none of them has a value to order by' : sortWords(r.sort));

/* ---------- what a line of results says ---------- */

const fmtInt = (v) => int(v);
const fmt = (v, d) => { const a = Math.abs(v); return a >= 100 ? fmtInt(v) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toPrecision(d); };

/* The kind a world is drawn as. Where the archive's radius is not a measurement the line says so; where it
   holds none, the size class its bounds give, or that no radius is known. */
export function kindLine(p) {
  const k = kindOf(p);
  if (k.drawn) return k.label.toLowerCase() + (p.measuredR ? '' : ', radius not measured');
  const sc = sizeClassOf(p);
  return sc ? `${sc.label.toLowerCase()} by its radius bound` : 'no radius known';
}
/* The kind, and the value the list is ordered by, with its unit. */
export function hitFact(p, key) {
  const t = tempOf(p);
  const v = key === 'dist' ? (isNum(p.dist) ? `${fmtInt(p.dist * PHYS.PC_LY)} ly` : 'distance unknown')
    : key === 'T' ? (t ? `${fmtInt(t.T)} K${t.published ? '' : ' computed'}` : 'no equilibrium temperature')
    : key === 'R' ? (isNum(p.R) ? `${fmt(p.R, 3)} R⊕` : 'no radius')
    : key === 'P' ? (isNum(p.P) ? `${fmt(p.P, 3)} d` : 'no period')
    : key === 'year' ? (p.year ? String(p.year) : '')
    : key === 'S' ? (insolation(p).S ? `${fmt(insolation(p).S, 3)} S⊕` : 'no insolation')
    : isNum(earthLikeness(p)) ? `likeness ${earthLikeness(p).toFixed(2)}` : '';
  const k = kindLine(p);
  return v ? `${k}, ${v}` : k;
}
