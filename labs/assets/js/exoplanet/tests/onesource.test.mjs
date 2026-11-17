/* ============================================================
   One number, one source (ticket 2.14): the catalogue-wide test.
   Run from the repository root:
     node labs/assets/js/exoplanet/tests/onesource.test.mjs

   For every planet of the committed snapshot it reads what each
   view of the survey prints, from the same pure functions the
   views call:
     sheet A    views/target.js reticleZone
     sheet B    views/target.js sheetRows
     the bench  panels.js compareHTML
     the chain  panels.js chainHTML
     the note   report.js facts and deterministicNote
     the list   find.js hitFact
     view D     views/system.js systemModel and systemCaption,
                opened on every planet of the system in turn
     the CSV    export.js csvText
     the search query.js parseQuestion, its habitable-zone reading
     the tour   tours.js tourStops, its widest orbit
   and the bench and sheet B again at a second albedo, and fails
   when
   - two views print numbers for one quantity (the starlight, the
     equilibrium temperature and its 68% range, the luminosity)
     that no single value rounds to, or one view prints a number
     where another says there is none;
   - the printed equilibrium temperature is not the one the
     printed starlight gives (T = 278.3 K S^(1/4) (1 - A)^(1/4));
   - the orbit printed on sheet B, in the chain and in the note is
     not the one view D draws (one a for every view, ticket 2.14 and
     labs/assets/data/exomania/backtest_orbit.py);
   - two views put one planet in two zones: the words of each view,
     where view D draws its orbit against the zone (inner edge to
     outer edge in AU), and the zone the search's words claim for
     the worlds it finds;
   - a view that names the zone of a star outside the fit's
     2,600 to 7,200 K does not say "extrapolated", or says it of
     one inside;
   - a view reads nothing: each prints how many values it gave
     for each quantity, and one that gave none fails (a pattern
     that stops matching the view's words would otherwise pass);
   - a system is kept in another order than its orbits, or the
     tour of extreme orbits names another widest orbit.
   A number the page labels as the archive's ("published", "the
   archive lists") is a source, not the page's value, and is not
   read as one. That the page's DOM prints what these functions
   return is checked in a browser by tools/drives/onesource.mjs.

   Written first and run on main's behaviour (main with the pure
   functions above taken out of the views, numbers unchanged),
   where it failed; see the pull request.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadSnapshot, provisionalMeasured } from '../catalog.js';
import { sheetRows, reticleZone } from '../views/target.js';
import { systemModel, systemCaption } from '../views/system.js';
import { compareHTML, chainHTML } from '../panels.js';
import { facts, deterministicNote } from '../report.js';
import { hitFact, kindLine } from '../find.js';
import { csvText } from '../export.js';
import { tourStops } from '../tours.js';
import { byOrbit, semiMajor, STASSUN, starlightCensus, luminosity, luminosityApart, LUMINOSITY_SPLIT } from '../starlight.js';
import { CIRCUMBINARY } from '../config.js';
import { parseQuestion } from '../query.js';
import { PHYS, TEQ, KOPPARAPU } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
const A = TEQ.albedo, A2 = 0.1;   // the default albedo, and a second one the bench and sheet B must both follow
const T0 = PHYS.T_SUN * Math.sqrt(PHYS.R_SUN_KM / PHYS.AU_KM / 2);   // 278.3 K
// the bench's reference column, as main.js builds it; only the planet's own column is read
const EARTH = { name: 'Earth', host: 'Sun', idx: -1, R: 1, Rerr: 0, M: 1, Mprov: 'Mass', Mlim: 0, P: 365.25, a: 1, ecc: 0.0167, S: 1, Teq: 255,
  Teff: 5772, Rs: 1, Ms: 1, logL: 0, dist: null, method: null, year: null, refs: {}, measuredR: true, lim: {},
  pl_name: 'Earth', hostname: 'Sun', pl_rade: 1, pl_masse: 1, pl_orbsmax: 1, pl_orbper: 365.25, pl_eqt: 255, st_teff: 5772, st_rad: 1, st_mass: 1, sy_dist: null };

/* ---------- reading printed text ---------- */

