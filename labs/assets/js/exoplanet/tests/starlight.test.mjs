/* ============================================================
   The rules of starlight.js, on cases with known answers. Run
   from the repository root:
     node labs/assets/js/exoplanet/tests/starlight.test.mjs
   No browser, no catalogue: starlight.mutants.test.mjs runs this
   file on a copy of the lab with one rule broken at a time, so it
   stays fast. The catalogue-wide test is onesource.test.mjs.
   ============================================================ */

import * as L from '../starlight.js';
import { KOPPARAPU, MC } from '../config.js';

let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (name, got, want, tol) => yes(name, Number.isFinite(got) && Math.abs(got - want) <= tol, `${got} (want ${want} ± ${tol})`);
const K = KOPPARAPU;
const block = (name, f) => { try { f(); } catch (e) { failed++; console.log(`FAIL  ${name} stopped on an error: ${e && e.message}`); } };

/* ---------- the luminosity and the orbit ---------- */
block('the luminosity and the orbit', () => {
  const sun = L.luminosity({ Teff: 5772, Rs: 1, logL: 0.3 });
  yes('the luminosity is R² (Teff / 5772 K)⁴ when the radius and temperature are given, whatever the archive lists', sun.L === 1 && sun.src === 'R and Teff' && Math.abs(sun.archive - Math.pow(10, 0.3)) < 1e-12);
  near('a star of half the radius at the same temperature has a quarter of the luminosity', L.luminosity({ Teff: 5772, Rs: 0.5 }).L, 0.25, 1e-12);
  near('a star twice as hot, sixteen times', L.luminosity({ Teff: 11544, Rs: 1 }).L, 16, 1e-12);
  yes('with no radius the archive\'s log L is used', L.luminosity({ Teff: 5772, Rs: null, logL: -1 }).src === 'archive' && Math.abs(L.luminosity({ Teff: 5772, Rs: null, logL: -1 }).L - 0.1) < 1e-12);
  yes('with no temperature the archive\'s log L is used', L.luminosity({ Teff: null, Rs: 1, logL: -1 }).src === 'archive');
  yes('a radius or temperature of zero is not a star\'s', L.luminosity({ Teff: 5772, Rs: 0, logL: -1 }).src === 'archive' && L.luminosity({ Teff: 0, Rs: 1, logL: -1 }).src === 'archive');
  yes('a value given as a string, or not finite, is not a star\'s', L.luminosity({ Teff: '5772', Rs: 1 }).src === 'none' && L.luminosity({ Teff: 5772, Rs: Infinity }).src === 'none' && L.starlight({ name: 'str', host: 'Str', Teff: '5772', Rs: 1, a: 1 }).src === 'none');
  yes('with neither there is none', L.luminosity({ Teff: null, Rs: null, logL: null }).L === null && L.luminosity({}).src === 'none');
  yes('the archive\'s luminosity is named when it is more than 1.2 times the computed one, either way, and not at 1.2', !L.luminosityDiffers({ L: 1, archive: 1.2, src: 'R and Teff' }) && L.luminosityDiffers({ L: 1, archive: 1.2001, src: 'R and Teff' })
    && !L.luminosityDiffers({ L: 1.2, archive: 1, src: 'R and Teff' }) && L.luminosityDiffers({ L: 1.2001, archive: 1, src: 'R and Teff' }) && !L.luminosityDiffers({ L: 1, archive: 3, src: 'archive' }) && !L.luminosityDiffers({ L: 1, archive: null, src: 'R and Teff' }));
  yes('the orbit is the archive\'s, else Kepler\'s third law', L.semiMajor({ a: 0.5, P: 365.25, Ms: 1 }).a === 0.5 && L.semiMajor({ a: null, P: 365.25, Ms: 8 }).a === 2 && L.semiMajor({ a: null, P: 365.25, Ms: 8 }).src === "Kepler's third law" && L.semiMajor({ a: null, P: 365.25 }).a === null && L.semiMajor({ a: null, Ms: 1 }).src === 'none');
});

