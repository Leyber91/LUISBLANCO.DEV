/* ============================================================
   The test of the air tests, third of three: the words of the
   line under the planet's name (air.js airShort, airParts,
   boundWords and the percentages). How the lists are checked
   against the code is in the first, air.mutants.test.mjs. Run
   from the repository root:
     node labs/assets/js/exoplanet/tests/air.mutants3.test.mjs
   ============================================================ */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runMutants } from '../../kit/tests/mutants.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const WORDS = [
  ['over 99.9% said from 99.99%', `if (v >= 99.95) return 'over 99.9%';`, `if (v >= 99.99) return 'over 99.9%';`],
  ['under 0.01% said from 0.001%', `if (v < 0.01) return 'under 0.01%';`, `if (v < 0.001) return 'under 0.01%';`],
  ['under 0.01% said from 0.02%', `if (v < 0.01) return 'under 0.01%';`, `if (v < 0.02) return 'under 0.01%';`],
  ['two figures from 2% down', `if (v < 1) return`, `if (v < 2) return`],
  ['whole numbers from 0.5%', `if (v < 1) return`, `if (v < 0.5) return`],
  ["one figure up to 0.2%", "num(v, v < 0.1 ? 1 : 2)", "num(v, v < 0.2 ? 1 : 2)"],
  ["two figures from 0.01%", "num(v, v < 0.1 ? 1 : 2)", "num(v, 2)"],
  ["three figures from 98% up", "`${v > 99 ? num(v, 3) : int(v)}%`", "`${v > 98 ? num(v, 3) : int(v)}%`"],
  ["three figures only from 99.5% up", "`${v > 99 ? num(v, 3) : int(v)}%`", "`${v > 99.5 ? num(v, 3) : int(v)}%`"],
  ["just under 50% from 49%", "if (v >= 49.5 && v < 50) return", "if (v >= 49 && v < 50) return"],
  ["just under 50% only from 49.6%", "if (v >= 49.5 && v < 50) return", "if (v >= 49.6 && v < 50) return"],
  ["50% itself said to be just under", "if (v >= 49.5 && v < 50) return", "if (v >= 49.5 && v <= 50) return"],
  ["pressures of 1 bar in millibar", "const bar = (x) => (x >= 1 ?", "const bar = (x) => (x > 1 ?"],
  ["pressures of 1 mbar in microbar", ": x >= 0.001 ? `${+(x * 1000)", ": x > 0.001 ? `${+(x * 1000)"],
  ["one pressure said as a range", "const span = (b) => (b.lo === b.hi ?", "const span = (b) => (b.lo !== b.hi ?"],
  ["an open-ended bound given an end", ": b.hi === Infinity ? `from ${bar(b.lo)}`", ": b.hi !== Infinity ? `from ${bar(b.lo)}`"],
  ["a bound from zero said to start somewhere", ": b.lo > 0 ? `from ${bar(b.lo)} to ${bar(b.hi)}`", ": b.lo >= 0 ? `from ${bar(b.lo)} to ${bar(b.hi)}`"],
  ["a day-side bound given pressures", "  if (b.kind === 'bare') return `by its day side", "  if (b.kind !== 'bare') return `by its day side"],
  ["a bound over every gas named by its gases", "const gases = b.gases === 'all' ? 'any air'", "const gases = b.gases !== 'all' ? 'any air'"],
  ["energy balance never said", "${b.basis === 'energy balance' ? ', by energy balance' : ''}", "${b.basis !== 'energy balance' ? ', by energy balance' : ''}"],
  ['a range keeps both per-cent signs', '`${/^\\d/.test(a) ? a.slice(0, -1) : a} to ${b}`', '`${a} to ${b}`'],
  ['a range drops a sign from words too', '`${/^\\d/.test(a) ? a.slice(0, -1) : a} to ${b}`', '`${a.slice(0, -1)} to ${b}`'],
  ['a range of one value said twice', 'a === b ? `all ${b}` :', 'false ? `all ${b}` :'],
  ["three papers joined by \"and\" twice", "(xs.length < 3 ? xs.join(' and ')", "(xs.length < 4 ? xs.join(' and ')"],
  ["the short line calls the default chosen", "const why = shown !== sc.drawn ? ', by your choice'", "const why = shown === sc.drawn ? ', by your choice'"],
  ["the short line does not say a world is observed", ": sc.by === 'observed' ? ', as observed'", ": sc.by !== 'observed' ? ', as observed'"],
  ["the short line does not say a world is drawn from its paper", ": sc.by === 'paper' ? ', from its paper'", ": sc.by !== 'paper' ? ', from its paper'"],
  ["the short line does not say the fit chose", ": sc.by === 'fit' ? (shown === 'bare'", ": sc.by !== 'fit' ? (shown === 'bare'"],
  ["the short line calls bare rock illustrative in thickness", "(shown === 'bare' ? '' : ', thickness illustrative')", "(shown !== 'bare' ? '' : ', thickness illustrative')"],
  ["the short line with the range of an extreme", "const extreme = /^(over|under) /.test(", "const extreme = /^(never) /.test("],
  ["the short line without the range", "${extreme ? '' : ` (${range(f.lo, f.hi)})`}", ""],
  ["the details call the default chosen", "const chosen = shown !== sc.drawn ?", "const chosen = shown === sc.drawn ?"],
  ["the details of a paper without its conclusion", "  if (sc.by === 'paper') {", "  if (sc.by !== 'paper') {"],
  ["the line led by another scenario", `const lead = sc.list.find((x) => x.key === shown);`, `const lead = sc.list.find((x) => x.key !== shown);`],
  ["the drawn scenario listed again", `sc.list.filter((x) => x.key !== shown && x.status === status)`, `sc.list.filter((x) => x.status === status)`],
  ["each status sentence listing the others", `x.key !== shown && x.status === status`, `x.key !== shown && x.status !== status`],
  ["the parts run together with spaces", `.map((x) => x.t).join('');`, `.map((x) => x.t).join(' ');`],
  ["the line without its first sentence", `airParts(sc, shown).map((x) => x.t).join('');`, `airParts(sc, shown).slice(1).map((x) => x.t).join('');`],
  ['two papers joined by a comma', `(xs.length < 3 ? xs.join(' and ')`, `(xs.length < 3 ? xs.join(', ')`],
  ['three papers without their "and"', '`${xs.slice(0, -1).join(\', \')} and ${xs[xs.length - 1]}`', `xs.join(', ')`],
  ["an observed scenario drawn and not said to be", "  if (lead.status === 'observed') out.push(", "  if (false) out.push("],
  ["a drawn scenario said to be observed when it is not", "  if (lead.status === 'observed') out.push(", "  if (lead.status !== 'observed') out.push("],
  ["the word observed not marked", "{ t: 'observed', st: 'observed' }", "{ t: 'observed' }"],
  ["a disfavoured scenario drawn and not said to be", "  if (lead.status === 'disfavoured') out.push(", "  if (false) out.push("],
  ["a drawn scenario said to be disfavoured when it is not", "  if (lead.status === 'disfavoured') out.push(", "  if (lead.status !== 'disfavoured') out.push("],
  ['a chosen scenario not said to be chosen', ', by your choice; the survey draws ${L[sc.drawn]}', ''],
  ["allowed scenarios never said", "for (const status of ['observed', 'allowed'])", "for (const status of ['observed'])"],
  ["observed scenarios never said", "for (const status of ['observed', 'allowed'])", "for (const status of ['allowed'])"],
  ["the drawn scenario listed again among the disfavoured", "sc.list.filter((y) => y.key !== shown && y.status === 'disfavoured')", "sc.list.filter((y) => y.key === shown && y.status === 'disfavoured')"],
  ["every scenario but the disfavoured said to be disfavoured", "sc.list.filter((y) => y.key !== shown && y.status === 'disfavoured')", "sc.list.filter((y) => y.key !== shown && y.status !== 'disfavoured')"],
  ["the drawn scenario listed again among the excluded", "sc.list.filter((y) => y.key !== shown && y.status === 'excluded')", "sc.list.filter((y) => y.key === shown && y.status === 'excluded')"],
  ["every scenario but the excluded said to be excluded", "sc.list.filter((y) => y.key !== shown && y.status === 'excluded')", "sc.list.filter((y) => y.key !== shown && y.status !== 'excluded')"],
  ["an exclusion without what covers it", ".filter((b) => covers(b, x.key)).map(boundWords)", ".map(boundWords)"],
  ['two names joined by a comma', `i === xs.length - 1 ? ' and ' : ', '`, `', '`],
  ['the first name of a sentence joined to the last', `out.push({ t: i === 0 ? ' ' :`, `out.push({ t: i < 0 ? ' ' :`],
  ["the first name of a sentence in lower case", "out.push({ t: i === 0 ? cap(L[x.key]) : L[x.key], air: x.key });", "out.push({ t: i !== 0 ? cap(L[x.key]) : L[x.key], air: x.key });"],
  ["a disfavoured scenario not offered as a link", "{ t: cap(L[x.key]), air: x.key }, { t: ' ' }, { t: 'disfavoured'", "{ t: cap(L[x.key]) }, { t: ' ' }, { t: 'disfavoured'"],
  ["an allowed scenario not offered as a link", "out.push({ t: i === 0 ? cap(L[x.key]) : L[x.key], air: x.key });", "out.push({ t: i === 0 ? cap(L[x.key]) : L[x.key] });"],
  ["the status word left out of its sentence", "if (xs.length) out.push({ t: ' ' }, { t: status, st: status }, { t: '.' });", "if (xs.length) out.push({ t: '.' });"],
  ["a status word not marked", "{ t: status, st: status }", "{ t: status }"],
  ["a preprint not said to be one", " + (PAPERS[k].preprint ? ', a preprint' : '')", ""],
  ['an unobserved world not said to be one', `: ' Not observed.' });`, `: '' });`],
  ["a fit said with nothing left open", "const fitSaid = (sc) => !!sc.fit && sc.list.some((x) => x.open);", "const fitSaid = (sc) => !!sc.fit;"],
  ["the details without the range", ": ${pct(sc.fit.P)} (68% range ${range(sc.fit.lo, sc.fit.hi)}).", ": ${pct(sc.fit.P)}."],
  ["the thickness not said where the fit gave air", "if (sc.by === 'fit' && sc.drawn !== 'bare') out.push({ t: ` ${THICKNESS}` });", ""],
  ["the thickness said where the fit drew bare rock", "if (sc.by === 'fit' && sc.drawn !== 'bare') out.push(", "if (sc.by === 'fit' && sc.drawn === 'bare') out.push("],
  ["the thickness said whatever chose the drawing", "if (sc.by === 'fit' && sc.drawn !== 'bare') out.push(", "if (sc.by !== 'fit' && sc.drawn !== 'bare') out.push("],
  ["the stand-ins never said", "const star = sc.starStandIn ? ' The star", "const star = false ? ' The star"],
  ['a world past the sample not said to be', `\${sc.fit.outside ? ' past its sample' : ''}`, ''],
  ['a range across 50% not said', `if (sc.fit.lo < 0.5 && sc.fit.hi > 0.5) out.push(`, `if (false) out.push(`],
  ['a range said to cross 50% from 40%', `if (sc.fit.lo < 0.5 && sc.fit.hi > 0.5) out.push(`, `if (sc.fit.lo < 0.6 && sc.fit.hi > 0.4) out.push(`],
  ['a minimum mass not said', `if (sc.minMass) out.push(`, `if (false) out.push(`],
  ['the habitable zone not said', `if (sc.inZone) out.push(`, `if (false) out.push(`],
  ["every world said to be in the zone", "inZone: !!inZone, lacks,", "inZone: true, lacks,"],
  ["no fit not said", "} else if (!sc.fit) {", "} else if (false) {"],
];

const data = ['data/exomania/pscomppars-snapshot.json'];
const w = await runMutants({ here, file: 'air.js', test: 'air.test.mjs', mutants: WORDS, also: ['kit'], data });
console.log(`\nbroken rules: ${WORDS.length} of the line in air.js`);
process.exit(w);
