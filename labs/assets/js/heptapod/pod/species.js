/* ============================================================
   heptapod/pod/species.js — a species is a way of cutting the
   day-one world into concepts that English does not use.

   It starts from the twelve English concepts of the world (two
   parties, four acts, six objects) and applies operations, each
   English concept used at most once:
     split  one English word becomes two concepts, by a feature
            English ignores on it: an object by where it is (near
            the glass or far), an act by the size of the thing
            handled, "you" by whether the hand was empty.
     join   two English words of one class become one concept.
     novel  a concept with no English counterpart that crosses two
            English words: (o1 or o2) near the glass, with o1-far
            and o2-far left as their own words; for acts, (a1 or
            a2) on a small thing.
   Alienness is the share of a species' concepts that are not an
   English word. Operations are drawn in a seeded order until that
   share is within 0.05 of the target.

   Every concept gets a six-cell code from the lab's script, drawn
   in a seeded shuffle, so a concept is one radical in one sector.
   [ILLUSTRATIVE: the species are invented; the generator is the
   one the selection in tests/pod.test.mjs runs]
   ============================================================ */

import { mulberry32 } from '../raster.js';
import { makeCode } from '../script.js';
import { OBJECTS, OBJ, ACTS, PLACES, SCENES } from './world.js';

export const ALIEN_TOL = 0.05;