/* A printed number: digits grouped by commas, with decimals, and below 0.001 a power of ten (starlight.js starNum). */
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?(?: × 10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)';
const SUP = { '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
/* A printed number with the interval its rounding leaves: "0.750" is 0.7495 to 0.7505, "1,783" 1,782.5 to 1,783.5,
   "2.60 × 10⁻⁷" 2.595e-7 to 2.605e-7; a CSV's "2.6e-7" likewise. */
function printed(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/,/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(?: × 10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)|e([+-]?\d+))?$/);
  if (!m) return null;
  const d = (m[1].split('.')[1] || '').length, e = m[2] ? +[...m[2]].map((c) => SUP[c]).join('') : m[3] ? +m[3] : 0;
  const v = +m[1] * Math.pow(10, e), h = 0.5 * Math.pow(10, e - d);
  return { s: String(s), v, lo: v - h, hi: v + h };
}
const firstNum = (s, after = '') => { const m = String(s || '').match(new RegExp(after + NUM)); return m ? printed(m[1]) : null; };
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const benchCell = (html, head) => { const m = html.match(new RegExp(`<tr><th>${head}</th><td>.*?</td><td>(.*?)</td></tr>`)); return m ? strip(m[1]) : null; };
const chainStep = (html, head) => { const m = html.match(new RegExp(`<li><b>${head}</b> <code>.*?</code> <span class="ch-v">(.*?)</span>`)); return m ? strip(m[1]) : null; };
const NONE = new RegExp(`^(${String.fromCharCode(0x2014)}|none|unknown|needs |not computable|no )`);   // the dash is the views' mark for no value

/* the zone each view's words name */
const fromLabel = (s) => (/inside the conservative habitable zone/.test(s) ? 'cons' : /inside the optimistic habitable zone/.test(s) ? 'opt'
  : /the flux at the zone's inner edge/.test(s) ? 'hot' : /below the flux at the zone's outer edge/.test(s) ? 'cold' : /not computable/.test(s) ? 'unknown' : null);
const fromReticle = (s) => (/^in the conservative/.test(s) ? 'cons' : /^in the optimistic/.test(s) ? 'opt' : /^hotter than/.test(s) ? 'hot' : /^colder than/.test(s) ? 'cold' : /unknown/.test(s) ? 'unknown' : null);
const fromWord = (s) => (/^conservative/.test(s) ? 'cons' : /^optimistic/.test(s) ? 'opt' : /^too hot/.test(s) ? 'hot' : /^too cold/.test(s) ? 'cold' : /^unknown/.test(s) ? 'unknown' : null);
/* where view D draws an orbit of size a against a zone: inside the filled band (the conservative edges), inside the dotted
   rings (the optimistic edges), or inside or outside both */
const drawnAt = (hz, a) => (!hz || !(a > 0) ? 'unknown' : a >= hz.inner && a <= hz.outer ? 'cons' : a >= hz.innerOpt && a <= hz.outerOpt ? 'opt' : a < hz.innerOpt ? 'hot' : 'cold');
const WORDS = { cons: 'in the conservative habitable zone', opt: 'in the optimistic habitable zone', hot: 'hotter than', cold: 'colder than' };

/* ---------- what every view prints, for one planet ---------- */

const byHost = new Map();
for (const p of list) { if (!byHost.has(p.host)) byHost.set(p.host, []); byHost.get(p.host).push(p); }
const models = new Map();   // view D opened on each planet
for (const p of list) { const sys = byHost.get(p.host); const m = systemModel(p, sys); models.set(p, { m, cap: systemCaption(m, false) }); }

