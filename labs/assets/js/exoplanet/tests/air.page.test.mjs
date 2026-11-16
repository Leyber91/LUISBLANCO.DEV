/* ============================================================
   The article labs/exomania-air.html against the code it
   describes. Run from the repository root:
     node labs/assets/js/exoplanet/tests/air.page.test.mjs

   The tables and lists of the page are written by
   tools/dev/air_article.mjs from air.js and data.js; this test
   fails when any of them differs from what the code gives now
   (rewrite with `node tools/dev/air_article.mjs write`). The
   numbers in the prose are checked here one by one against the
   code, so a sentence cannot keep a number the code dropped.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parts, differences, catalogue } from '../../../../../tools/dev/air_article.mjs';
import { SHORELINE, BARE, OBSERVED, PAPERS, MR, airProbability, V_ESC_EARTH, percent, percentRange, THICKNESS, BASES } from '../air.js';
import { physics } from '../data.js';
import { luminosity } from '../starlight.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../../../exomania-air.html'), 'utf8').replace(/\r\n/g, '\n');   // the checkout's line endings are not the page's
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

const d = differences(html, await parts());
yes('every generated part of the page is what the code gives now', d.length === 0, d.join('; '));

// the prose, sentence by sentence where it holds a number
const text = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const K = SHORELINE;
yes('the formula on the page is the paper\'s, in its constants f0, p, q and w', html.includes('f<sub>shore</sub> / f<sub>⊕</sub> = f<sub>0</sub> (v<sub>esc</sub> / v<sub>esc,⊕</sub>)<sup>p</sup> (L / L<sub>☉</sub>)<sup>q</sup>') && html.includes('P(atmosphere) = 1 / (1 + e<sup>Δ / w</sup>)'));
const T771 = airProbability({ S: 10 ** 1.248, L: 10 ** -2.26, vEsc: V_ESC_EARTH * 10 ** 0.16 }).P * 100;
yes('the Table 1 sentence gives the largest gap as the code computes it', text.includes(`the largest gap is TOI-771 b, ${T771.toFixed(1)}% against 21.6%`) && Math.abs(T771 - 21.6) <= 1, T771.toFixed(2));
yes('the paper\'s mass relation is stated with its constants', text.includes(`M = e−0.025 R3.37 below 1.8 Earth radii`) && MR.a === -0.025 && MR.b === 3.37 && MR.upTo === 1.8);
yes('the meaning of the fit\'s label is quoted from the paper', text.includes('"probably ≲ 10 bar CO2"'));
yes('the fit\'s sample is said to stop at its flux limit', text.includes(`above ${K.fluxMax.toLocaleString('en-US')} times Earth's flux`));
yes('the boundary for a Sun-like star is the normalisation', text.includes(`${Math.round(Math.pow(10, K.logF0))} times Earth's flux`));
yes('the bare rock is described with its constants', text.includes(`Bond albedo ${BARE.albedo}`) && text.includes(`night side is ${BARE.Tnight} K`) && text.includes(`arccos[(${BARE.Tlock.toLocaleString('en-US')} K / Tss)4]`));
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
yes('the observed plate is headed with the number of planets in the table', new RegExp(`${words[OBSERVED.length]} rocky planets with their own observation`, 'i').test(text), `${OBSERVED.length}`);
const labelled = OBSERVED.filter((e) => !['TRAPPIST-1 d', 'TRAPPIST-1 e'].includes(e.name));
yes('the list is the paper\'s 13 without air and 2 with, and TRAPPIST-1 d and e; the fit uses 15 of the 17', labelled.length === 15 && labelled.filter((e) => e.observed).length === 2 && text.includes('13 it labels as having none') && text.includes('2 as having one') && text.includes('to 15 of the 17 planets above (TRAPPIST-1 d and e are not in it'));

const list = await catalogue();
const by = new Map(list.map((p) => [p.name, p]));
// the luminosity the fit reads, as every sheet prints it: from the star's radius and temperature (starlight.js, ticket 2.14)
const logL = (n) => Math.log10(luminosity(by.get(n)).L).toFixed(2).replace('-', '−');
yes('the luminosities of TRAPPIST-1 and Proxima Centauri are the ones the fit reads', luminosity(by.get('TRAPPIST-1 e')).src === 'R and Teff' && text.includes(`TRAPPIST-1 (log L = ${logL('TRAPPIST-1 e')}, from the radius and temperature the archive gives it)`) && text.includes(`Proxima Centauri (${logL('Proxima Cen b')})`), `${logL('TRAPPIST-1 e')} ${logL('Proxima Cen b')}`);
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1 };
const P = (R, M, a) => physics({ pl_name: 'x', pl_rade: R, pl_masse: M, pl_orbsmax: a, a, pl_orbper: 365.25 * Math.pow(a, 1.5), pl_eqt: null, ...SUN }).air.fit.P;
const mars = P(0.532, 0.107, 1.524), mercury = P(0.383, 0.0553, 0.387);
yes('the Solar System sentence holds: Earth and Venus above 0.999, Mars and Mercury as the posterior gives them', P(1, 1, 1) > 0.999 && P(0.949, 0.815, 0.723) > 0.999 && text.includes(`P = ${mars.toFixed(2)}`) && text.includes(`P = ${mercury.toFixed(3)}`), `${mars.toFixed(3)} ${mercury.toFixed(4)}`);
yes('Proxima b\'s note gives its probability', text.includes(`the ${Math.round(physics(by.get('Proxima Cen b')).air.fit.P * 100)}% that follows`) && text.includes(`so the ${Math.round(physics(by.get('Proxima Cen b')).air.fit.P * 100)}% is a lower bound`));
const t1e = physics(by.get('TRAPPIST-1 e')).air.fit, r128 = physics(by.get('Ross 128 b')).air.fit;
yes('plate e quotes the line\'s odds for TRAPPIST-1 e and Ross 128 b as the code gives them', text.includes(`Chance of air ${percent(t1e.P)} (${percentRange(t1e.lo, t1e.hi)})`) && text.includes(`Chance it kept an atmosphere, by the 2026 fit, extrapolated: ${percent(t1e.P)} (68% range ${percentRange(t1e.lo, t1e.hi)})`) && text.includes(`as Ross 128 b's does (${percentRange(r128.lo, r128.hi)})`) && r128.lo < 0.5 && r128.hi > 0.5);
yes('plate e says what the habitable zone does not tell', text.includes('The habitable zone describes the temperature the star gives, and says nothing about whether the planet kept air.'));
yes('the article says what the fit learns from and that it does not say how thick, as the line does (V1)', text.includes('So the fit learns from Solar System bodies with any air and from exoplanets whose eclipses show a thick one, and it does not say how thick.') && THICKNESS.startsWith('The fit learns from Solar System bodies with any air and from exoplanets whose eclipses show a thick one, so it does not say how thick') && text.includes('any air above 10−6 bar, so Mars counts'));
yes('the article defines an exclusion as the code does: every composition considered, or energy balance (V4)', text.includes('when a paper rules it out for every composition it considers, or by energy balance') && BASES.join() === 'composition,energy balance');
yes('no word of the old reading of the fit is left on the page', !/detectable atmosphere|fit counts|the rest is bare/i.test(text));
const nofit = list.filter((p) => { const ph = physics(p); return !ph.isGiant && !ph.air.fit; }).length;
yes('the number of worlds with no fit is the code\'s', text.includes(`and says so: ${nofit} rocky worlds`), `${nofit}`);

// every DOI on the page is one of the papers read, and every paper read is on the page
const dois = new Set([...html.matchAll(/https:\/\/doi\.org\/([^"]+)"/g)].map((m) => m[1]));
const read = new Set([...Object.values(PAPERS).map((x) => x.doi), '10.3847/1538-4357/ae77fd', '10.3847/1538-4357/ac3b48', '10.3847/0004-637X/828/2/80', '10.5281/zenodo.15858798']);
yes('every DOI linked is a paper that was read, and each paper is linked', [...dois].every((x) => read.has(x)) && [...read].every((x) => dois.has(x)), [...dois].filter((x) => !read.has(x)).join(' '));
yes('the page links back to the survey', html.includes('href="exomania-survey.html"'));
// the design revision of 2026-11-16 (BAR_L2.md): no meta strings joined by middle dots (the site's mark in the bar is
// shared chrome and stays), and world names upright, because in Fraunces italic a planet's letter b reads as a 6
const dots = [...html.matchAll(/&middot;|·/g)].length, mark = (html.match(/THE LAB &middot; <b>L212<\/b>/g) || []).length;
yes('no middle dot joins anything on the page but the site\'s mark', dots === mark && mark === 1, `${dots} dots`);
const css = readFileSync(join(here, '../../../css/exomania-air.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');   // the rules, without their comments
const worldRule = (css.match(/\.world \{[^}]*\}/) || [''])[0];
yes('world names are set upright, in Fraunces', /font-style: normal/.test(worldRule) && /Fraunces/.test(worldRule) && !/italic/.test(css), worldRule);
yes('no label on the page is set in tracked capitals by its own stylesheet', !/text-transform:\s*uppercase/.test(css));
yes('no emoji on the page (the Sun sign and the Earth sign are symbols, not emoji)', !/\p{Emoji_Presentation}/u.test(html) && !/\u{FE0F}/u.test(html));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
