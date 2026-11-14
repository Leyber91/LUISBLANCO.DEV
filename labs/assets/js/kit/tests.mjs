/* ============================================================
   kit/tests.mjs — the shared kit, checked in Node.

     node labs/assets/js/kit/tests.mjs

   The kit replaced copies that other labs' recorded results
   depend on, so the first duty here is equality with what it
   replaced: each older way of writing the generator is kept below
   as a reference and compared draw by draw. The one copy that was
   wrong (Altverse's, whose state was not kept to 32 bits) is
   compared up to the draw where it left the sequence.
   ============================================================ */

import { mulberry32, fnv1a, seedOf, streamSeed, randInt, pick, shuffle, weightedPick, normalFrom } from './rng.js';

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${a}, expected ${b}`);

/* ---------------- the generator against the copies it replaced ---------------- */
/* memes/random.js, as it was: the state kept as a signed 32-bit integer */
function memesWas(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* altverse/rng.js, as it was: the state grows without bound */
function altverseWas(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEEDS = [0, 1, 2, 42, 20261113, 0x7fffffff, 0x80000000, 0xffffffff, 123456789];
for (const seed of SEEDS) {
  const a = mulberry32(seed), b = memesWas(seed), c = altverseWas(seed);
  let same = true, sameAlt = true;
  for (let i = 0; i < 200000; i++) { const x = a(); if (x !== b()) same = false; if (x !== c()) sameAlt = false; }
  ok(same, `seed ${seed}: the same 200,000 numbers as the signed-state copy`);
  ok(sameAlt, `seed ${seed}: the same first 200,000 numbers as Altverse's copy, so its worlds replay unchanged`);
}
{ // where the unbounded copy left the sequence, and the kit does not
  const a = mulberry32(1), c = altverseWas(1);
  let first = -1;
  for (let i = 1; i <= 5000000 && first < 0; i++) if (a() !== c()) first = i;
  eq(first, 4917760, 'for seed 1 the unbounded copy first differs at this draw (4,917,759 draws agree)');
}
{ // golden values, so a change to the generator cannot pass by changing both sides
  const g = mulberry32(1);
  const first = [g(), g(), g()].map((x) => Math.round(x * 4294967296));
  eq(first.join(','), '2693262067,11749833,2265367787', 'mulberry32(1), first three draws as 32-bit integers');
  ok(Array.from({ length: 1000 }, mulberry32(7)).every((x) => x >= 0 && x < 1), 'every draw is in [0, 1)');
  eq(mulberry32(5)(), mulberry32(5 + 4294967296)(), 'a seed is taken modulo 2^32');
}

/* ---------------- the hash ---------------- */
eq(fnv1a(''), 0x811c9dc5, 'FNV-1a of the empty string is its offset basis');
eq(fnv1a('a'), 0xe40c292c, 'FNV-1a of "a" (the published test vector)');
eq(fnv1a('foobar'), 0xbf9cf968, 'FNV-1a of "foobar" (the published test vector)');
eq(seedOf('species', 0.75, 3), fnv1a('species|0.75|3'), 'seedOf joins its parts with a bar');
ok(seedOf('a', 1) !== seedOf('a', 2) && seedOf('a', 1) === seedOf('a', 1), 'a seed is stable and differs by label');
{ // streamSeed against ai-health's streamFor as it was
  const was = (seed, label) => { let h = 2166136261 ^ (seed >>> 0); const s = String(label); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  let same = true;
  for (const seed of SEEDS) for (const label of ['', 'train', 'test', 'bed-12', 'ward/3', 7]) if (streamSeed(seed, label) !== was(seed, label)) same = false;
  ok(same, 'streamSeed gives the seeds ai-health drew its streams from');
}

/* ---------------- draws ---------------- */
{
  const r = mulberry32(9);
  const ints = Array.from({ length: 5000 }, () => randInt(r, 3, 7));
  ok(Math.min(...ints) === 3 && Math.max(...ints) === 7, 'randInt reaches both ends and no further');
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const before = list.join('');
  const sh = shuffle(list, r);
  eq(list.join(''), before, 'shuffle leaves the list it was given as it was');
  eq(sh.slice().sort().join(''), before, 'and returns the same items');
  eq(shuffle(list, mulberry32(3)).join(''), shuffle(list, mulberry32(3)).join(''), 'the same seed gives the same order');
  ok(new Set(Array.from({ length: 200 }, () => shuffle(list, r).join(''))).size > 150, 'different draws give different orders');
  ok(Array.from({ length: 2000 }, () => pick(list, r)).every((x) => list.includes(x)), 'pick returns an item of the list');
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 30000; i++) counts[weightedPick(['a', 'b', 'c'], [0, 1, 3], r)]++;
  eq(counts.a, 0, 'an item of weight zero is never drawn');
  ok(Math.abs(counts.c / counts.b - 3) < 0.2, `weights 1 and 3 are drawn about one to three (got ${(counts.c / counts.b).toFixed(2)})`);
  eq(weightedPick(['a', 'b'], [0, 1], () => 0), 'b', 'a draw of exactly 0 does not return a zero-weight first item');
  const n = normalFrom(mulberry32(11));
  const xs = Array.from({ length: 40000 }, () => n(2, 3));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  ok(Math.abs(mean - 2) < 0.06 && Math.abs(sd - 3) < 0.06, `normal(2, 3) has that mean and spread (got ${mean.toFixed(3)}, ${sd.toFixed(3)})`);
}

/* ---------------- dom.js: what does not need a document ---------------- */
{
  const { esc, el } = await import('./dom.js');
  eq(esc('<img src=x onerror="a(\'b\')">&'), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;', 'esc leaves nothing that opens a tag or closes a quoted attribute');
  eq(esc(null), '', 'esc of nothing is the empty string');
  eq(esc(12), '12', 'esc takes a number');
  // el with a stand-in document: the text goes to textContent and never to innerHTML
  const made = [];
  globalThis.document = { createElement: (tag) => { const n = { tag, className: '', set innerHTML(v) { n.parsed = v; } }; made.push(n); return n; } };
  const n = el('p', 'x', '<b>bold</b>');
  ok(n.tag === 'p' && n.className === 'x' && n.textContent === '<b>bold</b>' && n.parsed === undefined, 'el writes its text as text');
  ok(el('div').textContent === undefined && el('div', '', 0).textContent === 0, 'no text leaves the element empty, and 0 is a text');
  delete globalThis.document;
}

if (fails.length) { console.log(`kit tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`kit tests: ${passed} passed, 0 failed`);
