/* ============================================================
   kit/tests/fog.test.mjs: kit/fog.js, checked in Node.

   1. The lift changed no value. The fingerprints below were taken
      from heptapod/pod/medium.js before its noise moved here
      (2026-11-21, SHA-256 of the outputs, first 16 hex digits), and
      Heptapod's own re-export is checked to be the kit's function.
   2. Same seed, same fog; another seed, another fog.
   3. The fog texture tiles: its first and last columns, and rows,
      meet as neighbours do.
   4. Value noise stays in [-1, 1] and is smooth: a step of 0.01
      moves it by little.
   ============================================================ */
import crypto from 'node:crypto';
import { fogNoise, noise3 } from '../fog.js';
import * as medium from '../../heptapod/pod/medium.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}${detail ? ': ' + detail : ''}`); } };
const h = (a) => crypto.createHash('sha256').update(Buffer.from(new Uint8Array(a.buffer))).digest('hex').slice(0, 16);

// 1. the lift
const n = new Float64Array(200);
for (let i = 0; i < 200; i++) n[i] = noise3(99, i * 0.37, i * 0.11 - 3, i * 0.05);
ok('fogNoise(42, 64) is the value Heptapod drew before the lift', h(fogNoise(42, 64)) === '9f22b288260fcbe8', h(fogNoise(42, 64)));
ok('fogNoise(7, 128, 3, 4) is too', h(fogNoise(7, 128, 3, 4)) === '1bdc352d2a66457c');
ok('noise3 over 200 points is too', h(n) === '5505296216835645', h(n));
ok("Heptapod's medium.js hands out the kit's functions", medium.noise3 === noise3 && medium.fogNoise === fogNoise);

// 2. seeded
{
  const a = fogNoise(5, 64), b = fogNoise(5, 64), c = fogNoise(6, 64);
  ok('the same seed gives the same fog', a.every((v, i) => v === b[i]));
  ok('another seed gives another fog', a.some((v, i) => v !== c[i]));
}

// 3. it tiles
{
  const s = 96, a = fogNoise(11, s);
  let seam = 0, inner = 0, seamR = 0, innerR = 0;
  for (let y = 0; y < s; y++) { seam += Math.abs(a[y * s] - a[y * s + s - 1]); inner += Math.abs(a[y * s + 1] - a[y * s]); }
  for (let x = 0; x < s; x++) { seamR += Math.abs(a[x] - a[(s - 1) * s + x]); innerR += Math.abs(a[s + x] - a[x]); }
  ok('its first and last columns meet as neighbours do', seam <= 1.6 * inner + s, `seam ${seam}, neighbours ${inner}`);
  ok('and its first and last rows', seamR <= 1.6 * innerR + s, `seam ${seamR}, neighbours ${innerR}`);
}

// 4. range and smoothness
{
  let lo = Infinity, hi = -Infinity, jump = 0;
  for (let i = 0; i < 4000; i++) {
    const x = i * 0.013, y = Math.sin(i) * 7, z = i * 0.002;
    const v = noise3(3, x, y, z);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
    jump = Math.max(jump, Math.abs(noise3(3, x + 0.01, y, z) - v));
  }
  ok('noise3 stays in [-1, 1]', lo >= -1 && hi <= 1, `${lo} to ${hi}`);
  ok('and moves by less than 0.05 for a step of 0.01', jump < 0.05, String(jump));
}

console.log(`kit fog: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
