/* ============================================================
   The test of the air tests, second of three: the statuses that
   air.js derives from the papers' bounds (statusOf, touches,
   covers, the table) and the rules data.js takes from air.js.
   How the lists are checked against the code is in the first,
   air.mutants.test.mjs. Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.mutants2.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const STATUSES = [
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
  ["Glidden's degree dropped from the table", ", null, { word: 'weakly', sigma: 2 })] },", ")] },"],
  ["LHS 1140 c's finding taken for a conclusion", "is drawn as bare rock.', 'finds'),\n    bounds: [\n      pressure('fortune25'", "is drawn as bare rock.'),\n    bounds: [\n      pressure('fortune25'"],
  ["every quote a conclusion", "reading = null, verb = 'concludes') => ({ scenario, paper, quote, where, reading, verb });", "reading = null, verb = 'concludes') => ({ scenario, paper, quote, where, reading, verb: 'concludes' });"],
];

/* Rules data.js takes from air.js. The amounts of air and the bare rock's lock are in looks.mutants.test.mjs. */
const DATA = [
  ['the drawing\'s escape speed at the paper\'s rounded 11.18', `const vEscKms = Math.sqrt(M / R) * V_ESC_EARTH;`, `const vEscKms = Math.sqrt(M / R) * 11.18;`],
  ['the paper\'s relation used even with a measured mass', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = fitMass(R) ?? M;`],
  ['the forecast never used for the fit', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = p.pl_masse != null ? M : fitMass(R);`],
  ['the forecast used in place of the paper\'s relation', `const Mfit = p.pl_masse != null ? M : fitMass(R) ?? M;`, `const Mfit = M;`],
  ['a fit on a stand-in radius', `const vFit = radiusKnown ? Math.sqrt(Mfit / R) * V_ESC_EARTH : null;`, `const vFit = Math.sqrt(Mfit / R) * V_ESC_EARTH;`],
  ['the drawing\'s flux as a fallback', `const Sfit = insolation(p).S, Lfit`, `const Sfit = insolation(p).S ?? S, Lfit`],
  ['the drawing\'s star as a fallback', `Lfit = luminosity(p).L;`, `Lfit = luminosity(p).L ?? Lrel;`],
  ['the star\'s luminosity said to be lacking when it is there', `[Lfit == null && 'the star`, `[Lfit != null && 'the star`],
  ['the flux said to be lacking when it is there', `Sfit == null && 'the flux'`, `Sfit != null && 'the flux'`],
  ['a radius said to be lacking when it is there', `vFit == null && 'a radius'`, `vFit != null && 'a radius'`],
  ['a known star temperature called a stand-in', `starStandIn: p.st_teff == null ||`, `starStandIn: p.st_teff != null ||`],
  ['a known star size called a stand-in', `|| p.st_rad == null });`, `|| p.st_rad != null });`],
  ['a star with one stand-in not said to have any', `starStandIn: p.st_teff == null || p.st_rad == null`, `starStandIn: p.st_teff == null && p.st_rad == null`],
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
  ['a measured day side ignored where it decides melt', `const Ttest = dayMeasured ?? (`, `const Ttest = (`],
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
const s = await runMutants({ here, file: 'air.js', test: 'air.test.mjs', mutants: STATUSES, also: ['kit'], data });
const d = await runMutants({ here, file: 'data.js', test: 'air.test.mjs', mutants: DATA, also: ['kit'], data });
console.log(`\nbroken rules: ${STATUSES.length} of the statuses in air.js, ${DATA.length} in data.js`);
process.exit(s || d);
