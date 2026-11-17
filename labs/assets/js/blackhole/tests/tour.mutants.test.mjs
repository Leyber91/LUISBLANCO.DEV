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

  /* ---- the numbers a caption quotes (the distance's units moved to physics.js parsecs on 2026-11-16) ---- */
  ['the idle caption reads the telescope view as another view', `s.view === 'telescope' ? measurement(s) : null`, `s.view === 'telescopeX' ? measurement(s) : null`],
  ['the stops\' shadow taken at 90 deg, not the measurement\'s inclination (fix_s2_p1 K1)', `const ms = measurement(s), ts = ms.th;`, `const ms = measurement(s), ts = measurement({ ...s, view: 'telescope', incl: 90 }).th;`],
  ['the stops\' comparison taken at 90 deg', `    const cmp = ms.cmp;\n`, `    const cmp = measurement({ ...s, view: 'telescope', incl: 90 }).cmp;\n`],
  ['the shadow\'s inclination read from the camera', `farIncl: deg(ms.incl),`, `farIncl: deg(s.incl),`],
  ['the shadow\'s inclination rounded', `farIncl: deg(ms.incl),`, `farIncl: ms.incl.toFixed(0),`],
  ['the scale\'s number dropped', `scale: cmp ? s3(cmp.pred.thetaG) : '--',`, `scale: '--',`],
  ['the angle quoted as the scale', `scale: cmp ? s3(cmp.pred.thetaG) : '--',`, `scale: cmp ? s3(cmp.pred.value) : '--',`],
  ['the idle caption names Bardeen\'s curve whatever the shadow', `named = ms ? SHADOW_HOW[ms.th.how].curve : null;`, `named = ms ? SHADOW_HOW.bardeen.curve : null;`],
  ['the thick disk names a curve where none is drawn', '${named ? `The ${curve} curve: the ${named}.`', '${true ? `The ${curve} curve: the ${named}.`'],
  ['the thin gas names a curve where none is drawn', '${named ? `The ${curve} curve is the ${named};', '${true ? `The ${curve} curve is the ${named};'],
  ['a custom hole is named M87*', `name: o ? o.name : 'this hole'`, `name: o ? o.name : 'M87*'`],
  ['the caption\'s comparison sentence left out', `eht: compareSentence(cmp, o ? o.name : 'this hole'),`, `eht: '',`],
  ['the scale\'s name left out of the caption', `by: cmp && cmp.pred.by ? cmp.pred.by : 'its mass and distance',`, `by: 'its mass and distance',`],
  ['the tour names the centre where the fall ends at the inner horizon, and back', `inner: m.endsAtCentre ? 'the centre'`, `inner: !m.endsAtCentre ? 'the centre'`],
  ['a key the state does not have reads "undefined"', `n[k] ?? k`, `n[k]`],
  /* ---- the numbers of 2026-11-16 (review_s2 P2-2, P2-3, P2-8, P2-1) ---- */
  ['the ring stop quotes a factor at a charged hole', `ringThin: g == null ? '--'`, `ringThin: g != null ? '--'`],
  ['the ring stop\'s factor the inverse', `: s3(Math.exp(g)),`, `: s3(Math.exp(-g)),`],
  ['the ring named white in every colour mode', `ringWord: s.color === 'order' ?`, `ringWord: s.color !== 'orderX' ?`],
  ['the ring never named by its colour', `ringWord: s.color === 'order' ?`, `ringWord: s.color === 'orderX' ?`],
  ['the ring named bright where order is shown', `colourWord('order1') : 'bright'`, `'bright' : 'bright'`],
  ['the angle paired with the width again', `shadowAcross: s3(cmp ? cmp.pred.diamM : ts.mean)`, `shadowAcross: s3(ts.chords.width)`],
  ['the angle to one decimal', `shadowUas: cmp ? s3(cmp.pred.value) : '--',`, `shadowUas: cmp ? cmp.pred.value.toFixed(1) : '--',`],
  ['the horizon across given as its radius', `horizonAcrossKm: sci(2 * m.horizonKm)`, `horizonAcrossKm: sci(m.horizonKm)`],
  ['the body typed', `bodyM: String(BODY_M)`, `bodyM: '1'`],
  ['the horizon across given as its radius in M', `rhAcross: s3(2 * m.rh)`, `rhAcross: s3(m.rh)`],
  ['the spin to 2 decimals', `a: spinText(s.a), rhAcross:`, `a: s.a.toFixed(2), rhAcross:`],
  ['the boost to one decimal', `gmax: an && an.gmax ? s3(Math.pow(an.gmax, 4)) : '--'`, `gmax: an && an.gmax ? Math.pow(an.gmax, 4).toFixed(1) : '--'`],

  /* ---- moving through the tour ---- */
  ['start() with no stop named starts at the second', `start(i = 0) {`, `start(i = 1) {`],
  ['a stop before the first is let through', CLAMP, `this.i = Math.min(TOUR.length - 1, i);`],
  ['a stop past the last is let through', CLAMP, `this.i = Math.max(0, i);`],
  ['the last stop is one past the end', CLAMP, CLAMP.replace(`TOUR.length - 1, i`, `TOUR.length, i`)],
  ['the journey never plays', `if (stop.id === 'fall') this.journey.play('tour');`, `if (stop.id === 'fallX') this.journey.play('tour');`],
  ['the tour plays the fall as the visitor', `if (stop.id === 'fall') this.journey.play('tour');`, `if (stop.id === 'fall') this.journey.play();`],
  ['every stop plays the journey', `if (stop.id === 'fall') this.journey.play('tour'); else this.journey.stop();`, `this.journey.play('tour');`],
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
