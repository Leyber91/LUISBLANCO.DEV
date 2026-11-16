// The planet renderer, judged on the worlds whose looks are known. Run with tools/drive.mjs:
//   node tools/drive.mjs tools/drives/planets.mjs --base http://127.0.0.1:<port> --out <dir> --width 1372 --height 690 --timeout 500
//
// The contact sheet (tools/dev/planet_sheet.html) draws the Solar System through the pipeline every exoplanet
// goes through and measures each tile. This scenario reads those measurements and checks what a picture of
// each planet must show: its kind, its colour, bands where there are bands, black space around it, and how
// much light it returns against the measured geometric albedo. Then it loads the three views of the survey
// page for one world.
import { exomaniaRules } from './exomania.mjs';

const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/* Geometric albedo, NASA planetary fact sheets (nssdc.gsfc.nasa.gov/planetary/factsheet/), read 2026-11-15. */
const GEOMETRIC = { Mercury: 0.142, Venus: 0.689, Earth: 0.434, Mars: 0.170, Jupiter: 0.538, Saturn: 0.499, Uranus: 0.488, Neptune: 0.442 };
/* How far the drawn albedo may sit from the measured one. The renderer shades by Lambert's law, which cannot
   give the backward brightening real planets show at full phase, so the band is wide. Earth is outside it:
   see EARTH_FLOOR. */
const ALBEDO_BAND = [0.70, 1.30];
/* Earth is the one planet whose published values disagree by a factor of two: 0.434 in the fact sheet (the
   synthetic value of Mallama, Krobusek & Pavlov 2017, Icarus 282, 19) and 0.218 in Payne et al. 2026 (PSJ 7, 51;
   arXiv:2508.13368, Table 10).
   The drawn Earth sits at the lower one. The check holds it between that floor and the fact-sheet value. */
const EARTH_FLOOR = 0.18;

