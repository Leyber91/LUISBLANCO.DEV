/* ============================================================
   Whether a rocky world keeps air (air.js), and what data.js
   draws from it. Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.test.mjs

   The acceptance of ticket 2.13, from the science ledger:
   - the observed rocky planets come out as observed;
   - Earth and Venus keep air and Mercury does not, by the fit;
   - LHS 3844 b, GJ 367 b and 55 Cnc e against their measured
     day-side temperatures (and every other measured day side
     in the table).
   The properties of the scenarios (Luis, 2026-11-16: "if we
   cannot rule it out, we will keep it as options"): at least two
   scenarios for every rocky world with no observation; an
   observed exclusion always appears as excluded; the fit's
   probabilities are stated for allowed scenarios.
   And the review of pull request 41 (2026-11-16): statuses are
   derived from each paper's bounds (B1); the fit's number is the
   paper's "detectable atmosphere" (S1); it is the posterior mean
   and reproduces the paper's Table 1 (S2); the paper's mass
   relation (S3); no fit without the archive's star (S4).

   Every number below is written here, not read from air.js or
   data.js, so a change to a constant there fails a check.
   ============================================================ */

import { airProbability, scenariosFor, statusOf, touches, covers, observedOf, OBSERVED, PAPERS, SCENARIOS, THICK_FROM, V_ESC_EARTH, fitMass, bareDay, pondAngle, mapDay, tsubForDay, airLine as airLine0, airParts as airParts0, airShort as airShort0, boundWords, drawable, percent, percentRange, BASES, THICKNESS, SIDE_MARGIN } from '../air.js';
import { DRAWS } from '../shoreline.js';
import { physics, lookOf, toParams, classify, AIR_THIN, AIR_FULL, lockRadiusAU } from '../data.js';
import { loadSnapshot } from '../catalog.js';
import { photopicFraction } from '../science.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
/* The line's words, wrapped: a rule broken so that they throw fails the checks that read them, and the file goes on. */
const threw = (e) => `THREW: ${e && e.message}`;
const airLine = (...a) => { try { return airLine0(...a); } catch (e) { return threw(e); } };
const airShort = (...a) => { try { return airShort0(...a); } catch (e) { return threw(e); } };
const airParts = (...a) => { try { return airParts0(...a); } catch (e) { return [{ t: threw(e) }]; } };
const near = (name, got, want, tol) => yes(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `${got} (want ${want} ± ${tol})`);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/* ---- the fit: the paper's posterior, and its Table 1 ---- */
{
  // Table 1 of Berta-Thompson, Wachiraphan & Murray 2026: log10 f/f_earth, log10 v_esc/v_esc,earth, log10 L, P(A=1) in %
  const T1 = [['GJ 3929 b', 1.287, 0.023, -1.965, 4.53], ['LTT 1445 A c', 1.066, 0.048, -2.056, 10.4], ['LTT 1445 A b', 0.756, 0.158, -2.091, 77.1],
    ['LHS 1140 b', -0.424, 0.255, -2.470, 99.3], ['TOI-198 b', 0.485, 0.217, -1.509, 99.7], ['TOI-406 c', 1.251, 0.099, -1.712, 43.1],
    ['TOI-771 b', 1.248, 0.160, -2.260, 21.6], ['HD 260655 c', 1.202, 0.153, -1.441, 91.8], ['TOI-244 b', 0.865, 0.123, -1.651, 88.6]];
  const got = T1.map(([n, lf, lv, lL, P]) => [n, airProbability({ S: 10 ** lf, L: 10 ** lL, vEsc: V_ESC_EARTH * 10 ** lv }).P * 100, P]);
  yes('the survey\'s probability reproduces the paper\'s Table 1 within 1 percentage point for all nine planets', got.every(([, g, P]) => Math.abs(g - P) <= 1), got.map(([n, g, P]) => `${n} ${g.toFixed(2)} (${P})`).join('; '));
  yes('the draws are the paper\'s posterior: medians 2.62, 5.9, 1.17 and 0.247 within their rounding', Math.abs(median(DRAWS.logF0) - 2.62) < 0.02 && Math.abs(median(DRAWS.p) - 5.9) < 0.02 && Math.abs(median(DRAWS.q) - 1.17) < 0.02 && Math.abs(median(DRAWS.w) - 0.247) < 0.003 && DRAWS.n === 2000 && DRAWS.p.length === 2000, `${median(DRAWS.logF0)} ${median(DRAWS.p)} ${median(DRAWS.q)} ${median(DRAWS.w)}`);
  yes('every draw has a positive width', DRAWS.w.every((w) => w > 0));
  const r = airProbability({ S: 10 ** 0.756, L: 10 ** -2.091, vEsc: V_ESC_EARTH * 10 ** 0.158 });
  yes('the 16th and 84th percentiles bracket the mean', r.lo <= r.P && r.P <= r.hi && r.hi - r.lo > 0.1, `${r.lo} ${r.P} ${r.hi}`);
  const g = airProbability({ S: 10 ** 1.287, L: 10 ** -1.965, vEsc: V_ESC_EARTH * 10 ** 0.023 });
  yes('and they are the paper\'s 68% intervals within 1 point: LTT 1445 A b 63.1 to 90.1%, GJ 3929 b 0.73 to 8.33%', Math.abs(r.lo * 100 - 63.1) <= 1 && Math.abs(r.hi * 100 - 90.1) <= 1 && Math.abs(g.lo * 100 - 0.73) <= 1 && Math.abs(g.hi * 100 - 8.33) <= 1, `${(r.lo * 100).toFixed(2)} ${(r.hi * 100).toFixed(2)} ${(g.lo * 100).toFixed(2)} ${(g.hi * 100).toFixed(2)}`);
  yes('more flux, less air; faster escape, more air; a brighter star at the same flux, more air', airProbability({ S: 30, L: 0.01, vEsc: 12 }).P < airProbability({ S: 20, L: 0.01, vEsc: 12 }).P && airProbability({ S: 20, L: 0.01, vEsc: 13 }).P > airProbability({ S: 20, L: 0.01, vEsc: 12 }).P && airProbability({ S: 20, L: 0.02, vEsc: 12 }).P > airProbability({ S: 20, L: 0.01, vEsc: 12 }).P);
  yes('no fit without all three inputs, or with one at zero or below', [{ L: 1, vEsc: 1 }, { S: 1, vEsc: 1 }, { S: 1, L: 1 }, { S: 0, L: 1, vEsc: 1 }, { S: 1, L: 0, vEsc: 1 }, { S: 1, L: 1, vEsc: 0 }, { S: 1, L: NaN, vEsc: 1 }, { S: 1, L: 1, vEsc: null }].every((x) => airProbability(x) === null));
  yes('the smallest positive inputs still give a fit', [{ S: 1e-6, L: 1, vEsc: 11 }, { S: 1, L: 1e-6, vEsc: 11 }, { S: 1, L: 1, vEsc: 1e-3 }].every((x) => airProbability(x) !== null));
  yes('the fit\'s sample stops at 1,400 times Earth\'s flux: 1,399 and 1,400 are inside it and 1,401 outside', airProbability({ S: 1399, L: 1, vEsc: 11 }).outside === false && airProbability({ S: 1400, L: 1, vEsc: 11 }).outside === false && airProbability({ S: 1401, L: 1, vEsc: 11 }).outside === true);
  near('one escape speed for the drawing and the fit: Earth\'s 11.186 km/s', V_ESC_EARTH, 11.186, 1e-12);
}

/* ---- the 50% line of the posterior, and which scenario is drawn ---- */
// the flux at which the posterior mean is exactly one half, for L = 1 and v = 8 km/s, by bisection on the module
const half = (() => { let lo = -3, hi = 5; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (airProbability({ S: 10 ** m, L: 1, vEsc: 8 }).P > 0.5) lo = m; else hi = m; } return (lo + hi) / 2; })();
{
  const at = (d, o = {}) => scenariosFor({ name: 'nobody', S: 10 ** (half + d), L: 1, vEsc: 8, ...o });
  yes('one thousandth of a dex from the line, the probability is within 0.002 of one half', Math.abs(at(-0.001).fit.P - 0.5) < 0.002 && Math.abs(at(0.001).fit.P - 0.5) < 0.002 && at(-0.001).fit.P > 0.5 && at(0.001).fit.P < 0.5, `${at(-0.001).fit.P} ${at(0.001).fit.P}`);
  yes('one thousandth of a dex inside the 50% line a world is drawn with air, one outside it bare', at(-0.001).drawn !== 'bare' && at(0.001).drawn === 'bare', `${at(-0.001).fit.P} ${at(0.001).fit.P}`);
  yes('the fit\'s number, the chance of any air, goes to thin and to thick air as P and to bare rock as 1 - P', (() => { const s = at(-0.3); return s.list[2].p === s.fit.P && s.list[1].p === s.fit.P && s.list[0].p === 1 - s.fit.P; })());
  yes('a world the fit gives air is drawn thick when its amount reaches full air, else thin', at(-0.5, { wantThick: true }).drawn === 'thick' && at(-0.5, { wantThick: false }).drawn === 'thin');
  yes('the amount does not change a bare verdict', at(0.5, { wantThick: true }).drawn === 'bare' && at(0.5).by === 'fit');
  yes('with no fit the amount of air decides, and says so', scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, wantAir: false }).drawn === 'bare' && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, wantAir: true }).drawn === 'thin' && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, wantAir: true, wantThick: true }).drawn === 'thick' && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1 }).by === 'amount');
  yes('a minimum mass is flagged only where there is a fit', at(0).minMass === false && at(0, { minMass: true }).minMass === true && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, minMass: true }).minMass === false);
}

