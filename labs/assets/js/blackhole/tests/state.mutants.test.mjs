/* ============================================================
   The test of the store's tests, part 1 of 2. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/state.mutants.test.mjs

   Each entry breaks one rule of state.js: a link value read into
   the schema (a number clamped to its range, a toggle, a name in
   its list), the limit a^2 + q^2 < 1 moved to either side of
   0.996, a change reported or heard wrongly, the easing curve or
   its length or its end moved. The broken file is written to a
   copy of this lab in the system's temp folder and
   state.test.mjs is run on the copy (kit/tests/mutants.mjs).
   Every broken rule must fail a check there. Part 2
   (state.mutants2.test.mjs) breaks the presets and the link.

   Add an entry here with every new rule in state.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/state.js labs/assets/js/blackhole/tests/state.mutants.test.mjs labs/assets/js/blackhole/tests/state.mutants2.test.mjs
   which names every condition no entry changes.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BOOL = `return v === true || v === 'true' || v === '1' || v === 1;`;

const MUTANTS = [
  /* ---- a link's values read into the schema ---- */
  ['a number below its range is let through', `Math.max(lo, Math.min(hi, v))`, `Math.min(hi, v)`],
  ['a number above its range is let through', `Math.max(lo, Math.min(hi, v))`, `Math.max(lo, v)`],
  ['a number is never read as a number', `if (d.type === 'num') {`, `if (d.type === 'number') {`],
  ['a value that is not a number is clamped into NaN', `return Number.isFinite(n) ? clamp(n, d.min, d.max) : d.def; }`, `return clamp(n, d.min, d.max); }`],
  ['a toggle is never read as a toggle', `if (d.type === 'bool') return`, `if (d.type === 'boolean') return`],
  ['true is not on', BOOL, BOOL.replace(`v === true ||`, `v === 'on' ||`)],
  ['the text "true" is not on', BOOL, BOOL.replace(`v === 'true' ||`, `v === 'yes' ||`)],
  ['the text "1" is not on', BOOL, BOOL.replace(`v === '1' ||`, `v === '2' ||`)],
  ['the number 1 is not on', BOOL, BOOL.replace(`v === 1;`, `v === 2;`)],
  ['on only when true and "true" at once', BOOL, BOOL.replace(`v === true || v === 'true'`, `v === true && v === 'true'`)],
  ['on only when "true" and "1" at once', BOOL, BOOL.replace(`v === 'true' || v === '1'`, `v === 'true' && v === '1'`)],
  ['on only when "1" and 1 at once', BOOL, BOOL.replace(`v === '1' || v === 1`, `v === '1' && v === 1`)],
  ['a name is never checked against its list', `if (d.type === 'enum') return`, `if (d.type === 'enums') return`],
  ['a name outside its list is kept', `d.options.includes(v) ? v : d.def`, `v`],
  ['a key outside the schema is dropped', `if (!d) return v;`, `if (!d) return undefined;`],

  /* ---- a hole needs a^2 + q^2 < 1 ---- */
  ['the charge never gives way', `if (this.s.a * this.s.a + this.s.q * this.s.q > 0.996) {`, `if (false) {`],
  ['the charge gives way from 0.995, inside the limit', `this.s.q * this.s.q > 0.996) {`, `this.s.q * this.s.q > 0.995) {`],
  ['the charge gives way only from 0.997, outside the limit', `this.s.q * this.s.q > 0.996) {`, `this.s.q * this.s.q > 0.997) {`],
  ['the spin left out of the limit', `if (this.s.a * this.s.a + this.s.q * this.s.q > 0.996) {`, `if (this.s.q * this.s.q > 0.996) {`],
  ['the charge gives way to sqrt(0.997 - a^2)', `Math.max(0, 0.996 - this.s.a * this.s.a)`, `Math.max(0, 0.997 - this.s.a * this.s.a)`],
  ['at the spin limit the charge becomes NaN', `Math.sqrt(Math.max(0, 0.996 - this.s.a * this.s.a))`, `Math.sqrt(0.996 - this.s.a * this.s.a)`],
  ['at the spin limit a charge of 0.1 is left', `Math.max(0, 0.996 - this.s.a * this.s.a)`, `Math.max(0.01, 0.996 - this.s.a * this.s.a)`],
  ['the lowered charge rounded to 2 decimals', `this.s.a * this.s.a)).toFixed(3);`, `this.s.a * this.s.a)).toFixed(2);`],
  ['a charge pushed down by the spin is not reported', `      if (!changed.includes('q')) changed.push('q');\n`, ``],

  /* ---- what a change reports ---- */
  ['a key set to the value it has counts as a change', `if (this.s[k] !== v) {`, `if (true) {`],
  ['no change is still heard', `    if (!changed.length) return changed;\n`, ``],
  ['a change is not heard', `    this._emit(changed, src);\n`, ``],
  ['the source of a change defaults to "boot"', `src = 'ui'`, `src = 'boot'`],

  /* ---- easing ---- */
  ['a new store shows nothing', `    EASED.forEach((k) => { this.shown[k] = this.s[k]; });\n    this.reduced = false;`, `    this.reduced = false;`],
  ['the disk\'s outer edge is not eased, so the picture never shows it change', `'tilt', 'rout'];`, `'tilt'];`],
  ['a change with no length given takes 1000 ms', `dur = 1400 }`, `dur = 1000 }`],
  ['a change eases its length away: always 1400 ms', `this.anim = { from, t0: performance.now(), dur };`, `this.anim = { from, t0: performance.now(), dur: 1400 };`],
  ['an instant change eases unless motion is reduced too', `if (instant || this.reduced) {`, `if (instant && this.reduced) {`],
  ['reduced motion ignored', `if (instant || this.reduced) {`, `if (instant) {`],
  ['an instant change is not shown at once', `        easedChanged.forEach((k) => { this.shown[k] = this.s[k]; });\n`, ``],
  ['an instant change leaves the running transition going', `        this.anim = null;\n      } else {`, `      } else {`],
  ['a change of a key that does not ease restarts the transition', `    if (easedChanged.length) {`, `    if (true) {`],
  ['a transition starts from the target, so it jumps', `{ from[k] = this.shown[k]; }`, `{ from[k] = this.s[k]; }`],
  ['the curve turns at 0.4 of the time', `(t < 0.5 ?`, `(t < 0.4 ?`],
  ['the curve turns at 0.6 of the time', `(t < 0.5 ?`, `(t < 0.6 ?`],
  ['the second half eased as the first, overshooting', `1 - Math.pow(-2 * t + 2, 3) / 2`, `4 * t * t * t`],
  ['no curve: linear in time', `: a + (b - a) * e;`, `: a + (b - a) * t;`],
  ['the distance eased linearly', `(k === 'rcam' ||`, `(k === 'rcamX' ||`],
  ['the field of view eased linearly', `|| k === 'fov')`, `|| k === 'fovX')`],
  ['neither eased in log space', `(k === 'rcam' || k === 'fov')`, `(k === 'rcam' && k === 'fov')`],
  ['a transition never ends', `if (t >= 1) this.anim = null;`, `if (t > 1) this.anim = null;`],
  ['a transition ends at 0.99 of its time', `if (t >= 1) this.anim = null;`, `if (t >= 0.99) this.anim = null;`],
  ['a running transition reports none', `    if (t >= 1) this.anim = null;\n    return true;`, `    if (t >= 1) this.anim = null;\n    return false;`],
  ['no transition reports one', `this.shown[k] = this.s[k]; }); return false; }`, `this.shown[k] = this.s[k]; }); return true; }`],
  ['the frame after the end keeps the eased value, not the target', `    if (!this.anim) { EASED.forEach((k) => { this.shown[k] = this.s[k]; }); return false; }`, `    if (!this.anim) return false;`],

  /* ---- the geometry handed to the renderer, the probe and the anchors ---- */
  ['view() and view(true) exchanged', `const v = target ? this.s : this.shown;`, `const v = target ? this.shown : this.s;`],
  ['view() drops the charge, as the probe once did', `q: v.q,`, `q: 0,`],
  /* ---- ledger row 12: the camera's floor by observer ---- */
  ['every camera falls to the horizon', `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`, `export const cameraFloor = (s) => (FALL_STOP * horizon(s.a, s.q));`],
  ['no camera falls below 3 M (the floor before ledger row 12)', `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`, `export const cameraFloor = (s) => (STILL_FLOOR);`],
  ['the floor reads another observer as the faller', `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`, `export const cameraFloor = (s) => (s.observer !== 'orbiter' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`],
  ['the floor without the charge', `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`, `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a) : STILL_FLOOR);`],
  ['the floor at the horizon itself', `export const FALL_STOP = 1.08;`, `export const FALL_STOP = 1;`],
  ['the still floor at 2 M', `export const STILL_FLOOR = 3;`, `export const STILL_FLOOR = 2;`],
  ['the floor never applied', `    if (this.s.rcam < floor) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`, ``],
  ['the floor applied only past it', `    if (this.s.rcam < floor) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`, `    if (this.s.rcam < floor - 0.01) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`],
  ['a camera above the floor moved to it', `    if (this.s.rcam < floor) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`, `    if (this.s.rcam < floor + 1) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`],
  ['view() reads the observer from the eased values', `observer: this.s.observer`, `observer: v.observer`],
];

process.exit(await runMutants({ here, file: 'state.js', test: '../state.test.mjs', mutants: MUTANTS }));