/* ---------------- seeded randomness ---------------- */
export function seedOf(...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/* ---------------- operations ---------------- */
const pairs = (xs) => xs.flatMap((x, i) => xs.slice(i + 1).map((y) => [x, y]));
export const OPS = [
  { type: 'split', cls: 'party', members: ['you'] },
  ...ACTS.map((a) => ({ type: 'split', cls: 'act', members: [a] })),
  ...OBJ.map((o) => ({ type: 'split', cls: 'obj', members: [o] })),
  { type: 'join', cls: 'party', members: ['you', 'me'] },
  ...pairs(ACTS).map((m) => ({ type: 'join', cls: 'act', members: m })),
  ...pairs(OBJ).map((m) => ({ type: 'join', cls: 'obj', members: m })),
  ...pairs(ACTS).map((m) => ({ type: 'novel', cls: 'act', members: m })),
  ...pairs(OBJ).map((m) => ({ type: 'novel', cls: 'obj', members: m })),
];
const NOVEL_ON = { act: 'small', obj: 'near' };
/* Every situation a concept of each class can be used in on day one; v is the value of the
   class's split feature (party: the hand before the act; act: the size handled; obj: the place). */
const SITS = {
  party: [{ name: 'you', v: 'empty' }, { name: 'you', v: 'full' }, { name: 'me', v: '-' }],
  act: ACTS.flatMap((a) => ['small', 'large'].map((v) => ({ name: a, v }))),
  obj: OBJ.flatMap((o) => PLACES.map((v) => ({ name: o, v }))),
};

function rulesFrom(ops) {
  const rules = {
    party: { you: { type: 'plain' }, me: { type: 'plain' } },
    act: Object.fromEntries(ACTS.map((a) => [a, { type: 'plain' }])),
    obj: Object.fromEntries(OBJ.map((o) => [o, { type: 'plain' }])),
  };
  for (const op of ops) for (const m of op.members) rules[op.cls][m] = op;
  return rules;
}
function concept(rules, cls, name, v) {
  const r = rules[cls][name];
  if (r.type === 'plain') return { id: `${cls}:${name}`, alien: false };
  if (r.type === 'split') return { id: `${cls}:${name}|${v}`, alien: true };
  if (r.type === 'join') return { id: `${cls}:${r.members.join('+')}`, alien: true };
  return v === NOVEL_ON[cls]
    ? { id: `${cls}:(${r.members.join('/')})&${v}`, alien: true }
    : { id: `${cls}:${name}|${v}`, alien: true };
}
function inventory(rules) {
  const ids = new Map();
  for (const cls of Object.keys(SITS)) for (const s of SITS[cls]) {
    const c = concept(rules, cls, s.name, s.v);
    ids.set(c.id, c.alien);
  }
  const alien = [...ids.values()].filter(Boolean).length;
  return { all: ids.size, alien, share: alien / ids.size, ids: [...ids.keys()] };
}

export const SECTORS = ['agent', 'pred', 'patient', 'recip'];
export const sectorDiff = (r1, r2) => SECTORS.reduce((n, k) => n + (r1[k] !== r2[k] ? 1 : 0), 0);
const tritStr = (code) => code.map((v) => (v < 0 ? '-' : v > 0 ? '+' : '0')).join('');

/**
 * The species at one alienness target and seed. Deterministic.
 * rings[i] is what the being writes about scene type i: per sector the radical (a six-character
 * string of - 0 +) and the concept id behind it; tokens are the distinct radicals of the ring.
 */
export function makeSpecies(target, sSeed) {
  const rng = mulberry32(seedOf('species', target, sSeed));
  let ops = [];
  if (target > 0) {
    let found = null;
    for (let tr = 0; tr < 100000 && !found; tr++) {
      const order = shuffle(OPS, rng);
      const used = new Set();
      const chosen = [];
      let share = 0;
      for (const op of order) {
        if (op.members.some((m) => used.has(op.cls + ':' + m))) continue;
        chosen.push(op);
        op.members.forEach((m) => used.add(op.cls + ':' + m));
        share = inventory(rulesFrom(chosen)).share;
        if (share >= target - ALIEN_TOL) break;
      }
      if (Math.abs(share - target) <= ALIEN_TOL) found = chosen;
    }
    if (!found) throw new Error(`no species within ${ALIEN_TOL} of alienness ${target} (seed ${sSeed})`);
    ops = found;
  }
  const rules = rulesFrom(ops);
  const inv = inventory(rules);
  const pool = shuffle([-1, 0, 1].flatMap((t) => Array.from({ length: 77 }, (_, i) => [t, i + 1])), rng);
  const trits = new Map(inv.ids.map((id, i) => [id, makeCode(pool[i][0], pool[i][1])]));
  const code = new Map(inv.ids.map((id) => [id, tritStr(trits.get(id))]));
  const idOfCode = new Map(inv.ids.map((id) => [code.get(id), id]));
  const rings = SCENES.map((s) => {
    const ids = {
      agent: concept(rules, 'party', 'you', s.act === 'lift' ? 'empty' : 'full').id,
      pred: concept(rules, 'act', s.act, OBJECTS[s.obj].size).id,
      patient: concept(rules, 'obj', s.obj, s.place).id,
      recip: s.act === 'give' ? concept(rules, 'party', 'me', '-').id : null,
    };
    const r = { ids };
    for (const k of SECTORS) r[k] = ids[k] ? code.get(ids[k]) : null;
    r.key = SECTORS.map((k) => r[k]).join('/');
    r.tokens = [...new Set(SECTORS.map((k) => r[k]).filter(Boolean))];
    return r;
  });
  // where each radical is used: the scene types whose ring carries it in any sector
  const ext = new Map(inv.ids.map((id) => [code.get(id), []]));
  rings.forEach((r, i) => { for (const t of r.tokens) ext.get(t).push(i); });
  const cls = new Map(inv.ids.map((id) => [id, id.slice(0, id.indexOf(':'))]));
  /* The greeting: the ring the being writes when a visitor arrives. Its word for itself, its word for
     a visitor with an empty hand, and two concepts that belong to no scene of day one. They take the
     next two codes of the same shuffle, so they are radicals of the same script, and nothing on the
     tray can ever point at them. */
  const far = ['far:1', 'far:2'];
  far.forEach((id, k) => {
    const [t, i] = pool[inv.ids.length + k];
    trits.set(id, makeCode(t, i)); code.set(id, tritStr(trits.get(id))); idOfCode.set(code.get(id), id);
    cls.set(id, 'far'); ext.set(code.get(id), []);
  });
  const gids = { agent: concept(rules, 'party', 'me', '-').id, pred: far[0], patient: far[1], recip: concept(rules, 'party', 'you', 'empty').id };
  const greeting = { ids: gids };
  for (const k of SECTORS) greeting[k] = code.get(gids[k]);
  greeting.key = SECTORS.map((k) => greeting[k]).join('/');
  greeting.tokens = [...new Set(SECTORS.map((k) => greeting[k]))];
  return { target, seed: sSeed, ops, inv, code, trits, idOfCode, cls, rings, ext, greeting };
}

export const opText = (op) => (op.type === 'split' ? `split ${op.members[0]}`
  : op.type === 'join' ? `join ${op.members.join('+')}`
  : `novel (${op.members.join('/')})&${NOVEL_ON[op.cls]}`);

/* The three species this page uses: of 80 species at alienness 0.25 or more, the ones where the
   largest share of proxy visitors ended day one between chance and ceiling (see proxy.js). */
export const GATE_SPECIES = [[1, 14], [1, 10], [0.75, 1]];