/* ---- statuses from bounds (B1) ---- */
const P = (lo, hi, gases = 'all', basis = gases === 'all' ? 'composition' : null) => ({ kind: 'pressure', paper: 'zieba23', lo, hi, gases, basis, says: `a bound from ${lo} to ${hi} bar.` });
const BARE_B = { kind: 'bare', paper: 'hu24', says: 'no bare rock.' };
const ent = (bounds, extra = {}) => ({ name: 'nobody', papers: ['zieba23'], bounds, observed: null, concludes: null, day: null, ...extra });
const st = (bounds, k, extra) => statusOf(ent(bounds, extra), k).s;
{
  yes('thick air is THICK_FROM bar and more, and THICK_FROM is 1 bar', THICK_FROM === 1);
  yes('a bound over all gases from exactly 1 bar up covers thick air: excluded; from 1.01 bar it leaves part of it: disfavoured', st([P(1, Infinity)], 'thick') === 'excluded' && st([P(1.01, Infinity)], 'thick') === 'disfavoured');
  yes('a bound from 0.99 bar up excludes thick air and touches thin air; from 1 bar it leaves thin air alone', st([P(0.99, Infinity)], 'thick') === 'excluded' && st([P(0.99, Infinity)], 'thin') === 'disfavoured' && st([P(1, Infinity)], 'thin') === 'allowed');
  yes('a bound that stops short of infinite pressure leaves thick air disfavoured, not excluded', st([P(1, 1000)], 'thick') === 'disfavoured');
  yes('a bound ending at 0.99 bar does not reach thick air; one ending at 1 bar touches it', st([P(0.5, 0.99)], 'thick') === 'allowed' && st([P(0.5, 1)], 'thick') === 'disfavoured');
  yes('a conclusion is quoted in the reason of the scenario it names', statusOf(observedOf('LHS 3844 b'), 'bare').why === 'No bound of Kreidberg 2019 and Zieba 2026 reaches it. The paper concludes: “The data are well fitted by a bare rock model with a low Bond albedo” (Kreidberg 2019).');
  yes('bounds over every composition are the five the papers state so', OBSERVED.flatMap((e) => e.bounds.filter((b) => b.gases === 'all').map((b) => `${e.name} ${b.lo}-${b.hi}`)).join(', ') === 'LHS 3844 b 10-Infinity, GJ 367 b 1-Infinity, GJ 1252 b 10-Infinity, GJ 486 b 1-Infinity, TOI-561 b 0-1');
  yes('a bound over all gases from 0 to 1 bar excludes thin air; to 0.99 bar, or from 0.01 bar, it only disfavours it', st([P(0, 1)], 'thin') === 'excluded' && st([P(0, 0.99)], 'thin') === 'disfavoured' && st([P(0.01, 1)], 'thin') === 'disfavoured');
  yes('a bound at zero pressure alone touches no atmosphere', st([P(0, 0)], 'thin') === 'allowed' && st([P(0, 0)], 'thick') === 'allowed');
  yes('a bound on some gases only disfavours, wherever it reaches', st([P(0, Infinity, ['CO2'])], 'thin') === 'disfavoured' && st([P(0, Infinity, ['CO2'])], 'thick') === 'disfavoured');
  yes('only a bare-rock bound excludes bare rock; a pressure bound never touches it', st([BARE_B], 'bare') === 'excluded' && st([P(0, Infinity)], 'bare') === 'allowed' && st([BARE_B], 'thin') === 'allowed');
  yes('no bound, no status but allowed', SCENARIOS.every((k) => st([], k) === 'allowed'));
  yes('a bound on some gases does not exclude, even with a basis', st([P(1, Infinity, ['CO2'], 'composition')], 'thick') === 'disfavoured' && st([P(1, Infinity, ['CO2'], 'energy balance')], 'thick') === 'disfavoured');
  const words = (b) => { try { return boundWords(b); } catch (e) { return threw(e); } };
  const W = (lo, hi, gases = ['CO2'], basis = null) => words({ kind: 'pressure', paper: 'zieba23', lo, hi, gases, basis });
  yes('a bound in words: bar from 1 bar, millibar from 1 mbar, microbar below', W(1, Infinity) === 'for CO2 from 1 bar (Zieba 2023)' && W(0.999, Infinity) === 'for CO2 from 999 mbar (Zieba 2023)' && W(0.001, Infinity) === 'for CO2 from 1 mbar (Zieba 2023)' && W(0.000999, Infinity) === 'for CO2 from 999 microbar (Zieba 2023)', W(0.001, Infinity));
  yes('a bound in words: one pressure, an open end, a closed range and one from zero', W(1, 1) === 'for CO2 at about 1 bar (Zieba 2023)' && W(0.006, 92) === 'for CO2 from 6 mbar to 92 bar (Zieba 2023)' && W(0, 1) === 'for CO2 up to 1 bar (Zieba 2023)' && W(0, 1, 'all', 'energy balance') === 'for any air up to 1 bar, by energy balance (Zieba 2023)' && W(0, 1, 'all', 'composition') === 'for any air up to 1 bar (Zieba 2023)' && W(1, Infinity, ['CO2', 'SO2']) === 'for CO2 or SO2 from 1 bar (Zieba 2023)');
  yes('a day-side bound in words', words({ kind: 'bare', paper: 'hu24' }) === 'by its day side (Hu 2024)');
  yes('a bound over every composition excludes only with a basis: the compositions its paper considers, or energy balance (V4)', st([P(1, Infinity, 'all', 'composition')], 'thick') === 'excluded' && st([P(1, Infinity, 'all', 'energy balance')], 'thick') === 'excluded' && st([P(1, Infinity, 'all', null)], 'thick') === 'disfavoured' && st([P(1, Infinity, 'all', 'a hunch')], 'thick') === 'disfavoured' && BASES.join() === 'composition,energy balance');
  yes('every bound of the table over all compositions carries one of the two bases, and the five that do are energy balance', OBSERVED.every((e) => e.bounds.every((b) => b.gases !== 'all' || BASES.includes(b.basis))) && OBSERVED.flatMap((e) => e.bounds.filter((b) => b.gases === 'all').map((b) => b.basis)).join() === 'energy balance,energy balance,energy balance,energy balance,energy balance');
  yes('an observed scenario is observed whatever the bounds say', statusOf(ent([P(1, Infinity)], { observed: { scenario: 'thick', paper: 'hu24', quote: 'q' } }), 'thick').s === 'observed');
  yes('touches and covers agree: whatever covers also touches', [P(0, 1), P(1, Infinity), P(0.5, 2), BARE_B].every((b) => SCENARIOS.every((k) => !covers(b, k) || touches(b, k))));
  yes('the reason of a disfavoured scenario is its bounds\' own words', statusOf(ent([P(0.01, Infinity, ['CO2'])]), 'thin').why === 'a bound from 0.01 to Infinity bar.');
  // drawn: observed, then the paper's conclusion, then the fit; an allowed scenario above a disfavoured one
  const S0 = 10 ** half;
  const draw = (bounds, extra = {}, d = -0.5, wantThick = true) => scenariosFor({ name: 'nobody', S: S0 * 10 ** d, L: 1, vEsc: 8, wantThick, observed: ent(bounds, extra) });
  yes('an observed scenario is drawn even where the fit and the paper say otherwise', draw([], { observed: { scenario: 'thin', paper: 'hu24', quote: 'q' }, concludes: { scenario: 'bare', paper: 'hu24', quote: 'q' } }, 0.5).drawn === 'thin');
  yes('else the paper\'s conclusion is drawn over the fit', draw([], { concludes: { scenario: 'bare', paper: 'hu24', quote: 'q' } }).drawn === 'bare' && draw([], { concludes: { scenario: 'bare', paper: 'hu24', quote: 'q' } }).by === 'paper');
  yes('a conclusion the same entry excludes is not drawn: the fit decides', draw([BARE_B], { concludes: { scenario: 'bare', paper: 'hu24', quote: 'q' } }).by === 'fit');
  yes('a disfavoured conclusion is still drawn: only an excluded one gives way', draw([P(0, Infinity, ['CO2'])], { concludes: { scenario: 'thin', paper: 'hu24', quote: 'q' } }).drawn === 'thin');
  yes('the fit says air and thick is wanted: an allowed thin air is drawn above a disfavoured thick air', draw([P(1.5, Infinity)]).drawn === 'thin');
  yes('the fit says air and both kinds are disfavoured: the allowed bare rock is drawn', draw([P(0, Infinity, ['CO2'])]).drawn === 'bare');
  yes('the fit says air and every scenario is disfavoured or excluded: a disfavoured one is drawn, never an excluded one', draw([P(0, Infinity, ['CO2']), BARE_B]).drawn === 'thick');
  yes('the switchable scenarios are the ones not excluded', drawable(draw([BARE_B])).join() === 'thin,thick');
  yes('the fit\'s probability goes to allowed and disfavoured scenarios, none to excluded or observed ones', (() => { const s = draw([BARE_B, P(0, Infinity, ['CO2'])], {}, -0.2); return s.list[0].p === null && s.list[1].p !== null && s.list[2].p !== null; })());
}

