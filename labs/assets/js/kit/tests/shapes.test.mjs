/* ============================================================
   The geometry of the shared shapes (kit/shapes.js): the interval
   on one log axis, the scale the arrow keys move, the tally that
   fits its strip. Run from the repository root:
     node labs/assets/js/kit/tests/shapes.test.mjs

   Each bound has a case on each side of it, so that
   kit/tests/shapes.mutants.test.mjs can break each rule and see a
   check fail here.
   ============================================================ */

import { ivGeometry, ivAt, scaleStep, tallyMarks, IV_SPAN, IV_PAD } from '../shapes.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
process.on('uncaughtException', (e) => { console.log(`FAIL  the tests stopped on an error: ${e && e.message}`); process.exit(1); });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- the interval ---- */
yes('the axis reaches a factor of 2.2 either side, with 3 px kept at each end', IV_SPAN === 2.2 && IV_PAD === 3);
const W = 150, k = (W / 2 - 3) / Math.log(2.2);
const g = ivGeometry(1.34, 1.16, 1.45, W);
yes('the value stands in the middle of the strip, and the ends where their ratio to it puts them on the log axis', !!g && g.xc === 75 && near(g.a, 75 + k * Math.log(1.16 / 1.34)) && near(g.b, 75 + k * Math.log(1.45 / 1.34)) && g.ranged && !g.cutLo && !g.cutHi, JSON.stringify(g));
yes('the same ratio is the same length on every row, whatever the value', near(ivGeometry(1, 0.5, 2, W).b - ivGeometry(1, 0.5, 2, W).xc, ivGeometry(300, 150, 600, W).b - ivGeometry(300, 150, 600, W).xc) && near(ivGeometry(1, 0.5, 2, W).xc - ivGeometry(1, 0.5, 2, W).a, ivGeometry(1, 0.5, 2, W).b - ivGeometry(1, 0.5, 2, W).xc));
const edge = 1 / 2.2;
const atEdge = ivGeometry(1, edge, 2.2, W), past = ivGeometry(1, edge * 0.999, 2.2 * 1.001, W);
yes('an end exactly at the axis\'s reach is not cut', near(atEdge.a, IV_PAD) && near(atEdge.b, W - IV_PAD) && !atEdge.cutLo && !atEdge.cutHi, JSON.stringify(atEdge));
yes('an end past it is cut at the strip\'s end, and says so', past.a === IV_PAD && past.b === W - IV_PAD && past.cutLo && past.cutHi, JSON.stringify(past));
yes('the default axis is the shared one', near(ivGeometry(1, 0.5, 2, W).b, ivGeometry(1, 0.5, 2, W, IV_SPAN).b) && near(ivAt(2, W), ivAt(2, W, IV_SPAN)));
yes('a range with no low end, or a low end of zero, is not drawn', !ivGeometry(2, null, 3, W).ranged && !ivGeometry(2, undefined, 3, W).ranged && !ivGeometry(2, 1, null, W).ranged);
yes('a high end exactly at the strip less its 3 px is not cut, and one just past is', !ivGeometry(1, 1 / IV_SPAN, IV_SPAN, W).cutHi && ivGeometry(1, 1 / IV_SPAN, IV_SPAN * 1.001, W).cutHi && near(ivGeometry(1, 0.9, IV_SPAN * 2, W).b, W - IV_PAD));
yes('a cut on one side only says that side', ivGeometry(1, 0.2, 1.5, W).cutLo && !ivGeometry(1, 0.2, 1.5, W).cutHi && !ivGeometry(1, 0.9, 5, W).cutLo && ivGeometry(1, 0.9, 5, W).cutHi);
yes('a value with no range is a bare tick', same(ivGeometry(112.3, null, null, W), { xc: 75, a: 75, b: 75, ranged: false, cutLo: false, cutHi: false }));
yes('a range that does not hold its value, or has no length, is not drawn', !ivGeometry(2, 2.1, 3, W).ranged && !ivGeometry(2, 1, 1.9, W).ranged && !ivGeometry(2, 2, 2, W).ranged && !ivGeometry(2, 3, 1, W).ranged);
yes('a range that starts or ends at its value is drawn', ivGeometry(2, 2, 3, W).ranged && ivGeometry(2, 1, 2, W).ranged && near(ivGeometry(2, 2, 3, W).a, 75) && near(ivGeometry(2, 1, 2, W).b, 75));
yes('a range with an end of zero or below is not drawn on a log axis', !ivGeometry(2, 0, 3, W).ranged && !ivGeometry(2, -1, 3, W).ranged && !ivGeometry(2, 1, Infinity, W).ranged);
yes('a value of zero or below, or not a number, has no place on a log axis', ivGeometry(0, null, null, W) === null && ivGeometry(-1, null, null, W) === null && ivGeometry(NaN, null, null, W) === null && ivGeometry('1', null, null, W) === null);
yes('a strip no wider than its two ends, or an axis that reaches no factor, draws nothing', ivGeometry(1, 0.5, 2, 6) === null && !!ivGeometry(1, 0.5, 2, 7) && ivGeometry(1, 0.5, 2, W, 1) === null && !!ivGeometry(1, 0.5, 2, W, 1.01));
yes('half and twice the value fall where the axis puts them, either side of the middle', near(ivAt(1, W), 75) && near(ivAt(0.5, W), 75 + k * Math.log(0.5)) && near(ivAt(2, W), 150 - ivAt(0.5, W)) && near(ivAt(2.2, W), W - IV_PAD));

