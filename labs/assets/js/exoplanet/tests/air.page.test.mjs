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
import { SHORELINE, BARE, OBSERVED, PAPERS } from '../air.js';
import { physics } from '../data.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../../../exomania-air.html'), 'utf8');
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

const d = differences(html, await parts());
yes('every generated part of the page is what the code gives now', d.length === 0, d.join('; '));

// the prose, sentence by sentence where it holds a number
const text = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const K = SHORELINE;
yes('the formula on the page carries the fit\'s constants', html.includes(`10<sup>${K.logF0}</sup> (v<sub>esc</sub> / ${K.vEscEarth} km/s)<sup>${K.p}</sup> (L / L<sub>☉</sub>)<sup>${K.q}</sup>`) && html.includes(`e<sup>Δ / ${K.w}</sup>`));
yes('the fit\'s sample is said to stop at its flux limit', text.includes(`above ${K.fluxMax.toLocaleString('en-US')} times Earth's flux`));
yes('the boundary for a Sun-like star is the normalisation', text.includes(`${Math.round(Math.pow(10, K.logF0))} times Earth's flux`));
yes('the bare rock is described with its constants', text.includes(`Bond albedo ${BARE.albedo}`) && text.includes(`night side is ${BARE.Tnight} K`) && text.includes(`arccos[(${BARE.Tlock.toLocaleString('en-US')} K / Tss)4]`));
const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
yes('the observed plate is headed with the number of planets in the table', new RegExp(`${words[OBSERVED.length]} rocky planets with their own observation`, 'i').test(text), `${OBSERVED.length}`);
const labelled = OBSERVED.filter((e) => !['TRAPPIST-1 d', 'TRAPPIST-1 e'].includes(e.name));
yes('the list is the paper\'s 13 without air and 2 with, and TRAPPIST-1 d and e', labelled.length === 15 && labelled.filter((e) => e.thick.s === 'observed').length === 2 && text.includes('13 it labels as having none') && text.includes('2 as having one'));

const list = await catalogue();
const by = new Map(list.map((p) => [p.name, p]));
const logL = (n) => by.get(n).logL.toFixed(2).replace('-', '−');
yes('the luminosities of TRAPPIST-1 and Proxima Centauri are the archive\'s', text.includes(`TRAPPIST-1 (log L = ${logL('TRAPPIST-1 e')} in the archive)`) && text.includes(`Proxima Centauri (${logL('Proxima Cen b')})`), `${logL('TRAPPIST-1 e')} ${logL('Proxima Cen b')}`);
const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1 };
const P = (R, M, a) => physics({ pl_name: 'x', pl_rade: R, pl_masse: M, pl_orbsmax: a, pl_orbper: 365.25 * Math.pow(a, 1.5), pl_eqt: null, ...SUN }).air.fit.P;
const mars = P(0.532, 0.107, 1.524), mercury = P(0.383, 0.0553, 0.387);
yes('the Solar System sentence holds: Earth and Venus above 0.999, Mars 0.98, Mercury 0.059', P(1, 1, 1) > 0.999 && P(0.949, 0.815, 0.723) > 0.999 && text.includes(`P = ${mars.toFixed(2)}`) && text.includes(`P = ${mercury.toFixed(3)}`), `${mars.toFixed(3)} ${mercury.toFixed(4)}`);
yes('Proxima b\'s note gives its probability', text.includes(`the ${Math.round(physics(by.get('Proxima Cen b')).air.fit.P * 100)}% that follows`));

// every DOI on the page is one of the papers read, and every paper read is on the page
const dois = new Set([...html.matchAll(/https:\/\/doi\.org\/([^"]+)"/g)].map((m) => m[1]));
const read = new Set([...Object.values(PAPERS).map((x) => x.doi), '10.3847/1538-4357/ae77fd', '10.3847/1538-4357/ac3b48', '10.3847/0004-637X/828/2/80']);
yes('every DOI linked is a paper that was read, and each paper is linked', [...dois].every((x) => read.has(x)) && [...read].every((x) => dois.has(x)), [...dois].filter((x) => !read.has(x)).join(' '));
yes('the page links back to the survey', html.includes('href="exomania-survey.html"'));
yes('no emoji on the page (the Sun sign and the Earth sign are symbols, not emoji)', !/\p{Emoji_Presentation}/u.test(html) && !/\u{FE0F}/u.test(html));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
