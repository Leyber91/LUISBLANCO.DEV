/* ============================================================
   The test of the tour's tests, part 1 of 2. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/tour.mutants.test.mjs

   Each entry breaks one rule of tour.js: what a stop sets
   (stopPatch), the numbers a caption quotes (the distance's unit
   at each bound, the end of the fall, a hole with no distance or
   EHT image), and moving through the tour (the first and last
   stop, Next, Back, Exit, the dots, Finish, the journey). The
   broken file is written to a copy of this lab in the system's
   temp folder and tour.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every broken rule must fail a check
   there. Part 2 (tour.mutants2.test.mjs) breaks the clock, the
   idle drift, the focus ring and the idle caption.

   Add an entry here with every new rule in tour.js, then run
     node tools/dev/conditions.mjs labs/assets/js/blackhole/tour.js labs/assets/js/blackhole/tests/tour.mutants.test.mjs labs/assets/js/blackhole/tests/tour.mutants2.test.mjs
   which names every condition no entry changes.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CLAMP = `this.i = Math.max(0, Math.min(TOUR.length - 1, i));`;
const BUTTONS = `if (n === 'next') this.next(); else if (n === 'prev') this.prev(); else this.stop();`;

const MUTANTS = [
  /* ---- what a stop sets ---- */
  ['a stop\'s own keys dropped', `, ...stop.patch };`, ` };`],
  ['a stop\'s view preset dropped', `...store.viewPatch(view, obj), `, ``],
  ['a stop\'s object preset dropped', `...store.objectPatch(obj, view), `, ``],
  ['a stop eases in over the default 1.4 s', `{ src: 'tour', dur: 1700 }`, `{ src: 'tour', dur: 1400 }`],
  ['a stop is set as the visitor\'s change', `{ src: 'tour', dur: 1700 }`, `{ src: 'ui', dur: 1700 }`],

  /* ---- the numbers a caption quotes ---- */
  ['a megaparsec reads in kiloparsecs', `(pc >= 1e6 ?`, `(pc > 1e6 ?`],
  ['just below a megaparsec reads in megaparsecs', `(pc >= 1e6 ?`, `(pc >= 9e5 ?`],
  ['a kiloparsec reads in parsecs', `: pc >= 1e3 ?`, `: pc > 1e3 ?`],
  ['just below a kiloparsec reads in kiloparsecs', `: pc >= 1e3 ?`, `: pc >= 900 ?`],
  ['megaparsecs off by a factor of 10', `(pc / 1e6).toPrecision(3)`, `(pc / 1e5).toPrecision(3)`],
  ['outside the telescope view the caption quotes the Measure card\'s shadow', `s.view === 'telescope' ? measurement(s) : null`, `s.view === 'telescopeX' ? measurement(s) : null`],
  ['outside the telescope view the shadow width is taken at 17 deg, not edge-on', `shadowFor(s.a, 90, s.q)`, `shadowFor(s.a, 17, s.q)`],
  ['a custom hole is named M87*', `name: o ? o.name : 'this hole'`, `name: o ? o.name : 'M87*'`],
  ['a hole with no distance quotes an empty one', `distText(o.distPc) : '--',`, `distText(o.distPc) : '',`],
  ['a hole the EHT has not imaged says nothing about it', `: 'The EHT has not imaged it.',`, `: '',`],
  ['at a = 0.001 the fall ends at the centre', `m.rmin < 5e-7 ?`, `m.rmin < 6e-7 ?`],
  ['at a = Q = 0 the fall ends at the inner horizon', `m.rmin < 5e-7 ?`, `m.rmin < 0 ?`],
  ['a key the state does not have reads "undefined"', `n[k] ?? k`, `n[k]`],

  /* ---- moving through the tour ---- */
  ['start() with no stop named starts at the second', `start(i = 0) {`, `start(i = 1) {`],
  ['a stop before the first is let through', CLAMP, `this.i = Math.min(TOUR.length - 1, i);`],
  ['a stop past the last is let through', CLAMP, `this.i = Math.max(0, i);`],
  ['the last stop is one past the end', CLAMP, CLAMP.replace(`TOUR.length - 1, i`, `TOUR.length, i`)],
  ['the journey never plays', `if (stop.id === 'fall') this.journey.play();`, `if (stop.id === 'fallX') this.journey.play();`],
  ['every stop plays the journey', `if (stop.id === 'fall') this.journey.play(); else this.journey.stop();`, `this.journey.play();`],
  ['Next at the last stop stays there', `if (this.i >= TOUR.length - 1) { this.stop(); return; }`, `if (this.i > TOUR.length - 1) { this.stop(); return; }`],
  ['Next at the stop before the last ends the tour', `if (this.i >= TOUR.length - 1) { this.stop(); return; }`, `if (this.i >= TOUR.length - 2) { this.stop(); return; }`],
  ['Back goes forward', `prev() { this.go(this.i - 1); }`, `prev() { this.go(this.i + 1); }`],
  ['the ring stays after the tour', `    this.focusSvg.innerHTML = '';\n    this.idleCaption();`, `    this.idleCaption();`],
  ['a change during the tour draws the idle caption, and a change after it the tour', `if (!this.running) this.idleCaption(); else this.draw();`, `if (this.running) this.idleCaption(); else this.draw();`],
  ['a refresh after the tour draws the tour', `refresh() { if (this.running) this.draw(); }`, `refresh() { this.draw(); }`],
  ['the first dot always on', `k === this.i ? 'on' : ''`, `k === 0 ? 'on' : ''`],
  ['every dot up to this stop on', `k === this.i ? 'on' : ''`, `k <= this.i ? 'on' : ''`],
  ['the stop before the last says Finish', `this.i === TOUR.length - 1 ? 'Finish'`, `this.i >= TOUR.length - 2 ? 'Finish'`],
  ['no stop says Finish', `this.i === TOUR.length - 1 ? 'Finish'`, `this.i === TOUR.length ? 'Finish'`],
  ['the Next button ends the tour', BUTTONS, BUTTONS.replace(`n === 'next'`, `n === 'nextX'`)],
  ['the Back button ends the tour', BUTTONS, BUTTONS.replace(`n === 'prev'`, `n === 'prevX'`)],
  ['the Exit button goes forward', BUTTONS, BUTTONS.replace(`else this.stop();`, `else this.next();`)],
  ['the idle caption\'s button starts at the second stop', `() => this.start(0));`, `() => this.start(1));`],
];

process.exit(await runMutants({ here, file: 'tour.js', test: '../tour.test.mjs', mutants: MUTANTS }));
