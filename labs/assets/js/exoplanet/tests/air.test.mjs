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
   And the properties of the scenarios (Luis, 2026-11-16: "if
   we cannot rule it out, we will keep it as options"): at least
   two scenarios for every rocky world with no observation; an
   observed exclusion always appears as excluded; the fit's
   probabilities are stated for allowed scenarios.

   Every number below is written here, not read from air.js or
   data.js, so a change to a constant there fails a check.
   ============================================================ */

import { airProbability, scenariosFor, observedOf, OBSERVED, PAPERS, SCENARIOS, bareDay, pondAngle, mapDay, tsubForDay, airLine, airParts, drawable, percent } from '../air.js';
import { physics, lookOf, toParams, classify, AIR_THIN, AIR_FULL } from '../data.js';
import { loadSnapshot } from '../catalog.js';
import { photopicFraction } from '../science.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (name, got, want, tol) => yes(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `${got} (want ${want} ± ${tol})`);

/* The fit as the paper writes it (Berta-Thompson, Wachiraphan & Murray 2026, eqs. 1 to 4, medians). */
const PAPER = { f0: Math.pow(10, 2.62), p: 5.9, q: 1.17, w: 0.247, v: 11.18 };
const paperP = (S, L, v) => { const fs = PAPER.f0 * Math.pow(v / PAPER.v, PAPER.p) * Math.pow(L, PAPER.q); return 1 / (1 + Math.exp(Math.log10(S / fs) / PAPER.w)); };
const shoreOf = (L, v) => PAPER.f0 * Math.pow(v / PAPER.v, PAPER.p) * Math.pow(L, PAPER.q);

/* ---- the fit ---- */
{
  const cases = [[1, 1, 11.18], [6.677, 1, 4.2505], [0.646, 5.53e-4, 9.70], [400, 1, 14.4], [36.4, 0.0161, 16.48], [2000, 0.6, 13.5]];
  yes('the probability is the paper\'s at six points, to 1e-9', cases.every(([S, L, v]) => Math.abs(airProbability({ S, L, vEsc: v }).P - paperP(S, L, v)) < 1e-9), cases.map(([S, L, v]) => airProbability({ S, L, vEsc: v }).P.toPrecision(4)).join(' '));
  near('Mercury\'s probability of an atmosphere (worked by hand from the paper\'s medians)', airProbability({ S: 6.677, L: 1, vEsc: 4.2505 }).P, 0.0593, 0.0005);
  yes('on the shoreline the probability is one half', Math.abs(airProbability({ S: shoreOf(0.3, 9), L: 0.3, vEsc: 9 }).P - 0.5) < 1e-12);
  yes('one hundredth of a dex inside the shoreline gives 0.5101 and one outside 0.4899', Math.abs(airProbability({ S: shoreOf(1, 8) * Math.pow(10, -0.01), L: 1, vEsc: 8 }).P - 0.51012) < 1e-4 && Math.abs(airProbability({ S: shoreOf(1, 8) * Math.pow(10, 0.01), L: 1, vEsc: 8 }).P - 0.48988) < 1e-4);
  yes('more flux, less air; faster escape, more air; a brighter star at the same flux, more air', airProbability({ S: 30, L: 0.01, vEsc: 12 }).P < airProbability({ S: 20, L: 0.01, vEsc: 12 }).P && airProbability({ S: 20, L: 0.01, vEsc: 13 }).P > airProbability({ S: 20, L: 0.01, vEsc: 12 }).P && airProbability({ S: 20, L: 0.02, vEsc: 12 }).P > airProbability({ S: 20, L: 0.01, vEsc: 12 }).P);
  yes('no fit without all three inputs, or with one at zero', [{ L: 1, vEsc: 1 }, { S: 1, vEsc: 1 }, { S: 1, L: 1 }, { S: 0, L: 1, vEsc: 1 }, { S: 1, L: NaN, vEsc: 1 }].every((x) => airProbability(x) === null));
  yes('the fit\'s sample stops at 1,400 times Earth\'s flux: 1,399 and 1,400 are inside it and 1,401 outside', airProbability({ S: 1399, L: 1, vEsc: 11 }).outside === false && airProbability({ S: 1400, L: 1, vEsc: 11 }).outside === false && airProbability({ S: 1401, L: 1, vEsc: 11 }).outside === true);
}

/* ---- which scenario is drawn ---- */
{
  const at = (d, o = {}) => scenariosFor({ name: 'nobody', S: shoreOf(1, 8) * Math.pow(10, d), L: 1, vEsc: 8, ...o });
  yes('just inside the shoreline a world is drawn with air, just outside it bare', at(-0.01).drawn !== 'bare' && at(0.01).drawn === 'bare', `${at(-0.01).drawn} / ${at(0.01).drawn}`);
  yes('a world the fit gives air is drawn thick when its amount reaches full air, else thin', at(-0.5, { wantThick: true }).drawn === 'thick' && at(-0.5, { wantThick: false }).drawn === 'thin');
  yes('the amount does not change a bare verdict', at(0.5, { wantThick: true }).drawn === 'bare' && at(0.5).by === 'fit');
  yes('with no fit the amount of air decides, and says so', scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, wantAir: false }).drawn === 'bare' && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1, wantAir: true }).drawn === 'thin' && scenariosFor({ name: 'nobody', S: 1, L: null, vEsc: 1 }).by === 'amount');
  // observed first, then the paper's conclusion, then the fit: written as entries the table does not hold
  const x = (s) => ({ s, why: 'test' });
  const ent = (bare, thin, thick, concludes = null) => ({ name: 'nobody', papers: ['zieba23'], concludes, day: null, bare: x(bare), thin: x(thin), thick: x(thick) });
  yes('an observed scenario is drawn even where the fit and the paper say otherwise', at(0.5, { observed: ent('allowed', 'observed', 'allowed', 'bare') }).drawn === 'thin' && at(0.5, { observed: ent('allowed', 'observed', 'allowed', 'bare') }).by === 'observed');
  yes('else the paper\'s conclusion is drawn over the fit', at(-0.5, { observed: ent('allowed', 'allowed', 'allowed', 'bare') }).drawn === 'bare' && at(-0.5, { observed: ent('allowed', 'allowed', 'allowed', 'bare') }).by === 'paper');
  yes('a conclusion the same entry excludes is not drawn: the fit decides', at(-0.5, { observed: ent('excluded', 'allowed', 'allowed', 'bare') }).drawn === 'thin' && at(-0.5, { observed: ent('excluded', 'allowed', 'allowed', 'bare') }).by === 'fit');
  yes('an excluded scenario is never drawn: air by the fit, thick wanted and excluded, gives thin', at(-0.5, { wantThick: true, observed: ent('allowed', 'allowed', 'excluded') }).drawn === 'thin');
  yes('the fit\'s probability is given to allowed scenarios only: bare 1 - P, thin and thick P', (() => { const s = at(-0.2, { observed: ent('allowed', 'allowed', 'excluded') }); const P = s.fit.P; return Math.abs(s.list[0].p - (1 - P)) < 1e-12 && s.list[1].p === P && s.list[2].p === null; })());
  yes('the switchable scenarios are the ones not excluded', drawable(at(0, { observed: ent('excluded', 'allowed', 'observed') })).join() === 'thin,thick');
}