/* ---- the observed table, as read on 2026-11-16 ---- */
const READ = {
  // name: bare, thin, thick (a allowed, d disfavoured, x excluded, o observed), the paper's conclusion, the papers, the number of bounds
  'TRAPPIST-1 b': ['aad', 'bare', 'greene23 ducrot25 gillon25', 1], 'TRAPPIST-1 c': ['add', null, 'zieba23 gillon25', 3], 'TRAPPIST-1 d': ['aad', null, 'piaulet25', 1],
  'TRAPPIST-1 e': ['add', null, 'espinoza25 glidden25', 1], 'LHS 3844 b': ['add', 'bare', 'kreidberg19 zieba26', 3], 'GJ 367 b': ['adx', 'bare', 'zhang24', 3],
  'TOI-1685 b': ['add', 'bare', 'luque25', 1], 'GJ 1252 b': ['aad', 'bare', 'crossfield22', 1], 'TOI-1468 b': ['aad', 'bare', 'meier25', 1],
  'LHS 1140 c': ['add', 'bare', 'fortune25', 2], 'LTT 3780 b': ['add', 'bare', 'allen25', 1], 'GJ 3929 b': ['add', 'bare', 'xue25', 1],
  'GJ 486 b': ['adx', 'bare', 'weiner24', 2], 'GJ 1132 b': ['add', 'bare', 'xue24', 3], 'LTT 1445 A b': ['aad', 'bare', 'wachiraphan25', 2],
  '55 Cnc e': ['xdo', null, 'hu24', 2], 'TOI-561 b': ['xxo', null, 'teske25', 2],
};
const DOI = {
  greene23: '10.1038/s41586-023-05951-7', ducrot25: '10.1038/s41550-024-02428-z', gillon25: '10.48550/arXiv.2509.02128', zieba23: '10.1038/s41586-023-06232-z',
  piaulet25: '10.3847/1538-4357/adf207', espinoza25: '10.3847/2041-8213/adf42e', glidden25: '10.3847/2041-8213/adf62e', kreidberg19: '10.1038/s41586-019-1497-4',
  zieba26: '10.1038/s41550-026-02860-3', zhang24: '10.3847/2041-8213/ad1a07', luque25: '10.3847/1538-3881/addb40', crossfield22: '10.3847/2041-8213/ac886b',
  meier25: '10.1051/0004-6361/202453449', fortune25: '10.1051/0004-6361/202554198', allen25: '10.3847/1538-3881/adfc51', xue25: '10.3847/2041-8213/ae2098',
  weiner24: '10.3847/2041-8213/ad8161', xue24: '10.3847/2041-8213/ad72e9', wachiraphan25: '10.3847/1538-3881/adc990', hu24: '10.1038/s41586-024-07432-x', teske25: '10.3847/2041-8213/ae0a4c',
};
const DAY = { 'TRAPPIST-1 b': 490, 'TRAPPIST-1 c': 369, 'LHS 3844 b': 985, 'GJ 367 b': 1709, 'GJ 1252 b': 1410, 'TOI-1468 b': 1024, 'LHS 1140 c': 561, 'LTT 3780 b': 1143, 'GJ 3929 b': 782, 'GJ 486 b': 865, 'GJ 1132 b': 709, 'LTT 1445 A b': 525, '55 Cnc e': 1796, 'TOI-561 b': 1800 };
{
  const code = { allowed: 'a', disfavoured: 'd', excluded: 'x', observed: 'o' };
  yes('the table holds the 17 planets read, and no other', OBSERVED.length === 17 && Object.keys(READ).every((n) => observedOf(n)) && OBSERVED.every((e) => READ[e.name]), OBSERVED.map((e) => e.name).filter((n) => !READ[n]).join(', '));
  for (const e of OBSERVED) {
    const r = READ[e.name] || ['', '', '', -1];
    const got = SCENARIOS.map((k) => code[statusOf(e, k).s]).join('');
    yes(`${e.name}: the statuses its bounds give (bare, thin, thick), its conclusion, its papers and its bounds`, got === r[0] && (e.concludes ? e.concludes.scenario : null) === r[1] && e.papers.join(' ') === r[2] && e.bounds.length === r[3], `${got} ${e.concludes ? e.concludes.scenario : null} ${e.papers.join(' ')} ${e.bounds.length}`);
  }
  yes('no status is written by hand: an entry carries bounds, a conclusion and an observation, and no status field', OBSERVED.every((e) => SCENARIOS.every((k) => e[k] === undefined) && Array.isArray(e.bounds)));
  yes('every bound carries its paper, a quote, where it is and what it says; pressures carry a range and their gases', OBSERVED.every((e) => e.bounds.every((b) => e.papers.includes(b.paper) && b.quote && b.quote.length > 20 && b.where && b.says && (b.kind === 'bare' || (typeof b.lo === 'number' && typeof b.hi === 'number' && b.lo <= b.hi && (b.gases === 'all' || (Array.isArray(b.gases) && b.gases.length)))))));
  yes('every conclusion and observation carries a quote from one of the entry\'s papers', OBSERVED.every((e) => [e.concludes, e.observed].filter(Boolean).every((c) => e.papers.includes(c.paper) && c.quote.length > 20 && SCENARIOS.includes(c.scenario))));
  yes('the exclusions the papers support for every composition: GJ 367 b and GJ 486 b thick air, TOI-561 b bare rock and thin air, 55 Cnc e bare rock', OBSERVED.flatMap((e) => SCENARIOS.filter((k) => statusOf(e, k).s === 'excluded').map((k) => `${e.name}:${k}`)).join(' ') === 'GJ 367 b:thick GJ 486 b:thick 55 Cnc e:bare TOI-561 b:bare TOI-561 b:thin');
  yes('every paper has the DOI that was opened, and every DOI is a DOI; the one preprint says so', Object.entries(DOI).every(([k, d]) => PAPERS[k] && PAPERS[k].doi === d) && Object.keys(PAPERS).length === Object.keys(DOI).length && Object.values(PAPERS).every((x) => /^10\.\d{4,5}\/\S+$/.test(x.doi) && x.cite && x.venue && x.what) && Object.keys(PAPERS).filter((k) => PAPERS[k].preprint).join() === 'gillon25' && /preprint/.test(PAPERS.gillon25.venue));
  yes('the measured day sides are the ones read', OBSERVED.every((e) => (e.day ? e.day.T : undefined) === DAY[e.name] && (!e.day || (e.day.lo > 0 && e.day.hi > 0 && PAPERS[e.day.src] && e.papers.includes(e.day.src)))), OBSERVED.filter((e) => (e.day ? e.day.T : undefined) !== DAY[e.name]).map((e) => e.name).join(', '));
  yes('every reason that names a paper names one of the entry\'s own', OBSERVED.every((e) => SCENARIOS.every((k) => [...statusOf(e, k).why.matchAll(/\(([A-Z][a-zé-]+(?: [A-Z][a-zé]+)?) (\d{4})/g)].every((m) => e.papers.some((pk) => PAPERS[pk].cite.startsWith(m[1]) && PAPERS[pk].cite.includes(m[2]))))));
}

/* ---- the mass the fit is given (S3) ---- */
{
  near('the paper\'s relation at 1 Earth radius: e^-0.025 Earth masses', fitMass(1), Math.exp(-0.025), 1e-12);
  near('and at 1.5 Earth radii: e^-0.025 1.5^3.37', fitMass(1.5), Math.exp(-0.025) * Math.pow(1.5, 3.37), 1e-12);
  yes('it holds up to 1.8 Earth radii, and stops there', fitMass(1.799) > 0 && fitMass(1.8) === null && fitMass(2.5) === null && fitMass(0) === null && fitMass(NaN) === null);
}

/* ---- the Solar System, by the fit ---- */
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1 };
const sol = (pl_name, pl_rade, pl_masse, a, pl_orbper) => ({ pl_name, pl_rade, pl_masse, pl_orbsmax: a, a, pl_orbper, pl_eqt: null, ...SUN });
const SOL = { Mercury: sol('Mercury', 0.383, 0.0553, 0.387, 87.97), Venus: sol('Venus', 0.949, 0.815, 0.723, 224.7), Earth: sol('Earth', 1, 1, 1, 365.25), Mars: sol('Mars', 0.532, 0.107, 1.524, 687) };
{
  const ph = Object.fromEntries(Object.entries(SOL).map(([k, p]) => [k, physics(p)]));
  yes('Earth and Venus keep air by the fit, both above 0.999', ph.Earth.air.fit.P > 0.999 && ph.Venus.air.fit.P > 0.999 && ph.Earth.air.by === 'fit', `${ph.Earth.air.fit.P} ${ph.Venus.air.fit.P}`);
  yes('Earth and Venus are drawn with thick air', ph.Earth.airKey === 'thick' && ph.Venus.airKey === 'thick');
  near('Mercury does not: the posterior gives it 0.103', ph.Mercury.air.fit.P, 0.103, 0.002);
  yes('Mercury is drawn bare, with no air at all', ph.Mercury.airKey === 'bare' && ph.Mercury.atmDensity === 0);
  yes('Mars keeps air by the fit (0.97) and is drawn with thin air, so it stays a desert', ph.Mars.air.fit.P > 0.96 && ph.Mars.airKey === 'thin' && lookOf(SOL.Mars) === 'desert', `${ph.Mars.air.fit.P.toFixed(3)} ${ph.Mars.airKey}`);
  yes('without the star\'s luminosity there is no fit (S4): the archive\'s values or none', physics({ ...SOL.Earth, pl_name: 'no star', S: 1, Teff: null, Rs: null, logL: null }).air.fit === null && physics({ ...SOL.Earth, pl_name: 'with log L', Teff: null, Rs: null, logL: 0 }).air.fit !== null);
  yes('without a flux or an orbit there is no fit, and none without a radius', physics({ ...SOL.Earth, pl_name: 'no orbit', a: null, pl_orbsmax: null, P: null }).air.fit === null && [physics({ ...SOL.Earth, pl_name: 'no radius', pl_rade: null }), physics({ ...SOL.Earth, pl_name: 'a radius bound', pl_rade: null, R: null, lim: { R: { v: 1.2, dir: 1 } } })].every((ph) => !ph.air || ph.air.fit === null) && physics({ ...SOL.Earth, pl_name: 'a radius bound', pl_rade: null, R: null, lim: { R: { v: 1.2, dir: 1 } } }).air !== null);
  near('Earth\'s escape speed in the drawing is 11.186 km/s', physics(SOL.Earth).vEscKms, 11.186, 1e-12);
  const half = airLine(physics({ ...SOL.Earth, pl_name: 'a star half known', Rs: null, logL: null, st_rad: null }).air);
  const noOrbit = airLine(physics({ ...SOL.Earth, pl_name: 'no orbit', a: null, pl_orbsmax: null, P: null }).air);
  yes('with no fit, the line says what the archive lacks, and calls the star a stand-in when its temperature or its size is one (N2)', /No fit: the archive lacks the star's luminosity and the flux\. The star's temperature and size are stand-ins, so the look is illustrative\./.test(half) && /No fit: the archive lacks the flux\. Whether it has air/.test(noOrbit), `${half} | ${noOrbit}`);
  const fc = { ...SOL.Earth, pl_name: 'an Earth with no mass', pl_masse: null, pl_rade: 1.2 };
  near('a rock without a measured mass gives the fit the paper\'s mass: v = 11.186 (e^-0.025 1.2^2.37)^(1/2) km/s', scenariosFor({ name: 'x', S: 1, L: 1, vEsc: 11.186 * Math.sqrt(Math.exp(-0.025) * Math.pow(1.2, 2.37)) }).fit.P, physics(fc).air.fit.P, 1e-12);
}

