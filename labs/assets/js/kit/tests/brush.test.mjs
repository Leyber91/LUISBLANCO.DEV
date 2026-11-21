/* ============================================================
   kit/tests/brush.test.mjs: kit/brush.js, checked in Node.

   1. A stroke is seeded: the same seed draws the same outlines,
      another seed others.
   2. It has a direction: a blot where it lands, narrow where it
      lifts (the profile, and the outlines measured across).
   3. It stays on its line: every outline point lies within the
      stroke's half-width, plus the wobble, of the centreline, and
      the first and last outline points sit at its two ends.
   4. The swell stays inside its bound.
   5. It is dry at the end and solid at the start: across the
      stroke near where it lands the bristles cover one interval;
      near the lift, on some seed, they leave a gap.
   6. Degenerate input draws nothing rather than NaN.
   ============================================================ */
import { BRUSH, brushStroke, profile, resample } from '../brush.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); } };
const line = [[10, 10], [10, 70], [40, 130], [40, 210]];
const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
const pairs = (d) => { const n = nums(d), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };

// 1. seeded
{
  const a = brushStroke(line, { width: 4, seed: 11 }), b = brushStroke(line, { width: 4, seed: 11 }), c = brushStroke(line, { width: 4, seed: 12 });
  ok('the same seed draws the same stroke', a.paths.join() === b.paths.join());
  ok('another seed draws another', a.paths.join() !== c.paths.join());
  ok('one outline per bristle', a.paths.length === BRUSH.BRISTLES, String(a.paths.length));
}

// 2. direction
ok('the profile lands as a blot wider than its body, at LANDED', Math.abs(profile(0) - BRUSH.LANDED) < 1e-9 && BRUSH.LANDED > 1);
ok('settles to its body after landing', Math.abs(profile(BRUSH.LAND + 0.01) - 1) < 1e-9);
ok('and lifts to TIP at the end', Math.abs(profile(1) - BRUSH.TIP) < 1e-9);
ok('it is wider a fifth of the way in than at the end', profile(0.2) > profile(0.95) + 0.4);
{
  const s = brushStroke(line, { width: 4, seed: 5 });
  ok('each bristle has a density between 0.55 and 1', s.alphas.length === s.paths.length && s.alphas.every((a) => a >= 0.55 && a <= 1), JSON.stringify(s.alphas));
  ok('and they are not all alike', new Set(s.alphas).size > 1);
  const b = pairs(s.blot);
  ok('the blot is a ring about where the stroke lands, as wide as it is there', b.length === 12 && b.every(([x, y]) => Math.abs(Math.hypot(x - 10, y - 10) - s.halfWidth(0)) < 0.15), JSON.stringify(b.slice(0, 3)));
}
{
  const s = brushStroke([[0, 0], [0, 200]], { width: 6, seed: 3 });
  // across a vertical stroke, the outlines' x extent at a given y
  const extent = (y0) => {
    let lo = Infinity, hi = -Infinity;
    for (const d of s.paths) for (const [x, y] of pairs(d)) if (Math.abs(y - y0) <= 3) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return hi - lo;
  };
  ok('measured, the stroke is wider near where it lands than near where it lifts', extent(30) > 2 * extent(190), `${extent(30)} and ${extent(190)}`);
}

// 3. on its line
for (const seed of [1, 2, 3, 4, 5, 77, 1e6]) {
  const width = 5;
  const s = brushStroke(line, { width, seed });
  const { pts } = resample(line);
  let worst = 0;
  for (const d of s.paths) for (const [x, y] of pairs(d)) {
    let best = Infinity, bt = 0;
    for (const p of pts) { const dd = Math.hypot(p.x - x, p.y - y); if (dd < best) { best = dd; bt = p.t; } }
    worst = Math.max(worst, best - s.halfWidth(bt) - BRUSH.WOBBLE);
  }
  ok(`seed ${seed}: every outline point is within the half-width and the wobble of the line`, worst <= 1.0, worst.toFixed(2));
  const first = pairs(s.paths[0])[0];
  ok(`seed ${seed}: the stroke starts at the line's first point`, Math.hypot(first[0] - 10, first[1] - 10) <= width / 2 + 0.2);
  const lastEnds = s.paths.map((d) => { const p = pairs(d); return p[Math.floor(p.length / 2)]; });
  ok(`seed ${seed}: its middle bristles reach the line's last point`, lastEnds.some(([x, y]) => Math.hypot(x - 40, y - 210) <= width), JSON.stringify(lastEnds));
}

// 4. the swell
{
  let lo = Infinity, hi = -Infinity;
  for (let seed = 0; seed < 40; seed++) {
    const s = brushStroke(line, { width: 2, seed });
    for (let t = BRUSH.LAND + 0.01; t < 1 - BRUSH.LIFT; t += 0.01) { const r = s.halfWidth(t) / (1 * profile(t)); lo = Math.min(lo, r); hi = Math.max(hi, r); }
  }
  ok('the body swells within SWELL either way', lo >= 1 - BRUSH.SWELL - 1e-9 && hi <= 1 + BRUSH.SWELL + 1e-9, `${lo} to ${hi}`);
  ok('and does swell', hi - lo > BRUSH.SWELL / 2, `${lo} to ${hi}`);
}

// 5. solid where it lands, parted on some seed near the lift
{
  const covered = (s, y0) => {
    const iv = s.paths.map((d) => { let lo = Infinity, hi = -Infinity; for (const [x, y] of pairs(d)) if (Math.abs(y - y0) <= 2.5) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return [lo, hi]; })
      .filter(([a, b]) => Number.isFinite(a)).sort((a, b) => a[0] - b[0]);
    let gap = 0;
    for (let i = 1; i < iv.length; i++) gap = Math.max(gap, iv[i][0] - Math.max(...iv.slice(0, i).map((v) => v[1])));
    return gap;
  };
  let solid = true, parted = false;
  for (let seed = 0; seed < 30; seed++) {
    const s = brushStroke([[0, 0], [0, 300]], { width: 10, seed });
    if (covered(s, 20) > 0.2) solid = false;
    if (covered(s, 270) > 0.3) parted = true;
  }
  ok('where it lands, the bristles cover one interval on every seed', solid);
  ok('near the lift they part on some seed', parted);
}

// 6. degenerate
ok('a line of one point draws nothing', brushStroke([[1, 1]], { width: 3, seed: 1 }).paths.length === 0);
ok('a line of zero length draws nothing', brushStroke([[1, 1], [1, 1]], { width: 3, seed: 1 }).paths.length === 0);
ok('no width draws nothing', brushStroke(line, { width: 0, seed: 1 }).paths.length === 0);
ok('no outline holds NaN', !brushStroke(line, { width: 3, seed: 9 }).paths.join().includes('NaN'));

console.log(`kit brush: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
