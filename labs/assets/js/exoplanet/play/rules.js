// @ts-check
/* ============================================================
   exoplanet/play/rules.js — the questions of a round, as rules.

   A rule is data and two functions: what it asks, and how it is
   drawn on the catalogue. Drawn by a seed on real planets it
   gives an instance: the planets, the cues the visitor reasons
   from, the answer keys and the right one. The key is computed
   when the instance is drawn, from the archive's orbital period
   (pl_orbper), the one source of a year on every sheet; nothing
   is a stored answer.

   The idea is Kepler's third law, P^2 = a^3 / M (P in years, a
   in AU, M in solar masses, the planet's mass left out). The
   cues are the orbit and the star's mass as sheet B prints them
   (semiMajor, three figures; the archive's mass, three figures).
   A planet is asked about only when the page computes its orbit
   from its period and its star's mass by that law, so the cues
   decide the key: a planet of two stars, or one whose orbit is
   the archive's, is left out. And only when the two years
   differ by BAR times or more, so the cues' three figures, which
   move a year by under 1%, never turn an answer round.

   Every function here is pure: a list and a seed in, an
   instance out. The round and its page are round.js.
   ============================================================ */

import { semiMajor } from '../starlight.js';
import { mulberry32, seedOf, shuffle } from '../../kit/rng.js';
import { num } from '../../kit/format.js';

/** @typedef {{ name: string, host: string, P: number | null, Ms: number | null }} Planet */
/** @typedef {{ name: string, a: number, M: number, P: number }} Cue */
/** @typedef {{ key: string, words: string }} Choice */
/** @typedef {{ rule: string, unit: string, id: string, ask: string, cues: Cue[], choices: Choice[], key: string, earth: boolean, ratio: number, misleads: boolean }} Instance */

/** Earth's year in days: the year the page compares with. */
export const YEAR_D = 365.25;
/** Two years are asked about only when one is at least this many times the other. */
export const BAR = 1.05;
/** A round: this many questions, at least PER_RULE of each rule. */
export const ROUND = 10, PER_RULE = 3;
/** The tries a rule takes to find an instance before it says it cannot be drawn. */
const TRIES = 400;

/** The year from the cues, by the law: sqrt(a^3 / M) years, in days. @param {number} a @param {number} M */
export const lawDays = (a, M) => Math.sqrt((a * a * a) / M) * YEAR_D;
/** How the cues are printed: three figures, as sheet B prints the orbit and the star's mass. @param {number} v */
export const cue = (v) => num(v, 3);

/** A planet a rule may ask about, with its cues; null when it may not.
   @param {Planet} p @returns {Cue | null} */
export function cueOf(p) {
  if (!(typeof p.P === 'number' && p.P > 0) || !(typeof p.Ms === 'number' && p.Ms > 0)) return null;
  const o = semiMajor(p);
  if (o.src !== "Kepler's third law" || !(o.a > 0)) return null;
  return { name: p.name, a: o.a, M: p.Ms, P: p.P };
}

/** How many times the longer of two years is the shorter. @param {number} x @param {number} y */
export const ratioOf = (x, y) => Math.max(x, y) / Math.min(x, y);
/** Whether the orbits alone point the wrong way: the larger orbit has the shorter year. @param {Cue} x @param {Cue} y */
export const orbitsMislead = (x, y) => (x.a > y.a) !== (x.P > y.P);
/** The same against Earth's 1 AU and 365.25 days. @param {Cue} x */
export const misleadsEarth = (x) => (x.a > 1) !== (x.P > YEAR_D);

/** The planets of the catalogue each rule draws on: those with cues, and the stars with two or more of them.
   @param {Planet[]} list */
export function pool(list) {
  /** @type {Cue[]} */
  const cues = [];
  /** @type {Map<string, Cue[]>} */
  const byHost = new Map();
  /** @type {Map<string, string>} */
  const hostOf = new Map();
  for (const p of list) {
    const c = cueOf(p);
    if (!c) continue;
    cues.push(c); hostOf.set(c.name, p.host);
    const h = byHost.get(p.host); if (h) h.push(c); else byHost.set(p.host, [c]);
  }
  const families = [...byHost.values()].filter((f) => f.length >= 2);
  return { cues, families, hostOf };
}

/* The words of each question. A pair's keys are its planets' names; Earth's are "shorter" and "longer". */
/** @param {Cue} x @param {Cue} y @returns {Choice[]} */
const pairChoices = (x, y) => [{ key: x.name, words: x.name }, { key: y.name, words: y.name }];
const EARTH_CHOICES = Object.freeze([{ key: 'shorter', words: 'Shorter' }, { key: 'longer', words: 'Longer' }]);

/** @typedef {ReturnType<typeof pool>} Pool */
/** @typedef {{ id: string, unit: string, words: string, draw: (pl: Pool, rng: () => number, used: Set<string>, mislead: boolean) => Instance | null }} Rule */