/* ---- the observed table, as read on 2026-11-16 ---- */
const READ = {
  // name: bare, thin, thick (a allowed, x excluded, o observed), the paper's conclusion, the papers
  'TRAPPIST-1 b': ['aaa', 'bare', 'greene23 ducrot25'], 'TRAPPIST-1 c': ['aax', null, 'zieba23'], 'TRAPPIST-1 d': ['aaa', null, 'piaulet25'],
  'TRAPPIST-1 e': ['aaa', null, 'espinoza25 glidden25'], 'LHS 3844 b': ['aax', 'bare', 'kreidberg19 zieba26'], 'GJ 367 b': ['aax', 'bare', 'zhang24'],
  'TOI-1685 b': ['aax', 'bare', 'luque25'], 'GJ 1252 b': ['aaa', 'bare', 'crossfield22'], 'TOI-1468 b': ['aax', 'bare', 'meier25'],
  'LHS 1140 c': ['aax', 'bare', 'fortune25'], 'LTT 3780 b': ['aaa', 'bare', 'allen25'], 'GJ 3929 b': ['aax', 'bare', 'xue25'],
  'GJ 486 b': ['aax', 'bare', 'weiner24'], 'GJ 1132 b': ['aax', 'bare', 'xue24'], 'LTT 1445 A b': ['aax', null, 'wachiraphan25'],
  '55 Cnc e': ['xxo', 'thick', 'hu24'], 'TOI-561 b': ['xxo', 'thick', 'teske25'],
};
const DOI = {
  greene23: '10.1038/s41586-023-05951-7', ducrot25: '10.1038/s41550-024-02428-z', zieba23: '10.1038/s41586-023-06232-z', piaulet25: '10.3847/1538-4357/adf207',
  espinoza25: '10.3847/2041-8213/adf42e', glidden25: '10.3847/2041-8213/adf62e', kreidberg19: '10.1038/s41586-019-1497-4', zieba26: '10.1038/s41550-026-02860-3',
  zhang24: '10.3847/2041-8213/ad1a07', luque25: '10.3847/1538-3881/addb40', crossfield22: '10.3847/2041-8213/ac886b', meier25: '10.1051/0004-6361/202453449',
  fortune25: '10.1051/0004-6361/202554198', allen25: '10.3847/1538-3881/adfc51', xue25: '10.3847/2041-8213/ae2098', weiner24: '10.3847/2041-8213/ad8161',
  xue24: '10.3847/2041-8213/ad72e9', wachiraphan25: '10.3847/1538-3881/adc990', hu24: '10.1038/s41586-024-07432-x', teske25: '10.3847/2041-8213/ae0a4c',
};
const DAY = { 'TRAPPIST-1 c': 380, 'LHS 3844 b': 985, 'GJ 367 b': 1709, 'GJ 1252 b': 1410, 'TOI-1468 b': 1024, 'LHS 1140 c': 561, 'LTT 3780 b': 1143, 'GJ 3929 b': 782, 'GJ 486 b': 865, 'GJ 1132 b': 709, 'LTT 1445 A b': 525, '55 Cnc e': 1796, 'TOI-561 b': 1800 };
{
  const code = { allowed: 'a', excluded: 'x', observed: 'o' };
  yes('the table holds the 17 planets read, and no other', OBSERVED.length === 17 && Object.keys(READ).every((n) => observedOf(n)) && OBSERVED.every((e) => READ[e.name]), OBSERVED.map((e) => e.name).filter((n) => !READ[n]).join(', '));
  for (const e of OBSERVED) {
    const r = READ[e.name] || ['', '', ''];
    const got = SCENARIOS.map((k) => code[e[k].s]).join('');
    yes(`${e.name}: the statuses read in the paper (bare, thin, thick) and its conclusion`, got === r[0] && e.concludes === r[1] && e.papers.join(' ') === r[2], `${got} ${e.concludes} ${e.papers.join(' ')}`);
  }
  yes('every paper has the DOI that was opened, and every DOI is a DOI', Object.entries(DOI).every(([k, d]) => PAPERS[k] && PAPERS[k].doi === d) && Object.keys(PAPERS).length === Object.keys(DOI).length && Object.values(PAPERS).every((x) => /^10\.\d{4,5}\/\S+$/.test(x.doi) && x.cite && x.venue && x.what));
  yes('every scenario of every entry has its reason, written from the paper', OBSERVED.every((e) => e.found && SCENARIOS.every((k) => typeof e[k].why === 'string' && e[k].why.length > 10)));
  yes('the measured day sides are the ones read', OBSERVED.every((e) => (e.day ? e.day.T : undefined) === DAY[e.name] && (!e.day || (e.day.lo > 0 && e.day.hi > 0 && PAPERS[e.day.src] && e.papers.includes(e.day.src)))), OBSERVED.filter((e) => (e.day ? e.day.T : undefined) !== DAY[e.name]).map((e) => e.name).join(', '));
  yes('every reason that names a paper names one of the entry\'s own', OBSERVED.every((e) => SCENARIOS.every((k) => { const m = e[k].why.match(/\(([A-Z][^()]*?) (\d{4})\)$/); return !m || e.papers.some((pk) => PAPERS[pk].cite.startsWith(m[1].split(' ')[0]) && PAPERS[pk].cite.endsWith(m[2])); })));
}