/* ---------- the starlight ---------- */
const earth = { name: 'Earth', host: 'Sun', Teff: 5772, Rs: 1, a: 1, S: null };
block('the starlight', () => {
  const s = L.starlight(earth);
  yes('Earth receives 1 S⊕, from its star, with no range when nothing has an error', s.S === 1 && s.src === 'star' && s.lo === null && s.hi === null && s.archive === null && s.ratio === null);
  yes('the same record gives the same answer, once computed', L.starlight(earth) === s && L.insolation === L.starlight);
  near('half the distance, four times the starlight', L.starlight({ name: 'x', host: 'Sun', Teff: 5772, Rs: 1, a: 0.5 }).S, 4, 1e-12);
  near('twice the radius, four times the starlight', L.starlight({ name: 'x', host: 'Big', Teff: 5772, Rs: 2, a: 1 }).S, 4, 1e-12);
  near('a star twice as hot, sixteen times', L.starlight({ name: 'x', host: 'Hot', Teff: 11544, Rs: 1, a: 1 }).S, 16, 1e-12);
  near('the orbit from Kepler\'s law serves when the archive has none', L.starlight({ name: 'x', host: 'K', Teff: 5772, Rs: 1, a: null, P: 365.25, Ms: 8 }).S, 0.25, 1e-12);
  const hd = L.starlight({ name: 'HD-like b', host: 'HD-like', Teff: 5772, Rs: 1, a: 0.5, S: 0.9 });
  yes('the archive\'s insolation is kept beside the computed one, and its ratio', hd.src === 'star' && hd.S === 4 && hd.archive === 0.9 && Math.abs(hd.ratio - 0.225) < 1e-12);
  const noR = L.starlight({ name: 'x', host: 'noR', Teff: 5772, Rs: null, a: 1, S: 0.7, logL: 0 });
  yes('with the star\'s radius missing, the archive\'s insolation', noR.src === 'archive' && noR.S === 0.7 && noR.ratio === 1 && noR.lo === null);
  yes('with the temperature or the orbit missing too', L.starlight({ name: 'x', host: 'noT', Teff: null, Rs: 1, a: 1, S: 0.7 }).src === 'archive' && L.starlight({ name: 'x', host: 'noA', Teff: 5772, Rs: 1, a: null, S: 0.7 }).src === 'archive');
  const la = L.starlight({ name: 'x', host: 'la', Teff: null, Rs: null, a: 2, S: null, logL: 0 });
  yes('with no insolation either, the archive\'s luminosity over the orbit', la.src === 'L / a^2' && la.S === 0.25 && la.archive === null);
  yes('an insolation of zero in the archive is no value', L.starlight({ name: 'x', host: 'z', Teff: null, Rs: null, a: null, S: 0 }).src === 'none' && L.starlight({ name: 'x', host: 'z2', Teff: 5772, Rs: 1, a: 1, S: 0 }).archive === null);
  yes('a luminosity with no orbit gives no starlight', L.starlight({ name: 'x', host: 'lo', Teff: null, Rs: null, a: null, logL: 0 }).src === 'none');
  yes('with nothing, none', L.starlight({ name: 'x', host: 'n' }).S === null && L.starlight({ name: 'x', host: 'n2', a: 1 }).src === 'none');
  yes('the archive\'s value is shown beside the computed one past 1.2 times either way, and not at 1.2', !L.archiveDiffers({ src: 'star', ratio: 1.2 }) && L.archiveDiffers({ src: 'star', ratio: 1.2001 }) && !L.archiveDiffers({ src: 'star', ratio: 1 / 1.2 }) && L.archiveDiffers({ src: 'star', ratio: 1 / 1.2001 })
    && !L.archiveDiffers({ src: 'archive', ratio: 3 }) && !L.archiveDiffers({ src: 'star', ratio: null }) && L.ARCHIVE_DIFF === 1.2);
});