export default async function planets(p, { base }) {
  for (const [n, e] of exomaniaRules()) p.invariant(n, e);   // after every step: tools/invariants.mjs, as exomania.mjs registers them
  await p.go(`${base}/tools/dev/planet_sheet.html?set=solar&view=orbit&size=340&cols=4`);
  const ready = await p.until('document.body.dataset.state === "ready"', 240000);
  const sheet = (await p.ev('window.__SHEET__ || []')) || [];
  const by = Object.fromEntries(sheet.map((t) => [t.name, t]));
  p.check('the sheet drew the eight planets', ready && sheet.length === 8, sheet.map((t) => `${t.name}:${t.look}`).join(' '));
  await p.shot('planets-solar');
  if (sheet.length !== 8) return;

  const looks = { Mercury: 'airless', Venus: 'shrouded', Earth: 'temperate', Mars: 'desert', Jupiter: 'fluid', Saturn: 'fluid', Uranus: 'fluid', Neptune: 'fluid' };
  p.check('each planet is drawn as its own kind', Object.entries(looks).every(([n, l]) => by[n].look === l), sheet.map((t) => `${t.name}:${t.look}`).join(' '));
  p.check('every disc is lit over a tenth of its tile at least', sheet.every((t) => t.lit > 0.10), sheet.map((t) => `${t.name} ${t.lit}`).join(' '));
  p.check('space is black in every corner: no nebula, no glare, no ring', sheet.every((t) => t.corner < 6), sheet.map((t) => `${t.name} ${t.corner}`).join(' '));
  p.check('nothing is unlit and no disc is burnt out on average', sheet.every((t) => t.peak > 60 && lum(t.mean) < 235), sheet.map((t) => `${t.name} ${t.peak}`).join(' '));

  const M = (n) => by[n].mean;
  p.check('Mars is red: its red is over 1.5 times its blue', M('Mars')[0] > 1.5 * M('Mars')[2], M('Mars').join(','));
  p.check('Uranus and Neptune are blue-green: blue and green both above red', ['Uranus', 'Neptune'].every((n) => M(n)[2] > M(n)[0] && M(n)[1] > M(n)[0]), `${M('Uranus').join(',')} | ${M('Neptune').join(',')}`);
  p.check('Neptune is bluer than Uranus, by a little', M('Neptune')[2] / M('Neptune')[0] > M('Uranus')[2] / M('Uranus')[0] && M('Neptune')[2] / M('Neptune')[0] < 1.6 * M('Uranus')[2] / M('Uranus')[0], `${(M('Neptune')[2] / M('Neptune')[0]).toFixed(2)} against ${(M('Uranus')[2] / M('Uranus')[0]).toFixed(2)}`);
  p.check('Jupiter and Saturn are warm: red above blue', ['Jupiter', 'Saturn'].every((n) => M(n)[0] > M(n)[2]), `${M('Jupiter').join(',')} | ${M('Saturn').join(',')}`);
  p.check('Mercury is a neutral grey: no channel more than 15% from another', Math.max(...M('Mercury')) < 1.15 * Math.min(...M('Mercury')), M('Mercury').join(','));
  p.check('Earth is bluer than Mars and than Venus', M('Earth')[2] / M('Earth')[0] > M('Mars')[2] / M('Mars')[0] && M('Earth')[2] / M('Earth')[0] > M('Venus')[2] / M('Venus')[0], M('Earth').join(','));
  p.check('Jupiter is banded hardest; Neptune and Venus are nearly smooth', by.Jupiter.banding > 2 * by.Neptune.banding && by.Jupiter.banding > 2 * by.Venus.banding && by.Jupiter.banding > by.Saturn.banding, ['Jupiter', 'Saturn', 'Neptune', 'Venus'].map((n) => `${n} ${by[n].banding}`).join(' '));

  // how much light each disc returns: the star behind the camera, the film skipped, the mean of the disc
  await p.go(`${base}/tools/dev/planet_sheet.html?set=solar&view=orbit&size=340&cols=4&phase=full&raw=1`);
  const ready2 = await p.until('document.body.dataset.state === "ready"', 240000);
  const full = (await p.ev('window.__SHEET__ || []')) || [];
  const A = Object.fromEntries(full.map((t) => [t.name, t.albedo ? lum(t.albedo) : NaN]));
  const table = Object.keys(GEOMETRIC).map((n) => `${n} ${Number.isFinite(A[n]) ? A[n].toFixed(3) : '?'} of ${GEOMETRIC[n]} (x${(A[n] / GEOMETRIC[n]).toFixed(2)})`).join('; ');
  p.check('the full-phase sheet drew and was measured', ready2 && full.length === 8 && Object.values(A).every(Number.isFinite), table);
  const others = Object.keys(GEOMETRIC).filter((n) => n !== 'Earth');
  p.check(`seven planets return between ${ALBEDO_BAND[0]} and ${ALBEDO_BAND[1]} times their measured geometric albedo`, others.every((n) => A[n] / GEOMETRIC[n] >= ALBEDO_BAND[0] && A[n] / GEOMETRIC[n] <= ALBEDO_BAND[1]), table);
  p.check(`Earth returns between ${EARTH_FLOOR} and its fact-sheet albedo: the two published values are 0.218 and 0.434`, A.Earth >= EARTH_FLOOR && A.Earth <= GEOMETRIC.Earth, `${A.Earth.toFixed(3)}`);
  p.check('Venus returns the most light; Mercury and Mars the least', Object.keys(A).every((n) => A.Venus >= A[n]) && ['Earth', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].every((n) => A[n] > A.Mercury && A[n] > A.Mars), table);

  // two lava worlds whose star fills a large part of their sky: space behind them must still be black
  await p.go(`${base}/tools/dev/planet_sheet.html?set=exo&view=orbit&size=340&cols=2&names=${encodeURIComponent('K2-141 b|55 Cnc e')}`);
  const ready3 = await p.until('document.body.dataset.state === "ready"', 240000);
  const lava = (await p.ev('window.__SHEET__ || []')) || [];
  p.check('two lava worlds are drawn molten, lit, and with black space in the corners (the star\'s corona does not light the sky)', ready3 && lava.length === 2 && lava.every((t) => t.look === 'molten' && t.lit > 0.1 && t.corner < 6), lava.map((t) => `${t.name} ${t.look} lit ${t.lit} corner ${t.corner}`).join('; '));
  await p.shot('planets-lava');

  // the live page, as a visitor gets it (no ?still): programs are built when needed, a notice stands while one
  // builds, and it goes when the view stops waiting
  const state = `(() => ({ note: (document.getElementById('exo-note') || {}).textContent || '', fail: !!document.getElementById('exo-fail'), on: (document.querySelector('[data-cam].on') || { dataset: {} }).dataset.cam || '', bezel: (document.getElementById('bezel') || {}).textContent || '', ground: !!document.getElementById('ground') && !document.getElementById('ground').hidden }))()`;
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('Kepler-442 b')}`);
  await p.until('(() => { const n = document.getElementById("ret-name"); return !!n && n.textContent.trim() === "Kepler-442 b"; })()', 60000);
  const up = await p.until('!document.getElementById("exo-note") && !document.getElementById("exo-fail")', 120000);
  p.check('live: the world comes up and the build notice is gone', up, JSON.stringify(await p.ev(state)));
  await p.ev('document.querySelector(\'[data-cam="surface"]\').click()');
  const landed = await p.until('/surface/i.test((document.getElementById("bezel") || {}).textContent || "") && !document.getElementById("exo-note")', 180000);
  const s1 = await p.ev(state);
  p.check('live: landing shows the ground, with its panel, and no notice is left', landed && s1.on === 'surface' && s1.ground && !s1.fail && !s1.note, JSON.stringify(s1));
  await p.ev('document.querySelector(\'[data-cam="closeorbit"]\').click()');
  await p.sleep(1500);
  const s2 = await p.ev(state);
  p.check('live: leaving for the low pass shows it, closes the ground panel and leaves no notice', s2.on === 'closeorbit' && /low pass/i.test(s2.bezel) && !s2.ground && !s2.note && !s2.fail, JSON.stringify(s2));
  // another kind of world, not built yet in this page: the choice must end with that world named and no notice
  await p.go(`${base}/labs/exomania-survey.html?p=${encodeURIComponent('Kepler-442 b')}`);
  await p.until('!document.getElementById("exo-note") && (document.getElementById("ret-name") || {}).textContent === "Kepler-442 b"', 120000);
  await p.ev('(() => { const q = document.getElementById("q"); q.value = "HD 209458 b"; q.dispatchEvent(new Event("input", { bubbles: true })); q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()');
  const swapped = await p.until('(document.getElementById("ret-name") || {}).textContent === "HD 209458 b" && !document.getElementById("exo-note")', 120000);
  p.check('live: choosing a world of another kind ends on that world with no notice left', swapped, JSON.stringify(await p.ev(state)));

  // the three views of one world on the page itself: each must come up in its mode with the look named, and no failure notice
  const modes = { orbit: /orbit/i, closeorbit: /low pass/i, surface: /ground|surface|elev/i };
  for (const view of ['orbit', 'closeorbit', 'surface']) {
    await p.go(`${base}/labs/exomania-survey.html?still&p=${encodeURIComponent('Kepler-442 b')}${view !== 'orbit' ? `&view=${view}` : ''}`);
    const named = await p.until('(() => { const n = document.getElementById("ret-name"); return !!n && n.textContent.trim() === "Kepler-442 b"; })()', 60000);
    await p.sleep(view === 'surface' ? 8000 : 4000);
    const st = await p.ev(`(() => ({ bezel: (document.getElementById('bezel') || {}).textContent || '', render: (document.getElementById('ret-render') || {}).textContent || '', ground: !!document.getElementById('ground') && !document.getElementById('ground').hidden, fail: !!document.getElementById('exo-fail'), on: (document.querySelector('[data-cam].on') || { dataset: {} }).dataset.cam || '' }))()`);
    p.check(`the ${view} view of Kepler-442 b comes up in its mode, named as a temperate world, with no failure notice`,
      named && !st.fail && st.on === view && /temperate world with seas/.test(st.render) && (view === 'surface') === st.ground && (view === 'surface' || modes[view].test(st.bezel)), JSON.stringify(st));
    await p.shot(`planets-${view}`);
  }
}
