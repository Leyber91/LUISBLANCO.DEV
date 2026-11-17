/* ============================================================
   The test of the tour's tests, part 2 of 2. Run from the
   repository root:
     node labs/assets/js/blackhole/tests/tour.mutants2.test.mjs

   Each entry breaks one rule of tour.js: the tour's clock (a stop
   ends just past its time, the ring redrawn each quarter second),
   the idle drift (after 20 s without input, never during the
   tour, under reduced motion, on a still page or with the
   animation off, and round at 180 deg), the focus ring (where it
   sits for each focus, its size and pulse, none when there is
   nothing to ring) and the idle caption. The broken file is
   written to a copy of this lab in the system's temp folder and
   tour.test.mjs is run on the copy (kit/tests/mutants.mjs). Every
   broken rule must fail a check there. Part 1 is
   tour.mutants.test.mjs.

   Add an entry here with every new rule in tour.js.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const QUARTER = `if (Math.floor(this.t * 4) !== Math.floor((this.t - dt / 1000) * 4)) this.drawFocus();`;
const IDLE = `if (!store.reduced && !this.app.still && now - this.app.lastInput > 20000 && store.get('anim')) {`;
const SHADOW = `if (stop.focus === 'shadow' && an.shadow) { pt = { sx: an.shadow.cx, sy: an.shadow.cy };`;

const MUTANTS = [
  /* ---- the tour's clock ---- */
  ['the clock counts milliseconds as seconds', `this.t += dt / 1000;`, `this.t += dt;`],
  ['a stop ends at exactly its time', `if (this.t > TOUR[this.i].dur) this.next();`, `if (this.t >= TOUR[this.i].dur) this.next();`],
  ['a stop runs a second past its time', `if (this.t > TOUR[this.i].dur) this.next();`, `if (this.t > TOUR[this.i].dur + 1) this.next();`],
  ['the ring redrawn on every frame', QUARTER, `this.drawFocus();`],
  ['the ring redrawn on every frame but those that cross a quarter second', QUARTER, QUARTER.replace(' !== ', ' === ')],
  ['the ring redrawn each half second', QUARTER, QUARTER.replace(`this.t * 4) !==`, `this.t * 2) !==`).replace(`/ 1000) * 4)`, `/ 1000) * 2)`)],

  /* ---- the idle drift ---- */
  ['the view drifts during the tour', `      return;\n    }\n    // idle drift`, `    }\n    // idle drift`],
  ['the view drifts under reduced motion', IDLE, IDLE.replace(`!store.reduced && `, ``)],
  ['the view drifts on a still page', IDLE, IDLE.replace(`!this.app.still && `, ``)],
  ['the view drifts at exactly 20 s after the last input', IDLE, IDLE.replace(`> 20000`, `>= 20000`)],
  ['the view drifts only from 20.001 s', IDLE, IDLE.replace(`> 20000`, `> 20001`)],
  ['the view drifts with the animation off', IDLE, IDLE.replace(` && store.get('anim')`, ``)],
  ['the drift turns 0.005 deg per ms', `dt * 0.004`, `dt * 0.005`],
  ['the drift never comes round past 180 deg', `((store.get('az') + dt * 0.004) % 360 + 540) % 360 - 180`, `store.get('az') + dt * 0.004`],

  /* ---- the focus ring ---- */
  ['a ring while the tour is not running', `if (!this.running || !an) {`, `if (!an) {`],
  ['a ring drawn from anchors that are not there', `if (!this.running || !an) {`, `if (!this.running && !an) {`],
  ['no anchors: the ring breaks', `if (!this.running || !an) {`, `if (!this.running) {`],
  ['the shadow never ringed', SHADOW, SHADOW.replace(`'shadow' &&`, `'shadowX' &&`)],
  ['a shadow stop with no traced shadow breaks', SHADOW, SHADOW.replace(` && an.shadow) {`, `) {`)],
  ['the shadow ring centred on its left edge', SHADOW, SHADOW.replace(`sx: an.shadow.cx`, `sx: an.shadow.left`)],
  ['the shadow ring 0.6 of the shadow\'s width', `rad = Math.abs(x1 - x0) * 0.62; }`, `rad = Math.abs(x1 - x0) * 0.6; }`],
  ['the limb never ringed', `else if (stop.focus === 'limb')`, `else if (stop.focus === 'limbX')`],
  ['the photon ring never ringed', `else if (stop.focus === 'ring')`, `else if (stop.focus === 'ringX')`],
  ['the ISCO never ringed', `else if (stop.focus === 'isco')`, `else if (stop.focus === 'iscoX')`],
  ['a point ringed at 20 px', `let pt = null, rad = 26;`, `let pt = null, rad = 20;`],
  ['a stop with nothing to ring breaks', `    if (!pt) { this.focusSvg.innerHTML = ''; return; }\n`, ``],
  ['the ring pulses by 10 %', `1 + 0.08 * Math.sin(this.t * 3)`, `1 + 0.1 * Math.sin(this.t * 3)`],

  /* ---- the idle caption ---- */
  ['a custom hole titled M87*', `: 'Custom hole';`, `: 'M87*';`],
  ['the telescope view reads as the cinematic one', `    const line = ms\n`, `    const line = null\n`],
  ['the telescope view never speaks of the inner shadow', `? (s.emit === 'thick'`, `? (s.emit === 'thickX'`],
  ['the journey view reads as the cinematic one', `: s.view === 'journey'`, `: s.view === 'journeyX'`],
  ['the spin quoted to 2 decimals', 'Spin ${spinText(s.a)}', 'Spin ${s.a.toFixed(2)}'],
  /* ---- 2026-11-16 (review_s2 P2-1, P6-3, P6-4) ---- */
  ['the curve called gold again', `const curve = colourWord('curve');`, `const curve = 'gold';`],
  ['the thick disk\'s inclination rounded', 'at ${deg(ms.incl)} deg. An opaque', 'at ${ms.incl.toFixed(0)} deg. An opaque'],
  ['the thin gas\'s inclination rounded', 'at ${deg(ms.incl)} deg, through hot', 'at ${ms.incl.toFixed(0)} deg, through hot'],
  ['the focus ring loses its class', `<circle class="tour-focus"`, `<circle class="focus"`],
  ['the focus ring in ink, not gold', `stroke="var(--accretion)"`, `stroke="var(--horizon)"`],
  ['anchors read for the eased view, not the target', `liveAnchors(this.getAnchors(), this.app.store.view(true))`, `liveAnchors(this.getAnchors(), this.app.store.view())`],
  ['the colour named by its key, not its label', '${COLOR_MODES[s.color].label.toLowerCase()} colour', '${s.color} colour'],
  ['the view named by its key, not its label', '${esc(VIEWS[s.view].label)} view', '${esc(s.view)} view'],
];

process.exit(await runMutants({ here, file: 'tour.js', test: '../tour.test.mjs', mutants: MUTANTS }));
