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
];
const CSV = [
  ['the CSV\'s page orbit the archive\'s', 'p.Mprov, p.Mlim, p.P, o.a, o.archive, p.ecc,', 'p.Mprov, p.Mlim, p.P, p.a, o.archive, p.ecc,'],
  ['the CSV\'s archive orbit the page\'s', 'p.Mprov, p.Mlim, p.P, o.a, o.archive, p.ecc,', 'p.Mprov, p.Mlim, p.P, o.a, o.a, p.ecc,'],
  ['the CSV\'s page starlight the archive\'s', '      sl.S, sl.lo, sl.hi, p.S, p.Teq,', '      p.S, sl.lo, sl.hi, p.S, p.Teq,'],
  ['the CSV without the starlight\'s range', '      sl.S, sl.lo, sl.hi, p.S, p.Teq,', '      sl.S, null, null, p.S, p.Teq,'],
  ['the CSV\'s preamble without the page\'s orbit', '# Inferred columns: a_AU_page, the orbit this page uses', '# Inferred columns: the orbit this page uses'],
  ['the CSV\'s Teq at the default albedo', 'fc && fc.median, fc && fc.lo, fc && fc.hi, equilibriumTemp(p, albedo),', 'fc && fc.median, fc && fc.lo, fc && fc.hi, equilibriumTemp(p),'],
];
const HEIGHT = [
  ['the scale height\'s temperature at the point value', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0;', 'const Sk = S0;'],
  ['the scale height drawing an orbit error on Kepler\'s orbit', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0;', 'const Sk = sDraws ? sDraws[k % sDraws.length] : S0 / Math.pow(Math.max(0.5, 1 + (isNum(p.aErr) ? p.aErr / semiMajor(p).a : 0) * gauss()), 2);'],
  ['the scale height\'s temperature at albedo 0.3 whatever is asked', 'kT = T_ZERO * Math.pow(1 - albedo, 0.25);', 'kT = T_ZERO * Math.pow(1 - 0.3, 0.25);'],
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
codes.push(await run('panels.js', BENCH));
process.exit(codes.some(Boolean) ? 1 : 0);