/* ---- the bare rock's day side ---- */
{
  const b = bareDay(5772, 1, 0.05);
  near('the hottest point of a bare rock at 0.05 AU from the Sun, A_B 0.1 (K)', b.Tss, 5772 * Math.sqrt(0.00465047 / 0.05) * Math.pow(0.9, 0.25), 1e-6);
  near('its day side is (2/3)^(1/4) of its hottest point', b.Tday / b.Tss, Math.pow(2 / 3, 0.25), 1e-12);
  near('the shader\'s temperature map gives that same day side with a cold night', mapDay(2000, 50) / 2000, Math.pow(2 / 3, 0.25), 0.002);
  yes('a warm night raises the day side of the map', mapDay(1000, 900) > mapDay(1000, 50) + 20);
  near('the hottest point found for a measured day side gives it back (K)', mapDay(tsubForDay(1796, 1175), 1175), 1796, 0.5);
  near('and for a day side just above what the night floor alone gives (K)', mapDay(tsubForDay(1100, 1000), 1000), 1100, 0.5);
  yes('a night floor whose map already gives the measured day side returns the floor itself', tsubForDay(900, 1000) === 1000 && tsubForDay(mapDay(1000, 1000), 1000) === 1000);
  near('a hot day side far above a cold night is found, near (3/2)^(1/4) of it (K)', tsubForDay(1500, 50), 1500 / Math.pow(2 / 3, 0.25), 2);
  yes('no open melt with the hottest point at 1,672 K; a small one at 1,674 K', pondAngle(1672) === 0 && pondAngle(1674) > 0 && pondAngle(1674) < 5, `${pondAngle(1674).toFixed(2)} degrees`);
  near('the melt reaches arccos[(1673 / 2000)^4] = 60.7 degrees from the point under the star', pondAngle(2000), Math.acos(Math.pow(1673 / 2000, 4)) * 180 / Math.PI, 1e-9);
  yes('no day side without the star or the orbit', bareDay(NaN, 1, 1) === null && bareDay(5000, 1, 0) === null);
}

