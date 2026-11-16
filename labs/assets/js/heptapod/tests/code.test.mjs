/* ============================================================
   heptapod/tests/code.test.mjs — the motif code (film track F3, E2).

     node labs/assets/js/heptapod/tests/code.test.mjs

   Every property is checked on the finished code by a method other
   than the one that built it: the words as strings of cells and
   substrings of their concatenations, not base-3 arithmetic.
   1. The seed rule: CODE_SEED is the seed of 1..SEED_SEARCH with the
      most flip pairs; the same seed builds the same code twice.
   2. Every partition is filled.
   3. Over every ordered pair of words: no word inside the two written
      side by side (comma-free); no run longer than RUN across the
      join; any two words at least DIST cells apart; the set closed
      under the sign flip; no word's reversal, at any rotation, in the
      code, and no word its own reversal up to rotation.
   4. Framing in use: streams of random words read from every start
      offset find words at exactly the true boundaries; mirrored
      streams never hold a frame.
   5. Every single-cell misread of every word is not a word.
   Exits 1 on any failure.
   ============================================================ */

import { mulberry32 } from '../topo/rng.js';
import { buildCode, partition, PARTITIONS, CODE_SEED, SEED_SEARCH, theCode, show, K, RUN, DIST } from '../topo/code.js';

let checks = 0, failures = 0;
const ok = (cond, what) => { checks++; if (!cond) { failures++; console.log('FAIL ' + what); } };

/* 1. the seed rule */
{
  let best = 0, bestSeed = 0;
  for (let s = 1; s <= SEED_SEARCH; s++) { const n = buildCode({ seed: s }).pairs.length; if (n > best) { best = n; bestSeed = s; } }
  ok(bestSeed === CODE_SEED, `seed rule: seed ${bestSeed} has the most pairs (${best}) of 1..${SEED_SEARCH}, CODE_SEED is ${CODE_SEED}`);
  const a = theCode(), b = theCode();
  ok(a.words.length === b.words.length && a.words.every((w, i) => w === b.words[i]), 'the same seed builds the same code');
}

const code = theCode();
const W = code.words.map(show);              // words as strings of '-', '0', '+'
const SET = new Set(W);
const flipS = (s) => s.replace(/[-+]/g, (c) => (c === '-' ? '+' : '-'));
const revS = (s) => [...s].reverse().join('');
const rotsS = (s) => Array.from({ length: K }, (_, i) => s.slice(i) + s.slice(0, i));

/* 2. partitions */
{
  const p = partition(code);
  ok(Object.keys(p.short).length === 0, `partitions: short ${JSON.stringify(p.short)}`);
  for (const [name, n, kind] of PARTITIONS) ok(p.parts[name].length === n, `partition ${name}: ${p.parts[name].length} of ${n} ${kind === 'pair' ? 'pairs' : 'words'}`);
}

/* 3. the properties over every pair */
{
  let comma = 0, runs = 0, near = 0, flipMissing = 0, mirror = 0, selfRev = 0;
  const runRe = new RegExp(`(.)\\1{${RUN}}`);
  for (const a of W) {
    if (!SET.has(flipS(a))) flipMissing++;
    const rr = rotsS(revS(a));
    if (rr.includes(a)) selfRev++;
    if (rr.some((x) => SET.has(x))) mirror++;
    if (runRe.test(a)) runs++;
    for (const b of W) {
      const ab = a + b;
      for (let i = 1; i < K; i++) if (SET.has(ab.slice(i, i + K))) comma++;
      if (runRe.test(ab)) runs++;
      if (a < b) { let d = 0; for (let i = 0; i < K; i++) if (a[i] !== b[i]) d++; if (d < DIST) near++; }
    }
  }
  ok(comma === 0, `comma-free: ${comma} words found inside two words side by side`);
  ok(runs === 0, `run limit: ${runs} words or joins with a run longer than ${RUN}`);
  ok(near === 0, `distance: ${near} pairs of words fewer than ${DIST} cells apart`);
  ok(flipMissing === 0, `sign flip: ${flipMissing} words whose flip is not in the code`);
  ok(mirror === 0 && selfRev === 0, `mirror: ${mirror} words whose reversal (at some rotation) is a word, ${selfRev} their own reversal`);
}

/* 4. framing in use */
{
  const rnd = mulberry32(42);
  let wrong = 0, mirrorFrames = 0, streams = 0;
  for (let t = 0; t < 300; t++) {
    const n = 20, idx = Array.from({ length: n }, () => Math.floor(rnd() * W.length));
    const s = idx.map((i) => W[i]).join('');
    const start = Math.floor(rnd() * K); // read from any cell
    for (let p = start; p + K <= s.length; p++) {
      const isWord = SET.has(s.slice(p, p + K)), isBoundary = p % K === 0;
      if (isWord !== isBoundary) wrong++;
    }
    // mirrored: at every offset, the share of windows that are words stays under one half
    const m = revS(s);
    for (let o = 0; o < K; o++) {
      let hit = 0, all = 0;
      for (let p = o; p + K <= m.length; p += K) { all++; if (SET.has(m.slice(p, p + K))) hit++; }
      if (hit >= all / 2) mirrorFrames++;
    }
    streams++;
  }
  ok(wrong === 0, `framing: ${wrong} windows misjudged over ${streams} streams of 20 words read from a random cell`);
  ok(mirrorFrames === 0, `mirror: ${mirrorFrames} offsets of mirrored streams where half or more of the windows are words`);
}

/* 5. single-cell misreads */
{
  let silent = 0;
  for (const a of W) for (let i = 0; i < K; i++) for (const c of '-0+') {
    if (c === a[i]) continue;
    if (SET.has(a.slice(0, i) + c + a.slice(i + 1))) silent++;
  }
  ok(silent === 0, `single-cell misreads: ${silent} of ${W.length * K * 2} turn a word into another word`);
}

console.log(failures ? `code: ${failures} of ${checks} checks FAILED` : `code: ${checks} of ${checks} checks pass (${code.pairs.length} flip pairs, ${W.length} words, seed ${CODE_SEED})`);
process.exit(failures ? 1 : 0);
