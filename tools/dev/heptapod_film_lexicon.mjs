/* ============================================================
   tools/dev/heptapod_film_lexicon.mjs — the film's own vocabulary,
   reverse-engineered from its logograms (private research, approved by
   Luis 2026-11-16; research/ip.md rule 3: it never seeds the lab's own
   vocabulary; rule 6: only numbers leave this script).

     node tools/dev/heptapod_film_lexicon.mjs <masks dir> <out.json>

   The masks are the 38 Wolfram ScriptLogoJpegs (film-tools/masks.py),
   whose file names are their glosses. Each logogram is unwrapped around
   its own fitted ring (detail/ring.js) to 360 angles x 150 radii from
   0.3 R to 1.8 R, so size is normalised and a rotation is a shift; the
   ring band |r/R - 1| < BAND is masked, as in the similarity gate,
   because every logogram shares the circle. Containment of A in B is
   the largest share of A's marks inside B (B dilated by one cell for
   two independent ring fits) over every rotation and its mirror.

   The test of a word W: the logogram whose gloss is W alone, against
   every sentence; is it inside the sentences whose gloss has W, and
   not inside the others? A word that passes has its blot found, and
   the best shift says where it sits in the sentence.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { readPBM, fitRing, unwrap, NA, NR } from '../../labs/assets/js/heptapod/detail/ring.js';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: heptapod_film_lexicon.mjs <masks dir> <out.json>'); process.exit(2); }
const BAND = 0.09, A = 360, RB = 150, FA = NA / A, FR = NR / RB;

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pbm')).sort();
const logos = [];
for (const f of files) {
  const m = readPBM(fs.readFileSync(path.join(dir, f)));
  const ring = fitRing(m);
  const U = unwrap(m, ring);
  const g = new Uint8Array(A * RB);
  for (let a = 0; a < A; a++) for (let j = 0; j < RB; j++) {
    const r = U.rr[Math.floor((j + 0.5) * FR)] / ring.R;
    if (Math.abs(r - 1) < BAND) continue;
    let any = 0;
    for (let da = 0; da < FA && !any; da++) for (let dj = 0; dj < FR; dj++) if (U.P[(a * FA + da) * NR + j * FR + dj]) { any = 1; break; }
    g[a * RB + j] = any;
  }
  // B as a target: dilated by one cell in angle and radius, rows doubled in angle so a shift is a contiguous read
  const dil = new Uint8Array(2 * A * RB);
  for (let a = 0; a < A; a++) for (let j = 0; j < RB; j++) {
    let v = 0;
    for (let da = -1; da <= 1 && !v; da++) for (let dj = -1; dj <= 1; dj++) { const J = j + dj; if (J >= 0 && J < RB && g[((a + da + A) % A) * RB + J]) { v = 1; break; } }
    dil[j * 2 * A + a] = v; dil[j * 2 * A + a + A] = v;
  }
  const cells = [];
  for (let a = 0; a < A; a++) for (let j = 0; j < RB; j++) if (g[a * RB + j]) cells.push([a, j]);
  const name = f.replace(/\.pbm$/, '');
  const words = name.replace(/_?\d+$/, '').replace(/_/g, '').split(/(?=[A-Z])/).filter(Boolean);
  logos.push({ name, words, cells, dil });
  process.stdout.write('.');
}
console.log(` ${logos.length} logograms unwrapped`);

/* Containment of a in b: the share of a's cells inside b at the best shift and mirror (c), and how far that peak
   stands above the median over all shifts, as a share of the room above the median (lift). A dense sentence holds
   any small logogram at every shift, so c alone found Humanity "inside" IanLouiseEatApple at 0.998; a shared word
   is a peak at one shift. */
function contain(a, b) {
  let best = 0, shift = 0, mirror = false;
  const all = [];
  for (const mir of [false, true]) {
    const hits = new Uint32Array(A);
    for (const [ang, j] of a.cells) {
      const base = j * 2 * A + (mir ? (A - ang) % A : ang);
      for (let s = 0; s < A; s++) hits[s] += b.dil[base + s];
    }
    for (let s = 0; s < A; s++) { const c = hits[s] / a.cells.length; all.push(c); if (c > best) { best = c; shift = s; mirror = mir; } }
  }
  all.sort((x, y) => x - y);
  const med = (all[(all.length >> 1) - 1] + all[all.length >> 1]) / 2;
  return { c: best, lift: med < 1 ? (best - med) / (1 - med) : 0, shift, mirror };
}

const C = {};
for (const a of logos) { C[a.name] = {}; for (const b of logos) if (a !== b) C[a.name][b.name] = contain(a, b); }

/* the words: a one-word logogram against the sentences that do and do not carry its word */
const singles = logos.filter((l) => l.words.length === 1);
const report = [];
for (const s of singles) {
  const w = s.words[0].toLowerCase();
  const has = [], hasNot = [];
  for (const b of logos) {
    if (b === s || b.words.length < 2) continue;
    const r = C[s.name][b.name];
    const row = { in: b.name, c: +r.c.toFixed(3), lift: +r.lift.toFixed(3), at: r.shift, mirror: r.mirror };
    (b.words.some((x) => x.toLowerCase() === w || (w === 'heptapod' && x.toLowerCase().startsWith('hep'))) ? has : hasNot).push(row);
  }
  const maxNot = hasNot.reduce((m, x) => Math.max(m, x.lift), 0);
  report.push({ word: s.words[0], logogram: s.name, cells: s.cells.length, inSentencesWithWord: has.sort((x, y) => y.lift - x.lift), bestWithout: hasNot.sort((x, y) => y.lift - x.lift).slice(0, 3), separated: has.filter((x) => x.lift > maxNot).length });
}
fs.writeFileSync(out, JSON.stringify({ method: 'polar containment, ring band masked, 360 x 150, one-cell dilation, rotation and mirror', band: BAND, report, matrix: Object.fromEntries(Object.entries(C).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([k2, r]) => [k2, +r.c.toFixed(3)]))])) }, null, 1));
for (const r of report) {
  const has = r.inSentencesWithWord.map((x) => `${x.in} ${x.lift} (c ${x.c})`).join(', ') || 'none';
  const not = r.bestWithout.map((x) => `${x.in} ${x.lift} (c ${x.c})`).join(', ');
  console.log(`${r.word.padEnd(10)} in sentences with it: ${has}\n${''.padEnd(10)} best without it: ${not}; ${r.separated} of ${r.inSentencesWithWord.length} above every sentence without it`);
}
console.log(`wrote ${out} (private: numbers only)`);