/* ---- the catalogue ---- */
const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
const by = new Map(list.map((p) => [p.name, p]));
// the physics of every world once: it is pure, and the catalogue-wide checks below read it many times (the
// broken-rule lists run this file once per entry, so its speed sets theirs)
const PH = new Map(list.map((p) => [p, physics(p)]));
const ph0 = (p) => PH.get(p) || physics(p);
{
  // every observed planet is in the catalogue, drawn with a surface, and comes out as observed
  for (const e of OBSERVED) {
    const p = by.get(e.name);
    if (!p) { yes(`${e.name} is in the catalogue`, false); continue; }
    const ph = physics(p), want = e.observed ? e.observed.scenario : e.concludes ? e.concludes.scenario : (ph.air.fit.P >= 0.5 ? 'thin' : 'bare');
    const prm = toParams(p);
    const airOk = want === 'bare' ? prm.hasAtmo === 0 && ph.atmDensity === 0 : prm.hasAtmo === 1 && ph.atmDensity >= AIR_THIN;
    yes(`${e.name} is drawn as observed: ${want}`, !ph.isGiant && ph.airKey === want && airOk && ph.air.observed === e, `${ph.airKey} ${lookOf(p)} hasAtmo ${prm.hasAtmo}`);
  }
  // what the paper excluded is never drawn, even when asked for, and the line says it is excluded
  for (const e of OBSERVED) {
    const p = by.get(e.name); if (!p) continue;
    const out = SCENARIOS.filter((k) => statusOf(e, k).s === 'excluded');
    const line = airLine(physics(p).air);
    yes(`${e.name}: each exclusion is listed as excluded and cannot be drawn; each disfavoured scenario is said to be`, out.every((k) => physics(p, { air: k }).airKey !== k && statusIn(line, k) === 'excluded') && SCENARIOS.filter((k) => statusIn(line, k) === 'excluded').length === out.length && SCENARIOS.filter((k) => statusOf(e, k).s === 'disfavoured' && k !== physics(p).airKey).every((k) => statusIn(line, k) === 'disfavoured'), line);
  }
  // the day sides: the bare-rock model against every measurement of a world drawn bare, and the atmosphere's sign
  const bareMeasured = OBSERVED.filter((e) => e.day && physics(by.get(e.name)).airKey === 'bare');
  const z = (e) => { const ph = physics(by.get(e.name)), m = bareDay(ph.Teff, ph.Rstar, ph.a).Tday, d = e.day; return (m - d.T) / (m > d.T ? d.hi : d.lo); };
  yes('twelve worlds drawn bare have a measured day side', bareMeasured.length === 12, bareMeasured.map((e) => e.name).join(', '));
  yes('the bare-rock model (A_B 0.1, f = 2/3) is within 2.5 sigma of eleven of them; LTT 1445 A b, on the archive\'s hotter star, within 3.1', bareMeasured.filter((e) => Math.abs(z(e)) > 2.5).map((e) => e.name).join() === 'LTT 1445 A b' && Math.abs(z(observedOf('LTT 1445 A b'))) <= 3.1, bareMeasured.map((e) => `${e.name} ${z(e).toFixed(2)}`).join(', '));
  near('LHS 3844 b: the model\'s day side against JWST\'s 985 K (K)', bareDay(physics(by.get('LHS 3844 b')).Teff, physics(by.get('LHS 3844 b')).Rstar, physics(by.get('LHS 3844 b')).a).Tday, 985, 2.5 * 16);
  near('GJ 367 b: the model\'s day side against the measured 1,709 K (K)', bareDay(physics(by.get('GJ 367 b')).Teff, physics(by.get('GJ 367 b')).Rstar, physics(by.get('GJ 367 b')).a).Tday, 1709, 92);
  const cnc = physics(by.get('55 Cnc e')), toi = physics(by.get('TOI-561 b'));
  yes('55 Cnc e and TOI-561 b: the measured day side is over 3 sigma below the bare-rock model, the sign of their air', (bareDay(cnc.Teff, cnc.Rstar, cnc.a).Tday - 1796) / 88 > 3 && (bareDay(toi.Teff, toi.Rstar, toi.a).Tday - 1800) / 130 > 3);
  yes('every observed world with a measured day side is drawn at it, to 1 K', OBSERVED.filter((e) => e.day).every((e) => { const prm = toParams(by.get(e.name)); return Math.abs(mapDay(prm.tsub, prm.tnight) - e.day.T) < 1; }));
  yes('and the melt is decided by the measured day side', OBSERVED.filter((e) => e.day).every((e) => physics(by.get(e.name)).Ttest === e.day.T));
  yes('GJ 367 b, at 1,709 K, has an open melt under its star; LHS 3844 b, at 985 K, has none', lookOf(by.get('GJ 367 b')) === 'molten' && pondAngle(toParams(by.get('GJ 367 b')).tsub) > 30 && lookOf(by.get('LHS 3844 b')) === 'airless' && pondAngle(toParams(by.get('LHS 3844 b')).tsub) === 0, `${pondAngle(toParams(by.get('GJ 367 b')).tsub).toFixed(1)} degrees`);
  yes('every rocky exoplanet the fit labels airless orbits an M dwarf (under 3,900 K in the archive)', OBSERVED.filter((e) => e.papers.length && !['TRAPPIST-1 d', 'TRAPPIST-1 e', '55 Cnc e', 'TOI-561 b'].includes(e.name)).every((e) => by.get(e.name).Teff < 3900));

  // the famous worlds that lose their air in the picture (posterior means)
  const famous = { 'TRAPPIST-1 e': 0.0114, 'TRAPPIST-1 f': 0.0848, 'TRAPPIST-1 g': 0.2415, 'Proxima Cen b': 0.1888 };
  for (const [n, Pf] of Object.entries(famous)) {
    const ph = physics(by.get(n));
    yes(`${n} is drawn as airless rock, the fit giving it a chance of air of ${(Pf * 100).toPrecision(3)}%`, ph.airKey === 'bare' && lookOf(by.get(n)) === 'airless' && Math.abs(ph.air.fit.P - Pf) < 0.0005, `${ph.airKey} ${lookOf(by.get(n))} ${ph.air.fit.P.toPrecision(4)}`);
  }
  yes('the world the survey opens on, Kepler-442 b, keeps its seas (over 99.9%)', lookOf(by.get('Kepler-442 b')) === 'temperate' && physics(by.get('Kepler-442 b')).air.fit.P > 0.999);
  // the five worlds near 50% the review named go where the posterior and the paper's mass relation put them
  const flips = { 'TOI-789 b': 'thick', 'K2-229 b': 'bare', 'Kepler-1368 b': 'thin', 'HD 260655 b': 'bare', 'Wolf 1061 b': 'bare' };
  yes('the five worlds near 50% fall where the posterior puts them', Object.entries(flips).every(([n, k]) => physics(by.get(n)).airKey === k && (physics(by.get(n)).air.fit.P >= 0.5) === (k !== 'bare')), Object.keys(flips).map((n) => `${n} ${(physics(by.get(n)).air.fit.P * 100).toFixed(1)}% ${physics(by.get(n)).airKey}`).join('; '));

  // every rocky world: its scenarios, their status and their probabilities
  const rocky = list.filter((p) => !ph0(p).isGiant);
  let fewer = 0, noP = 0, sumBad = 0, unnamed = 0, noWord = 0, unobserved = 0;
  for (const p of rocky) {
    const ph = ph0(p), sc = ph.air;
    if (!sc.observed) unobserved++;
    const open = sc.list.filter((x) => x.status !== 'excluded');
    if (!sc.observed && open.length < 2) fewer++;
    if (sc.fit && sc.list.some((x) => (x.status === 'allowed' || x.status === 'disfavoured') && x.p === null)) noP++;
    if (sc.fit && !sc.observed && Math.abs(sc.list[0].p + sc.list[2].p - 1) > 1e-12) sumBad++;
    const line = airLine(sc);
    if (!SCENARIOS.every((k) => statusIn(line, k) === (k === ph.airKey ? 'drawn' : sc.list.find((x) => x.key === k).status))) unnamed++;
    if (sc.fit && !sc.observed && !/ Chance it kept an atmosphere, by the 2026 fit, extrapolated(?: past its sample)?: (?:over |under |just under )?[\d.]+% \(68% range .+?%\)\./.test(line)) noWord++;
  }
  yes(`every one of the ${unobserved} rocky worlds with no observation keeps at least two scenarios`, rocky.length === 1956 && unobserved === 1956 - 17 && fewer === 0, `${fewer} with fewer`);
  yes('every allowed or disfavoured scenario carries the fit\'s probability where there is a fit', noP === 0, `${noP} without`);
  yes('the chance of air and that of bare rock add up to one', sumBad === 0);
  yes('the line names all three scenarios for every rocky world, each in a sentence that gives its status', unnamed === 0, `${unnamed} lines miss one`);
  yes('the line gives every unobserved world\'s chance of air, extrapolated, with its 68% range', noWord === 0, `${noWord} lines`);
  yes('no giant has scenarios: its look is its cloud tops', list.filter((p) => ph0(p).isGiant).every((p) => ph0(p).air === null));
  // the worlds without a fit (S4): drawn by the old rule, labelled so
  const nofit = rocky.filter((p) => !ph0(p).air.fit);
  yes('22 rocky worlds have no fit, all found by microlensing or pulsar timing, PSR B1257+12 c and d among them', nofit.length === 22 && nofit.every((p) => /Microlensing|Pulsar/.test(p.method || '')) && ['PSR B1257+12 c', 'PSR B1257+12 d'].every((n) => nofit.some((p) => p.name === n)), `${nofit.length}: ${[...new Set(nofit.map((p) => p.method))].join(', ')}`);
  const nofitKeys = nofit.reduce((c, p) => { const k = ph0(p).airKey; c[k] = (c[k] || 0) + 1; return c; }, {});
  yes('the amount of air draws 21 of them with thick air and 1 bare', nofitKeys.thick === 21 && nofitKeys.bare === 1 && !nofitKeys.thin, JSON.stringify(nofitKeys));
  yes('they are drawn by the amount of air, and the line says so with no probability', nofit.every((p) => ph0(p).air.by === 'amount' && /No fit: the archive lacks the star's luminosity and the flux\. The star's temperature and size are stand-ins, so the look is illustrative\./.test(airLine(ph0(p).air)) && !/Chance/.test(airLine(ph0(p).air) + airShort(ph0(p).air))));
  // a minimum mass (N2)
  const prox = airLine(physics(by.get('Proxima Cen b')).air);
  yes('where the mass is a minimum the line says the probability is a lower bound', / The mass is a minimum \(M sin i\), so the chance is a lower bound\. /.test(prox) && !/minimum/.test(airLine(physics(by.get('TRAPPIST-1 e')).air)), prox);
}