/* the CSV's columns, read by name: a quoted field may hold a comma */
const csvSplit = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (q) { if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const CSV_HEAD = csvSplit(csvText([], A).trim().split('\n').pop());
/* a CSV number keeps five significant figures (export.js): the interval its rounding leaves */
const csvNum = (s) => { const v = +s; if (!(v > 0)) return null; const h = 0.5 * Math.pow(10, Math.floor(Math.log10(v)) - 4); return { s, v, lo: v - h, hi: v + h }; };
const csvRow = (p, albedo) => { const v = csvSplit(csvText([p], albedo).trim().split('\n').pop()); return Object.fromEntries(CSV_HEAD.map((h, i) => [h, v[i]])); };

/* how many values each view gave for each quantity, over the catalogue */
const counts = {};
const count = (q, view) => { const k = `${q}|${view}`; counts[k] = (counts[k] || 0) + 1; };

function views(p) {
  const rows = sheetRows(p, A), all = [...rows.measured, ...rows.inferred];
  const row = (k) => all.find((r) => r.key === k) || null;
  const bench = compareHTML([p], EARTH, A), chain = chainHTML(p, A);
  const f = facts(p, A), note = deterministicNote(p, f), csv = csvRow(p, A);
  const out = { S: [], Slo: [], Shi: [], T: [], Tlo: [], Thi: [], T2: [], L: [], a: [], zone: [], extrap: [] };
  const put = (q, view, text, num) => { if (num) count(q, view); out[q].push({ view, text: String(text ?? ''), n: num, none: num === null && NONE.test(String(text ?? '').trim()) }); };
  const rangeOf = (s) => { const m = String(s || '').match(new RegExp(`${NUM} to ${NUM}`)); return m ? [printed(m[1]), printed(m[2])] : null; };

  // the starlight
  const sr = row('S');
  if (sr) { put('S', 'sheet B', sr.v, printed(sr.v)); const r = rangeOf(sr.pm); if (r) { put('Slo', 'sheet B', r[0].s, r[0]); put('Shi', 'sheet B', r[1].s, r[1]); } }
  const bS = benchCell(bench, 'Insolation');
  if (bS !== null) { put('S', 'bench', bS, firstNum(bS)); const r = rangeOf(bS); if (r) { put('Slo', 'bench', r[0].s, r[0]); put('Shi', 'bench', r[1].s, r[1]); } }
  const cS = chainStep(chain, 'Insolation');
  if (cS !== null) { put('S', 'chain', cS, firstNum(cS)); const r = rangeOf(cS); if (r) { put('Slo', 'chain', r[0].s, r[0]); put('Shi', 'chain', r[1].s, r[1]); } }
  const nS = note.match(new RegExp(`It receives ${NUM} times the sunlight Earth does, (.*?)\\.(?: [A-Z]|$)`));
  if (nS) put('S', 'note', nS[1], printed(nS[1]));
  // the list: the value after the kind, so that "no insolation" is read as none whatever the kind says
  const lS = hitFact(p, 'S').slice(kindLine(p).length + 2);
  if (!/published|archive/.test(lS)) { const m = lS.match(new RegExp(`^${NUM} S⊕$`)); put('S', 'list', lS, m ? printed(m[1]) : null); }
  const dS = models.get(p).cap.match(new RegExp(`${NUM} S⊕`));
  if (dS) put('S', 'view D', dS[1], printed(dS[1]));
  if (csv.insolation_Searth_page) put('S', 'CSV', csv.insolation_Searth_page, csvNum(csv.insolation_Searth_page));

  // the equilibrium temperature
  const tr = row('teq');
  if (tr) { put('T', 'sheet B', tr.v, printed(tr.v)); const r = rangeOf(tr.pm); if (r) { put('Tlo', 'sheet B', r[0].s, r[0]); put('Thi', 'sheet B', r[1].s, r[1]); } }
  const bT = benchCell(bench, 'Teq');
  if (bT !== null) { put('T', 'bench', bT, firstNum(bT)); const r = rangeOf(bT); if (r) { put('Tlo', 'bench', r[0].s, r[0]); put('Thi', 'bench', r[1].s, r[1]); } }
  const cT = chainStep(chain, 'Teq');
  if (cT !== null) {
    put('T', 'chain', cT, firstNum(cT));
    const m = cT.match(new RegExp(`${NUM}(?:-| to )${NUM}\\)`)); if (m) { put('Tlo', 'chain', m[1], printed(m[1])); put('Thi', 'chain', m[2], printed(m[2])); }
  }
  if (f.teq_this_page_K !== null && f.teq_this_page_K !== undefined) put('T', 'note facts', f.teq_this_page_K, printed(String(f.teq_this_page_K)));
  const lT = hitFact(p, 'T').slice(kindLine(p).length + 2);
  if (!/published|archive|own heat/.test(lT)) { const m = lT.match(new RegExp(`^${NUM} K$`)); put('T', 'list', lT, m ? printed(m[1]) : null); }
  if (csv.teq_this_page_K) put('T', 'CSV', csv.teq_this_page_K, csvNum(csv.teq_this_page_K));
  // a second albedo: the bench and sheet B must both follow the visitor's
  const t2 = (sheetRows(p, A2).inferred.find((r) => r.key === 'teq') || {}).v;
  if (t2 && t2 !== 'none') put('T2', 'sheet B', t2, printed(t2));
  const bT2 = benchCell(compareHTML([p], EARTH, A2), 'Teq');
  if (bT2 !== null) put('T2', 'bench', bT2, firstNum(bT2));

  // the orbit: printed on sheet B, in the chain and the note, and drawn by view D (the value itself, unrounded)
  const ar = row('a');
  if (ar && printed(ar.v)) put('a', 'sheet B', ar.v, printed(ar.v));
  const cA = chainStep(chain, 'Orbit');
  const cAi = chain.match(new RegExp(`<li><b>Orbit</b> <span class="ch-v">${NUM} AU`));
  if (cAi) put('a', 'chain', cAi[1], printed(cAi[1]));
  const nA = note.match(new RegExp(` at ${NUM} AU\\.`));
  if (nA) put('a', 'note', nA[1], printed(nA[1]));
  const drawn = models.get(p).m.planets.find((x) => x.p === p);
  if (drawn) put('a', 'view D, drawn', String(drawn.a), { s: String(drawn.a), v: drawn.a, lo: drawn.a, hi: drawn.a });
  if (csv.a_AU_page) put('a', 'CSV', csv.a_AU_page, csvNum(csv.a_AU_page));

  // the luminosity
  const st = row('star');
  const sL = st && st.note ? st.note.match(new RegExp(`luminosity is ${NUM} L☉`)) : null;
  if (sL) put('L', 'sheet B', sL[1], printed(sL[1]));
  const cL = chainStep(chain, 'Luminosity');
  if (cL !== null) put('L', 'chain', cL, firstNum(cL));
  const dL = models.get(p).cap.match(new RegExp(`luminosity, ${NUM} L☉`));
  if (dL) put('L', 'view D', dL[1], printed(dL[1]));

  // the zone, as each view names it
  const ret = reticleZone(p);
  out.zone.push({ view: 'sheet A', k: fromReticle(ret), text: ret });
  const zr = row('zone');
  if (zr) out.zone.push({ view: 'sheet B', k: fromWord(String(zr.v)), text: `${zr.v} | ${zr.note || ''}` });
  const bZ = benchCell(bench, 'Zone');
  if (bZ !== null) out.zone.push({ view: 'bench', k: fromLabel(bZ), text: bZ });
  if (nS) out.zone.push({ view: 'note', k: fromLabel(nS[2]), text: nS[2] });
  const cZ = chainStep(chain, 'Habitable zone');
  if (cZ !== null) out.zone.push({ view: 'chain', k: fromLabel(cZ), text: cZ });
  const { m, cap } = models.get(p), o = m.planets.find((x) => x.p === p);
  if (m.hz && o) out.zone.push({ view: 'view D, drawn', k: drawnAt(m.hz, o.a), text: `orbit ${o.a} AU, zone ${m.hz.inner} to ${m.hz.outer} AU`, draws: true });
  // every view that names a zone for a known zone, and whether it says extrapolated
  for (const z of out.zone) if (!z.draws && z.k && z.k !== 'unknown') out.extrap.push({ view: z.view, says: /extrapolated/.test(z.text) });
  if (m.hz) out.extrap.push({ view: 'view D, caption', says: /extrapolated/.test(cap) });
  return out;
}

/* ---------- the checks ---------- */

const bad = { numbers: [], none: [], teqFromS: [], zones: [], siblings: [], extrap: [], words: [] };
const show = (xs) => xs.map((x) => `${x.view} "${x.text}"`).join(' | ');
const agree = (xs) => { const ns = xs.map((x) => x.n).filter(Boolean); return !ns.length || Math.max(...ns.map((n) => n.lo)) <= Math.min(...ns.map((n) => n.hi)) + 1e-9; };

for (const p of list) {
  const v = views(p);
  for (const q of ['S', 'Slo', 'Shi', 'T', 'Tlo', 'Thi', 'T2', 'L', 'a']) {
    const xs = v[q];
    if (!agree(xs)) bad.numbers.push(`${p.name} ${q}: ${show(xs)}`);
    if (xs.some((x) => x.n) && xs.some((x) => x.none)) bad.none.push(`${p.name} ${q}: ${show(xs)}`);
  }
  // the printed Teq is what the printed starlight gives, on the sheet
  const S = v.S.find((x) => x.view === 'sheet B' && x.n), T = v.T.find((x) => x.view === 'sheet B' && x.n);
  if (S && T) {
    const k = T0 * Math.pow(1 - A, 0.25);
    const lo = k * Math.pow(Math.max(S.n.lo, 0), 0.25) - 0.5, hi = k * Math.pow(S.n.hi, 0.25) + 0.5;
    if (T.n.v < lo || T.n.v > hi) bad.teqFromS.push(`${p.name}: ${S.text} S⊕ gives ${Math.round(k * Math.pow(S.n.v, 0.25))} K, the sheet prints ${T.text} K`);
  }
  const ks = new Set(v.zone.map((z) => z.k));
  if (ks.size > 1) bad.zones.push(`${p.name}: ${v.zone.map((z) => `${z.view} ${z.k}`).join(', ')}`);
  if (v.zone.some((z) => z.k === null)) bad.words.push(`${p.name}: ${show(v.zone.filter((z) => z.k === null))}`);
  const outside = Number.isFinite(p.Teff) && (p.Teff < KOPPARAPU.tRange[0] || p.Teff > KOPPARAPU.tRange[1]);
  for (const e of v.extrap) if (e.says !== outside) bad.extrap.push(`${p.name} (Teff ${p.Teff} K): ${e.view} ${e.says ? 'says' : 'does not say'} extrapolated`);
}
// view D opened on another planet of the system draws this one against that planet's zone
const own = new Map(list.map((p) => [p, fromWord(String((sheetRows(p, A).inferred.concat(sheetRows(p, A).measured).find((r) => r.key === 'zone') || {}).v || ''))]));
for (const X of list) {
  const { m, cap } = models.get(X);
  if (!m.hz) continue;
  for (const o of m.planets) {
    if (o.p === X) continue;
    const drawn = drawnAt(m.hz, o.a), mine = own.get(o.p);
    if (!mine || mine === 'unknown' || drawn === mine) continue;
    // a planet drawn in another zone than its own is named in the caption with its own
    if (!(cap.includes(o.p.name) && cap.includes(WORDS[mine]))) bad.siblings.push(`${o.p.name} (${mine}) drawn ${drawn} when ${X.name} is open`);
  }
}
// the search: the zone its words claim for every world it finds
const q = parseQuestion('habitable planets');
const claims = new Set(q.notes.some((n) => /optimistic/.test(n)) ? ['cons', 'opt'] : q.notes.some((n) => /habitable zone/.test(n)) ? ['cons'] : []);
const found = list.filter((p) => q.zone && q.zone.includes(own.get(p)));
const misnamed = found.filter((p) => !claims.has(own.get(p)));

// a system in the order of its orbits, as main.js keeps it (byOrbit), is in the order view D draws them
const order = [];
for (const [host, sys] of byHost) {
  if (sys.length < 2) continue;
  const as = byOrbit(sys).map((p) => semiMajor(p).a).filter((a) => a !== null);
  const drawnAs = models.get(sys[0]).m.planets.map((o) => o.a).sort((x, y) => x - y);
  if (as.some((a, i) => i && a < as[i - 1]) || as.join() !== drawnAs.join()) order.push(host);
}
// the tour of extreme orbits names the widest orbit every sheet prints, on copies marked as the page marks them before the
// roster arrives (catalog.js provisionalMeasured), so the sheets above read the records as loaded
const tl = list.map((p) => ({ ...p }));
provisionalMeasured(tl);
const wideStop = tourStops('extreme', tl).find((s) => /widest orbit/.test(s.cap));
const widest = tl.filter((p) => p.measuredR).reduce((w, p) => ((semiMajor(p).a ?? -1) > (semiMajor(w).a ?? -1) ? p : w));
const wideAU = wideStop && wideStop.cap.match(new RegExp(`${NUM} AU`)), wideN = wideAU && printed(wideAU[1]);
const tourOk = wideStop && wideStop.p === widest && wideN && wideN.lo <= semiMajor(widest).a && semiMajor(widest).a <= wideN.hi && wideN.hi - wideN.lo <= 0.01 * semiMajor(widest).a;

// the orbit's two exceptions (backtest_orbit.py): every name of the list is a planet here, and the rules hold for each
const names = new Set(list.map((p) => p.name));
const cbMissing = CIRCUMBINARY.filter((n) => !names.has(n));
const cbKepler = list.filter((p) => CIRCUMBINARY.includes(p.name) && semiMajor(p).src !== 'archive' && semiMajor(p).src !== 'none').map((p) => p.name);
const stassun = list.filter((p) => p.refs && p.refs.star && String(p.refs.star.label).trim() === STASSUN && p.a > 0);
const stKepler = stassun.filter((p) => semiMajor(p).a !== p.a).map((p) => p.name);

const ex = (xs) => `${xs.length}${xs.length ? `; first: ${xs.slice(0, 4).join(' || ')}` : ''}`;
const EXPECT = { S: ['sheet B', 'bench', 'chain', 'note', 'list', 'view D', 'CSV'], Slo: ['sheet B', 'bench', 'chain'], Shi: ['sheet B', 'bench', 'chain'],
  T: ['sheet B', 'bench', 'chain', 'note facts', 'list', 'CSV'], Tlo: ['sheet B', 'bench', 'chain'], Thi: ['sheet B', 'bench', 'chain'], T2: ['sheet B', 'bench'],
  L: ['sheet B', 'chain', 'view D'], a: ['sheet B', 'chain', 'note', 'view D, drawn', 'CSV'] };
// a range is printed only where the snapshot gives every input an error (starlight.js plan); where no planet of the
// catalogue has one, the range readers are held on stand-ins that do (a real planet with every error given), so a
// reader that stops matching the views' words still fails
const census = starlightCensus(list);
const RANGES = ['Slo', 'Shi', 'Tlo', 'Thi'];
const standIns = list.filter((p) => p.TeffErr > 0 && p.RsErr > 0 && p.aErr > 0).slice(0, 25).map((p) => ({ ...p, name: `${p.name} (every error)`, logL: null, P: null }));
const before = Object.fromEntries(RANGES.flatMap((q) => EXPECT[q].map((v) => [`${q}|${v}`, counts[`${q}|${v}`] || 0])));
for (const p of standIns) {
  const m = systemModel(p, [p]); models.set(p, { m, cap: systemCaption(m, false) });
  const v = views(p);
  for (const q of ['S', 'Slo', 'Shi', 'T', 'Tlo', 'Thi', 'T2', 'L', 'a']) { if (!agree(v[q])) bad.numbers.push(`${p.name} ${q}: ${show(v[q])}`); if (v[q].some((x) => x.n) && v[q].some((x) => x.none)) bad.none.push(`${p.name} ${q}: ${show(v[q])}`); }
}
const empty = [];
for (const [q, vs] of Object.entries(EXPECT)) console.log(`${q.padEnd(4)} ${vs.map((v) => { const n = RANGES.includes(q) ? before[`${q}|${v}`] : counts[`${q}|${v}`] || 0; const m = RANGES.includes(q) ? (counts[`${q}|${v}`] || 0) - n : 0; if (!(RANGES.includes(q) ? (census.ranged ? n : m) : n)) empty.push(`${q} from ${v}`); return RANGES.includes(q) ? `${v} ${n} (stand-ins ${m})` : `${v} ${n}`; }).join(', ')}`);
console.log(`the catalogue: ${census.ranged} planets with a range, ${census.point} point values (${census.partial} with an error on some input and not every one); ${standIns.length} stand-ins with every error`);
// the disagreement of a star's two luminosities: the threshold is the 95th percentile of the factor between the two luminosities, at two figures
const apart = list.map((p) => luminosityApart(luminosity(p))).filter((x) => x !== null).sort((x, y) => x - y);
const p95 = apart[Math.floor(0.95 * apart.length)], beyond = list.filter((p) => luminosityApart(luminosity(p)) > LUMINOSITY_SPLIT);
console.log(`${list.length} planets, ${list.filter((p) => byHost.get(p.host).length > 1).length} in systems of two or more`);
yes('no two views print numbers for one quantity that no one value rounds to (the starlight, Teq and its range, the luminosity, the orbit)', bad.numbers.length === 0, ex(bad.numbers));
yes('no view prints a number where another says there is none', bad.none.length === 0, ex(bad.none));
yes('the equilibrium temperature on the sheet is the one its starlight gives', bad.teqFromS.length === 0, ex(bad.teqFromS));
yes('no planet is in two zones across sheet A, sheet B, the bench, the note, the chain and view D', bad.zones.length === 0, ex(bad.zones));
yes('every view that names a zone names one of the four, or unknown', bad.words.length === 0, ex(bad.words));
yes('view D, opened on another planet of the system, draws each planet in its own zone or names it with its own', bad.siblings.length === 0, ex(bad.siblings));
yes(`the search for habitable planets claims for each world it finds the zone its sheet gives (${found.length} found; the note: ${q.notes.join('; ')})`, misnamed.length === 0, ex(misnamed.map((p) => `${p.name} (${own.get(p)})`)));
yes('every view that names the zone of a star outside 2,600 to 7,200 K says extrapolated, and no other does', bad.extrap.length === 0, ex(bad.extrap));
yes('every view gave values for every quantity it prints (the counts above; the ranges from the stand-ins where the catalogue has none)', empty.length === 0 && standIns.length > 0, ex(empty));
yes(`the threshold at which the sheet names a star's two luminosities as disagreeing is the 95th percentile of the factor between its luminosities, at two figures (${p95.toFixed(3)} over ${apart.length} planets; ${beyond.length} planets on ${new Set(beyond.map((p) => p.host)).size} stars past it)`, Math.round(p95 * 10) / 10 === LUMINOSITY_SPLIT && beyond.length > 0, `${p95}`);
yes(`every one of the ${CIRCUMBINARY.length} names of config.js CIRCUMBINARY is a planet of the snapshot`, cbMissing.length === 0 && CIRCUMBINARY.length > 0, ex(cbMissing));
yes('a planet of two stars takes the archive\'s orbit, or none, never Kepler\'s law on one star\'s mass', cbKepler.length === 0, ex(cbKepler));
yes(`every planet whose star's reference is ${STASSUN} takes the archive's orbit (${stassun.length} planets)`, stKepler.length === 0 && stassun.length > 0, ex(stKepler));
yes(`every system of two or more is kept in the order of the orbits view D draws (${[...byHost.values()].filter((x) => x.length > 1).length} systems)`, order.length === 0, ex(order));
yes(`the tour of extreme orbits names the widest orbit every sheet prints (${widest.name}, ${semiMajor(widest).a} AU)`, !!tourOk, wideStop ? wideStop.cap : 'no stop');

// the archive's labels arrive with HTML's character references ("Anglada-Escud&eacute;"; 140 of 2,157 labels on
// 2026-11-17): every label the page reads is letters, and the accented ones are there to be read
const labels = new Set(), escaped = [];
for (const p of list) for (const r of Object.values(p.refs || {})) if (r && r.label) labels.add(r.label);
for (const l of labels) if (/&(#x?[0-9a-fA-F]+|[A-Za-z]+);/.test(l)) escaped.push(l);
const accented = [...labels].filter((l) => /[À-ɏ]/.test(l));
yes(`no reference label the page reads keeps a character reference (${labels.size} labels; ${accented.length} with an accented letter, e.g. ${accented.slice(0, 2).join(', ')})`, escaped.length === 0 && accented.length > 0, ex(escaped));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
