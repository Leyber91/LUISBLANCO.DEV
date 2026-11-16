/* ============================================================
   The test of the air tests, first part: the fit, the table, the
   statuses and the scenarios. The line's words and the rules
   data.js takes from air.js are in air.mutants2.test.mjs: one
   file of both ran past the 120 s lab_tests gives a file on the
   gates' machine (2026-11-16). Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.mutants.test.mjs

   Each entry breaks one rule of air.js. The broken file is written to a copy of this
   lab in the system's temp folder and air.test.mjs is run on
   the copy (mutants.mjs). Every broken rule must fail a check.

   The list is checked against the code, not written from
   memory: tools/dev/conditions.mjs (pull request 43) reads
   every comparison, default and clamp of air.js and data.js
   and names those no entry here breaks. A condition no entry
   can break without changing nothing says so on its own line
   with "equivalent:" and the reason.
     node tools/dev/conditions.mjs labs/assets/js/exoplanet/air.js labs/assets/js/exoplanet/tests/air.mutants.test.mjs labs/assets/js/exoplanet/tests/air.mutants2.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const AIR = [
  /* ---- the fit's guards and its numbers ---- */
  ["no flux guard", "if (!fin(S) || !fin(L) || !fin(vEsc) ||", "if (!fin(L) || !fin(vEsc) ||"],
  ["a missing flux passed when the luminosity is known", "if (!fin(S) || !fin(L) ||", "if (!fin(S) && !fin(L) ||"],
  ["a missing luminosity passed when the escape speed is known", "|| !fin(L) || !fin(vEsc) ||", "|| !fin(L) && !fin(vEsc) ||"],
  ["a missing escape speed passed when the flux is positive", "|| !fin(vEsc) || S <= 0 ||", "|| !fin(vEsc) && S <= 0 ||"],
  ['no luminosity guard', `if (!fin(S) || !fin(L) || !fin(vEsc) ||`, `if (!fin(S) || !fin(vEsc) ||`],
  ['no escape-speed guard', `if (!fin(S) || !fin(L) || !fin(vEsc) ||`, `if (!fin(S) || !fin(L) ||`],
  ['a fit with no flux', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `L <= 0 || vEsc <= 0) return null;`],
  ['zero flux allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S < 0 || L <= 0 || vEsc <= 0) return null;`],
  ['no luminosity floor', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || vEsc <= 0) return null;`],
  ["no flux floor when the luminosity is positive", `S <= 0 || L <= 0 ||`, `S <= 0 && L <= 0 ||`],
  ["no luminosity floor when the escape speed is positive", `L <= 0 || vEsc <= 0)`, `L <= 0 && vEsc <= 0)`],
  ['zero luminosity allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L < 0 || vEsc <= 0) return null;`],
  ['no escape-speed floor', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L <= 0) return null;`],
  ['zero escape speed allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L <= 0 || vEsc < 0) return null;`],
  ['the logistic turned round', `ps[i] = 1 / (1 + Math.exp(d / DRAWS.w[i]));`, `ps[i] = 1 / (1 + Math.exp(-d / DRAWS.w[i]));`],
  ["the median in place of the mean", "full = { P: sum / DRAWS.n,", "full = { P: ps[Math.floor(0.5 * DRAWS.n)],"],
  ['the escape speed normalised to 11.0 km/s', `export const V_ESC_EARTH = 11.186;`, `export const V_ESC_EARTH = 11.0;`],
  ['the luminosity left out of the shoreline', `(DRAWS.logF0[i] + DRAWS.p[i] * lv + DRAWS.q[i] * lL)`, `(DRAWS.logF0[i] + DRAWS.p[i] * lv)`],
  ['the escape speed left out of the shoreline', `(DRAWS.logF0[i] + DRAWS.p[i] * lv + DRAWS.q[i] * lL)`, `(DRAWS.logF0[i] + DRAWS.q[i] * lL)`],
  ["every draw but the first left out", "for (let i = 0; i < DRAWS.n; i++) {\n      const d = lf", "for (let i = 0; i < 1; i++) {\n      const d = lf"],
  ['lower percentile at 10%', `lo: ps[Math.floor(0.16 * DRAWS.n)]`, `lo: ps[Math.floor(0.10 * DRAWS.n)]`],
  ['upper percentile at 90%', `hi: ps[Math.floor(0.84 * DRAWS.n)]`, `hi: ps[Math.floor(0.90 * DRAWS.n)]`],
  ['the fit\'s sample to 1,300 times Earth\'s flux', `fluxMax: 1400 }`, `fluxMax: 1300 }`],
  ['the fit\'s sample to 1,500 times Earth\'s flux', `fluxMax: 1400 }`, `fluxMax: 1500 }`],
  ['1,400 itself outside the sample', `outside: S > K.fluxMax`, `outside: S >= K.fluxMax`],
  ['never outside the sample', `outside: S > K.fluxMax`, `outside: false`],
  /* ---- the paper's mass relation ---- */
  ['the relation at zero radius', `fin(R) && R > 0 && R < MR.upTo`, `fin(R) && R >= 0 && R < MR.upTo`],
  ['no mass relation', `fin(R) && R > 0 && R < MR.upTo`, `fin(R) && R > 0 && R < 0`],
  ['1.8 itself inside the relation', `fin(R) && R > 0 && R < MR.upTo`, `fin(R) && R > 0 && R <= MR.upTo`],
  ['the relation\'s exponent at 3.0', `b: 3.37,`, `b: 3.0,`],
  ['the relation\'s normalisation at 0', `a: -0.025,`, `a: 0,`],
  ['the relation up to 2.0', `upTo: 1.8 };`, `upTo: 2.0 };`],
  /* ---- the bare rock's day side ---- */
  ['the rock\'s albedo from 0.1 to 0.2', `albedo: 0.1,`, `albedo: 0.2,`],
  ['the rock\'s albedo from 0.1 to 0', `albedo: 0.1,`, `albedo: 0,`],
  ['the day-side factor from 2/3 to 1/2', `f: 2 / 3,`, `f: 1 / 2,`],
  ['the melt from 1,673 K to 1,600 K', `Tlock: 1673,`, `Tlock: 1600,`],
  ['the melt from 1,673 K to 1,750 K', `Tlock: 1673,`, `Tlock: 1750,`],
  ['the night of a bare rock at 75 K', `Tnight: 50 }`, `Tnight: 75 }`],
  ["no star temperature guard", `if (!fin(Teff) || !fin(Rstar) ||`, `if (!fin(Rstar) ||`],
  ["no star radius guard", `if (!fin(Teff) || !fin(Rstar) ||`, `if (!fin(Teff) ||`],
  ["no orbit guard", "if (!fin(Teff) || !fin(Rstar) || !fin(a) || a <= 0) return null;", "if (!fin(Teff) || !fin(Rstar) || !fin(a)) return null;"],
  ["no finite-orbit guard", "|| !fin(Rstar) || !fin(a) || a <= 0)", "|| !fin(Rstar) || a <= 0)"],
  ["a missing star temperature passed when its radius is known", "if (!fin(Teff) || !fin(Rstar) ||", "if (!fin(Teff) && !fin(Rstar) ||"],
  ["a missing star radius passed when the orbit is known", "|| !fin(Rstar) || !fin(a) ||", "|| !fin(Rstar) && !fin(a) ||"],
  ['a zero orbit allowed', `if (!fin(Teff) || !fin(Rstar) || !fin(a) || a <= 0) return null;`, `if (!fin(Teff) || !fin(Rstar) || !fin(a) || a < 0) return null;`],
  ['the albedo left out of the hottest point', `* Math.pow(1 - BARE.albedo, 0.25);`, `;`],
  ['the day side taken at the hottest point', `Tday: Tss * Math.pow(BARE.f, 0.25)`, `Tday: Tss`],
  ['a melt starting 5 K above the bound', `Tss <= BARE.Tlock) return 0;`, `Tss <= BARE.Tlock + 5) return 0;`],
  ['the melt\'s angle by the square', `Math.acos(Math.pow(BARE.Tlock / Tss, 4))`, `Math.acos(Math.pow(BARE.Tlock / Tss, 2))`],
  ['no guard on the melt angle', `if (!fin(Tss) || Tss <= BARE.Tlock) return 0;`, `if (Tss <= BARE.Tlock) return 0;`],
  ['the map without its night floor', `Math.max(Tsub * Math.pow(c, 0.25), Tnight)`, `Tsub * Math.pow(c, 0.25)`],
  ['the day side summed over a tenth of the hemisphere', `for (let i = 0; i < 400; i++) {`, `for (let i = 0; i < 40; i++) {`],
  ['the search stopped after six halvings', `for (let i = 0; i < 60; i++) {`, `for (let i = 0; i < 6; i++) {`],
  ['the search starting below the night floor', `let lo = Tnight, hi = Tday * 2;`, `let lo = Tday * 0.5, hi = Tday * 2;`],
  ['the search turned round', `if (mapDay(m, Tnight) < Tday) lo = m; else hi = m;`, `if (mapDay(m, Tnight) > Tday) lo = m; else hi = m;`],
  ['the search\'s upper bound too low', `let lo = Tnight, hi = Tday * 2;`, `let lo = Tnight, hi = Tday * 1.1;`],

  /* ---- statuses from bounds ---- */
  ["thin air read as bare where bounds touch", `  if (key === 'bare') return b.kind === 'bare';\n  if (b.kind !== 'pressure') return false;`, `  if (key !== 'thick') return b.kind === 'bare';\n  if (b.kind !== 'pressure') return false;`],
  ["the thin and thick bands swapped where bounds touch", `return key === 'thin' ? b.lo < THICK_FROM`, `return key !== 'thin' ? b.lo < THICK_FROM`],
  ["thin air read as bare where bounds cover", `  if (key === 'bare') return b.kind === 'bare';\n  if (b.gases`, `  if (key !== 'thick') return b.kind === 'bare';\n  if (b.gases`],
  ["the thin and thick bands swapped where bounds cover", `return key === 'thin' ? b.lo <= 0`, `return key !== 'thin' ? b.lo <= 0`],
  ["bare never touched", `  if (key === 'bare') return b.kind === 'bare';\n  if (b.kind !== 'pressure') return false;`, `  if (key === 'bare') return b.kind !== 'bare';\n  if (b.kind !== 'pressure') return false;`],
  ['thin never touched', `return key === 'thin' ? b.lo < THICK_FROM && b.hi > 0 : b.hi >= THICK_FROM;`, `return key === 'thin' ? false : b.hi >= THICK_FROM;`],
  ['1 bar itself thin', `b.lo < THICK_FROM && b.hi > 0 :`, `b.lo <= THICK_FROM && b.hi > 0 :`],
  ['zero touches thin', `b.lo < THICK_FROM && b.hi > 0 :`, `b.lo < THICK_FROM && b.hi >= 0 :`],
  ['thick never touched', `: b.hi >= THICK_FROM;\n}`, `: false;\n}`],
  ['1 bar itself not thick', `: b.hi >= THICK_FROM;\n}`, `: b.hi > THICK_FROM;\n}`],
  ["bare never excluded", `  if (key === 'bare') return b.kind === 'bare';\n  if (b.gases`, `  if (key === 'bare') return false;\n  if (b.gases`],
  ["some gases cover", "if (b.gases !== 'all' || !BASES.includes(b.basis)) return false;", "if (!BASES.includes(b.basis)) return false;"],
  ["an exclusion with no basis", "if (b.gases !== 'all' || !BASES.includes(b.basis)) return false;", "if (b.gases !== 'all') return false;"],
  ["an exclusion needing only one of its gases and its basis", "if (b.gases !== 'all' || !BASES.includes(b.basis))", "if (b.gases !== 'all' && !BASES.includes(b.basis))"],
  ["energy balance not a basis", "export const BASES = ['composition', 'energy balance'];", "export const BASES = ['composition'];"],
  ["GJ 367 b's exclusion without its basis", "while 0.1 bar atmospheres are consistent with the data.', 'energy balance')", "while 0.1 bar atmospheres are consistent with the data.')"],
  ["TRAPPIST-1 c's day side from its one eclipse", "day: { T: 369, lo: 23, hi: 23, src: 'gillon25' }", "day: { T: 380, lo: 31, hi: 31, src: 'zieba23' }"],
  ["LTT 1445 A b's conclusion as its consistency statement", "'These results suggest that LTT 1445A b lacks a very thick CO2 atmosphere, possibly due to atmospheric erosion driven by stellar activity. However, the presence of a moderately thin atmosphere (similar to those on Mars, Titan, or Earth) remains uncertain.'", "'consistent with emission from a dark rocky surface'"],
  ["a conclusion without its reading", "${c.reading ? ` ${c.reading}` : ''}", ""],
  ['thin never excluded', `return key === 'thin' ? b.lo <= 0 && b.hi >= THICK_FROM :`, `return key === 'thin' ? false :`],
  ['thin covered from 0.01 bar', `? b.lo <= 0 && b.hi >= THICK_FROM :`, `? b.lo <= 0.01 && b.hi >= THICK_FROM :`],
  ['thin covered to 0.99 bar', `? b.lo <= 0 && b.hi >= THICK_FROM :`, `? b.lo <= 0 && b.hi >= 0.99 :`],
  ['thick never excluded', `: b.lo <= THICK_FROM && b.hi === Infinity;`, `: false;`],
  ['thick covered from 1.01 bar', `: b.lo <= THICK_FROM && b.hi === Infinity;`, `: b.lo <= 1.01 && b.hi === Infinity;`],
  ['thick covered to 1,000 bar', `: b.lo <= THICK_FROM && b.hi === Infinity;`, `: b.lo <= THICK_FROM && b.hi >= 1000;`],
  ['thick from 2 bar', `export const THICK_FROM = 1;`, `export const THICK_FROM = 2;`],
  ["an unknown world given undefined", `BY_NAME.get(name) || null;`, `BY_NAME.get(name);`],
  ['nothing observed', `if (entry.observed && entry.observed.scenario === key) return`, `if (false) return`],
  ['every scenario touched', `  if (!hit.length) {\n    const c = entry.concludes`, `  if (false) {\n    const c = entry.concludes`],
  ['the conclusion never quoted', `const c = entry.concludes && entry.concludes.scenario === key ?`, `const c = false ?`],
  ['never excluded', `const s = hit.some((b) => covers(b, key)) ? 'excluded' : 'disfavoured';`, `const s = 'disfavoured';`],
  ['excluded only if every bound covers', `const s = hit.some((b) => covers(b, key)) ? 'excluded' : 'disfavoured';`, `const s = hit.every((b) => covers(b, key)) ? 'excluded' : 'disfavoured';`],
  ['a bound\'s words left out of the reason', `why: hit.map((b) => b.says).join(' ')`, `why: 'bounded.'`],
  ['LHS 3844 b\'s 10-bar bound for every gas made CO2 alone', `pressure('kreidberg19', 10, Infinity, 'all',`, `pressure('kreidberg19', 10, Infinity, ['CO2'],`],
  ['GJ 367 b\'s 1-bar bound for a wide range of gases made partial', `pressure('zhang24', 1, Infinity, 'all',`, `pressure('zhang24', 1, Infinity, ['CO2'],`],
  ['55 Cnc e\'s atmosphere only allowed', `observed: said('thick', 'hu24',`, `observed: null && said('thick', 'hu24',`],
  ['TRAPPIST-1 b\'s conclusion dropped', `concludes: said('bare', 'greene23',`, `concludes: null && said('bare', 'greene23',`],
  ['LHS 3844 b\'s day side taken from Spitzer', `day: { T: 985, lo: 17, hi: 16, src: 'zieba26' }`, `day: { T: 1040, lo: 40, hi: 40, src: 'kreidberg19' }`],
  ['a DOI one digit off', `doi: '10.1038/s41586-023-05951-7'`, `doi: '10.1038/s41586-023-05952-7'`],
  ['the preprint not marked', `what: 'JWST MIRI, phase curves at 15 µm', preprint: true }`, `what: 'JWST MIRI, phase curves at 15 µm' }`],

  /* ---- the scenarios and the drawing ---- */
  ["the fit's P and 1 - P swapped", "(key !== 'bare' ? fit.P : 1 - fit.P)", "(key === 'bare' ? fit.P : 1 - fit.P)"],
  ["allowed without a probability, the others with one", `const open = st.s === 'allowed' || st.s === 'disfavoured';`, `const open = st.s !== 'allowed' || st.s === 'disfavoured';`],
  ["a status read from another scenario", `list.find((x) => x.key === k).status`, `list.find((x) => x.key !== k).status`],
  ["any scenario but an observed one taken as observed", `const seenOne = list.find((x) => x.status === 'observed');`, `const seenOne = list.find((x) => x.status !== 'observed');`],
  ["bare rock given P", "(key !== 'bare' ? fit.P : 1 - fit.P)", "(key !== 'bare' ? fit.P : fit.P)"],
  ['disfavoured without a probability', `const open = st.s === 'allowed' || st.s === 'disfavoured';`, `const open = st.s === 'allowed';`],
  ["a probability for excluded and observed too", "get p() { return open ? pOf(key) : null; }", "get p() { return pOf(key); }"],
  ['observed not drawn first', `if (seenOne) { drawn = seenOne.key; by = 'observed'; }`, `if (false) { drawn = seenOne.key; by = 'observed'; }`],
  ['the conclusion ignored', `else if (obs && obs.concludes && status(obs.concludes.scenario) !== 'excluded')`, `else if (false)`],
  ['an excluded conclusion drawn', `else if (obs && obs.concludes && status(obs.concludes.scenario) !== 'excluded')`, `else if (obs && obs.concludes)`],
  ['a disfavoured conclusion not drawn', `status(obs.concludes.scenario) !== 'excluded')`, `status(obs.concludes.scenario) === 'allowed')`],
  ["air from 0.502 where the mean decides", "return posterior().P >= 0.5;", "return posterior().P >= 0.502;"],
  ["the median deciding everywhere", "if (Math.abs(median - 0.5) < SIDE_MARGIN) return", "if (Math.abs(median - 0.5) < 0) return"],
  ["the margin at 0.01, inside the widest disagreement", "export const SIDE_MARGIN = 0.1;", "export const SIDE_MARGIN = 0.01;"],
  ["the margin read the wrong way round", "if (Math.abs(median - 0.5) < SIDE_MARGIN) return", "if (Math.abs(median - 0.5) >= SIDE_MARGIN) return"],
  ["air from 0.498 where the mean decides", "return posterior().P >= 0.5;", "return posterior().P >= 0.498;"],
  ["with no fit, always air", "const air = fit ? fit.air : wantAir;", "const air = fit ? fit.air : true;"],
  ['thick never chosen by the amount', `(wantThick ? ['thick', 'thin', 'bare'] : ['thin', 'thick', 'bare'])`, `['thin', 'thick', 'bare']`],
  ['a bare verdict drawn thin', `: ['bare', 'thin', 'thick'];`, `: ['thin', 'bare', 'thick'];`],
  ['an excluded scenario drawn', `drawn = order.find((k) => status(k) === 'allowed') || order.find((k) => status(k) === 'disfavoured') || null;`, `drawn = order[0];`],
  ['disfavoured before allowed', `drawn = order.find((k) => status(k) === 'allowed') || order.find((k) => status(k) === 'disfavoured') || null;`, `drawn = order.find((k) => status(k) !== 'excluded') || null;`],
  ['never a minimum mass', `minMass: !!minMass && !!fit`, `minMass: false`],
  ['a minimum mass flagged without a fit', `minMass: !!minMass && !!fit`, `minMass: !!minMass`],
  ['an excluded scenario offered as a switch', `filter((x) => x.status !== 'excluded').map((x) => x.key)`, `map((x) => x.key)`],

];

const data = ['data/exomania/pscomppars-snapshot.json'];
const a = await runMutants({ here, file: 'air.js', test: 'air.test.mjs', mutants: AIR, data });
console.log(`\nbroken rules: ${AIR.length} in air.js (the line's words and data.js are in air.mutants2.test.mjs)`);
process.exit(a);
