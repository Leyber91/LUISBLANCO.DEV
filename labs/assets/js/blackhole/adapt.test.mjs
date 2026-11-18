/* ============================================================
   blackhole/adapt.test.mjs — the render's fit to the machine
   (adapt.js): the tier from how long a full picture takes and how
   long frames take, the preview's resolution from how long a frame
   takes while the view moves.
   Run:  node labs/assets/js/blackhole/adapt.test.mjs

   The page chose its tier twice in the first two seconds and never
   again, from the interval between frames, which the display's
   refresh bounds from below. A slow start kept a visit on the
   coarsest tier on a machine that runs the finest at 16 ms a frame
   (an RTX 3500 laptop, 2026-11-18). Machines are simulated by their
   cost per ray; a visit's clock advances by each picture's own time
   and the drag before it (review_res 2: a clock that ignored them hid
   an oscillation). The constants are pinned here, so a change to one
   is a change to this file too (review_res 7).
   ============================================================ */

import { TIERS } from './config.js';
import * as A from './adapt.js';

let fails = 0, checks = 0;
const ok = (name, cond, detail = '') => {
  checks++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

ok('the tier rule\'s bounds are 1.2 s to climb, 2.5 s to drop and a 3 s hold, and frame time is not among them',
  JSON.stringify(A.ADAPT) === JSON.stringify({ climbMs: 1200, dropMs: 2500, holdMs: 3000 }), JSON.stringify(A.ADAPT));
ok('the preview\'s bounds are 40 ms slow, 20 ms keeping up, a 1 s hold, a 5 s undo, steps 0.3 to 1',
  JSON.stringify(A.PREVIEW) === JSON.stringify({ slowMs: 40, keepUpMs: 20, holdMs: 1000, undoMs: 5000 }) && JSON.stringify(A.PREVIEW_STEPS) === '[0.3,0.4,0.55,0.75,1]');

const W = 1762, H = 1003, DPR = 0.9;               // his window, measured 2026-11-18
const rays = (tier) => A.tierRays(TIERS[tier], W, H, DPR);
const ctx = (refineMs, now) => ({ refineMs, w: W, h: H, dpr: DPR, now, tiers: TIERS });

ok('the rays a full picture traces, supersamples counted: min 228874, low 605197, mid 2806080, high 5728632',
  rays('min') === 228874 && rays('low') === 605197 && rays('mid') === 2806080 && rays('high') === 5728632, A.ORDER.map((t) => `${t} ${rays(t)}`).join(', '));

/** A visit: n pictures, each taking rays x cost (ms a ray, a function of the tier), each after dragMs of dragging and a
 *  4 s pause; the clock advances by all three. */
function visit(start, costOf, { n = 30, dragMs = 0 } = {}) {
  let s = A.tierStart(start), now = 0;
  const path = [s.tier];
  for (let k = 0; k < n; k++) {
    now += dragMs;
    const refineMs = rays(s.tier) * costOf(s.tier);
    now += refineMs;
    s = A.tierAfter(s, ctx(refineMs, now));
    if (s.tier !== path[path.length - 1]) path.push(s.tier);
    now += 4000;
  }
  return { path: path.join(' > '), s };
}

// 1. his GPU, 50 ns a ray: a visit that starts on min climbs to high and stays
{
  const v = visit('min', () => 50e-6);
  ok('a fast GPU that starts on min climbs to high and stays', v.path === 'min > low > mid > high', v.path);
}
// 2. 1.5 us a ray: min's picture is 343 ms, low's predicted 908 ms (climbs), mid's predicted 4.2 s (does not)
{
  const v = visit('min', () => 1.5e-3);
  ok('a slow machine climbs while the next picture is predicted from its rays under 1.2 s, and no further', v.path === 'min > low', v.path);
}
// 3. high far slower than its rays predict: one climb, undone by its first picture, never retried, with or without
//    long drags before the pictures (the evidence arriving late)
for (const dragMs of [0, 8000, 30000]) {
  const v = visit('mid', (t) => (t === 'high' ? 600e-6 : 50e-6), { dragMs });
  ok(`a climb whose first picture is too slow is undone and not tried again, ${dragMs / 1000} s of drag before each picture`, v.path === 'mid > high > mid' && v.s.ceiling === 2, `${v.path}, ceiling ${A.ORDER[v.s.ceiling]}`);
}
// 4. a high picture of 11.5 s, over three times the bound: the failed climb returns to where it came from, not below
{
  const v = visit('mid', (t) => (t === 'high' ? 11500 / rays('high') : 50e-6));
  ok('a climb undone by a very slow picture returns to the tier it came from and stays', v.path === 'mid > high > mid', v.path);
}
// 5. drops with no climb before them: one tier over the bound, two over three times it, with the bound itself kept
{
  const one = A.tierAfter(A.tierStart('high'), ctx(2501, 10000)), at = A.tierAfter(A.tierStart('high'), ctx(2500, 10000));
  const two = A.tierAfter(A.tierStart('high'), ctx(7501, 10000)), at3 = A.tierAfter(A.tierStart('high'), ctx(7500, 10000));
  ok('a picture of 2501 ms drops one tier and one of 2500 ms does not', one.tier === 'mid' && at.tier === 'high', `${one.tier}, ${at.tier}`);
  ok('a picture of 7501 ms drops two tiers and one of 7500 ms drops one', two.tier === 'low' && at3.tier === 'mid', `${two.tier}, ${at3.tier}`);
  const s0 = { ...A.tierStart('min'), lastChange: 5000 };
  const floor = A.tierAfter(s0, ctx(9000, 10000));
  ok('min stays min however slow, and a slow picture there does not restart the hold', floor.tier === 'min' && floor.lastChange === 5000, `${floor.tier}, ${floor.lastChange}`);
}
// 6. the climb's prediction, just under and just over 1.2 s
{
  const ratio = rays('low') / rays('min');
  const under = A.tierAfter(A.tierStart('min'), ctx(1200 / ratio * (1 - 1e-6), 10000));
  const over = A.tierAfter(A.tierStart('min'), ctx(1200 / ratio * (1 + 1e-6), 10000));
  ok('a climb predicted just under 1.2 s is taken, just over it is not', under.tier === 'low' && over.tier === 'min', `${under.tier}, ${over.tier}`);
}
// 7. the hold, just inside and just outside 3 s after a change
{
  const s0 = { ...A.tierStart('min'), lastChange: 10000 };
  ok('no climb 2999 ms after a change, a climb at 3000 ms', A.tierAfter(s0, ctx(10, 12999)).tier === 'min' && A.tierAfter(s0, ctx(10, 13000)).tier === 'low');
}
// 8. a bounded number of changes: pictures of random times, fast and slow; the ceiling only falls, and each fall is a
//    failed climb, so the climbs that fail are at most three
{
  let s = A.tierStart('min'), now = 0, changes = 0, falls = 0, seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 2000; k++) {
    now += 500 + 8000 * rnd();
    const next = A.tierAfter(s, ctx(rnd() < 0.5 ? 50 * rnd() : 2500 + 9000 * rnd(), now));
    if (next.ceiling > s.ceiling) falls = -99;
    if (next.ceiling < s.ceiling) falls++;
    if (next.tier !== s.tier) changes++;
    s = next;
  }
  ok('2000 pictures of random times: the ceiling never rises and falls at most three times', falls >= 0 && falls <= 3, `${changes} changes, ${falls} falls, ceiling ${A.ORDER[s.ceiling]}`);
}
// 9. a drop with no climb before it (a moment the machine was busy) bars nothing: fast pictures climb back after the hold
{
  let s = A.tierAfter(A.tierStart('high'), ctx(2600, 10000));
  const dropped = s.tier;
  s = A.tierAfter(s, ctx(100, 13000));
  ok('a tier dropped by one slow picture, with no climb before it, is climbed back after the hold', dropped === 'mid' && s.tier === 'high' && s.ceiling === 3, `${dropped}, then ${s.tier}`);
}
// 10. a climb whose first picture is fine is kept, and the next climb is judged on its own
{
  let s = A.tierAfter(A.tierStart('min'), ctx(100, 10000));
  s = A.tierAfter(s, ctx(200, 14000));
  ok('a climb whose first picture is fast is kept, and the following climb is taken', s.tier === 'mid' && s.from === 'low', `${s.tier} from ${s.from}`);
}