/* ---- the scale ---- */
yes('the right and down keys move one option on, and stop at the last', scaleStep(0, 3, 'ArrowRight') === 1 && scaleStep(1, 3, 'ArrowDown') === 2 && scaleStep(2, 3, 'ArrowRight') === 2);
yes('the left and up keys move one option back, and stop at the first', scaleStep(2, 3, 'ArrowLeft') === 1 && scaleStep(1, 3, 'ArrowUp') === 0 && scaleStep(0, 3, 'ArrowLeft') === 0);
yes('Home and End go to the two ends', scaleStep(1, 3, 'Home') === 0 && scaleStep(1, 3, 'End') === 2 && scaleStep(0, 5, 'End') === 4);
yes('other keys, and a scale with no options, move nothing', scaleStep(1, 3, 'Enter') === null && scaleStep(1, 3, 'a') === null && scaleStep(0, 0, 'ArrowRight') === null);

/* ---- the tally ---- */
yes('a strip that holds them all has a mark for each, and a tall mark for each kept, spread along it', same(tallyMarks(12, 3, 84, 7), { marks: 12, tall: [3, 7, 11], all: true }), JSON.stringify(tallyMarks(12, 3, 84, 7)));
yes('a strip one pitch short holds one mark fewer and says it does not hold them all', same(tallyMarks(12, 3, 83, 7), { marks: 11, tall: [3, 7, 10], all: false }), JSON.stringify(tallyMarks(12, 3, 83, 7)));
yes('every kept thing has its tall mark when all fit', tallyMarks(5, 5, 35, 7).tall.length === 5 && tallyMarks(5, 4, 35, 7).tall.length === 4 && tallyMarks(5, 1, 35, 7).tall.length === 1);
yes('when they do not all fit the kept keep their share, and one at least stands for any', tallyMarks(1000, 1, 140, 7).tall.length === 1 && tallyMarks(1000, 0, 140, 7).tall.length === 0 && tallyMarks(1000, 500, 140, 7).tall.length === 10 && tallyMarks(200, 200, 140, 7).tall.length === 20,
  `${tallyMarks(1000, 1, 140, 7).tall.length} ${tallyMarks(1000, 500, 140, 7).tall.length} ${tallyMarks(200, 200, 140, 7).tall.length}`);
yes('nothing counted, or no room, draws no mark', same(tallyMarks(0, 0, 200), { marks: 0, tall: [], all: true }) && same(tallyMarks(9, 2, 0), { marks: 0, tall: [], all: false }) && tallyMarks(9, 2, 6, 7).marks === 0 && tallyMarks(9, 2, 7, 7).marks === 1 && tallyMarks(9, 2, -7).marks === 0 && same(tallyMarks(9, 2, -7).tall, []));
yes('more kept than counted is read as all counted being kept, and odd counts are read as whole', same(tallyMarks(3, 9, 70), { marks: 3, tall: [0, 1, 2], all: true }) && tallyMarks(3.7, 1.9, 70).marks === 3 && tallyMarks(3.7, 1.9, 70).tall.length === 1 && tallyMarks(NaN, 2, 70).marks === 0 && tallyMarks(-4, 2, 70).marks === 0);
yes('a kept count below zero, or not a number, is read as none kept', tallyMarks(10, -3, 70).tall.length === 0 && tallyMarks(10, NaN, 70).tall.length === 0 && tallyMarks(10, '2', 70).tall.length === 0, `${tallyMarks(10, -3, 70).tall} | ${tallyMarks(10, NaN, 70).tall}`);
yes('a pitch of zero or below draws no mark, and the default pitch is 7 px', tallyMarks(10, 2, 70, 0).marks === 0 && tallyMarks(10, 2, 70, -7).marks === 0 && tallyMarks(10, 2, 70).marks === 10 && tallyMarks(10, 2, 69).marks === 9);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
