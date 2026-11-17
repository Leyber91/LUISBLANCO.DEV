/* ============================================================
   The test of the routes to the page's one orbit, starlight and
   albedo. Run from the repository root:
     node labs/assets/js/exoplanet/tests/routes.mutants.test.mjs

   Each entry breaks one of the six places the review of pull
   request 50 found unheld (2026-11-17), in the module that holds
   it, and routes.test.mjs is run on the copy (mutants.mjs). Every
   broken route must fail a check there. That main.js calls
   starlight.js byOrbit and draws sheet A's inset from insetModel
   is proved in a browser by tools/drives/onesource.mjs.

   Add an entry here with every view that reads the orbit, the
   starlight or the albedo.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const run = (file, mutants) => runMutants({ here, file, test: 'routes.test.mjs', mutants, also: ['ai', 'kit'] });

const ORDER = [
  ['a system kept in the order of the archive\'s orbits', 'const key = (p) => semiMajor(p).a;', 'const key = (p) => (p.a > 0 ? p.a : null);'],
  ['a system kept in the order of its periods', 'if (ax !== null && ay !== null) return ax - ay;', 'if (ax !== null && ay !== null) return x.P - y.P;'],
  ['a system kept the other way round', 'if (ax !== null && ay !== null) return ax - ay;', 'if (ax !== null && ay !== null) return ay - ax;'],
];
const TOUR = [
  ['the widest orbit chosen by the archive\'s', 'const wide = top(measured, 1, (p) => semiMajor(p).a)[0];', 'const wide = top(measured, 1, (p) => p.a)[0];'],
  ['the widest orbit printed as the archive\'s', '${fmt(semiMajor(wide).a, 3)} AU.`', '${fmt(wide.a, 3)} AU.`'],
  ['the widest orbit printed whole', '${fmt(semiMajor(wide).a, 3)} AU.`', '${fmtInt(semiMajor(wide).a)} AU.`'],
];
const INSET = [
  ['the inset drawn at the archive\'s orbits', 'const orbits = m.planets.map((o) => ({ p: o.p, a: o.a })), hz = m.hz;', 'const orbits = m.planets.map((o) => ({ p: o.p, a: o.p.a })), hz = m.hz;'],
  ['view D and the inset drawn at the archive\'s orbits', '    const { a } = semiMajor(p);\n    const P = isNum(p.P)', '    const a = p.a;\n    const P = isNum(p.P)'],
  ['the inset\'s zone left out', 'const orbits = m.planets.map((o) => ({ p: o.p, a: o.a })), hz = m.hz;', 'const orbits = m.planets.map((o) => ({ p: o.p, a: o.a })), hz = null;'],
  ['the inset reaching to its outer orbit alone', 'reach: hz && hz.outer / outer < 6 ? Math.max(outer, hz.outer) * 1.08 : outer * 1.15 };', 'reach: outer * 1.15 };'],
  ['the inset measured from its inner orbit', 'const outer = Math.max(...orbits.map((o) => o.a), 1e-4);', 'const outer = Math.min(...orbits.map((o) => o.a), 1e-4);'],
  ['the inset with no orbit reaching a thousandth of an AU', 'const outer = Math.max(...orbits.map((o) => o.a), 1e-4);', 'const outer = Math.max(...orbits.map((o) => o.a), 1e-3);'],
];
const CSV = [
  ['the CSV\'s page orbit the archive\'s', 'p.Mprov, p.Mlim, p.P, o.a, o.archive, p.ecc,', 'p.Mprov, p.Mlim, p.P, p.a, o.archive, p.ecc,'],
  ['the CSV\'s archive orbit the page\'s', 'p.Mprov, p.Mlim, p.P, o.a, o.archive, p.ecc,', 'p.Mprov, p.Mlim, p.P, o.a, o.a, p.ecc,'],
  ['the CSV\'s page starlight the archive\'s', '      sl.S, sl.lo, sl.hi, p.S, p.Teq,', '      p.S, sl.lo, sl.hi, p.S, p.Teq,'],
  ['the CSV without the starlight\'s range', '      sl.S, sl.lo, sl.hi, p.S, p.Teq,', '      sl.S, null, null, p.S, p.Teq,'],
  ['the CSV\'s preamble without the page\'s orbit', '# Inferred columns: a_AU_page, the orbit this page uses', '# Inferred columns: the orbit this page uses'],
  ['the archive\'s own insolation counted over every planet', "const archiveOwn = rows.filter((p) => insolation(p).src === 'archive').length;", 'const archiveOwn = rows.length;'],
  ['the archive\'s own insolation counted as none', "const archiveOwn = rows.filter((p) => insolation(p).src === 'archive').length;", "const archiveOwn = rows.filter((p) => insolation(p).src === 'none').length;"],
  ['one planet said in the plural', "${archiveOwn === 1 ? ' here that lacks' : 's here that lack'}", "${archiveOwn === 0 ? ' here that lacks' : 's here that lack'}"],
  ['the Stassun guard named as a mass from the paper', 'a star whose values cite ${STASSUN}', 'a star whose mass is from ${STASSUN}'],
  ['the CSV\'s Teq at the default albedo', 'fc && fc.median, fc && fc.lo, fc && fc.hi, equilibriumTemp(p, albedo),', 'fc && fc.median, fc && fc.lo, fc && fc.hi, equilibriumTemp(p),'],
];
const HEIGHT = [
  ['the scale height\'s temperature at the point value', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0;', 'const Sk = S0;'],
  ['the scale height drawing an orbit error on Kepler\'s orbit', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0;', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0 / Math.pow(Math.max(0.5, 1 + (isNum(p.aErr) ? p.aErr / semiMajor(p).a : 0) * gauss()), 2);'],
  ['the scale height\'s temperature at albedo 0.3 whatever is asked', 'kT = T_ZERO * Math.pow(1 - albedo, 0.25);', 'kT = T_ZERO * Math.pow(1 - 0.3, 0.25);'],
];
const CHAIN = [
  ['the luminosity step\'s formula for the archive\'s always the star\'s', "steps.push(li('Luminosity', L.src === 'archive' ? 'L = 10^log L, the archive\\'s'", "steps.push(li('Luminosity', L.src === 'none' ? 'L = 10^log L, the archive\\'s'"],
  ['the luminosity step\'s source never the archive\'s', "    L.src === 'archive' ? (luminosityDiffers(L) ?", "    L.src === 'none' ? (luminosityDiffers(L) ?"],
  ['the star\'s luminosity not said to be the only one', ": L.src === 'R and Teff' ? 'the archive gives none' : ''));", ": L.src === 'none' ? 'the archive gives none' : ''));"],
  ['the other luminosity never named', '(luminosityDiffers(L) ? `R★² (Teff / 5772 K)⁴ gives', '(false ? `R★² (Teff / 5772 K)⁴ gives'],
  ['the luminosity\'s formula for the starlight never given', "const sHow = S.src === 'luminosity' ? 'S = L / a²", "const sHow = S.src === 'none' ? 'S = L / a²"],
  ['the star\'s formula for the starlight never given', ": S.src === 'star' ? 'S = (R★ / a)²", ": S.src === 'none' ? 'S = (R★ / a)²"],
  ['the archive\'s value not said', ": S.src === 'archive' ? 'archive value' :", ": S.src === 'none' ? 'archive value' :"],
  ['the starlight step without its units', "'S = L / a², L in L☉ and a in AU' :", "'S = L / a²' :"],
  ['draws said where there are none', "${isNum(S.lo) ? `, ${MC.draws} draws over ${ew.carried}` : ''}", "${true ? `, ${MC.draws} draws over ${ew.carried}` : ''}"],
  ['the archive\'s insolation not said in the step', "esc([S.src === 'archive' ? starlightNote(p, S) : ''", "esc([S.src === 'none' ? starlightNote(p, S) : ''"],
  ['what carries no error never said', "S.src !== 'archive' ? ew.missing : ''", "S.src === 'archive' ? ew.missing : ''"],
  ['the Teq step\'s second form for every starlight', "${S.src === 'star' ? ' = Teff √(R★ / 2a) (1 − A)^¼, R★ and a in one unit' : ''}", "${S.src !== 'none' ? ' = Teff √(R★ / 2a) (1 − A)^¼, R★ and a in one unit' : ''}"],
  ['the Teq step always drawn', "${isNum(S.lo) ? 'the same draws' : 'from the point value'}", "${true ? 'the same draws' : 'from the point value'}"],
  ['the zone step\'s edge by the luminosity', "${hz.by === 'S' ? 'd = a √(S / S_eff)' : 'd = √(L / S_eff)'}", "${hz.by === 'L' ? 'd = a √(S / S_eff)' : 'd = √(L / S_eff)'}"],
  ['the method\'s count of the archive\'s luminosity', 'L is the archive\'s luminosity for ${fmtInt(census.luminosity)} planets', 'L is the archive\'s luminosity for ${fmtInt(census.n)} planets'],
  ['the method\'s count of the star\'s', 'R★² (Teff / 5772 K)⁴ for the ${fmtInt(census.star)} whose star', 'R★² (Teff / 5772 K)⁴ for the ${fmtInt(census.archive)} whose star'],
  ['the method\'s count of ranges', ': ${fmtInt(census.ranged)} ${census.ranged === 1', ': ${fmtInt(census.n)} ${census.ranged === 1'],
  ['the method\'s ranges always plural', "${census.ranged === 1 ? 'planet has' : 'planets have'} one.", "planets have one."],
  ['the method\'s count of partial ranges', '(${fmtInt(census.partial)} of them have an error on some input', '(${fmtInt(census.point)} of them have an error on some input'],
  ['the method promising a range over some errors', 'only where the snapshot gives every input an error, since a range over some of them would be narrower than the truth:', 'over the errors the snapshot carries:'],
  ['the method\'s old ground for the luminosity', 'The archive\'s luminosity is chosen for the Gaia parallaxes behind the Kepler stars\' luminosities', 'The archive\'s luminosity was nearer the papers\' insolation for 2,283 of 3,354 planets'],
  ['the method\'s count of point values', 'The other ${fmtInt(census.point)} print a point value', 'The other ${fmtInt(census.n - census.ranged)} print a point value'],
];
const BENCH = [
  ['the bench\'s Teq at the default albedo', "['Teq', (p) => { const t = teqOf(p, albedo);", "['Teq', (p) => { const t = teqOf(p);"],
];

const codes = [];
codes.push(await run('starlight.js', ORDER));
codes.push(await run('tours.js', TOUR));
codes.push(await run('views/system.js', INSET));
codes.push(await run('export.js', CSV));
codes.push(await run('science.js', HEIGHT));

codes.push(await run('panels.js', [...BENCH, ...CHAIN]));
console.log(`\nroutes: ${codes.filter(Boolean).length} of ${codes.length} lists failed`);
process.exit(codes.some(Boolean) ? 1 : 0);
