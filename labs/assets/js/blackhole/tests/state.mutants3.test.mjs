/* ============================================================
   The test of the store's tests, part 3: the camera's floor
   (ledger row 12) after review_s5. Run from the repository root:
     node labs/assets/js/blackhole/tests/state.mutants3.test.mjs

   Each entry breaks one rule of where the camera may stand: the
   floor by observer, the lift and its report, the order of the
   charge and the floor, and the floor held by the eased camera
   while a change of hole or observer runs. The broken file is
   written to a copy of this lab in the system's temp folder and
   state.test.mjs is run on the copy; a mutant that passes it is
   a rule nothing checks.
   ============================================================ */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const FLOOR = `export const cameraFloor = (s) => (s.observer === 'faller' ? FALL_STOP * horizon(s.a, s.q) : STILL_FLOOR);`;
const LIFT = `    if (this.s.rcam < floor) { this.s.rcam = floor; if (!changed.includes('rcam')) changed.push('rcam'); }`;
const CHARGE = `    // a hole needs a^2 + q^2 < 1: charge gives way to spin
    if (this.s.a * this.s.a + this.s.q * this.s.q > 0.996) {
      this.s.q = +Math.sqrt(Math.max(0, 0.996 - this.s.a * this.s.a)).toFixed(3);
      if (!changed.includes('q')) changed.push('q');
    }
    // the camera's floor by observer (ledger row 12), after the spin and charge are settled
    const floor = cameraFloor(this.s);
${LIFT}`;
const CHARGE_AFTER = `    // the camera's floor by observer (ledger row 12), after the spin and charge are settled
    const floor = cameraFloor(this.s);
${LIFT}
    // a hole needs a^2 + q^2 < 1: charge gives way to spin
    if (this.s.a * this.s.a + this.s.q * this.s.q > 0.996) {
      this.s.q = +Math.sqrt(Math.max(0, 0.996 - this.s.a * this.s.a)).toFixed(3);
      if (!changed.includes('q')) changed.push('q');
    }`;
const EASED_LOW = `    const low = cameraFloor({ observer: this.s.observer, a: this.shown.a, q: this.shown.q });`;
const EASED_HOLD = `    if (this.shown.rcam < low) this.shown.rcam = low;`;

const MUTANTS = [
  // review_s5 6: the three the first list missed, and the floor read from one hole
  ['an orbiter falls to the horizon too', FLOOR, FLOOR.replace(`s.observer === 'faller'`, `s.observer !== 'zamo'`)],
  ['the lifted radius is not reported as a change', LIFT, `    if (this.s.rcam < floor) { this.s.rcam = floor; }`],
  ['the floor taken before the charge gives way', CHARGE, CHARGE_AFTER],
  ['the floor from the spin of the default hole', FLOOR, FLOOR.replace(`horizon(s.a, s.q)`, `horizon(0.94, s.q)`)],
  // review_s5 1 and 5: the eased camera
  ['the eased camera keeps no floor', EASED_HOLD, ''],
  ['the eased floor from the spin the change started at', EASED_LOW, EASED_LOW.replace('a: this.shown.a', 'a: this.anim.from.a')],
  ['the eased floor always the faller\'s', EASED_LOW, EASED_LOW.replace('observer: this.s.observer', `observer: 'faller'`)],
  ['the eased camera held at nine tenths of the floor', EASED_HOLD, `    if (this.shown.rcam < 0.9 * low) this.shown.rcam = 0.9 * low;`],
];

process.exit(await runMutants({ here, file: 'state.js', test: '../state.test.mjs', mutants: MUTANTS }));