// 11. the edges the first list let pass (tests/adapt.mutants.test.mjs)
{
  // the dpr cap: on a phone at dpr 3, min traces at most one ray a CSS px times its scale
  ok('on a phone at dpr 3 the min tier traces 156 x 338 rays: the dpr is capped at the cap of the tier', A.tierRays(TIERS.min, 390, 844, 3) === 156 * 338, String(A.tierRays(TIERS.min, 390, 844, 3)));
  // a climb predicted exactly at the bound is not taken (tiers with whole ratios, so the prediction is exact)
  const T4 = { min: { scale: 1, ss: 1, dprCap: 1 }, low: { scale: 2, ss: 1, dprCap: 1 }, mid: { scale: 3, ss: 1, dprCap: 1 }, high: { scale: 4, ss: 1, dprCap: 1 } };
  const exact = A.tierAfter(A.tierStart('min'), { refineMs: 300, frameMs: 16, w: 1, h: 1, dpr: 1, now: 10000, tiers: T4 });
  const below = A.tierAfter(A.tierStart('min'), { refineMs: 299.999, frameMs: 16, w: 1, h: 1, dpr: 1, now: 10000, tiers: T4 });
  ok('a climb predicted at exactly 1200 ms is not taken, at 1199.996 ms it is', exact.tier === 'min' && below.tier === 'low', `${exact.tier}, ${below.tier}`);
  // a clock that ran backwards changes nothing
  const back = A.tierAfter(A.tierStart('min'), ctx(-1, 10000));
  ok('a negative picture time changes nothing', back.tier === 'min' && back.from === null, back.tier);
  // the first picture after a climb decides it, and only that one: a later slow picture drops a tier with no ceiling
  let s = A.tierAfter(A.tierStart('min'), ctx(100, 10000));
  s = A.tierAfter(s, ctx(200, 11000));
  s = A.tierAfter(s, ctx(2600, 30000));
  ok('a slow picture well after a kept climb drops a tier and bars nothing', s.tier === 'min' && s.ceiling === 3, `${s.tier}, ceiling ${s.ceiling}`);
  // a drop restarts the hold
  const dropped = A.tierAfter(A.tierStart('high'), ctx(2600, 10000));
  ok('no climb 1 s after a drop', A.tierAfter(dropped, ctx(100, 11000)).tier === 'mid');
}

