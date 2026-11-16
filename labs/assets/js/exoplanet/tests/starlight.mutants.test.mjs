/* ============================================================
   The test of starlight.js's rules. Run from the repository root:
     node labs/assets/js/exoplanet/tests/starlight.mutants.test.mjs

   Each entry breaks one rule of starlight.js: a bound moved to
   either side, a branch taken away, a source swapped, a word of
   the copy changed. The broken file is written to a copy of this
   lab in the system's temp folder and starlight.test.mjs is run on
   the copy (kit/tests/mutants.mjs). Every entry must fail a check
   there. Coverage of the module's conditions is read with
     node tools/dev/conditions.mjs labs/assets/js/exoplanet/starlight.js labs/assets/js/exoplanet/tests/starlight.mutants.test.mjs

   Add an entry here with every new rule of the module.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const STAR = "if (pos(p.Rs) && pos(p.Teff)) return { L: p.Rs * p.Rs * Math.pow(p.Teff / PHYS.T_SUN, 4), src: 'R and Teff', archive };";
const DRAW = 'if (T > 0 && R > 0 && aa > 0) d[n++] = fluxFrom(T, R, aa);';
const FLUX = "export const fluxFrom = (T, R, a) => { const t = T / PHYS.T_SUN; return R * R / (a * a) * (t * t) * (t * t); };";
const KEY = "const key = S <= e.sInner && S >= e.sOuter ? 'cons' : S <= e.sInnerOpt && S >= e.sOuterOpt ? 'opt' : S > e.sInnerOpt ? 'hot' : 'cold';";

const MUTANTS = [
  /* ---- what a number is ---- */
  ['a string counted as a number', "const isNum = (v) => typeof v === 'number' && Number.isFinite(v);", "const isNum = (v) => typeof v === 'string' || Number.isFinite(v);"],
  ['a value that is not finite counted as one', "const isNum = (v) => typeof v === 'number' && Number.isFinite(v);", "const isNum = (v) => typeof v === 'number';"],
  ['zero counted as a positive value', 'const pos = (v) => isNum(v) && v > 0;', 'const pos = (v) => isNum(v) && v >= 0;'],
  ['a negative error drawn as one', 'const sd = (e) => (pos(e) ? e : 0);', 'const sd = (e) => (isNum(e) ? e : 0);'],
  ['T_ZERO from 1 R_sun / 1 AU', 'PHYS.R_SUN_KM / PHYS.AU_KM / 2);', 'PHYS.R_SUN_KM / PHYS.AU_KM);'],
  ['T_ZERO from a 5,780 K Sun', 'export const T_ZERO = PHYS.T_SUN *', 'export const T_ZERO = 5780 *'],

  /* ---- the luminosity and the orbit ---- */
  ['the archive\'s luminosity first, as before', STAR, `if (isNum(p.logL)) return { L: Math.pow(10, p.logL), src: 'archive', archive };\n  ${STAR}`],
  ['a luminosity from the radius alone', STAR, STAR.replace('pos(p.Rs) && pos(p.Teff)', 'pos(p.Rs)')],
  ['a luminosity cubic in the temperature', STAR, STAR.replace('PHYS.T_SUN, 4)', 'PHYS.T_SUN, 3)')],
  ['a luminosity linear in the radius', STAR, STAR.replace('L: p.Rs * p.Rs *', 'L: p.Rs *')],
  ['the archive\'s luminosity not kept beside it', STAR, STAR.replace("src: 'R and Teff', archive };", "src: 'R and Teff', archive: null };")],
  ['the archive\'s luminosity taken as log L itself', 'const archive = isNum(p.logL) ? Math.pow(10, p.logL) : null;', 'const archive = isNum(p.logL) ? p.logL : null;'],
  ['the archive\'s luminosity never used', "  if (archive !== null) return { L: archive, src: 'archive', archive };\n", ''],
  ['the archive\'s luminosity used when it is missing', "if (archive !== null) return { L: archive, src: 'archive', archive };", "if (archive === null) return { L: archive, src: 'archive', archive };"],
  ['the archive\'s luminosity said to be computed', "if (archive !== null) return { L: archive, src: 'archive', archive };", "if (archive !== null) return { L: archive, src: 'R and Teff', archive };"],
  ['the archive\'s orbit passed over', "  if (isNum(p.a)) return { a: p.a, src: 'archive' };\n", ''],
  ['Kepler\'s law with a year of 365 days', 'Math.pow(p.P / 365.25, 2) * p.Ms)', 'Math.pow(p.P / 365, 2) * p.Ms)'],
  ['Kepler\'s law without the star\'s mass', 'Math.pow(p.P / 365.25, 2) * p.Ms)', 'Math.pow(p.P / 365.25, 2))'],
  ['Kepler\'s law with no mass to use', 'if (isNum(p.P) && isNum(p.Ms)) return', 'if (isNum(p.P)) return'],

  /* ---- the flux, the table of deviates and the selection of the shares ---- */
  ['the flux of a star linear in its radius', FLUX, FLUX.replace('return R * R / (a * a) *', 'return R / (a * a) *')],
  ['the flux falling with the orbit, not its square', FLUX, FLUX.replace('return R * R / (a * a) *', 'return R * R / a *')],
  ['the flux cubic in the temperature', FLUX, FLUX.replace('(t * t) * (t * t); };', '(t * t) * t; };')],
  ['the flux of the temperature against a 5,780 K Sun', FLUX, FLUX.replace('const t = T / PHYS.T_SUN;', 'const t = T / 5780;')],
  ['the table made again on every call', '  if (!table) {\n    const z = normalFrom', '  if (true) {\n    const z = normalFrom'],
  ['the table from another seed', "seedOf('exomania', 'starlight')", "seedOf('exomania', 'starlight', 2)"],
  ['the table one deviate short', 'for (let i = 0; i < table.length; i++) table[i] = z();', 'for (let i = 0; i < table.length - 1; i++) table[i] = z();'],
  ['the table of two deviates a draw', 'table = new Float64Array(3 * MC.draws);', 'table = new Float64Array(2 * MC.draws);'],
  ['the temperature and the radius drawn with one deviate', 'R = p.Rs + eR * z[3 * k + 1],', 'R = p.Rs + eR * z[3 * k],'],
  ['the orbit drawn with the radius\'s deviate', 'aa = a + eA * z[3 * k + 2];', 'aa = a + eA * z[3 * k + 1];'],
  ['the temperature drawn with the next draw\'s deviate', 'const T = p.Teff + eT * z[3 * k],', 'const T = p.Teff + eT * z[3 * k + 3],'],
  ['a part of one element left unsorted', 'while (hi > lo) {\n    const x = a[(lo + hi) >> 1];', 'while (hi > lo + 1) {\n    const x = a[(lo + hi) >> 1];'],
  ['the partition stopped one short', 'while (i <= j) {\n      while (a[i] < x) i++;', 'while (i < j) {\n      while (a[i] < x) i++;'],
  ['the left walk past values equal to the pivot', 'while (a[i] < x) i++;', 'while (a[i] <= x && i < hi) i++;'],
  ['the right walk past values equal to the pivot', 'while (a[j] > x) j--;', 'while (a[j] >= x && j > lo) j--;'],
  ['a pair that has crossed swapped', 'if (i <= j) { const t = a[i];', 'if (i <= j + 1) { const t = a[i];'],
  ['the left part kept when the place is right of it', 'if (k <= j) hi = j;', 'if (k <= j + 1) hi = j;'],
  ['the place taken for found at the right part\'s first element', 'else if (k >= i) lo = i;', 'else if (k > i) lo = i;'],
  ['the median one place up', 'const im = Math.floor(0.5 * n),', 'const im = Math.floor(0.5 * n) + 1,'],
  ['the range from the 15th percentile', 'il = Math.floor(0.16 * n),', 'il = Math.floor(0.15 * n),'],
  ['the range to the 85th percentile', 'ih = Math.min(n - 1, Math.floor(0.84 * n));', 'ih = Math.min(n - 1, Math.floor(0.85 * n));'],
  ['the share taken one place up', 'il = Math.floor(0.16 * n),', 'il = Math.ceil(0.16 * n),'],
  ['the low end looked for beside the median, not below it', 'lo: il < im ? kth(d, il, 0, im - 1) : S,', 'lo: il < im ? kth(d, il, 1, im) : S,'],
  ['the high end looked for beside the median, not above it', 'hi: ih > im ? kth(d, ih, im + 1, n - 1) : S }', 'hi: ih > im ? kth(d, ih, im, n - 2) : S }'],
  ['the low end always the median', 'lo: il < im ? kth(d, il, 0, im - 1) : S,', 'lo: il > im ? kth(d, il, 0, im - 1) : S,'],
  ['the high end always the median', 'hi: ih > im ? kth(d, ih, im + 1, n - 1) : S }', 'hi: ih < im ? kth(d, ih, im + 1, n - 1) : S }'],
  ['no buffer to draw into', 'd = work || (work = new Float64Array(MC.draws));', 'd = work && (work = new Float64Array(MC.draws));'],
  ['the draws of a planet kept from the last one', 'const z = DEVIATES(), d = work || (work = new Float64Array(MC.draws));', 'const z = DEVIATES(), d = work && null || (work = new Float64Array(MC.draws - 1));'],

  /* ---- the starlight ---- */
  ['a planet computed again on every call', '  if (!out) { out = compute(p); memo.set(p, out); }\n  return out;', '  return compute(p);'],
  ['the archive\'s insolation first, as before', "  if (pos(p.Teff) && pos(p.Rs) && pos(a)) {\n    const eT", "  if (pos(p.Teff) && pos(p.Rs) && pos(a) && !pos(p.S)) {\n    const eT"],
  ['the star without its radius', 'if (pos(p.Teff) && pos(p.Rs) && pos(a)) {', 'if (pos(p.Teff) && pos(a)) {'],
  ['the star without its temperature', 'if (pos(p.Teff) && pos(p.Rs) && pos(a)) {', 'if (pos(p.Rs) && pos(a)) {'],
  ['an archive insolation of zero taken as a value', 'const archive = pos(p.S) ? p.S : null;', 'const archive = isNum(p.S) ? p.S : null;'],
  ['the error of an orbit from Kepler\'s law drawn', "eA = aSrc === 'archive' ? sd(p.aErr) : 0;", "eA = aSrc !== 'none' ? sd(p.aErr) : 0;"],
  ['the orbit\'s error never drawn', "eA = aSrc === 'archive' ? sd(p.aErr) : 0;", 'eA = 0;'],
  ['the temperature\'s error never drawn', 'const eT = sd(p.TeffErr),', 'const eT = 0,'],
  ['the radius\'s error never drawn', 'eR = sd(p.RsErr),', 'eR = 0,'],
  ['draws only when the temperature and the radius both have an error', 'if (eT || eR || eA) {', 'if (eT && eR || eA) {'],
  ['draws only when the radius and the orbit both have an error', 'if (eT || eR || eA) {', 'if (eT || eR && eA) {'],
  ['a draw short', 'for (let k = 0; k < MC.draws; k++) {', 'for (let k = 1; k < MC.draws; k++) {'],
  ['the last draw left out', 'for (let k = 0; k < MC.draws; k++) {', 'for (let k = 0; k < MC.draws - 1; k++) {'],
  ['a temperature below zero drawn', DRAW, DRAW.replace('T > 0 &&', 'T > -Infinity &&')],
  ['a cool draw left out', DRAW, DRAW.replace('T > 0 &&', 'T > 3000 &&')],
  ['a radius below zero drawn', DRAW, DRAW.replace('R > 0 &&', 'R > -Infinity &&')],
  ['a small radius left out', DRAW, DRAW.replace('R > 0 &&', 'R > 0.1 &&')],
  ['an orbit below zero drawn', DRAW, DRAW.replace('aa > 0)', 'aa > -Infinity)')],
  ['a close orbit left out', DRAW, DRAW.replace('aa > 0)', 'aa > 0.01)')],
  ['no ratio to the archive\'s insolation', 'ratio: archive === null ? null : archive / S };', 'ratio: null };'],
  ['the ratio taken the other way', 'ratio: archive === null ? null : archive / S };', 'ratio: archive === null ? null : S / archive };'],
  ['a ratio for a missing archive value', 'ratio: archive === null ? null : archive / S };', 'ratio: archive !== null ? null : archive / S };'],
  ['the archive\'s insolation never a fallback', "  if (archive !== null) return { S: archive, lo: null, hi: null, src: 'archive', archive, ratio: 1 };\n", ''],
  ['the archive\'s insolation as a fallback when there is none', "if (archive !== null) return { S: archive, lo: null, hi: null, src: 'archive', archive, ratio: 1 };", "if (archive === null) return { S: archive, lo: null, hi: null, src: 'archive', archive, ratio: 1 };"],
  ['the archive\'s fallback said to be computed', "src: 'archive', archive, ratio: 1 };", "src: 'star', archive, ratio: 1 };"],
  ['no luminosity over the orbit', "  if (pos(L) && pos(a)) return { S: L / (a * a), lo: null, hi: null, src: 'L / a^2', archive: null, ratio: null };\n", ''],
  ['the luminosity over the orbit, not its square', "return { S: L / (a * a), lo: null, hi: null, src: 'L / a^2'", "return { S: L / a, lo: null, hi: null, src: 'L / a^2'"],
  ['the luminosity over the orbit with no orbit', 'if (pos(L) && pos(a)) return { S: L / (a * a)', 'if (pos(L)) return { S: L / (a * a)'],
  ['the old name for another number', 'export const insolation = starlight;', 'export const insolation = luminosity;'],

  /* ---- when the archive is named ---- */
  ['the archive named from 1.2 times', '&& Math.max(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;', '&& Math.max(s.ratio, 1 / s.ratio) >= ARCHIVE_DIFF;'],
  ['the archive named only when its value is larger', '&& Math.max(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;', '&& s.ratio > ARCHIVE_DIFF;'],
  ['the archive named only when its value is smaller', '&& Math.max(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;', '&& Math.min(s.ratio, 1 / s.ratio) > ARCHIVE_DIFF;'],
  ['the archive named beside its own value', "export const archiveDiffers = (s) => s.src === 'star' &&", "export const archiveDiffers = (s) => s.src !== 'none' &&"],
  ['the archive named with no ratio to show', "s.src === 'star' && isNum(s.ratio) &&", "s.src === 'star' &&"],
  ['the archive named from 1.25 times', 'export const ARCHIVE_DIFF = 1.2;', 'export const ARCHIVE_DIFF = 1.25;'],
  ['the archive named from 1.15 times', 'export const ARCHIVE_DIFF = 1.2;', 'export const ARCHIVE_DIFF = 1.15;'],
  ['the archive\'s luminosity named from 1.2 times', '&& Math.max(L.archive / L.L, L.L / L.archive) > ARCHIVE_DIFF;', '&& Math.max(L.archive / L.L, L.L / L.archive) >= ARCHIVE_DIFF;'],
  ['the archive\'s luminosity named only when larger', '&& Math.max(L.archive / L.L, L.L / L.archive) > ARCHIVE_DIFF;', '&& L.archive / L.L > ARCHIVE_DIFF;'],
  ['the archive\'s luminosity named beside itself', "export const luminosityDiffers = (L) => L.src === 'R and Teff' &&", "export const luminosityDiffers = (L) => L.src !== 'none' &&"],
  ['the archive\'s luminosity named when it has none', "L.src === 'R and Teff' && pos(L.archive) &&", "L.src === 'R and Teff' &&"],

  /* ---- the equilibrium temperature ---- */
  ['a temperature with no starlight', '  if (!pos(s.S)) return null;\n  const k = T_ZERO', '  const k = T_ZERO'],
  ['the albedo taken to the half', 'const k = T_ZERO * Math.pow(1 - albedo, 0.25);', 'const k = T_ZERO * Math.pow(1 - albedo, 0.5);'],
  ['the albedo left out', 'const k = T_ZERO * Math.pow(1 - albedo, 0.25);', 'const k = T_ZERO;'],
  ['the temperature as the square root of the starlight', 'k * Math.pow(x, 0.25) : null);', 'k * Math.pow(x, 0.5) : null);'],
  ['no range for the temperature', 'return { med: t(s.S), lo: t(s.lo), hi: t(s.hi), src: s.src };', 'return { med: t(s.S), lo: null, hi: null, src: s.src };'],
  ['the range of the temperature the wrong way round', 'return { med: t(s.S), lo: t(s.lo), hi: t(s.hi), src: s.src };', 'return { med: t(s.S), lo: t(s.hi), hi: t(s.lo), src: s.src };'],
  ['the temperature at no albedo by default', 'export function teqOf(p, albedo = TEQ.albedo) {', 'export function teqOf(p, albedo = 0) {'],
  ['the one number its low end', 'return t ? t.med : null; };', 'return t ? t.lo : null; };'],
  ['the one number at no albedo by default', 'export const equilibriumTemp = (p, albedo = TEQ.albedo) =>', 'export const equilibriumTemp = (p, albedo = 0) =>'],

  /* ---- how both are printed ---- */
  ['the starlight to two figures', 'const v = num(s.S, 3), pm = range(s.lo, s.hi, 2);', 'const v = num(s.S, 2), pm = range(s.lo, s.hi, 2);'],
  ['its range to three figures', 'const v = num(s.S, 3), pm = range(s.lo, s.hi, 2);', 'const v = num(s.S, 3), pm = range(s.lo, s.hi, 3);'],
  ['the starlight without its unit', "text: `${v} S⊕${pm ? ` (68%: ${pm})` : ''}` };", "text: `${v}${pm ? ` (68%: ${pm})` : ''}` };"],
  ['the starlight\'s range not said to be 68%', "text: `${v} S⊕${pm ? ` (68%: ${pm})` : ''}` };", "text: `${v} S⊕${pm ? ` (${pm})` : ''}` };"],
  ['a starlight of zero printed', "  if (!pos(s.S)) return { v: '', pm: '', text: '' };\n  const v = num(s.S, 3)", '  const v = num(s.S, 3)'],
  ['the temperature to a tenth', 'const v = int(t.med), pm =', 'const v = t.med.toFixed(1), pm ='],
  ['a half range printed', "pm = isNum(t.lo) && isNum(t.hi) ? `${int(t.lo)} to ${int(t.hi)}` : '';", "pm = isNum(t.lo) || isNum(t.hi) ? `${int(t.lo)} to ${int(t.hi)}` : '';"],
  ['the temperature without its unit', "text: `${v} K${pm ? ` (68%: ${pm})` : ''}` };", "text: `${v}${pm ? ` (68%: ${pm})` : ''}` };"],
  ['no temperature printed as one', "  if (!t) return { v: '', pm: '', text: '' };\n  const v = int(t.med)", '  const v = int(t.med)'],

  /* ---- the note ---- */
  ['the computed starlight not said to be', "  if (s.src === 'star') {\n    const base", "  if (s.src === 'none') {\n    const base"],
  ['the archive\'s value never named', '    if (!archiveDiffers(s)) return base;\n', '    return base;\n'],
  ['the archive\'s value named where it agrees', '    if (!archiveDiffers(s)) return base;\n', ''],
  ['more and less the wrong way round', "times ${s.ratio > 1 ? 'more' : 'less'}.`;", "times ${s.ratio > 1 ? 'less' : 'more'}.`;"],
  ['more from twice', "times ${s.ratio > 1 ? 'more' : 'less'}.`;", "times ${s.ratio > 2 ? 'more' : 'less'}.`;"],
  ['the factor the archive\'s ratio itself', 'const f = s.ratio > 1 ? s.ratio : 1 / s.ratio;', 'const f = s.ratio;'],
  ['the factor taken from twice', 'const f = s.ratio > 1 ? s.ratio : 1 / s.ratio;', 'const f = s.ratio > 2 ? s.ratio : 1 / s.ratio;'],
  ['the factor to three figures', '${num(f, 2)} times', '${num(f, 3)} times'],
  ['the archive\'s value to two figures', 'The archive lists ${num(s.archive, 3)} S⊕', 'The archive lists ${num(s.archive, 2)} S⊕'],
  ['the archive named without its source', '(NASA Exoplanet Archive, PSCompPars), ${num(f, 2)}', '${num(f, 2)}'],
  ['the archive\'s fallback not said', "if (s.src === 'archive') return `The archive's insolation", "if (s.src === 'none') return `The archive's insolation"],
  ['the luminosity over the orbit not said', "if (s.src === 'L / a^2') return `The starlight is the archive's", "if (s.src === 'none') return `The starlight is the archive's"],
  ['a missing temperature not named', "!pos(p.Teff) && 'the star\\'s temperature'", "false && 'the star\\'s temperature'"],
  ['a missing radius not named', "!pos(p.Rs) && 'the star\\'s radius'", "false && 'the star\\'s radius'"],
  ['a missing orbit not named', "!pos(a) && 'the orbit'", "false && 'the orbit'"],
  ['the missing named without and', ".filter(Boolean).join(' and ');", ".filter(Boolean).join(', ');"],

  /* ---- the zone's edges ---- */
  ['a cold star not held at 2,600 K', 'Math.max(KOPPARAPU.tRange[0], Math.min(KOPPARAPU.tRange[1], teff))', 'Math.min(KOPPARAPU.tRange[1], teff)'],
  ['a hot star not held at 7,200 K', 'Math.max(KOPPARAPU.tRange[0], Math.min(KOPPARAPU.tRange[1], teff))', 'Math.max(KOPPARAPU.tRange[0], teff)'],
  ['the polynomial about 5,772 K', ', teff)) - 5780;', ', teff)) - 5772;'],
  ['the polynomial without its last term', 'c[3] * T * T * T + c[4] * T * T * T * T;', 'c[3] * T * T * T;'],
  ['the conservative inner edge at the optimistic one', 'sInner: seff(teff, K.runaway),', 'sInner: seff(teff, K.recentVenus),'],
  ['the conservative outer edge at the optimistic one', 'sOuter: seff(teff, K.maxGreen),', 'sOuter: seff(teff, K.earlyMars),'],
  ['the optimistic inner edge at the moist greenhouse', 'sInnerOpt: seff(teff, K.recentVenus),', 'sInnerOpt: seff(teff, K.moist),'],
  ['the optimistic outer edge at the conservative one', 'sOuterOpt: seff(teff, K.earlyMars),', 'sOuterOpt: seff(teff, K.maxGreen),'],
  ['2,600 K itself extrapolated', 'extrapolated: teff < K.tRange[0] || teff > K.tRange[1],', 'extrapolated: teff <= K.tRange[0] || teff > K.tRange[1],'],
  ['7,200 K itself extrapolated', 'extrapolated: teff < K.tRange[0] || teff > K.tRange[1],', 'extrapolated: teff < K.tRange[0] || teff >= K.tRange[1],'],
  ['only a star outside both ends extrapolated', 'extrapolated: teff < K.tRange[0] || teff > K.tRange[1],', 'extrapolated: teff < K.tRange[0] && teff > K.tRange[1],'],
  ['edges with no temperature', '  if (!isNum(teff)) return null;\n  const K = KOPPARAPU;', '  const K = KOPPARAPU;'],

  /* ---- the zone in AU ---- */
  ['the zone in AU by the luminosity, as before', 'const byS = pos(s.S) && pos(a);', 'const byS = false;'],
  ['the zone by the starlight with no orbit', 'const byS = pos(s.S) && pos(a);', 'const byS = pos(s.S);'],
  ['the zone with no starlight or luminosity', 'if (scale === null) return null;', 'if (scale === undefined) return null;'],
  ['an edge at the starlight over its flux, not its root', 'const d = (x) => scale / Math.sqrt(x);', 'const d = (x) => scale / x;'],
  ['the zone with no orbit placed by the starlight\'s root alone', ": pos(L) ? Math.sqrt(L) : null;", ": pos(L) ? L : null;"],
  ['the zone not said to be placed by the starlight', "by: byS ? 'S' : 'L', L,", "by: 'L', L,"],

  /* ---- where a planet sits ---- */
  ['a world with no starlight placed', "if (!e || !pos(s.S)) return { key: 'unknown'", "if (!e && !pos(s.S)) return { key: 'unknown'"],
  ['the conservative inner edge itself optimistic', KEY, KEY.replace('S <= e.sInner &&', 'S < e.sInner &&')],
  ['the conservative outer edge itself optimistic', KEY, KEY.replace('S >= e.sOuter ?', 'S > e.sOuter ?')],
  ['the optimistic inner edge itself hot', KEY, KEY.replace('S <= e.sInnerOpt &&', 'S < e.sInnerOpt &&')],
  ['the optimistic outer edge itself cold', KEY, KEY.replace('S >= e.sOuterOpt ?', 'S > e.sOuterOpt ?')],
  ['hot and cold the wrong way round', KEY, KEY.replace("S > e.sInnerOpt ? 'hot'", "S < e.sInnerOpt ? 'hot'")],
  ['the conservative zone read only by its inner edge', KEY, KEY.replace("S <= e.sInner && S >= e.sOuter ? 'cons'", "S <= e.sInner ? 'cons'")],
  ['hot measured against the optimistic edge', "hot: `${fmtX(S / e.sInner)} the flux", "hot: `${fmtX(S / e.sInnerOpt)} the flux"],
  ['cold measured against the optimistic edge', "cold: `${fmtX(e.sOuter / S)} below", "cold: `${fmtX(e.sOuterOpt / S)} below"],
  ['the conservative zone named the habitable zone alone', "cons: 'inside the conservative habitable zone',", "cons: 'inside the habitable zone',"],
  ['the optimistic zone named the habitable zone alone', "opt: 'inside the optimistic habitable zone',", "opt: 'inside the habitable zone',"],
  ['an extrapolated zone not said', 'label: e.extrapolated ? `${words}, ${extrapolatedWords(p.Teff)}` : words,', 'label: words,'],
  ['no flag for an extrapolated zone', 'hz, S, extrapolated: e.extrapolated, edges: e };', 'hz, S, extrapolated: false, edges: e };'],
  ['a factor of a hundred printed with no grouping', 'const fmtX = (x) => (x >= 100 ? int(x) :', 'const fmtX = (x) => (x >= 10000 ? int(x) :'],
  ['a factor of ten printed to one decimal', 'x >= 10 ? x.toFixed(0) : x.toFixed(1)) +', 'x >= 9.9 ? x.toFixed(0) : x.toFixed(1)) +'],
  ['a factor under ten printed whole', 'x >= 10 ? x.toFixed(0) : x.toFixed(1)) +', 'x >= 10 ? x.toFixed(0) : x.toFixed(0)) +'],
  ['the extrapolated words without the star\'s temperature', "`extrapolated: the star's ${int(teff)} K is outside", "`extrapolated: the star is outside"],
  ['the extrapolated words with the wrong range', 'outside the ${int(KOPPARAPU.tRange[0])} to ${int(KOPPARAPU.tRange[1])} K', 'outside the ${int(KOPPARAPU.tRange[0])} K'],

  /* ---- the words of each view ---- */
  ['the full phrase never given', "  if (form === 'label') return pos_.label;\n", ''],
  ['the sheet\'s words under the name', "const W = form === 'word'", "const W = form !== 'word'"],
  ['an extrapolated zone not said in a word', "return pos_.extrapolated ? `${W[pos_.key]}, extrapolated` : W[pos_.key];", 'return W[pos_.key];'],
  ['the sheet\'s word for the optimistic zone', "opt: 'optimistic', hot: 'too hot'", "opt: 'habitable', hot: 'too hot'"],
  ['the line under the name for hot', "hot: 'hotter than the habitable zone'", "hot: 'too hot'"],
  ['the line under the name for the optimistic zone', "opt: 'in the optimistic habitable zone', hot: 'hotter", "opt: 'in the habitable zone', hot: 'hotter"],

  /* ---- where view D draws an orbit ---- */
  ['an orbit drawn with no zone', "if (!hz || !pos(a)) return 'unknown';", "if (!hz && !pos(a)) return 'unknown';"],
  ['the inner edge itself outside the band', "if (a >= hz.inner && a <= hz.outer) return 'cons';", "if (a > hz.inner && a <= hz.outer) return 'cons';"],
  ['the outer edge itself outside the band', "if (a >= hz.inner && a <= hz.outer) return 'cons';", "if (a >= hz.inner && a < hz.outer) return 'cons';"],
  ['the optimistic inner ring itself outside', "if (a >= hz.innerOpt && a <= hz.outerOpt) return 'opt';", "if (a > hz.innerOpt && a <= hz.outerOpt) return 'opt';"],
  ['the optimistic outer ring itself outside', "if (a >= hz.innerOpt && a <= hz.outerOpt) return 'opt';", "if (a >= hz.innerOpt && a < hz.outerOpt) return 'opt';"],
  ['inside and outside the rings the wrong way round', "return a < hz.innerOpt ? 'hot' : 'cold';", "return a > hz.innerOpt ? 'hot' : 'cold';"],
];

process.exit(await runMutants({ here, file: 'starlight.js', test: 'starlight.test.mjs', mutants: MUTANTS, also: ['kit'] }));