/* ---- the line ---- */
/* The status the details give a scenario, read from the sentences a visitor reads: "Drawn as/with X ...", a group
   "X and Y allowed." or "X observed.", or a sentence that starts "X disfavoured " or "X excluded ". Null when no
   sentence gives it one, or more than one does. */
function statusIn(line, key) {
  const name = { bare: 'bare rock', thin: 'thin air', thick: 'thick air' }[key];
  const found = [];
  for (const s of line.split(/(?<=\.) (?=[A-Z])/)) {
    const drawn = s.match(/^Drawn (?:as|with) (bare rock|thin air|thick air)\b/);
    if (drawn) { if (drawn[1] === name) found.push('drawn'); continue; }
    const group = s.match(/^((?:Bare rock|Thin air|Thick air)(?:(?:, | and )(?:bare rock|thin air|thick air))*) (allowed|observed)\.$/);
    if (group) { if (group[1].toLowerCase().split(/, | and /).includes(name)) found.push(group[2]); continue; }
    const one = s.match(/^(Bare rock|Thin air|Thick air) (?:[a-z]+ )?(disfavoured|excluded) /);   // "weakly disfavoured (2σ)" is disfavoured
    if (one && one[1].toLowerCase() === name) found.push(one[2]);
  }
  return found.length === 1 ? found[0] : null;
}
const PCT = [0.0004, 0.0006, 0.004, 0.0099, 0.0101, 0.143, 0.9899, 0.9901, 0.997, 0.9994, 0.9996, 0.00005, 0.0011, 0.00094, 0.00011, 0.015, 0.4949, 0.4951, 0.4999, 0.5];
const ZONE = 'The habitable zone describes the temperature the star gives, and says nothing about whether the planet kept air.';
{
  const line = (n, shown) => airLine(physics(by.get(n)).air, shown);
  const short = (n, shown) => airShort(physics(by.get(n)).air, shown);
  // the short line, always shown (V2)
  yes('the short line of a world drawn bare by the fit: what is drawn, the chance of air and its range', short('TRAPPIST-1 e') === 'Air: drawn as bare rock. Chance of air 1% (0.05 to 2%).', short('TRAPPIST-1 e'));
  yes('the short line of a world drawn from its paper says so', short('LHS 3844 b') === 'Air: drawn as bare rock, from its paper. Chance of air 0.74% (0.03 to 1%).', short('LHS 3844 b'));
  yes('the short line of a world the fit gives air says its thickness is illustrative, and leaves the range of an extreme to the details', short('Kepler-442 b') === 'Air: drawn with thick air, thickness illustrative. Chance of air over 99.9%.', short('Kepler-442 b'));
  yes('the short line of an observed atmosphere', short('55 Cnc e') === 'Air: drawn with thick air, as observed. Chance of air 94% (88 to 99.1%).' && short('TOI-561 b') === 'Air: drawn with thick air, as observed.', short('55 Cnc e'));
  yes('the short line of a scenario the visitor chose', short('TRAPPIST-1 e', 'thin') === 'Air: drawn with thin air, by your choice. Chance of air 1% (0.05 to 2%).', short('TRAPPIST-1 e', 'thin'));
  yes('the short line of a world with no fit', short('PSR B1257+12 c') === 'Air: drawn with thick air, illustrative: no fit.', short('PSR B1257+12 c'));
  const longs = list.filter((p) => ph0(p).air).map((p) => [p.name, airShort(ph0(p).air)]).sort((a, b) => b[1].length - a[1].length);
  yes('every short line is at most 92 characters, and the longest is EPIC 201238110 b\'s, which the drive measures at 390 px', longs[0][1].length <= 92 && longs.find((x) => x[0] === 'EPIC 201238110 b')[1].length === longs[0][1].length, `${longs[0][1].length}: ${longs[0][0]}: ${longs[0][1]}`);
  // the details, under the short line
  yes('an unobserved world in the habitable zone: drawn, the other two allowed, not observed, the chance of air with its range, and what the zone does not say', line('TRAPPIST-1 f') === `Drawn as bare rock. Thin air and thick air allowed. Not observed. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 8% (68% range 0.73 to 16%). ${ZONE}`, line('TRAPPIST-1 f'));
  yes('an observed world drawn from its paper: its conclusion, and what each disfavoured scenario is disfavoured for', line('LHS 3844 b') === 'Drawn as bare rock. Its paper concludes: “The data are well fitted by a bare rock model with a low Bond albedo” (Kreidberg 2019). Thin air disfavoured for CO2 from 100 mbar (Zieba 2026) and for SO2 from 10 microbar (Zieba 2026). Thick air disfavoured for any air from 10 bar, by energy balance (Kreidberg 2019), for CO2 from 100 mbar (Zieba 2026) and for SO2 from 10 microbar (Zieba 2026). Observed by Kreidberg 2019 and Zieba 2026. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 0.74% (68% range 0.03 to 1%).', line('LHS 3844 b'));
  yes('an exclusion by energy balance says so', line('GJ 367 b').includes(' Thick air excluded for any air from 1 bar, by energy balance (Zhang 2024).') && line('GJ 486 b').includes(' Thick air excluded for any air from 1 bar, by energy balance (Weiner Mansfield 2024).'), line('GJ 486 b'));
  yes('an observed atmosphere, with its thin air disfavoured and bare rock excluded', line('55 Cnc e') === 'Drawn with thick air, as observed. Thin air disfavoured for air of vaporized rock up to 1 bar (Hu 2024). Bare rock excluded by its day side (Hu 2024). Observed by Hu 2024. Chance it kept an atmosphere, by the 2026 fit, extrapolated past its sample: 94% (68% range 88 to 99.1%).', line('55 Cnc e'));
  yes('an observed atmosphere with nothing left for the fit says no number', line('TOI-561 b') === 'Drawn with thick air, as observed. Bare rock excluded by its day side (Teske 2025). Thin air excluded for any air up to 1 bar, by energy balance (Teske 2025). Observed by Teske 2025.', line('TOI-561 b'));
  yes('a paper whose conclusion does not name the scenario drawn gives the reading the drawing follows (N1)', line('LTT 1445 A b').startsWith('Drawn as bare rock. Its paper concludes: “These results suggest that LTT 1445A b lacks a very thick CO2 atmosphere, possibly due to atmospheric erosion driven by stellar activity. However, the presence of a moderately thin atmosphere (similar to those on Mars, Titan, or Earth) remains uncertain.” (Wachiraphan 2025). Its day side, 0.952 ± 0.057 of a dark rock\'s, is drawn as bare rock; thin air stays a scenario. Thin air allowed.') && ['LHS 1140 c', 'LTT 3780 b'].every((n) => /^We /.test(observedOf(n).concludes.quote) && observedOf(n).concludes.reading), line('LTT 1445 A b'));
  yes('a finding quoted is called one, and a conclusion one: LHS 1140 c and LTT 3780 b find, LTT 1445 A b concludes', ['LHS 1140 c', 'LTT 3780 b'].every((n) => line(n).startsWith('Drawn as bare rock. Its paper finds: “We ') && observedOf(n).concludes.verb === 'finds') && line('LTT 1445 A b').startsWith('Drawn as bare rock. Its paper concludes: “These results suggest') && OBSERVED.filter((e) => e.concludes && e.concludes.verb === 'finds').map((e) => e.name).join() === 'LHS 1140 c,LTT 3780 b');
  const deg = (d) => ({ kind: 'pressure', paper: 'zieba23', lo: 1, hi: Infinity, gases: ['CO2'], basis: null, degree: d, says: 'x' });
  const two = (a, b) => airLine(scenariosFor({ name: 'nobody', S: 10, L: 1, vEsc: 4, observed: { name: 'nobody', papers: ['zieba23'], concludes: null, day: null, observed: null, bounds: [a, b] } }));
  yes('a paper\'s degree is said with the status from the bound itself: TRAPPIST-1 e\'s thick air, weakly disfavoured (2σ) by Glidden 2025', / Thick air weakly disfavoured \(2σ\) for CO2-rich air from 6 mbar to 92 bar \(Glidden 2025\)\./.test(line('TRAPPIST-1 e')) && observedOf('TRAPPIST-1 e').bounds[0].degree.word === 'weakly' && observedOf('TRAPPIST-1 e').bounds[0].degree.sigma === 2, line('TRAPPIST-1 e'));
  yes('bounds that differ in degree each say their own, and a bound with none says none', / Thick air disfavoured for CO2 from 1 bar, weakly \(2σ\) \(Zieba 2023\) and for CO2 from 1 bar \(Zieba 2023\)\./.test(two(deg({ word: 'weakly', sigma: 2 }), deg(null))) && / Thick air disfavoured for CO2 from 1 bar, weakly \(2σ\) \(Zieba 2023\) and for CO2 from 1 bar, strongly \(4σ\) \(Zieba 2023\)\./.test(two(deg({ word: 'weakly', sigma: 2 }), deg({ word: 'strongly', sigma: 4 }))) && / Thick air weakly disfavoured \(2σ\) for CO2 from 1 bar \(Zieba 2023\) and for CO2 from 1 bar \(Zieba 2023\)\./.test(two(deg({ word: 'weakly', sigma: 2 }), deg({ word: 'weakly', sigma: 2 }))), two(deg({ word: 'weakly', sigma: 2 }), deg(null)));
  yes('a degree is shared only when both its word and its sigma agree', / Thick air disfavoured for CO2 from 1 bar, weakly \(2σ\) \(Zieba 2023\) and for CO2 from 1 bar, weakly \(3σ\) \(Zieba 2023\)\./.test(two(deg({ word: 'weakly', sigma: 2 }), deg({ word: 'weakly', sigma: 3 }))) && / Thick air disfavoured for CO2 from 1 bar, weakly \(2σ\) \(Zieba 2023\) and for CO2 from 1 bar, mildly \(2σ\) \(Zieba 2023\)\./.test(two(deg({ word: 'weakly', sigma: 2 }), deg({ word: 'mildly', sigma: 2 }))), two(deg({ word: 'weakly', sigma: 2 }), deg({ word: 'weakly', sigma: 3 })));
  yes('the reason of the scenario a finding leads to says the paper finds it', statusOf(observedOf('LHS 1140 c'), 'bare').why.endsWith('The paper finds: “We rule out a wide range of atmospheric forward models to >3 σ, including pure CO2 atmospheres with surface pressure ≥10 mbar and pure H2O atmospheres with surface pressure ≥1 bar.” (Fortune 2025).') && statusOf(observedOf('LHS 3844 b'), 'bare').why.includes('The paper concludes:'), statusOf(observedOf('LHS 1140 c'), 'bare').why);
  yes('a preprint is named as one', line('TRAPPIST-1 b').includes('Observed by Greene 2023, Ducrot 2025 and Gillon 2025, a preprint.') && line('TRAPPIST-1 b').includes('from 1 bar (Gillon 2025, a preprint).'), line('TRAPPIST-1 b'));
  yes('a scenario chosen by the visitor says what the survey would draw, and what the choice is disfavoured for', line('TRAPPIST-1 e', 'thin') === `Drawn with thin air, though weakly disfavoured (2σ) for CO2-rich air from 6 mbar to 92 bar (Glidden 2025), by your choice; the survey draws bare rock. Bare rock allowed. Thick air weakly disfavoured (2σ) for CO2-rich air from 6 mbar to 92 bar (Glidden 2025). Observed by Espinoza 2025 and Glidden 2025. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 1% (68% range 0.05 to 2%). ${ZONE}`, line('TRAPPIST-1 e', 'thin'));
  yes('a range that crosses 50% says the fit cannot decide, and a minimum mass says the chance is a lower bound', line('Ross 128 b') === `Drawn as bare rock. Thin air and thick air allowed. Not observed. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 42% (68% range 19 to 66%). Its range crosses 50%, so the fit cannot decide; the picture takes the more probable side. The mass is a minimum (M sin i), so the chance is a lower bound. ${ZONE}`, line('Ross 128 b'));
  yes('a world the fit gives air says the fit does not say how thick (V1)', line('TOI-789 b') === `Drawn with thick air. Bare rock and thin air allowed. Not observed. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 55% (68% range 40 to 70%). ${THICKNESS} Its range crosses 50%, so the fit cannot decide; the picture takes the more probable side.`, line('TOI-789 b'));
  yes('a range that stops short of 50% says nothing of it: TRAPPIST-1 g, 68% range up to 49%', !/cannot decide/.test(line('TRAPPIST-1 g')) && /68% range 3 to 49%/.test(line('TRAPPIST-1 g')), line('TRAPPIST-1 g'));
  yes('a world outside the habitable zone has no sentence on it', !/habitable zone/.test(line('LHS 3844 b')) && !/habitable zone/.test(line('55 Cnc e')));
  yes('a world past the fit\'s sample says so', /, by the 2026 fit, extrapolated past its sample: /.test(line('K2-141 b')));
  yes('no part of the line is joined by a middle dot', ['Proxima Cen b', 'LHS 3844 b', '55 Cnc e', 'TRAPPIST-1 b'].every((n) => !line(n).includes('·') && !short(n).includes('·')));
  yes('the links of the line are the scenario names alone', ['Proxima Cen b', 'LHS 3844 b', 'LTT 1445 A b'].every((n) => airParts(physics(by.get(n)).air).filter((x) => x.air).every((x) => /^(bare rock|thin air|thick air)$/i.test(x.t))));
  const marks = (n) => airParts(physics(by.get(n)).air).filter((x) => x.st).map((x) => `${x.t}/${x.st}`).join(' ');
  yes('each status word is a part the survey marks (gold for "observed" alone), and the words are the statuses', marks('55 Cnc e') === 'observed/observed disfavoured/disfavoured excluded/excluded' && marks('TRAPPIST-1 f') === 'allowed/allowed' && marks('LHS 3844 b') === 'disfavoured/disfavoured disfavoured/disfavoured', `${marks('55 Cnc e')} | ${marks('TRAPPIST-1 f')} | ${marks('LHS 3844 b')}`);
  yes('three papers are joined as "a, b and c"', line('TRAPPIST-1 b').includes('Greene 2023, Ducrot 2025 and Gillon 2025'));
  const noRest = scenariosFor({ name: 'nobody', S: 10, L: 1, vEsc: 11, observed: { name: 'nobody', papers: ['teske25'], concludes: null, day: null, observed: null, bounds: [BARE_B, P(0, 1)] } });
  yes('with bare rock and thin air excluded and thick air open, the fit is said for the one scenario left', noRest.drawn === 'thick' && /Chance it kept an atmosphere/.test(airLine(noRest)) && statusIn(airLine(noRest), 'bare') === 'excluded' && statusIn(airLine(noRest), 'thin') === 'excluded', airLine(noRest));
  yes('the switchable parts are the allowed, disfavoured and observed scenarios not drawn', airParts(physics(by.get('LHS 3844 b')).air).filter((x) => x.air).map((x) => x.air).join() === 'thin,thick' && airParts(physics(by.get('TOI-561 b')).air).filter((x) => x.air).length === 0 && airParts(physics(by.get('GJ 367 b')).air).filter((x) => x.air).map((x) => x.air).join() === 'thin');
  yes('percentages by the kit (kit/format.js): one significant figure under 0.1%, two under 1% with their zeros, whole numbers to 99%, three figures above, just under one half and the extremes in words', PCT.map(percent).join(' ') === '0.04% 0.06% 0.40% 0.99% 1% 14% 99% 99.0% 99.7% 99.9% over 99.9% under 0.01% 0.11% 0.09% 0.01% 2% 49% just under 50% just under 50% 50%', PCT.map(percent).join(' '));
  yes('a range drops the first per-cent sign only when both ends are numbers', percentRange(0.0005, 0.02) === '0.05 to 2%' && percentRange(0.00005, 0.0008) === 'under 0.01% to 0.08%' && percentRange(0.995, 0.9999) === '99.5 to over 99.9%' && percentRange(0.9996, 0.9999) === 'all over 99.9%' && percentRange(0.00001, 0.00002) === 'all under 0.01%');
  const x = (s) => ({ scenario: s, paper: 'zieba23', quote: 'a quote long enough to count' });
  const sc = scenariosFor({ name: 'nobody', S: 10, L: 1, vEsc: 11, observed: { name: 'nobody', papers: ['zieba23'], concludes: null, day: null, observed: x('thin'), bounds: [P(1, Infinity)] } });
  yes('an observed scenario not drawn is named as observed and can be switched back to', airLine(sc, 'bare') === 'Drawn as bare rock, by your choice; the survey draws thin air. Thin air observed. Thick air excluded for any air from 1 bar (Zieba 2023). Observed by Zieba 2023. Chance it kept an atmosphere, by the 2026 fit, extrapolated: 99.7% (68% range 99.5 to over 99.9%).' && airParts(sc, 'bare').some((p) => p.air === 'thin'), airLine(sc, 'bare'));
}

