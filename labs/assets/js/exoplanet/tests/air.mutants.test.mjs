/* ============================================================
   The test of the air tests. Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.mutants.test.mjs

   Each entry breaks one rule of air.js, or one rule data.js
   draws from it. The broken file is written to a copy of this
   lab in the system's temp folder and air.test.mjs is run on
   the copy (mutants.mjs). Every broken rule must fail a check.

   The list is checked against the code, not written from
   memory: tools/dev/conditions.mjs (pull request 43) reads
   every comparison, default and clamp of air.js and data.js
   and names those no entry here breaks. A condition no entry
   can break without changing nothing says so on its own line
   with "equivalent:" and the reason.
     node tools/dev/conditions.mjs labs/assets/js/exoplanet/air.js labs/assets/js/exoplanet/tests/air.mutants.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from './mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const AIR = [
  /* ---- the fit's guards and its numbers ---- */
  ['no flux guard', `if (!fin(S) || !fin(L) || !fin(vEsc) ||`, `if (!fin(L) || !fin(vEsc) ||`],
  ['no luminosity guard', `if (!fin(S) || !fin(L) || !fin(vEsc) ||`, `if (!fin(S) || !fin(vEsc) ||`],
  ['no escape-speed guard', `if (!fin(S) || !fin(L) || !fin(vEsc) ||`, `if (!fin(S) || !fin(L) ||`],
  ['a fit with no flux', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `L <= 0 || vEsc <= 0) return null;`],
  ['zero flux allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S < 0 || L <= 0 || vEsc <= 0) return null;`],
  ['no luminosity floor', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || vEsc <= 0) return null;`],
  ['zero luminosity allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L < 0 || vEsc <= 0) return null;`],
  ['no escape-speed floor', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L <= 0) return null;`],
  ['zero escape speed allowed', `S <= 0 || L <= 0 || vEsc <= 0) return null;`, `S <= 0 || L <= 0 || vEsc < 0) return null;`],
  ['the logistic turned round', `ps[i] = 1 / (1 + Math.exp(d / DRAWS.w[i]));`, `ps[i] = 1 / (1 + Math.exp(-d / DRAWS.w[i]));`],
  ['the median in place of the mean', `const out = { P: sum / DRAWS.n,`, `const out = { P: ps[Math.floor(0.5 * DRAWS.n)],`],
  ['the escape speed normalised to 11.0 km/s', `export const V_ESC_EARTH = 11.186;`, `export const V_ESC_EARTH = 11.0;`],
  ['the luminosity left out of the shoreline', `(DRAWS.logF0[i] + DRAWS.p[i] * lv + DRAWS.q[i] * lL)`, `(DRAWS.logF0[i] + DRAWS.p[i] * lv)`],
  ['the escape speed left out of the shoreline', `(DRAWS.logF0[i] + DRAWS.p[i] * lv + DRAWS.q[i] * lL)`, `(DRAWS.logF0[i] + DRAWS.q[i] * lL)`],
  ['every draw but the first left out', `for (let i = 0; i < DRAWS.n; i++) {\n    const d = lf`, `for (let i = 0; i < 1; i++) {\n    const d = lf`],
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
  ['no orbit guard', `if (!fin(Teff) || !fin(Rstar) || !fin(a) || a <= 0) return null;`, `if (!fin(Teff) || !fin(Rstar) || !fin(a)) return null;`],
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
  ["some gases cover", `if (b.gases !== 'all') return false;`, `if (false) return false;`],
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
  ["the fit's P and 1 - P swapped", `(key === 'thick' ? fit.P : 1 - fit.P)`, `(key !== 'thick' ? fit.P : 1 - fit.P)`],
  ["allowed without a probability, the others with one", `const open = st.s === 'allowed' || st.s === 'disfavoured';`, `const open = st.s !== 'allowed' || st.s === 'disfavoured';`],
  ["a status read from another scenario", `list.find((x) => x.key === k).status`, `list.find((x) => x.key !== k).status`],
  ["any scenario but an observed one taken as observed", `const seenOne = list.find((x) => x.status === 'observed');`, `const seenOne = list.find((x) => x.status !== 'observed');`],
  ['bare rock given P', `(key === 'thick' ? fit.P : 1 - fit.P)`, `(key === 'thick' ? fit.P : fit.P)`],
  ['disfavoured without a probability', `const open = st.s === 'allowed' || st.s === 'disfavoured';`, `const open = st.s === 'allowed';`],
  ['a probability for excluded and observed too', `p: open ? pOf(key) : null`, `p: pOf(key)`],
  ['observed not drawn first', `if (seenOne) { drawn = seenOne.key; by = 'observed'; }`, `if (false) { drawn = seenOne.key; by = 'observed'; }`],
  ['the conclusion ignored', `else if (obs && obs.concludes && status(obs.concludes.scenario) !== 'excluded')`, `else if (false)`],
  ['an excluded conclusion drawn', `else if (obs && obs.concludes && status(obs.concludes.scenario) !== 'excluded')`, `else if (obs && obs.concludes)`],
  ['a disfavoured conclusion not drawn', `status(obs.concludes.scenario) !== 'excluded')`, `status(obs.concludes.scenario) === 'allowed')`],
  ['air from 0.502', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.502 : wantAir;`],
  ['air from 0.498', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.498 : wantAir;`],
  ['with no fit, always air', `const air = fit ? fit.P >= 0.5 : wantAir;`, `const air = fit ? fit.P >= 0.5 : true;`],
  ['thick never chosen by the amount', `(wantThick ? ['thick', 'thin', 'bare'] : ['thin', 'thick', 'bare'])`, `['thin', 'thick', 'bare']`],
  ['a bare verdict drawn thin', `: ['bare', 'thin', 'thick'];`, `: ['thin', 'bare', 'thick'];`],
  ['an excluded scenario drawn', `drawn = order.find((k) => status(k) === 'allowed') || order.find((k) => status(k) === 'disfavoured') || null;`, `drawn = order[0];`],
  ['disfavoured before allowed', `drawn = order.find((k) => status(k) === 'allowed') || order.find((k) => status(k) === 'disfavoured') || null;`, `drawn = order.find((k) => status(k) !== 'excluded') || null;`],
  ['never a minimum mass', `minMass: !!minMass && !!fit`, `minMass: false`],
  ['a minimum mass flagged without a fit', `minMass: !!minMass && !!fit`, `minMass: !!minMass`],
  ['an excluded scenario offered as a switch', `filter((x) => x.status !== 'excluded').map((x) => x.key)`, `map((x) => x.key)`],

  /* ---- the line ---- */
  ['over 99.9% said from 99.99%', `if (v >= 99.95) return 'over 99.9%';`, `if (v >= 99.99) return 'over 99.9%';`],
  ['under 0.01% said from 0.001%', `if (v < 0.01) return 'under 0.01%';`, `if (v < 0.001) return 'under 0.01%';`],
  ['under 0.01% said from 0.02%', `if (v < 0.01) return 'under 0.01%';`, `if (v < 0.02) return 'under 0.01%';`],
  ['two figures from 2% down', `if (v < 1) return`, `if (v < 2) return`],
  ['whole numbers from 0.5%', `if (v < 1) return`, `if (v < 0.5) return`],
  ['one figure up to 0.2%', `toPrecision(v < 0.1 ? 1 : 2)`, `toPrecision(v < 0.2 ? 1 : 2)`],
  ['two figures from 0.01%', `toPrecision(v < 0.1 ? 1 : 2)`, `toPrecision(2)`],
  ['a decimal from 98% up', '`${v > 99 ? v.toFixed(1)', '`${v > 98 ? v.toFixed(1)'],
  ['a decimal only from 99.5% up', '`${v > 99 ? v.toFixed(1)', '`${v > 99.5 ? v.toFixed(1)'],
  ['a range keeps both per-cent signs', '`${/^\\d/.test(a) ? a.slice(0, -1) : a} to ${b}`', '`${a} to ${b}`'],
  ['a range drops a sign from words too', '`${/^\\d/.test(a) ? a.slice(0, -1) : a} to ${b}`', '`${a.slice(0, -1)} to ${b}`'],
  ['a range of one value said twice', 'a === b ? `all ${b}` :', 'false ? `all ${b}` :'],
  ["three papers joined by \"and\" twice", `(xs.length < 3 ? xs.join(' and ')`, `(xs.length < 4 ? xs.join(' and ')`],
  ["the line led by another scenario", `const lead = sc.list.find((x) => x.key === shown);`, `const lead = sc.list.find((x) => x.key !== shown);`],
  ['the default said to be chosen', '${shown !== sc.drawn ? `', '${true ? `'],
  ["the drawn scenario listed again", `sc.list.filter((x) => x.key !== shown && x.status === status)`, `sc.list.filter((x) => x.status === status)`],
  ["each status sentence listing the others", `x.key !== shown && x.status === status`, `x.key !== shown && x.status !== status`],
  ["the rest names thick air alone", `x.key !== 'thick' && x.p !== null`, `x.key === 'thick' && x.p !== null`],
  ["the parts run together with spaces", `.map((x) => x.t).join('');`, `.map((x) => x.t).join(' ');`],
  ['two papers joined by a comma', `(xs.length < 3 ? xs.join(' and ')`, `(xs.length < 3 ? xs.join(', ')`],
  ['three papers without their "and"', '`${xs.slice(0, -1).join(\', \')} and ${xs[xs.length - 1]}`', `xs.join(', ')`],
  ['an observed scenario drawn and not said to be', `lead.status === 'observed' ? ', as observed' : ''`, `''`],
  ['a disfavoured scenario drawn and not said to be', `lead.status === 'disfavoured' ? ', though disfavoured' : ''`, `''`],
  ['a chosen scenario not said to be chosen', ', by your choice; the survey draws ${L[sc.drawn]}', ''],
  ['excluded scenarios never said', `for (const status of ['observed', 'allowed', 'disfavoured', 'excluded'])`, `for (const status of ['observed', 'allowed', 'disfavoured'])`],
  ['disfavoured scenarios never said', `for (const status of ['observed', 'allowed', 'disfavoured', 'excluded'])`, `for (const status of ['observed', 'allowed', 'excluded'])`],
  ['two names joined by a comma', `i === xs.length - 1 ? ' and ' : ', '`, `', '`],
  ['the first name of a sentence joined to the last', `out.push({ t: i === 0 ? ' ' :`, `out.push({ t: i < 0 ? ' ' :`],
  ['the first name of a sentence in lower case', `const t = i === 0 ? cap(L[x.key]) : L[x.key];`, `const t = L[x.key];`],
  ['an excluded scenario offered as a link', `out.push(status === 'excluded' ? { t } : { t, air: x.key });`, `out.push({ t, air: x.key });`],
  ['an open scenario not offered', `out.push(status === 'excluded' ? { t } : { t, air: x.key });`, `out.push({ t });`],
  ['the status word left out of its sentence', 'if (xs.length) out.push({ t: ` ${status}.` });', `if (xs.length) out.push({ t: '.' });`],
  ['a preprint not said to be one', ` + (PAPERS[k].preprint ? ' (a preprint)' : '')`, ``],
  ['an unobserved world not said to be one', `: ' Not observed.' });`, `: '' });`],
  ['a fit said with nothing left open', `if (sc.fit && sc.list.some((x) => x.p !== null)) {`, `if (sc.fit) {`],
  ['the rest left out', "${rest.length ? ` The rest is ${rest.join(' or ')}.` : ''}", ''],
  ['the rest names excluded scenarios', `const rest = sc.list.filter((x) => x.key !== 'thick' && x.p !== null)`, `const rest = sc.list.filter((x) => x.key !== 'thick')`],
  ['an empty rest said', "${rest.length ? ` The rest is ${rest.join(' or ')}.` : ''}", "${` The rest is ${rest.join(' or ')}.`}"],
  ['the odds not said to be of what the fit counts', `chance it kept an atmosphere the fit counts (thicker than about 1 to 10 bar) \${pct(sc.fit.P)}`, `\${pct(sc.fit.P)}`],
  ['the odds without their range', `, 68% range \${range(sc.fit.lo, sc.fit.hi)}.`, `.`],
  ['a world past the sample not said to be', `\${sc.fit.outside ? ' past its sample' : ''}`, ''],
  ['a range across 50% not said', `if (sc.fit.lo < 0.5 && sc.fit.hi > 0.5) out.push(`, `if (false) out.push(`],
  ['a range said to cross 50% from 40%', `if (sc.fit.lo < 0.5 && sc.fit.hi > 0.5) out.push(`, `if (sc.fit.lo < 0.6 && sc.fit.hi > 0.4) out.push(`],
  ['a minimum mass not said', `if (sc.minMass) out.push(`, `if (false) out.push(`],
  ['the habitable zone not said', `if (sc.inZone) out.push(`, `if (false) out.push(`],
  ['every world said to be in the zone', `inZone: !!inZone };`, `inZone: true };`],
  ['no fit not said', `} else if (!sc.fit) out.push(`, `} else if (false) out.push(`],
];

/* Rules data.js takes from air.js. The amounts of air and the bare rock's lock are in looks.mutants.test.mjs. */
const DATA = [
  ['the drawing\'s escape speed at the paper\'s rounded 11.18', `const vEscKms = Math.sqrt(M / R) * V_ESC_EARTH;`, `const vEscKms = Math.sqrt(M / R) * 11.18;`],
  ['the paper\'s relation used even with a measured mass', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = fitMass(R) ?? M;`],
  ['the forecast never used for the fit', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = p.pl_masse != null ? M : fitMass(R);`],
  ['the forecast used in place of the paper\'s relation', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = M;`],
  ['a fit on a stand-in radius', `const vFit = radiusKnown ? Math.sqrt(Mfit / R) * V_ESC_EARTH : null;`, `const vFit = Math.sqrt(Mfit / R) * V_ESC_EARTH;`],
  ['the drawing\'s flux as a fallback', `S: insolation(p).S, L: luminosity(p).L,`, `S: insolation(p).S ?? S, L: luminosity(p).L,`],
  ['the drawing\'s star as a fallback', `S: insolation(p).S, L: luminosity(p).L,`, `S: insolation(p).S, L: luminosity(p).L ?? Lrel,`],
  ['never thick', `wantThick: share >= AIR_FULL,`, `wantThick: false,`],
  ['always air without a fit', `wantAir: share >= AIR_THIN,`, `wantAir: true,`],
  ['never a minimum mass', `minMass: p.pl_masse != null && p.Mprov === 'Msini'`, `minMass: false`],
  ['every mass a minimum', `minMass: p.pl_masse != null && p.Mprov === 'Msini'`, `minMass: p.pl_masse != null`],
  ['no world in the zone', `inZone: ['cons', 'opt'].includes(hzPosition(p).key)`, `inZone: false`],
  ['every world in the zone', `inZone: ['cons', 'opt'].includes(hzPosition(p).key)`, `inZone: true`],
  ["a class never locked", `locked: ph.locked, physics: ph,`, `locked: false, physics: ph,`],
  ["a request read as another scenario", `const can = air.list.find((x) => x.key === opts.air);`, `const can = air.list.find((x) => x.key !== opts.air);`],
  ["thin air drawn as full air", `atmDensity = airKey === 'thick' ? Math.max(share, AIR_FULL)`, `atmDensity = airKey !== 'bare' ? Math.max(share, AIR_FULL)`],
  ["bare rock drawn with thin air", `: airKey === 'thin' ? clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;`, `: true ? clamp(share, AIR_THIN, AIR_FULL - 0.01) : 0;`],
  ["the lock reaching twice as far", `const locked = a < lockRadiusAU(Mstar);`, `const locked = a < 2 * lockRadiusAU(Mstar);`],
  ['a bare rock\'s day side given to thin air', `!isGiant && atmDensity < AIR_THIN && locked ? bareDay`, `!isGiant && atmDensity < AIR_FULL && locked ? bareDay`],
  ['a measured day side passed over where it decides melt', `const Ttest = dayMeasured ?? (`, `const Ttest = null ?? (`],
  ['an excluded scenario drawn on request', `airKey = can && can.status !== 'excluded' ? opts.air : air.drawn;`, `airKey = can ? opts.air : air.drawn;`],
  ['a request ignored', `airKey = can && can.status !== 'excluded' ? opts.air : air.drawn;`, `airKey = air.drawn;`],
  ['the measured day side not used for the melt', `air.observed.day && locked ? air.observed.day.T : null;`, `air.observed.day && locked ? null : null;`],
  ['the measured day side not drawn', `measured = !!(obs && obs.day && locked);`, `measured = false;`],
  ['a bare rock\'s night at 0.15 of its Teq', `const Tnight = ph.bare ? BARE.Tnight :`, `const Tnight = ph.bare ? Math.max(0.15 * ph.Teq, 40) :`],
  ['a bare rock\'s hottest point at sqrt 2 Teq', `: ph.bare ? ph.bare.Tss : k * ph.Teq;`, `: k * ph.Teq;`],
  ['a bare rock\'s glow without its measured temperature', `(1 - BARE.albedo) * Math.pow(Tsub / ph.bare.Tss, 4)`, `(1 - BARE.albedo)`],
  ['a bare rock\'s glow at the old 0.9 (T / sqrt2 Teq)^4', `(ph.bare ? (1 - BARE.albedo) * Math.pow(Tsub / ph.bare.Tss, 4) : 0.9 * Math.pow(k / Math.SQRT2, 4))`, `(0.9 * Math.pow(k / Math.SQRT2, 4))`],
];

const data = ['data/exomania/pscomppars-snapshot.json'];
const a = await runMutants({ here, file: 'air.js', test: 'air.test.mjs', mutants: AIR, data });
const d = await runMutants({ here, file: 'data.js', test: 'air.test.mjs', mutants: DATA, data });
console.log(`\nbroken rules: ${AIR.length} in air.js, ${DATA.length} in data.js`);
process.exit(a || d);
