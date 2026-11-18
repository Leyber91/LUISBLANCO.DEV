/* ============================================================
   blackhole/adapt.test.mjs — the render's fit to the machine
   (adapt.js): the tier from how long a full picture takes, the
   preview's resolution from how long a frame takes while the view
   moves. Run:  node labs/assets/js/blackhole/adapt.test.mjs

   The page chose its tier twice in the first two seconds and never
   again, from the interval between frames, which cannot fall below
   the display's refresh. A slow start kept a visit on the coarsest
   tier on a machine that runs the finest at 16 ms a frame (an RTX
   3500 laptop, 2026-11-18). Machines are simulated here by their
   cost per ray, since a full picture's time is its rays times that
   cost.
   ============================================================ */

import { TIERS } from './config.js';
import * as A from './adapt.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const W = 1762, H = 1003, DPR = 0.9;               // his window, measured 2026-11-18
const rays = (tier) => A.tierRays(TIERS[tier], W, H, DPR);

/** A visit: full pictures every 4 s for 2 minutes, each taking rays x cost (ms a ray, a function of the tier for a
 *  machine whose cost is not proportional). Returns the tiers in order. */
function visit(start, costOf, n = 30) {
  let s = A.tierStart(start);
  const path = [s.tier];
  for (let k = 1; k <= n; k++) {
    const refineMs = rays(s.tier) * costOf(s.tier);
    s = A.tierAfter(s, { refineMs, w: W, h: H, dpr: DPR, now: k * 4000, tiers: TIERS });
    if (s.tier !== path[path.length - 1]) path.push(s.tier);
  }
  return { path, final: s.tier };
}

// the rays each tier traces at his window, so the costs below mean what they say
ok('the rays a full picture traces grow tier by tier', rays('min') < rays('low') && rays('low') < rays('mid') && rays('mid') < rays('high'),
  A.ORDER.map((t) => `${t} ${rays(t)}`).join(', '));

// 1. a slow start on a fast machine climbs back: his GPU, 50 ns a ray (a full picture at high in 0.29 s)
{
  const v = visit('min', () => 50e-6);
  ok('a visit that starts on min on a fast GPU climbs to high and stays there', v.final === 'high' && v.path.join('>') === 'min>low>mid>high', v.path.join(' > '));
}
// 2. a software renderer, 2 us a ray: it climbs while the next tier's picture is predicted under the bound, no higher
{
  const v = visit('min', () => 2e-3);
  const at = (t) => rays(t) * 2e-3;
  ok('a slow machine climbs only to a tier whose full picture takes under the drop bound', at(v.final) <= A.ADAPT.dropMs && v.path[0] === 'min',
    `${v.path.join(' > ')}; ${v.final} takes ${at(v.final).toFixed(0)} ms`);
}
// 3. a machine whose cost jumps at one tier (high far slower than its rays predict): it climbs, drops, and never
//    climbs to the tier that failed again
{
  const v = visit('mid', (t) => (t === 'high' ? 600e-6 : 50e-6));
  ok('a climb that had to be undone is not tried again: no oscillation', v.final === 'mid' && v.path.join('>') === 'mid>high>mid', v.path.join(' > '));
}
// 4. a picture far too slow drops two tiers; one too slow drops one
{
  let s = A.tierStart('high');
  s = A.tierAfter(s, { refineMs: 4 * A.ADAPT.dropMs, w: W, h: H, dpr: DPR, now: 10000, tiers: TIERS });
  ok('a full picture over three times the bound drops two tiers', s.tier === 'low', s.tier);
  s = A.tierAfter(A.tierStart('high'), { refineMs: 1.2 * A.ADAPT.dropMs, w: W, h: H, dpr: DPR, now: 10000, tiers: TIERS });
  ok('a full picture over the bound drops one tier', s.tier === 'mid', s.tier);
}
// 5. no climb within the hold after a change
{
  let s = A.tierStart('min');
  s = A.tierAfter(s, { refineMs: 10, w: W, h: H, dpr: DPR, now: 5000, tiers: TIERS });
  const t1 = s.tier;
  s = A.tierAfter(s, { refineMs: 10, w: W, h: H, dpr: DPR, now: 5000 + A.ADAPT.holdMs / 2, tiers: TIERS });
  ok('no second climb within the hold after a climb', t1 === 'low' && s.tier === 'low', `${t1}, then ${s.tier}`);
  s = A.tierAfter(s, { refineMs: 10, w: W, h: H, dpr: DPR, now: 5000 + A.ADAPT.holdMs + 1, tiers: TIERS });
  ok('a climb once the hold is over', s.tier === 'mid', s.tier);
}
// 6. a drop that undid no climb (a moment the machine was busy) does not bar the tier: fast pictures climb back
{
  let s = A.tierStart('high');
  s = A.tierAfter(s, { refineMs: 1.2 * A.ADAPT.dropMs, w: W, h: H, dpr: DPR, now: 10000, tiers: TIERS });
  const dropped = s.tier;
  s = A.tierAfter(s, { refineMs: 100, w: W, h: H, dpr: DPR, now: 60000, tiers: TIERS });
  ok('a tier dropped by one slow picture, with no climb before it, is climbed back when pictures are fast', dropped === 'mid' && s.tier === 'high', `${dropped}, then ${s.tier}`);
}

// the preview while the view moves: frames whose time grows with the preview's rays (k ms at scale 1)
function drag(k, n = 200) {
  let s = A.previewStart(0.4);
  const path = [s.ps];
  for (let i = 1; i <= n; i++) {
    const frameMs = Math.max(1000 / 60, k * s.ps * s.ps);
    s = A.previewAfter(s, { frameMs, now: i * 250 });
    if (s.ps !== path[path.length - 1]) path.push(s.ps);
  }
  return { path, final: s.ps };
}
{
  const fast = drag(12);
  ok('on a fast GPU the preview grows to the full resolution', fast.final === 1, fast.path.join(' > '));
  const slow = drag(400);
  ok('on a slow one it shrinks to the floor', slow.final === A.PREVIEW_STEPS[0], slow.path.join(' > '));
  // a machine whose frames jump at full resolution (15 ms below it, 45 ms at it): one climb undone, then settled
  let s = A.previewStart(0.4);
  const path = [s.ps];
  for (let i = 1; i <= 400; i++) {
    s = A.previewAfter(s, { frameMs: s.ps < 1 ? 15 : 45, now: i * 250 });
    if (s.ps !== path[path.length - 1]) path.push(s.ps);
  }
  const reversals = path.slice(2).filter((p, i) => (p - path[i + 1]) * (path[i + 1] - path[i]) < 0).length;
  ok('where one step is too slow the preview tries it once and settles below it, no flapping', reversals === 1 && s.ps === 0.75, `${path.join(' > ')}, ${reversals} reversals`);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