/* ---- the Solar System, by the fit ---- */
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1 };
const sol = (pl_name, pl_rade, pl_masse, pl_orbsmax, pl_orbper) => ({ pl_name, pl_rade, pl_masse, pl_orbsmax, pl_orbper, pl_eqt: null, ...SUN });
const SOL = { Mercury: sol('Mercury', 0.383, 0.0553, 0.387, 87.97), Venus: sol('Venus', 0.949, 0.815, 0.723, 224.7), Earth: sol('Earth', 1, 1, 1, 365.25), Mars: sol('Mars', 0.532, 0.107, 1.524, 687) };
{
  const ph = Object.fromEntries(Object.entries(SOL).map(([k, p]) => [k, physics(p)]));
  yes('Earth and Venus keep air by the fit, both above 0.999', ph.Earth.air.fit.P > 0.999 && ph.Venus.air.fit.P > 0.999 && ph.Earth.air.by === 'fit', `${ph.Earth.air.fit.P} ${ph.Venus.air.fit.P}`);
  yes('Earth and Venus are drawn with thick air', ph.Earth.airKey === 'thick' && ph.Venus.airKey === 'thick');
  near('Mercury does not: the fit gives it 0.059', ph.Mercury.air.fit.P, 0.0593, 0.002);
  yes('Mercury is drawn bare, with no air at all', ph.Mercury.airKey === 'bare' && ph.Mercury.atmDensity === 0);
  yes('Mars keeps air by the fit (0.98) and is drawn with thin air, so it stays a desert', ph.Mars.air.fit.P > 0.97 && ph.Mars.airKey === 'thin' && lookOf(SOL.Mars) === 'desert', `${ph.Mars.air.fit.P.toFixed(3)} ${ph.Mars.airKey}`);
}

