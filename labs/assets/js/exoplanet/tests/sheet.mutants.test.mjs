/* ============================================================
   The test of sheet B's rows for the orbit, the starlight, the star
   and the equilibrium temperature. Run from the repository root:
     node labs/assets/js/exoplanet/tests/sheet.mutants.test.mjs

   Each entry breaks one rule of views/target.js that ticket 2.14
   added or moved, and sheet.test.mjs is run on the copy
   (kit/tests/mutants.mjs). Every entry must fail a check there.
   What the page's DOM prints is proved in a browser by
   tools/drives/onesource.mjs.
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const MUTANTS = [
  ['Kepler\'s orbit under the measured heading', "if (a.a && a.src === 'archive') rows.push(orbitRow(p, a));", "if (a.a) rows.push(orbitRow(p, a));"],
  ['the archive\'s orbit never under the measured heading', "if (a.a && a.src === 'archive') rows.push(orbitRow(p, a));", "if (a.a && a.src === 'x') rows.push(orbitRow(p, a));"],
  ['the archive\'s orbit under the inferred heading too', "if (a.a && a.src !== 'archive') rows.push(orbitRow(p, a));", "if (a.a) rows.push(orbitRow(p, a));"],
  ['Kepler\'s orbit never shown', "if (a.a && a.src !== 'archive') rows.push(orbitRow(p, a));", "if (a.a && a.src === 'x') rows.push(orbitRow(p, a));"],
  ['an orbit of none shown with a limit', "else if (!a.a && limitOf(p, 'a'))", "else if (limitOf(p, 'a'))"],
  ['no row for an orbit of none', "  else if (!a.a) rows.push({ key: 'a', n: 'orbit', v: 'none'", "  else if (false) rows.push({ key: 'a', n: 'orbit', v: 'none'"],
  ['an orbit of none without why', "pm: eText(p), note: orbitNote(a), iv: false });", "pm: eText(p), iv: false });"],
  ['Kepler\'s orbit called measured', "kind: a.src === 'archive' ? 'm' : 'd', refs: a.src === 'archive' || orbitDiffers(a)", "kind: 'm', refs: a.src === 'archive' || orbitDiffers(a)"],
  ['the archive\'s orbit given no source', "refs: a.src === 'archive' || orbitDiffers(a) ? [COMPOSITE] : [],", "refs: orbitDiffers(a) ? [COMPOSITE] : [],"],
  ['the archive\'s orbit named beside Kepler\'s without its source', "refs: a.src === 'archive' || orbitDiffers(a) ? [COMPOSITE] : [],", "refs: a.src === 'archive' ? [COMPOSITE] : [],"],
  ['the archive\'s insolation under the inferred heading', "if (S.S && S.src === 'archive') rows.push(starlightRow(p, S));", "if (S.S && S.src === 'x') rows.push(starlightRow(p, S));"],
  ['the page\'s starlight under the measured heading', "if (S.S && S.src === 'archive') rows.push(starlightRow(p, S));", "if (S.S) rows.push(starlightRow(p, S));"],
  /* ---- the table on the page (createTarget): the loops a comment once swallowed ---- */
  ['the sheet never drawn', '      draw(p, true);\n', ''],
  ['the measured rows never drawn', "group(meas, ARCHIVE_HEADING); mrows.forEach((r) => row(meas, r, ctx)); }", "group(meas, ARCHIVE_HEADING); }"],
  ['the archive group called measured again', "export const ARCHIVE_HEADING = 'From the archive';", "export const ARCHIVE_HEADING = 'Measured, from the archive';"],
  ['an estimated radius gives an error as if measured', "pm: p.measuredR === false ? 'estimated' : errText(p.Rerr1, p.Rerr2),", "pm: errText(p.Rerr1, p.Rerr2),"],
  ['a measured radius called estimated', "pm: p.measuredR === false ? 'estimated' : errText(p.Rerr1, p.Rerr2),", "pm: p.measuredR !== true ? 'estimated' : errText(p.Rerr1, p.Rerr2),"],
  ['the inferred rows never drawn', '    irows.forEach((r) => row(inf, r, ctx));\n', ''],
  ['the inferred rows drawn into the measured group', '    irows.forEach((r) => row(inf, r, ctx));', '    irows.forEach((r) => row(meas, r, ctx));'],
  ['the inferred rows behind a comment, as on bcb5b88', "    inf.replaceChildren(); group(inf, inferredHeading(irows));\n    irows.forEach((r) => row(inf, r, ctx));", "    inf.replaceChildren(); group(inf, inferredHeading(irows));   // a note irows.forEach((r) => row(inf, r, ctx));"],
  ['the inferred heading a fixed promise of ranges', 'group(inf, inferredHeading(irows));', 'group(inf, `Inferred: ${MC.draws} draws, 68% where errors exist`);'],
  ['ranges and points named as ranges alone', "if (ranged && point) return 'Inferred: 68% ranges and point values';", "if (ranged && point) return `Inferred: 68% ranges from ${MC.draws} draws`;"],
  ['a value without a range not taken for a point value', 'point = rows.some((r) => r.iv && !hasRange(r));', "point = rows.some((r) => r.pm === 'point value');"],
  ['half a range taken for a range', 'const hasRange = (r) => r.iv && isNum(r.iv.lo) && isNum(r.iv.hi);', 'const hasRange = (r) => r.iv && (isNum(r.iv.lo) || isNum(r.iv.hi));'],
  ['a point alone headed as nothing', "return point ? 'Inferred: point values' : 'Inferred';", "return 'Inferred';"],
  ['the page\'s starlight never shown', "if (S.S && S.src !== 'archive') rows.push(starlightRow(p, S));", "if (S.S && S.src === 'x') rows.push(starlightRow(p, S));"],
  ['the page\'s starlight called measured', "kind: S.src === 'archive' ? 'm' : 'd', refs: S.src === 'archive' || archiveDiffers(S)", "kind: 'm', refs: S.src === 'archive' || archiveDiffers(S)"],
  ['the archive\'s insolation given no source', "refs: S.src === 'archive' || archiveDiffers(S) ? [COMPOSITE] : [],", "refs: archiveDiffers(S) ? [COMPOSITE] : [],"],
  ['the archive\'s differing insolation given no source', "refs: S.src === 'archive' || archiveDiffers(S) ? [COMPOSITE] : [],", "refs: S.src === 'archive' ? [COMPOSITE] : [],"],
  ['a starlight with a range shown as a point value', "pm: t.pm || (t.point ? 'point value' : ''),", "pm: (t.point ? 'point value' : ''),"],
  ['a starlight\'s point value not said on the sheet', "pm: t.pm || (t.point ? 'point value' : ''),", "pm: t.pm,"],
  ['a temperature\'s point value not said on the sheet', "pm: mc.teq ? tq.pm || (tq.point ? 'point value' : '') : 'needs the starlight'", "pm: mc.teq ? tq.pm : 'needs the starlight'"],
  ['a temperature with no starlight not said', "pm: mc.teq ? tq.pm || (tq.point ? 'point value' : '') : 'needs the starlight'", "pm: mc.teq ? tq.pm || (tq.point ? 'point value' : '') : ''"],
  ['why a temperature has no range not said', "${tq.point ? ', and has no range because the starlight has none' : ''}", ''],
  ['why given where there is a range', "${tq.point ? ', and has no range because the starlight has none' : ''}", ", and has no range because the starlight has none"],
  ['the archive\'s insolation not named in the temperature\'s note', "takes the starlight${S.src === 'archive' ? ', the archive\\'s,' : ''} with", "takes the starlight with"],
  ['the archive\'s luminosity not said to be', "${L.src === 'archive' ? `, the archive's${luminosityDiffers(L)", "${L.src === 'x' ? `, the archive's${luminosityDiffers(L)"],
  ['the other luminosity never named on the sheet', "${luminosityDiffers(L) ? `; its radius and temperature give ${starNum(L.fromStar, 3)}` : ''}", ''],
  ['the luminosity written without a power of ten', 'L.L ? `Its luminosity is ${starNum(L.L, 3)} L\\u2609', 'L.L ? `Its luminosity is ${fmt(L.L, 3)} L\\u2609'],
  ['the luminosity from the star not said to be the only one', "', from its radius and temperature: the archive gives none'", "''"],
];

process.exit(await runMutants({ here, file: 'views/target.js', test: 'sheet.test.mjs', mutants: MUTANTS, also: ['kit', 'ai'] }));