/* ---- the line agrees with the picture, for every rocky world (V1: the class fix) ---- */
{
  const SHORT_AS = { bare: 'Air: drawn as bare rock', thin: 'Air: drawn with thin air', thick: 'Air: drawn with thick air' };
  const side = (s) => { const m = s.match(/Chance of air (just under 50%|over 99\.9%|under 0\.01%|[\d.]+%)/); return !m ? null : m[1] === 'just under 50%' || m[1] === 'under 0.01%' ? 'bare' : m[1] === 'over 99.9%' ? 'air' : parseFloat(m[1]) >= 50 ? 'air' : 'bare'; };
  const bad = [];
  for (const p of list) {
    const ph = ph0(p), sc = ph.air;
    if (!sc) continue;
    const k = ph.airKey, s = airShort(sc), l = airLine(sc);
    const why = sc.by === 'observed' ? s.startsWith(`${SHORT_AS[k]}, as observed.`) && sc.observed.observed.scenario === k
      : sc.by === 'paper' ? s.startsWith(`${SHORT_AS[k]}, from its paper.`) && / Its paper (concludes|finds): “/.test(l) && sc.observed.concludes.scenario === k
        : sc.by === 'fit' ? (k === 'bare' ? s.startsWith(`${SHORT_AS[k]}.`) && side(s) === 'bare' && !l.includes(THICKNESS) : s.startsWith(`${SHORT_AS[k]}, thickness illustrative.`) && side(s) === 'air' && l.includes(THICKNESS))
          : s === `${SHORT_AS[k]}, illustrative: no fit.` && l.includes(' No fit: the archive lacks ');
    const said = statusIn(l, k) === 'drawn' && SCENARIOS.every((q) => q === k || statusIn(l, q) === sc.list.find((x) => x.key === q).status);
    const stale = /rest is|detectable|thicker than about/.test(s + l);
    if (!why || !said || stale) bad.push(`${p.name}: ${s} | ${l.slice(0, 120)}`);
  }
  yes('for every rocky world, the short line and the details say the scenario drawn and why, the chance of air is on its side, and each other scenario is given its status', bad.length === 0, `${bad.length}: ${bad.slice(0, 3).join(' || ')}`);
}