/* ---------- its range, and two planets of one star ---------- */
block('its range', () => {
  const p = { name: 'e1', host: 'Err', Teff: 5772, TeffErr: 100, Rs: 1, RsErr: 0.05, a: 1, aErr: 0.01 };
  const s = L.starlight(p);
  yes('with errors, the median and a 68% range that holds it', s.lo < s.S && s.S < s.hi && Math.abs(s.S - 1) < 0.02, `${s.lo} ${s.S} ${s.hi}`);
  // the range of S = R² T⁴ / a² from 1.7% in T, 5% in R and 1% in a: about 12% either side
  near('the range is about 12% either side for 1.7% in T, 5% in R and 1% in a (lower)', (s.S - s.lo) / s.S, 0.115, 0.03);
  near('(upper)', (s.hi - s.S) / s.S, 0.12, 0.03);
  yes('each error alone gives a range', ['TeffErr', 'RsErr', 'aErr'].every((k) => { const q = L.starlight({ name: 'e2', host: `Err ${k}`, Teff: 5772, Rs: 1, a: 1, [k]: k === 'TeffErr' ? 100 : 0.05 }); return q.lo < q.hi; }));
  yes('an error on an orbit from Kepler\'s law is not drawn', L.starlight({ name: 'e3', host: 'Kep', Teff: 5772, Rs: 1, a: null, P: 365.25, Ms: 1, aErr: 0.5 }).lo === null);
  yes('a negative or zero error is none', L.starlight({ name: 'e4', host: 'Neg', Teff: 5772, Rs: 1, a: 1, TeffErr: -5, RsErr: 0, aErr: null }).lo === null);
  const b = { name: 'b', host: 'Two', Teff: 5000, TeffErr: 80, Rs: 0.8, RsErr: 0.04, a: 0.1, aErr: 0.002 }, c = { ...b, name: 'c', a: 0.4, aErr: 0.008 };
  const sb = L.starlight(b), sc = L.starlight(c);
  near('two planets of one star, the orbit\'s error the same share of each: their starlight keeps the ratio of the squares of their orbits', sb.S / sc.S, 16, 1e-9);
  near('and so do their ranges', sb.lo / sc.lo + sb.hi / sc.hi, 32, 1e-9);
  const d = { ...b, name: 'd', host: 'Other', a: 0.4, aErr: 0.008 };
  yes('a star listed with other values, or under another name, draws its own numbers', Math.abs(L.starlight(d).S - sc.S) > 1e-12 || Math.abs(L.starlight(d).lo - sc.lo) > 1e-12);
  const wild = L.starlight({ name: 'w', host: 'Wild', Teff: 3000, TeffErr: 4000, Rs: 0.1, RsErr: 0.5, a: 0.01, aErr: 0.05 });
  yes('draws below zero are left out, and the rest still give a value', Number.isFinite(wild.S) && wild.S > 0 && wild.lo > 0, `${wild.lo} ${wild.S} ${wild.hi}`);
  yes(`the draws are the page's ${MC.draws}`, MC.draws === 400);
  // the draws themselves are fixed: a change to the seed, the order of the deviates, their number or the draws kept moves these
  const pin = (x, want) => Math.abs(x / want - 1) < 1e-12;
  yes('the draws are the same on every machine: a star of 5,772 +- 100 K, 1 +- 0.05 R and 1 +- 0.01 AU', pin(s.S, 1.008575985034472) && pin(s.lo, 0.8936311556338775) && pin(s.hi, 1.1330942133807589), `${s.S} ${s.lo} ${s.hi}`);
  yes('and with most draws below zero left out', pin(wild.S, 23.01414758856151) && pin(wild.lo, 0.08199980977529292) && pin(wild.hi, 796.6230269128189), `${wild.S} ${wild.lo} ${wild.hi}`);
});

