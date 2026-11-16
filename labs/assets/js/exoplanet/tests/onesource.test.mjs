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
     the search query.js parseQuestion, its habitable-zone reading
   and fails when
   - two views print numbers for one quantity (the starlight, the
     equilibrium temperature and its 68% range, the luminosity)
     that no single value rounds to, or one view prints a number
     where another says there is none;
   - the printed equilibrium temperature is not the one the
     printed starlight gives (T = 278.3 K S^(1/4) (1 - A)^(1/4));
   - two views put one planet in two zones: the words of each view,
     where view D draws its orbit against the zone (inner edge to
     outer edge in AU), and the zone the search's words claim for
     the worlds it finds;
   - a view that names the zone of a star outside the fit's
     2,600 to 7,200 K does not say "extrapolated", or says it of
     one inside.
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
import { loadSnapshot } from '../catalog.js';
import { sheetRows, reticleZone } from '../views/target.js';
import { systemModel, systemCaption } from '../views/system.js';
import { compareHTML, chainHTML } from '../panels.js';
import { facts, deterministicNote } from '../report.js';
import { hitFact } from '../find.js';
import { parseQuestion } from '../query.js';
import { PHYS, TEQ, KOPPARAPU } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
const yes = (name, cond, detail = '') => { cond ? passed++ : failed++; console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };

const json = JSON.parse(readFileSync(join(here, '../../../data/exomania/pscomppars-snapshot.json'), 'utf8'));
globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
const { list } = await loadSnapshot();
const A = TEQ.albedo;
const T0 = PHYS.T_SUN * Math.sqrt(PHYS.R_SUN_KM / PHYS.AU_KM / 2);   // 278.3 K
// the bench's reference column, as main.js builds it; only the planet's own column is read
const EARTH = { name: 'Earth', host: 'Sun', idx: -1, R: 1, Rerr: 0, M: 1, Mprov: 'Mass', Mlim: 0, P: 365.25, a: 1, ecc: 0.0167, S: 1, Teq: 255,
  Teff: 5772, Rs: 1, Ms: 1, logL: 0, dist: null, method: null, year: null, refs: {}, measuredR: true, lim: {},
  pl_name: 'Earth', hostname: 'Sun', pl_rade: 1, pl_masse: 1, pl_orbsmax: 1, pl_orbper: 365.25, pl_eqt: 255, st_teff: 5772, st_rad: 1, st_mass: 1, sy_dist: null };

/* ---------- reading printed text ---------- */

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';
/* A printed number with the interval its rounding leaves: "0.750" is 0.7495 to 0.7505, "1,783" 1,782.5 to 1,783.5. */
function printed(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const d = (t.split('.')[1] || '').length;
  const v = +t, h = 0.5 * Math.pow(10, -d);
  return { s: String(s), v, lo: v - h, hi: v + h };
}
const firstNum = (s, after = '') => { const m = String(s || '').match(new RegExp(after + NUM)); return m ? printed(m[1]) : null; };
const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const benchCell = (html, head) => { const m = html.match(new RegExp(`<tr><th>${head}</th><td>.*?</td><td>(.*?)</td></tr>`)); return m ? strip(m[1]) : null; };
const chainStep = (html, head) => { const m = html.match(new RegExp(`<li><b>${head}</b> <code>.*?</code> <span class="ch-v">(.*?)</span>`)); return m ? strip(m[1]) : null; };
const NONE = /^(—|none|unknown|needs |not computable|no )/;

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

function views(p) {
  const rows = sheetRows(p, A), all = [...rows.measured, ...rows.inferred];
  const row = (k) => all.find((r) => r.key === k) || null;
  const bench = compareHTML([p], EARTH, A), chain = chainHTML(p, A);
  const f = facts(p, A), note = deterministicNote(p, f);
  const out = { S: [], Slo: [], Shi: [], T: [], Tlo: [], Thi: [], L: [], zone: [], extrap: [] };
  const put = (q, view, text, num) => { out[q].push({ view, text: String(text ?? ''), n: num, none: num === null && NONE.test(String(text ?? '').trim()) }); };
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
  const lS = hitFact(p, 'S');
  if (!/published|archive/.test(lS)) { const m = lS.match(new RegExp(`, ${NUM} S⊕$`)); put('S', 'list', lS, m ? printed(m[1]) : null); }
  const dS = models.get(p).cap.match(new RegExp(`${NUM} S⊕`));
  if (dS) put('S', 'view D', dS[1], printed(dS[1]));

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
  const lT = hitFact(p, 'T');
  if (!/published|archive/.test(lT)) { const m = lT.match(new RegExp(`, ${NUM} K(?: computed)?$`)); if (m || /no equilibrium temperature$/.test(lT)) put('T', 'list', lT, m ? printed(m[1]) : null); }

  // the luminosity
  const st = row('star');
  const sL = st && st.note ? st.note.match(new RegExp(`luminosity is ${NUM} L☉`)) : null;
  if (sL) put('L', 'sheet B', sL[1], printed(sL[1]));
  const cL = chainStep(chain, 'Luminosity');
  if (cL !== null) put('L', 'chain', cL, firstNum(cL));
  const dL = models.get(p).cap.match(new RegExp(`L ${NUM} L☉`));
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
  for (const q of ['S', 'Slo', 'Shi', 'T', 'Tlo', 'Thi', 'L']) {
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

const ex = (xs) => `${xs.length}${xs.length ? `; first: ${xs.slice(0, 4).join(' || ')}` : ''}`;
console.log(`${list.length} planets, ${list.filter((p) => byHost.get(p.host).length > 1).length} in systems of two or more`);
yes('no two views print numbers for one quantity that no one value rounds to', bad.numbers.length === 0, ex(bad.numbers));
yes('no view prints a number where another says there is none', bad.none.length === 0, ex(bad.none));
yes('the equilibrium temperature on the sheet is the one its starlight gives', bad.teqFromS.length === 0, ex(bad.teqFromS));
yes('no planet is in two zones across sheet A, sheet B, the bench, the note, the chain and view D', bad.zones.length === 0, ex(bad.zones));
yes('every view that names a zone names one of the four, or unknown', bad.words.length === 0, ex(bad.words));
yes('view D, opened on another planet of the system, draws each planet in its own zone or names it with its own', bad.siblings.length === 0, ex(bad.siblings));
yes(`the search for habitable planets claims for each world it finds the zone its sheet gives (${found.length} found; the note: ${q.notes.join('; ')})`, misnamed.length === 0, ex(misnamed.map((p) => `${p.name} (${own.get(p)})`)));
yes('every view that names the zone of a star outside 2,600 to 7,200 K says extrapolated, and no other does', bad.extrap.length === 0, ex(bad.extrap));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