/* ---- a scenario can be drawn instead, and the default is the rule's ---- */
{
  const e = by.get('TRAPPIST-1 e');
  yes('TRAPPIST-1 e can be drawn with thin air (a desert) or thick air (seas or ice) on request', physics(e, { air: 'thin' }).airKey === 'thin' && ['desert', 'ice'].includes(lookOf(e, physics(e, { air: 'thin' }))) && physics(e, { air: 'thick' }).airKey === 'thick' && ['temperate', 'ice'].includes(lookOf(e, physics(e, { air: 'thick' }))), `${lookOf(e, physics(e, { air: 'thin' }))} ${lookOf(e, physics(e, { air: 'thick' }))}`);
  yes('a scenario that is not one of the three is ignored', physics(e, { air: 'jungle' }).airKey === 'bare' && physics(e, { air: undefined }).airKey === 'bare');
  yes('the request reaches the picture\'s numbers', toParams(e, { air: 'thick' }).hasAtmo === 1 && toParams(e).hasAtmo === 0 && classify(e, { air: 'thin' }).airKey === 'thin');
  const cnc = by.get('55 Cnc e');
  yes('a molten world keeps its look in every scenario, so a switch there changes numbers, not the program', ['bare', 'thin', 'thick'].every((k) => lookOf(by.get('GJ 367 b'), physics(by.get('GJ 367 b'), { air: k })) === 'molten') && toParams(by.get('GJ 367 b'), { air: 'thin' }).type === toParams(by.get('GJ 367 b')).type && lookOf(cnc) === 'molten');
  yes('a locked bare rock has a 50 K night', toParams(by.get('GJ 367 b')).tnight === 50 && physics(by.get('GJ 367 b')).bare !== null);
  const g = toParams(by.get('GJ 367 b')), gph = physics(by.get('GJ 367 b')), luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  near('its glow under the star: (1 - 0.1) (T / T_ss)^4 of the starlight, in the eye\'s share of each spectrum', luma(g.glow), 0.9 * Math.pow(g.tsub / gph.bare.Tss, 4) * photopicFraction(g.tsub) / photopicFraction(gph.Teff), 1e-9);
  const t1h = by.get('TRAPPIST-1 h'), t1ph = physics(t1h);
  near('a locked bare rock with no measured day side is drawn with the model\'s hottest point: TRAPPIST-1 h (K)', toParams(t1h).tsub, t1ph.Teff * Math.sqrt(t1ph.Rstar * 0.00465047 / t1ph.a) * Math.pow(0.9, 0.25), 1e-6);
}

/* ---- conditions the conditions tool found unbroken (pull request 43) ---- */
{
  yes('a bare-rock day side needs the star\'s temperature and radius', bareDay(null, 1, 0.05) === null && bareDay(5772, null, 0.05) === null && bareDay(5772, 1, 0.05) !== null);
  yes('a world not in the observed table has no entry (null)', observedOf('nobody') === null);
  yes('no melt angle without a hottest point', pondAngle(NaN) === 0 && pondAngle(undefined) === 0);
  const f = physics(by.get('TRAPPIST-1 f')).air;
  const ps = f.list.map((x) => x.key + ' ' + x.status + ' ' + x.p).join(', ');
  yes('the fit gives 1 - P to bare rock and P, the chance of any air, to thin and to thick air', ps === 'bare allowed ' + (1 - f.fit.P) + ', thin allowed ' + f.fit.P + ', thick allowed ' + f.fit.P, ps);
  yes('no day side without a finite orbit (N3)', bareDay(5772, 1, NaN) === null && bareDay(5772, 1, undefined) === null && bareDay(5772, 1, Infinity) === null);
  const e = by.get('TRAPPIST-1 e');
  const dens = [physics(e).atmDensity, physics(e, { air: 'thin' }).atmDensity, physics(e, { air: 'thick' }).atmDensity];
  yes('only bare rock is drawn with the bare rock\'s day side: TRAPPIST-1 e with thin air has none', physics(e).bare !== null && physics(e, { air: 'thin' }).bare === null && physics(e, { air: 'thick' }).bare === null);
  yes('thin air is drawn with an amount inside the thin band, thick air with full air, bare rock with none',dens[0] === 0 && dens[1] >= AIR_THIN && dens[1] < AIR_FULL && dens[2] >= AIR_FULL, dens.join(' '));
  const at = (k) => { const a = lockRadiusAU(1) * k; return { ...SOL.Earth, pl_name: 'at ' + k + ' lock radii', pl_orbsmax: a, a, pl_orbper: 365.25 * Math.pow(a, 1.5), P: 365.25 * Math.pow(a, 1.5) }; };
  yes('a world just inside the lock radius is locked in its physics and in its class, one just outside is not', physics(at(0.99)).locked === true && physics(at(1.01)).locked === false && classify(at(0.99)).locked === true && classify(at(1.01)).locked === false);
}

/* ---- the side the picture takes, read fast (N4) ---- */
{
  let differ = 0, worlds = 0, nearHalf = 0, widest = 0;
  for (const p of list) {
    const fit = ph0(p).air && ph0(p).air.fit;
    if (!fit) continue;
    worlds++;
    if (fit.air !== (fit.P >= 0.5)) differ++;
    if ((fit.median >= 0.5) !== (fit.P >= 0.5)) { nearHalf++; widest = Math.max(widest, Math.abs(fit.median - 0.5)); }
  }
  yes('over the whole catalogue the fast path draws exactly the side the posterior mean draws', worlds === 1934 && differ === 0, `${differ} of ${worlds}`);
  yes('the median parameters and the mean disagree only within the margin, where the mean decides', nearHalf > 0 && widest < SIDE_MARGIN && SIDE_MARGIN === 0.1, `${nearHalf} worlds, widest ${widest.toFixed(4)}`);
  const at = (d) => scenariosFor({ name: 'nobody', S: 10 ** (half + d), L: 1, vEsc: 8 });
  yes('just inside the margin the posterior mean decides, just outside the median does', at(0).fit.air === (at(0).fit.P >= 0.5) && Math.abs(at(0).fit.median - 0.5) < SIDE_MARGIN && Math.abs(at(-0.3).fit.median - 0.5) >= SIDE_MARGIN && at(-0.3).fit.air === true && at(0.3).fit.air === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
