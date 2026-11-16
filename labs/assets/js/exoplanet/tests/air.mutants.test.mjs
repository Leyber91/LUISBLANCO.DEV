/* ============================================================
   The test of the air tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.mutants.test.mjs

   Each entry breaks one rule of air.js, or one rule data.js
   draws from it: a constant of the fit moved to either side, a
   bound moved across a case, a status of the observed table
   turned, a branch silenced. The broken file is written to a
   copy of this lab in the system's temp folder and
   air.test.mjs is run on the copy (mutants.mjs). Every broken
   rule must fail a check there.

   Add an entry here with every new rule in air.js, and with
   every rule data.js takes from it.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const AIR = [
  /* ---- the fit's constants, each moved to either side ---- */
  ['the shoreline\'s normalisation from 2.62 down to 2.52', `logF0: 2.62,`, `logF0: 2.52,`],
  ['the shoreline\'s normalisation from 2.62 up to 2.72', `logF0: 2.62,`, `logF0: 2.72,`],
  ['the escape-speed exponent from 5.9 down to 5.5', `p: 5.9,`, `p: 5.5,`],
  ['the escape-speed exponent from 5.9 up to 6.3', `p: 5.9,`, `p: 6.3,`],
  ['the luminosity exponent from 1.17 down to 1.0', `q: 1.17,`, `q: 1.0,`],
  ['the luminosity exponent from 1.17 up to 1.3', `q: 1.17,`, `q: 1.3,`],
  ['the width from 0.247 down to 0.2 dex', `w: 0.247,`, `w: 0.2,`],
  ['the width from 0.247 up to 0.3 dex', `w: 0.247,`, `w: 0.3,`],
  ['Earth\'s escape speed from 11.18 to 11.0 km/s', `vEscEarth: 11.18,`, `vEscEarth: 11.0,`],
  ['the fit\'s sample to 1,300 times Earth\'s flux', `fluxMax: 1400 }`, `fluxMax: 1300 }`],
  ['the fit\'s sample to 1,500 times Earth\'s flux', `fluxMax: 1400 }`, `fluxMax: 1500 }`],
  ['1,400 itself counted outside the sample', `outside: S > K.fluxMax`, `outside: S >= K.fluxMax`],
  ['never outside the sample', `outside: S > K.fluxMax`, `outside: false`],
  ['a fit with no flux', `if (!fin(S) || !fin(L) || !fin(vEsc) || S <= 0 ||`, `if (!fin(S) || !fin(L) || !fin(vEsc) ||`],
  ['the logistic turned round', `P: 1 / (1 + Math.exp(delta / K.w))`, `P: 1 / (1 + Math.exp(-delta / K.w))`],

  /* ---- the scenarios ---- */
  ['bare rock given the probability of air', `(key === 'bare' ? 1 - fit.P : fit.P)`, `(key === 'bare' ? fit.P : fit.P)`],
  ['a probability given to excluded and observed scenarios too', `p: status === 'allowed' ? pOf(key) : null`, `p: pOf(key)`],
  ['every observation read as allowing everything', `const status = o ? o.s : 'allowed';`, `const status = 'allowed';`],
  ['an observed scenario not drawn first', `if (seenOne) { drawn = seenOne.key; by = 'observed'; }`, `if (false) { drawn = seenOne.key; by = 'observed'; }`],
  ['the paper\'s conclusion ignored', `else if (obs && obs.concludes && open(obs.concludes))`, `else if (false)`],
  ['a conclusion drawn though the entry excludes it', `else if (obs && obs.concludes && open(obs.concludes))`, `else if (obs && obs.concludes)`],
  ['air from a probability of 0.52', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.52 : wantAir;`],
  ['air from a probability of 0.48', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.48 : wantAir;`],
  ['with no fit, always air', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.5 : true;`],
  ['thick air never chosen by the amount', `(wantThick ? ['thick', 'thin', 'bare'] : ['thin', 'thick', 'bare'])`, `['thin', 'thick', 'bare']`],
  ['a bare verdict drawn with thin air', `: ['bare', 'thin', 'thick'];`, `: ['thin', 'bare', 'thick'];`],
  ['an excluded scenario drawn', `drawn = order.find(open) || null;`, `drawn = order[0];`],
  ['an excluded scenario offered as a switch', `filter((x) => x.status !== 'excluded').map((x) => x.key)`, `map((x) => x.key)`],

  /* ---- the observed table, as read ---- */
  ['LHS 3844 b\'s thick air allowed', `thick: ex('Atmospheres above 10 bar`, `thick: ok('Atmospheres above 10 bar`],
  ['55 Cnc e\'s atmosphere only allowed', `thick: seen('A volatile atmosphere`, `thick: ok('A volatile atmosphere`],
  ['TRAPPIST-1 b\'s conclusion dropped', `{ name: 'TRAPPIST-1 b', papers: ['greene23', 'ducrot25'], concludes: 'bare'`, `{ name: 'TRAPPIST-1 b', papers: ['greene23', 'ducrot25'], concludes: null`],
  ['LHS 3844 b\'s day side taken from Spitzer', `day: { T: 985, lo: 17, hi: 16, src: 'zieba26' }`, `day: { T: 1040, lo: 40, hi: 40, src: 'kreidberg19' }`],
  ['a DOI one digit off', `doi: '10.1038/s41586-023-05951-7'`, `doi: '10.1038/s41586-023-05952-7'`],

  /* ---- the bare rock's day side ---- */
  ['the rock\'s albedo from 0.1 to 0.2', `albedo: 0.1,`, `albedo: 0.2,`],
  ['the rock\'s albedo from 0.1 to 0', `albedo: 0.1,`, `albedo: 0,`],
  ['the day-side factor from 2/3 to 1/2', `f: 2 / 3,`, `f: 1 / 2,`],
  ['the melt from 1,673 K to 1,600 K', `Tlock: 1673,`, `Tlock: 1600,`],
  ['the melt from 1,673 K to 1,750 K', `Tlock: 1673,`, `Tlock: 1750,`],
  ['the night of a bare rock at 75 K', `Tnight: 50 }`, `Tnight: 75 }`],
  ['the albedo left out of the hottest point', `* Math.pow(1 - BARE.albedo, 0.25);`, `;`],
  ['the day side taken at the hottest point', `Tday: Tss * Math.pow(BARE.f, 0.25)`, `Tday: Tss`],
  ['a melt starting 5 K above the bound', `Tss <= BARE.Tlock) return 0;`, `Tss <= BARE.Tlock + 5) return 0;`],
  ['the melt\'s angle by the square', `Math.acos(Math.pow(BARE.Tlock / Tss, 4))`, `Math.acos(Math.pow(BARE.Tlock / Tss, 2))`],
  ['the map without its night floor', `Math.max(Tsub * Math.pow(c, 0.25), Tnight)`, `Tsub * Math.pow(c, 0.25)`],
  ['the search for a hottest point turned round', `if (mapDay(m, Tnight) < Tday) lo = m; else hi = m;`, `if (mapDay(m, Tnight) > Tday) lo = m; else hi = m;`],

  /* ---- the line ---- */
  ['over 99.9% said from 99.99%', `if (v >= 99.95) return 'over 99.9%';`, `if (v >= 99.99) return 'over 99.9%';`],
  ['under 0.1% said from 0.01%', `if (v < 0.05) return 'under 0.1%';`, `if (v < 0.01) return 'under 0.1%';`],
  ['a decimal from 2% down', '`${v < 1 || v > 99 ? v.toFixed(1)', '`${v < 2 || v > 99 ? v.toFixed(1)'],
  ['a decimal from 98% up', '`${v < 1 || v > 99 ? v.toFixed(1)', '`${v < 1 || v > 98 ? v.toFixed(1)'],
  /* the line, in sentences */
  ['an excluded scenario offered as a link', `out.push(status === 'excluded' ? { t } : { t, air: x.key });`, `out.push({ t, air: x.key });`],
  ['an allowed or observed scenario not offered', `out.push(status === 'excluded' ? { t } : { t, air: x.key });`, `out.push({ t });`],
  ['excluded scenarios never said', `for (const status of ['observed', 'allowed', 'excluded'])`, `for (const status of ['observed', 'allowed'])`],
  ['the status word left out of its sentence', 'if (xs.length) out.push({ t: ` ${status}.` });', `if (xs.length) out.push({ t: '.' });`],
  ['two names joined by a comma', `i === xs.length - 1 ? ' and ' : ', '`, `', '`],
  ['the first name of a sentence in lower case', `const t = i === 0 ? cap(L[x.key]) : L[x.key];`, `const t = L[x.key];`],
  ['two papers joined by a comma', `(xs.length < 3 ? xs.join(' and ')`, `(xs.length < 3 ? xs.join(', ')`],
  ['three papers without their "and"', '`${xs.slice(0, -1).join(\', \')} and ${xs[xs.length - 1]}`', `xs.join(', ')`],
  ['an unobserved world not said to be one', `: ' Not observed.' });`, `: '' });`],
  ['an observed scenario drawn and not said to be observed', `lead.status === 'observed' ? ', as observed' : ''`, `''`],
  ['the only allowed air not named', ', of which only ${L[air[0].key]} is allowed', ''],
  ['a world past the sample not said to be', `\${sc.fit.outside ? ' past its sample' : ''}`, ''],
  ['a chosen scenario not said to be chosen', ', by your choice; the survey draws ${L[sc.drawn]}', ''],
];

/* Rules data.js takes from air.js. The amounts of air are in looks.mutants.test.mjs, beside the look rules. */
const DATA = [
  ['an excluded scenario drawn on request', `airKey = can && can.status !== 'excluded' ? opts.air : air.drawn;`, `airKey = can ? opts.air : air.drawn;`],
  ['a request ignored', `airKey = can && can.status !== 'excluded' ? opts.air : air.drawn;`, `airKey = air.drawn;`],
  ['the measured day side not used for the melt', `air.observed.day && locked ? air.observed.day.T : null;`, `air.observed.day && locked ? null : null;`],
  ['the measured day side not drawn', `measured = !!(obs && obs.day && locked);`, `measured = false;`],
  ['a bare rock\'s night at 0.15 of its Teq', `const Tnight = ph.bare ? BARE.Tnight :`, `const Tnight = ph.bare ? Math.max(0.15 * ph.Teq, 40) :`],
  ['a bare rock\'s hottest point at sqrt 2 Teq', `: ph.bare ? ph.bare.Tss : k * ph.Teq;`, `: k * ph.Teq;`],
  ['a bare rock\'s glow without its measured temperature', `(1 - BARE.albedo) * Math.pow(Tsub / ph.bare.Tss, 4)`, `(1 - BARE.albedo)`],
  ['a bare rock\'s glow at the old 0.9 (T / sqrt2 Teq)^4', `(ph.bare ? (1 - BARE.albedo) * Math.pow(Tsub / ph.bare.Tss, 4) : 0.9 * Math.pow(k / Math.SQRT2, 4))`, `(0.9 * Math.pow(k / Math.SQRT2, 4))`],
  ['the fit given the flux of the drawing instead of the page\'s', `S: insolation(p).S ?? S,`, `S: S * 1.3,`],
];

const data = ['data/exomania/pscomppars-snapshot.json'];
const a = await runMutants({ here, file: 'air.js', test: 'air.test.mjs', mutants: AIR, data });
const d = await runMutants({ here, file: 'data.js', test: 'air.test.mjs', mutants: DATA, data });
console.log(`\nbroken rules: ${AIR.length} in air.js, ${DATA.length} in data.js`);
process.exit(a || d);