// the preview while the view moves
function drag(frameOf, n = 400, start = 0.4) {
  let s = A.previewStart(start);
  const path = [s.ps];
  for (let i = 1; i <= n; i++) {
    s = A.previewAfter(s, { frameMs: frameOf(s.ps), now: i * 250 });
    if (s.ps !== path[path.length - 1]) path.push(s.ps);
  }
  return { path, s };
}
{
  const fast = drag((ps) => Math.max(1000 / 60, 12 * ps * ps));
  ok('on a fast GPU the preview grows to the full resolution, a step at a time', fast.path.join(' > ') === '0.4 > 0.55 > 0.75 > 1', fast.path.join(' > '));
  const slow = drag(() => 400);
  ok('on a slow one it shrinks to the floor and stays', slow.path.join(' > ') === '0.4 > 0.3' && slow.s.ps === 0.3, slow.path.join(' > '));
  const edge = drag((ps) => (ps < 1 ? 15 : 45));
  const rev = edge.path.slice(2).filter((p, i) => (p - edge.path[i + 1]) * (edge.path[i + 1] - edge.path[i]) < 0).length;
  ok('where one step is too slow the preview tries it once and settles below it', rev === 1 && edge.s.ps === 0.75, `${edge.path.join(' > ')}, ${rev} reversals`);
  // boundaries: 40 ms keeps the scale, 41 ms lowers it; 20 ms keeps it, 19 ms raises it
  const at = (frameMs) => A.previewAfter(A.previewStart(0.55), { frameMs, now: 10000 }).ps;
  ok('frames at 40 ms and at 20 ms keep the scale, 41 ms lower it, 19 ms raise it', at(40) === 0.55 && at(20) === 0.55 && at(41) === 0.4 && at(19) === 0.75, `${at(40)} ${at(20)} ${at(41)} ${at(19)}`);
  // the hold: no second step within 1 s
  const s1 = A.previewAfter(A.previewStart(0.55), { frameMs: 10, now: 10000 });
  ok('no second step within the 1 s hold, one at 1 s', A.previewAfter(s1, { frameMs: 10, now: 10999 }).ps === 0.75 && A.previewAfter(s1, { frameMs: 10, now: 11000 }).ps === 1);
  // the undo: a step down within 5 s of a step up lowers the ceiling; at 5 s it does not
  const up = { ...A.previewStart(0.75), lastUp: 10000 };
  const d1 = A.previewAfter(up, { frameMs: 50, now: 14999 }), d2 = A.previewAfter(up, { frameMs: 50, now: 15000 });
  ok('a step down 4999 ms after a step up bars the step it left (0.75: the ceiling is 0.55), at 5000 ms it does not', d1.ceiling === 2 && d1.ps === 0.55 && d2.ceiling === 4, `${d1.ceiling}, ${d2.ceiling}`);
  // after a tier change, a slow preview is the tier's, not the step's: no ceiling from it
  const reset = A.previewReset(up, 10500);
  const after = A.previewAfter({ ...reset, holdUntil: -Infinity }, { frameMs: 50, now: 11000 });
  ok('after a tier change a slow preview steps down without barring the step it came from', after.ps === 0.55 && after.ceiling === 4, `${after.ps}, ceiling ${after.ceiling}`);
  ok('a tier change holds the preview for 1 s', reset.holdUntil === 11500);
  // a step down remembers the step up before it, for the undo
  const up2 = A.previewAfter(A.previewStart(0.55), { frameMs: 10, now: 10000 });
  const down2 = A.previewAfter(up2, { frameMs: 50, now: 11500 });
  ok('a step down keeps the time of the step up before it', down2.lastUp === 10000 && down2.ceiling === 2, `lastUp ${down2.lastUp}, ceiling ${down2.ceiling}`);
  // a step down holds too: a second slow run 0.5 s later does not step again
  const down = A.previewAfter(A.previewStart(0.75), { frameMs: 50, now: 10000 });
  ok('no second step down within the hold', A.previewAfter(down, { frameMs: 50, now: 10500 }).ps === 0.55 && A.previewAfter(down, { frameMs: 50, now: 11000 }).ps === 0.4);
  // a scale between the steps starts on the nearest step
  ok('a starting scale of 0.5 is taken as the step 0.55', A.previewStart(0.5).ps === 0.55 && A.previewStart(0.62).ps === 0.55 && A.previewStart(0.66).ps === 0.75);
}

console.log(`\n${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