/* ---------- the equilibrium temperature from the same draws ---------- */
block('the equilibrium temperature', () => {
  near('T_ZERO is 278.3 K', L.T_ZERO, 278.33, 0.01);
  near('Earth at albedo 0.3: 254.6 K', L.equilibriumTemp(earth, 0.3), 254.6, 0.05);
  near('Earth at albedo 0: 278.3 K', L.equilibriumTemp(earth, 0), 278.33, 0.01);
  near('the default albedo is 0.3', L.equilibriumTemp(earth), 254.6, 0.05);
  near('for the range too', L.teqOf(earth).med, 254.6, 0.05);
  const p = { name: 't', host: 'T', Teff: 4000, TeffErr: 120, Rs: 0.7, RsErr: 0.05, a: 0.05, aErr: 0.001 };
  const s = L.starlight(p), t = L.teqOf(p, 0.3);
  const f = (x) => L.T_ZERO * Math.pow(x * 0.7, 0.25);
  yes('the median and range of Teq are those of S, in kelvin', Math.abs(t.med - f(s.S)) < 0.01 && Math.abs(t.lo - f(s.lo)) < 0.01 && Math.abs(t.hi - f(s.hi)) < 0.01 && t.src === 'star');
  near('and the same as Teff (R / 2a)^½ (1 - A)^¼ with no errors', L.equilibriumTemp({ name: 't2', host: 'T2', Teff: 4000, Rs: 0.7, a: 0.05 }, 0.3), 4000 * Math.sqrt(0.7 * 695700 / 149597870.7 / 0.1) * Math.pow(0.7, 0.25), 1e-6);
  yes('from the archive\'s insolation where the star cannot give one, with no range', L.teqOf({ name: 'x', host: 'tA', Teff: null, S: 1 }, 0.3).src === 'archive' && Math.abs(L.teqOf({ name: 'x', host: 'tA2', Teff: null, S: 1 }, 0.3).med - 254.6) < 0.05 && L.teqOf({ name: 'x', host: 'tA3', S: 1 }).lo === null);
  yes('with no starlight, none', L.teqOf({ name: 'x', host: 'tN' }) === null && L.equilibriumTemp({ name: 'x', host: 'tN2' }) === null);
});

/* ---------- how both are printed ---------- */
block('how both are printed', () => {
  const t = L.starlightText({ S: 0.7503, lo: 0.6, hi: 0.91 });
  yes('the starlight to three figures with its range and unit', t.v === '0.750' && t.pm === '0.600 to 0.910' && t.text === '0.750 S⊕ (68%: 0.600 to 0.910)', JSON.stringify(t));
  yes('without a range, the value alone', L.starlightText({ S: 2658.4, lo: null, hi: null }).text === '2,658 S⊕' && L.starlightText({ S: 2658.4 }).pm === '');
  yes('with no starlight, nothing', L.starlightText({ S: null }).text === '' && L.starlightText({ S: 0 }).v === '');
  const q = L.teqText({ med: 702.6, lo: 662.9, hi: 738.2 });
  yes('the temperature in whole kelvin with its range', q.v === '703' && q.pm === '663 to 738' && q.text === '703 K (68%: 663 to 738)', JSON.stringify(q));
  yes('without a range, the value alone; with none, nothing', L.teqText({ med: 1782.6, lo: null, hi: null }).text === '1,783 K' && L.teqText(null).text === '' && L.teqText({ med: 300, lo: 290, hi: null }).pm === '');
});