/* ---- the bare rock's day side ---- */
{
  const b = bareDay(5772, 1, 0.05);
  near('the hottest point of a bare rock at 0.05 AU from the Sun, A_B 0.1 (K)', b.Tss, 5772 * Math.sqrt(0.00465047 / 0.05) * Math.pow(0.9, 0.25), 1e-6);
  near('its day side is (2/3)^(1/4) of its hottest point', b.Tday / b.Tss, Math.pow(2 / 3, 0.25), 1e-12);
  near('the shader\'s temperature map gives that same day side with a cold night', mapDay(2000, 50) / 2000, Math.pow(2 / 3, 0.25), 0.002);
  yes('a warm night raises the day side of the map', mapDay(1000, 900) > mapDay(1000, 50) + 20);
  near('the hottest point found for a measured day side gives it back (K)', mapDay(tsubForDay(1796, 1175), 1175), 1796, 0.5);
  yes('no open melt with the hottest point at 1,672 K; a small one at 1,674 K', pondAngle(1672) === 0 && pondAngle(1674) > 0 && pondAngle(1674) < 5, `${pondAngle(1674).toFixed(2)} degrees`);
  near('the melt reaches arccos[(1673 / 2000)^4] = 60.7 degrees from the point under the star', pondAngle(2000), Math.acos(Math.pow(1673 / 2000, 4)) * 180 / Math.PI, 1e-9);
  yes('no day side without the star or the orbit', bareDay(NaN, 1, 1) === null && bareDay(5000, 1, 0) === null);
}