/** @type {readonly Rule[]} */
export const RULES = Object.freeze([
  {
    id: 'orbits.sibling', unit: 'exo-u2', words: 'Same star, farther out',
    draw(pl, rng, used) {
      for (let i = 0; i < TRIES; i++) {
        const f = pl.families[Math.floor(rng() * pl.families.length)];
        if (!f) return null;
        const [x, y] = shuffle(f.filter((c) => !used.has(c.name)), rng);
        if (!x || !y || ratioOf(x.P, y.P) < BAR) continue;
        return { rule: 'orbits.sibling', unit: 'exo-u2', id: `orbits.sibling|${x.name}|${y.name}`, ask: `${x.name} and ${y.name} orbit the same star. Which has the longer year?`,
          cues: [x, y], choices: pairChoices(x, y), key: x.P > y.P ? x.name : y.name, earth: false, ratio: ratioOf(x.P, y.P), misleads: false };
      }
      return null;
    },
  },
  {
    id: 'orbits.earth', unit: 'exo-u2', words: 'Against Earth\'s year',
    draw(pl, rng, used, mislead) {
      const near = pl.cues.filter((c) => !used.has(c.name) && ratioOf(c.P, YEAR_D) >= BAR && c.a >= 0.3 && c.a <= 3 && misleadsEarth(c) === mislead);
      const x = near[Math.floor(rng() * near.length)];
      if (!x) return null;
      return { rule: 'orbits.earth', unit: 'exo-u2', id: `orbits.earth|${x.name}`, ask: `Is ${x.name}'s year shorter or longer than Earth's?`,
        cues: [x], choices: [...EARTH_CHOICES], key: x.P > YEAR_D ? 'longer' : 'shorter', earth: true, ratio: ratioOf(x.P, YEAR_D), misleads: mislead };
    },
  },
  {
    id: 'orbits.pair', unit: 'exo-u2', words: 'Two stars',
    draw(pl, rng, used, mislead) {
      const free = pl.cues.filter((c) => !used.has(c.name));
      for (let i = 0; i < TRIES; i++) {
        const x = free[Math.floor(rng() * free.length)], y = free[Math.floor(rng() * free.length)];
        if (!x || !y || x === y || pl.hostOf.get(x.name) === pl.hostOf.get(y.name)) continue;
        if (ratioOf(x.P, y.P) < BAR || ratioOf(x.P, y.P) > 20 || orbitsMislead(x, y) !== mislead) continue;
        return { rule: 'orbits.pair', unit: 'exo-u2', id: `orbits.pair|${x.name}|${y.name}`, ask: `${x.name} and ${y.name} orbit different stars. Which has the longer year?`,
          cues: [x, y], choices: pairChoices(x, y), key: x.P > y.P ? x.name : y.name, earth: false, ratio: ratioOf(x.P, y.P), misleads: mislead };
      }
      return null;
    },
  },
]);

/** The words for a rule that could not be drawn. @param {string} id */
export const cannotDraw = (id) => `the catalogue has no planets left for the question "${(RULES.find((r) => r.id === id) || { words: id }).words}"`;

/** A round of ROUND questions on the catalogue, the same for the same seed: the rules in the order of the idea (the
   same star, then Earth's year, then two stars), PER_RULE or more of each, no planet twice. For Earth and two stars,
   every other question is one where the orbits alone point the wrong way and the star's mass decides it, while the
   catalogue has one. `why` names a rule that could not be drawn; the round is then shorter.
   @param {Planet[]} list @param {number} seed @returns {{ items: Instance[], why: string[] }} */
export function buildRound(list, seed) {
  const pl = pool(list), rng = mulberry32(seedOf('exomania-round', seed)), used = new Set();
  const plan = ['orbits.sibling', 'orbits.sibling', 'orbits.sibling', 'orbits.sibling', 'orbits.earth', 'orbits.earth', 'orbits.earth', 'orbits.pair', 'orbits.pair', 'orbits.pair'];
  /** @type {Instance[]} */
  const items = [];
  /** @type {string[]} */
  const why = [];
  /** @type {Record<string, number>} */
  const n = {};
  for (const id of plan.slice(0, ROUND)) {
    const r = /** @type {Rule} */ (RULES.find((x) => x.id === id));
    n[id] = (n[id] || 0) + 1;
    const mislead = id !== 'orbits.sibling' && n[id] % 2 === 0;
    const it = r.draw(pl, rng, used, mislead) || (mislead ? r.draw(pl, rng, used, false) : null);
    if (!it) { if (!why.includes(cannotDraw(id))) why.push(cannotDraw(id)); continue; }
    for (const c of it.cues) used.add(c.name);
    items.push(it);
  }
  return { items, why };
}

/** Whether an answer is the key. @param {Instance} it @param {string} answer */
export const isRight = (it, answer) => answer === it.key;