/* ---------- what the sheet says about the starlight ---------- */
block('the note', () => {
  const base = 'The starlight is computed from the star\'s temperature, the star\'s radius and the orbit';
  const hd = { name: 'n1', host: 'N1', Teff: 5772, Rs: 1, a: 0.5, S: 0.9 };
  yes('the computed starlight says where it comes from, and names the archive\'s value where it differs', L.starlightNote(hd).startsWith(base) && L.starlightNote(hd).endsWith('The archive lists 0.900 S⊕ (NASA Exoplanet Archive, PSCompPars), 4.4 times less.'), L.starlightNote(hd));
  yes('more, where the archive\'s is larger, and whole from ten times', L.starlightNote({ name: 'n2', host: 'N2', Teff: 5772, Rs: 1, a: 1, S: 1.5 }).endsWith('1.50 S⊕ (NASA Exoplanet Archive, PSCompPars), 1.5 times more.') && L.starlightNote({ name: 'n3', host: 'N3', Teff: 5772, Rs: 1, a: 1, S: 33.5 }).endsWith('34 times more.'),
    L.starlightNote({ name: 'n2', host: 'N2', Teff: 5772, Rs: 1, a: 1, S: 1.5 }));
  yes('and not where the two agree within 1.2 times', !/archive/.test(L.starlightNote({ name: 'n4', host: 'N4', Teff: 5772, Rs: 1, a: 1, S: 1.1 })));
  yes('the archive\'s value says what the archive lacks', L.starlightNote({ name: 'n5', host: 'N5', Teff: 5772, Rs: null, a: 1, S: 0.7 }) === 'The archive\'s insolation (NASA Exoplanet Archive, PSCompPars): it lacks the star\'s radius, so the starlight cannot be computed from the star.'
    && /it lacks the star's temperature and the orbit,/.test(L.starlightNote({ name: 'n6', host: 'N6', Teff: null, Rs: 1, a: null, S: 0.7 })), L.starlightNote({ name: 'n6', host: 'N6', Teff: null, Rs: 1, a: null, S: 0.7 }));
  yes('the archive\'s luminosity over the orbit says so', L.starlightNote({ name: 'n7', host: 'N7', Teff: null, Rs: null, a: 2, logL: 0 }) === 'The starlight is the archive\'s luminosity over the orbit, L / a²: it lacks the star\'s temperature and the star\'s radius and gives no insolation.');
  yes('no starlight, no note', L.starlightNote({ name: 'n8', host: 'N8' }) === '');
});

/* ---------- the habitable zone ---------- */
block('the habitable zone', () => {
  const e = L.zoneEdges(5780);
  yes('at 5,780 K each edge is its first coefficient', e.sInner === K.runaway[0] && e.sOuter === K.maxGreen[0] && e.sInnerOpt === K.recentVenus[0] && e.sOuterOpt === K.earlyMars[0] && !e.extrapolated);
  yes('a temperature outside the fit takes the nearer end of it', L.seff(2000, K.runaway) === L.seff(2600, K.runaway) && L.seff(9000, K.maxGreen) === L.seff(7200, K.maxGreen) && L.seff(2601, K.runaway) !== L.seff(2600, K.runaway) && L.seff(7199, K.runaway) !== L.seff(7200, K.runaway));
  yes('and is extrapolated: below 2,600 K and above 7,200 K, not at either end', L.zoneEdges(2599.9).extrapolated && !L.zoneEdges(2600).extrapolated && !L.zoneEdges(7200).extrapolated && L.zoneEdges(7200.1).extrapolated);
  const T = 3000 - 5780, poly = (c) => c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T + c[4] * T * T * T * T;
  yes('away from 5,780 K every term of the polynomial counts: the edges at 3,000 K', ['runaway', 'maxGreen', 'recentVenus', 'earlyMars'].every((k) => Math.abs(L.seff(3000, K[k]) - poly(K[k])) < 1e-12) && Math.abs(poly(K.runaway) - (poly(K.runaway) - K.runaway[4] * T * T * T * T)) > 0.05, `${L.seff(3000, K.runaway)}`);
  yes('no temperature, no edges', L.zoneEdges(null) === null && L.zoneEdges(undefined) === null);
  const hz = L.habitableZone(earth);
  near('the Sun\'s runaway edge, 0.981 AU', hz.inner, 0.981, 0.003);
  near('its maximum greenhouse edge, 1.689 AU', hz.outer, 1.689, 0.003);
  near('its recent Venus edge, 0.750 AU', hz.innerOpt, 0.750, 0.003);
  near('its early Mars edge, 1.766 AU', hz.outerOpt, 1.766, 0.003);
  yes('placed by the starlight', hz.by === 'S' && hz.S === 1 && hz.L === 1);
  const far = { name: 'f', host: 'F', Teff: 5772, Rs: 1, a: 2, S: 3 };
  near('in AU an edge lies where the planet\'s own starlight would be its flux, a √(S / S_edge)', L.habitableZone(far).inner, 2 * Math.sqrt(L.starlight(far).S / L.zoneEdges(5772).sInner), 1e-12);
  const noOrbit = { name: 'o', host: 'O', Teff: 5772, Rs: 0.5, a: null, logL: 0 };
  yes('with no orbit, by the luminosity', L.habitableZone(noOrbit).by === 'L' && Math.abs(L.habitableZone(noOrbit).inner - Math.sqrt(0.25 / L.zoneEdges(5772).sInner)) < 1e-12 && L.habitableZone(noOrbit).S === null);
  yes('with neither, or no temperature, none', L.habitableZone({ name: 'x', host: 'X', Teff: 5772, S: 1 }) === null && L.habitableZone({ name: 'x', host: 'X2', Teff: null, Rs: 1, a: 1 }) === null);
});

/* ---------- where a planet sits ---------- */
block('where a planet sits', () => {
  const at = (S, Teff = 5780) => L.hzPosition({ name: `at ${S}`, host: `H ${S} ${Teff}`, Teff, Rs: null, a: null, S });
  const e = L.zoneEdges(5780);
  yes('on the conservative edges, conservative', at(e.sInner).key === 'cons' && at(e.sOuter).key === 'cons' && at(0.7).key === 'cons');
  yes('just past them, optimistic', at(e.sInner * 1.0001).key === 'opt' && at(e.sOuter * 0.9999).key === 'opt');
  yes('on the optimistic edges, optimistic; past them, hot and cold', at(e.sInnerOpt).key === 'opt' && at(e.sOuterOpt).key === 'opt' && at(e.sInnerOpt * 1.0001).key === 'hot' && at(e.sOuterOpt * 0.9999).key === 'cold');
  yes('the words of each', at(0.7).label === 'inside the conservative habitable zone' && at(1.5).label === 'inside the optimistic habitable zone' && at(e.sInner * 3).label === '3.0x the flux at the zone\'s inner edge' && at(e.sOuter / 4).label === '4.0x below the flux at the zone\'s outer edge');
  yes('the factor to one decimal, whole from ten, grouped from a hundred', at(e.sInner * 12.4).label.startsWith('12x ') && at(e.sInner * 9.96).label.startsWith('10.0x ') && at(e.sInner * 1234).label.startsWith('1,234x '), at(e.sInner * 12.4).label);
  yes('no temperature or no starlight, unknown', L.hzPosition({ name: 'u', host: 'U', Teff: null, S: 1 }).key === 'unknown' && L.hzPosition({ name: 'u2', host: 'U2', Teff: 5780 }).key === 'unknown' && L.hzPosition({ name: 'u3', host: 'U3' }).label === 'not computable');
  const cold = at(0.5, 2566);
  yes('a star outside the fit says so in the label', cold.extrapolated && cold.key === 'cons' && cold.label === 'inside the conservative habitable zone, extrapolated: the star\'s 2,566 K is outside the 2,600 to 7,200 K the zone was fitted on', cold.label);
  yes('and in every form', L.zoneWords(cold, 'word') === 'conservative, extrapolated' && L.zoneWords(cold, 'reticle') === 'in the conservative habitable zone, extrapolated' && L.zoneWords(cold) === cold.label);
  yes('the sheet\'s words', ['cons', 'opt', 'hot', 'cold', 'unknown'].map((k) => L.zoneWords({ key: k, extrapolated: false }, 'word')).join('|') === 'conservative|optimistic|too hot|too cold|unknown');
  yes('the words under the name', ['cons', 'opt', 'hot', 'cold', 'unknown'].map((k) => L.zoneWords({ key: k, extrapolated: false }, 'reticle')).join('|') === 'in the conservative habitable zone|in the optimistic habitable zone|hotter than the habitable zone|colder than the habitable zone|its zone unknown');
  const hz = { inner: 1, outer: 2, innerOpt: 0.8, outerOpt: 2.2 };
  yes('an orbit is drawn inside the band from its inner to its outer edge, both included', L.placedAt(hz, 1) === 'cons' && L.placedAt(hz, 2) === 'cons' && L.placedAt(hz, 1.5) === 'cons');
  yes('inside the dotted rings past them, both included', L.placedAt(hz, 0.8) === 'opt' && L.placedAt(hz, 2.2) === 'opt' && L.placedAt(hz, 0.9999) === 'opt' && L.placedAt(hz, 2.0001) === 'opt');
  yes('inside or outside both', L.placedAt(hz, 0.7999) === 'hot' && L.placedAt(hz, 2.2001) === 'cold');
  yes('no zone or no orbit, unknown', L.placedAt(null, 1) === 'unknown' && L.placedAt(hz, null) === 'unknown' && L.placedAt(hz, 0) === 'unknown');
  const p = { name: 'self', host: 'Self', Teff: 4500, TeffErr: 90, Rs: 0.7, RsErr: 0.03, a: 0.3, aErr: 0.01 };
  yes('a planet is drawn against its own zone where its starlight places it', L.placedAt(L.habitableZone(p), p.a) === L.hzPosition(p).key, `${L.hzPosition(p).key}`);
  yes('extrapolated words name the fit\'s range', L.extrapolatedWords(7500) === 'extrapolated: the star\'s 7,500 K is outside the 2,600 to 7,200 K the zone was fitted on');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