/* ---- the catalogue ---- */
const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
const by = new Map(list.map((p) => [p.name, p]));
{
  // every observed planet is in the catalogue, drawn with a surface, and comes out as observed
  for (const e of OBSERVED) {
    const p = by.get(e.name);
    if (!p) { yes(`${e.name} is in the catalogue`, false); continue; }
    const ph = physics(p), want = e.thick.s === 'observed' ? 'thick' : e.concludes || (ph.air.fit.P >= 0.5 ? 'thin' : 'bare');
    const prm = toParams(p);
    const airOk = want === 'bare' ? prm.hasAtmo === 0 && ph.atmDensity === 0 : prm.hasAtmo === 1 && ph.atmDensity >= AIR_THIN;
    yes(`${e.name} is drawn as observed: ${want}`, !ph.isGiant && ph.airKey === want && airOk && ph.air.observed === e, `${ph.airKey} ${lookOf(p)} hasAtmo ${prm.hasAtmo}`);
  }
  // what the paper excluded is never drawn, even when asked for, and the line says it is excluded
  for (const e of OBSERVED) {
    const p = by.get(e.name); if (!p) continue;
    const out = SCENARIOS.filter((k) => e[k].s === 'excluded');
    const line = airLine(physics(p).air);
    yes(`${e.name}: each exclusion is listed as excluded and cannot be drawn`, out.every((k) => physics(p, { air: k }).airKey !== k && statusIn(line, k) === 'excluded') && SCENARIOS.filter((k) => statusIn(line, k) === 'excluded').length === out.length, line);
  }
  // the day sides: the bare-rock model against every measurement of a world drawn bare, and the atmosphere's sign
  const bareMeasured = OBSERVED.filter((e) => e.day && physics(by.get(e.name)).airKey === 'bare');
  const z = (e) => { const ph = physics(by.get(e.name)), m = bareDay(ph.Teff, ph.Rstar, ph.a).Tday, d = e.day; return (m - d.T) / (m > d.T ? d.hi : d.lo); };
  yes('ten worlds drawn bare have a measured day side', bareMeasured.length === 10, bareMeasured.map((e) => e.name).join(', '));
  yes('the bare-rock model (A_B 0.1, f = 2/3) is within 2.5 sigma of every one of them', bareMeasured.every((e) => Math.abs(z(e)) <= 2.5), bareMeasured.map((e) => `${e.name} ${z(e).toFixed(2)}`).join(', '));
  near('LHS 3844 b: the model\'s day side against JWST\'s 985 K (K)', bareDay(physics(by.get('LHS 3844 b')).Teff, physics(by.get('LHS 3844 b')).Rstar, physics(by.get('LHS 3844 b')).a).Tday, 985, 2.5 * 16);
  near('GJ 367 b: the model\'s day side against the measured 1,709 K (K)', bareDay(physics(by.get('GJ 367 b')).Teff, physics(by.get('GJ 367 b')).Rstar, physics(by.get('GJ 367 b')).a).Tday, 1709, 92);
  const cnc = physics(by.get('55 Cnc e')), toi = physics(by.get('TOI-561 b'));
  yes('55 Cnc e and TOI-561 b: the measured day side is over 3 sigma below the bare-rock model, the sign of their air', (bareDay(cnc.Teff, cnc.Rstar, cnc.a).Tday - 1796) / 88 > 3 && (bareDay(toi.Teff, toi.Rstar, toi.a).Tday - 1800) / 130 > 3);
  yes('every observed world with a measured day side is drawn at it, to 1 K', OBSERVED.filter((e) => e.day).every((e) => { const prm = toParams(by.get(e.name)); return Math.abs(mapDay(prm.tsub, prm.tnight) - e.day.T) < 1; }));
  yes('and the melt is decided by the measured day side', OBSERVED.filter((e) => e.day).every((e) => physics(by.get(e.name)).Ttest === e.day.T));
  yes('GJ 367 b, at 1,709 K, has an open melt under its star; LHS 3844 b, at 985 K, has none', lookOf(by.get('GJ 367 b')) === 'molten' && pondAngle(toParams(by.get('GJ 367 b')).tsub) > 30 && lookOf(by.get('LHS 3844 b')) === 'airless' && pondAngle(toParams(by.get('LHS 3844 b')).tsub) === 0, `${pondAngle(toParams(by.get('GJ 367 b')).tsub).toFixed(1)} degrees`);

  // the famous worlds that lose their air in the picture
  const famous = { 'TRAPPIST-1 e': 0.0040, 'TRAPPIST-1 f': 0.0427, 'TRAPPIST-1 g': 0.171, 'Proxima Cen b': 0.143 };
  for (const [n, P] of Object.entries(famous)) {
    const ph = physics(by.get(n));
    yes(`${n} is drawn as airless rock, the fit giving it air at ${(P * 100).toPrecision(2)}%`, ph.airKey === 'bare' && lookOf(by.get(n)) === 'airless' && Math.abs(ph.air.fit.P - P) < P * 0.02, `${ph.airKey} ${lookOf(by.get(n))} ${ph.air.fit.P.toPrecision(3)}`);
  }
  yes('the world the survey opens on, Kepler-442 b, keeps its seas (air over 99.9%)', lookOf(by.get('Kepler-442 b')) === 'temperate' && physics(by.get('Kepler-442 b')).air.fit.P > 0.999);

  // every rocky world: its scenarios, their status and their probabilities
  const rocky = list.filter((p) => !physics(p).isGiant);
  let fewer = 0, noP = 0, sumBad = 0, unnamed = 0, noWord = 0;
  for (const p of rocky) {
    const ph = physics(p), sc = ph.air;
    const open = sc.list.filter((x) => x.status !== 'excluded');
    if (!sc.observed && open.length < 2) fewer++;
    if (sc.fit && sc.list.some((x) => x.status === 'allowed' && x.p === null)) noP++;
    if (!sc.observed && Math.abs(sc.list[0].p + sc.list[1].p - 1) > 1e-12) sumBad++;
    const line = airLine(sc);
    if (!SCENARIOS.every((k) => statusIn(line, k) === (k === ph.airKey ? 'drawn' : sc.list.find((x) => x.key === k).status))) unnamed++;
    if (sc.fit && !sc.observed && !/2026 fit, extrapolated/.test(line)) noWord++;
  }
  yes(`every one of the ${rocky.length} rocky worlds with no observation keeps at least two scenarios`, rocky.length > 1500 && fewer === 0, `${fewer} with fewer`);
  yes('every allowed scenario carries the fit\'s probability', noP === 0, `${noP} without`);
  yes('bare rock and air add up to one', sumBad === 0);
  yes('the line names all three scenarios for every rocky world, each in a sentence that gives its status', unnamed === 0, `${unnamed} lines miss one`);
  yes('the line marks every unobserved world\'s probability as extrapolated', noWord === 0);
  yes('no giant has scenarios: its look is its cloud tops', list.filter((p) => physics(p).isGiant).every((p) => physics(p).air === null));
}

/* ---- the line ---- */
/* The status a line gives a scenario: the one sentence that names it (in any case) starts with "Drawn" or ends with
   its status. Null when no sentence names it, or more than one does. */
function statusIn(line, key) {
  const name = { bare: 'bare rock', thin: 'thin air', thick: 'thick air' }[key];
  const sentences = line.split(/(?<=\.) /).filter((s) => !/^(Observed by|The 2026 fit|Not observed|No fit)/.test(s));
  // "Drawn with thin air, by your choice; the survey draws bare rock." names bare rock only as the survey's own choice
  const own = sentences.filter((s) => { const at = s.toLowerCase().indexOf(name); return at >= 0 && !(s.includes('; the survey draws') && at > s.indexOf(';')); });
  if (own.length !== 1) return null;
  if (/^Drawn /.test(own[0])) return 'drawn';
  const m = own[0].match(/ (excluded|allowed|observed)\.$/);
  return m ? m[1] : null;
}
const PCT = [0.0004, 0.0006, 0.004, 0.0099, 0.0101, 0.143, 0.9899, 0.9901, 0.997, 0.9994, 0.9996];
{
  const line = (n, shown) => airLine(physics(by.get(n)).air, shown);
  yes('an unobserved world: drawn, the other two allowed, not observed, the fit with both numbers', line('Proxima Cen b') === 'Drawn as bare rock. Thin air and thick air allowed. Not observed. The 2026 fit, extrapolated: bare rock 86%, air 14%.', line('Proxima Cen b'));
  yes('an observed world whose thick air is excluded', line('LHS 3844 b') === 'Drawn as bare rock. Thin air allowed. Thick air excluded. Observed by Kreidberg 2019 and Zieba 2026. The 2026 fit, extrapolated: bare rock 99.7%, air 0.3%, of which only thin air is allowed.', line('LHS 3844 b'));
  yes('an observed atmosphere, with nothing left for the fit', line('55 Cnc e') === 'Drawn with thick air, as observed. Bare rock and thin air excluded. Observed by Hu 2024.', line('55 Cnc e'));
  yes('a scenario chosen by the visitor says what the survey would draw', line('TRAPPIST-1 e', 'thin') === 'Drawn with thin air, by your choice; the survey draws bare rock. Bare rock and thick air allowed. Observed by Espinoza 2025 and Glidden 2025. The 2026 fit, extrapolated: bare rock 99.6%, air 0.4%.', line('TRAPPIST-1 e', 'thin'));
  yes('a world past the fit\'s sample says so', / The 2026 fit, extrapolated past its sample: /.test(line('K2-141 b')));
  yes('no part of the line is joined by a middle dot', ['Proxima Cen b', 'LHS 3844 b', '55 Cnc e', 'TRAPPIST-1 b'].every((n) => !line(n).includes('·')));
  yes('the links of the line are the scenario names alone', ['Proxima Cen b', 'LHS 3844 b', 'LTT 1445 A b'].every((n) => airParts(physics(by.get(n)).air).filter((x) => x.air).every((x) => /^(bare rock|thin air|thick air)$/i.test(x.t))));
  yes('three papers would be joined as "a, b and c"', airLine(scenariosFor({ name: 'nobody', S: 10, L: 1, vEsc: 11, observed: { name: 'nobody', papers: ['zieba23', 'hu24', 'teske25'], concludes: null, day: null, bare: { s: 'allowed' }, thin: { s: 'allowed' }, thick: { s: 'allowed' } } })).includes('Observed by Zieba 2023, Hu 2024 and Teske 2025.'));
  yes('the switchable parts are the allowed and observed scenarios not drawn', airParts(physics(by.get('LHS 3844 b')).air).filter((x) => x.air).map((x) => x.air).join() === 'thin' && airParts(physics(by.get('55 Cnc e')).air).filter((x) => x.air).length === 0);
  yes('percentages: two digits in the middle, one decimal near the ends, and the extremes said in words', PCT.map(percent).join(' ') === 'under 0.1% 0.1% 0.4% 1.0% 1% 14% 99% 99.0% 99.7% 99.9% over 99.9%', PCT.map(percent).join(' '));
  const x = (s) => ({ s, why: 'test' });
  const sc = scenariosFor({ name: 'nobody', S: 10, L: 1, vEsc: 11, observed: { name: 'nobody', papers: ['zieba23'], concludes: null, day: null, bare: x('allowed'), thin: x('observed'), thick: x('excluded') } });
  yes('an observed scenario not drawn is named as observed and can be switched back to', airLine(sc, 'bare') === 'Drawn as bare rock, by your choice; the survey draws thin air. Thin air observed. Thick air excluded. Observed by Zieba 2023. The 2026 fit, extrapolated: bare rock 0.2%.' && airParts(sc, 'bare').some((p) => p.air === 'thin'), airLine(sc, 'bare'));
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
  const t1b = by.get('TRAPPIST-1 b'), t1ph = physics(t1b);
  near('a locked bare rock with no measured day side is drawn with the model\'s hottest point: TRAPPIST-1 b (K)', toParams(t1b).tsub, t1ph.Teff * Math.sqrt(t1ph.Rstar * 0.00465047 / t1ph.a) * Math.pow(0.9, 0.25), 1e-6);
  const g = toParams(by.get('GJ 367 b')), gph = physics(by.get('GJ 367 b')), luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  near('its glow under the star: (1 - 0.1) (T / T_ss)^4 of the starlight, in the eye\'s share of each spectrum', luma(g.glow), 0.9 * Math.pow(g.tsub / gph.bare.Tss, 4) * photopicFraction(g.tsub) / photopicFraction(gph.Teff), 1e-9);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
