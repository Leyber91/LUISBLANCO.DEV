// The parts of labs/exomania-air.html that are numbers and tables, written from the code that draws the planets
// (labs/assets/js/exoplanet/air.js and data.js) on the committed catalogue snapshot.
//
//   node tools/dev/air_article.mjs write    rewrite every marked part of the page
//   node tools/dev/air_article.mjs check    exit 1 when a marked part differs from what the code gives now
//
// A marked part sits between <!-- air:<name> --> and <!-- /air:<name> -->. The prose around them is written by
// hand from the same code; labs/assets/js/exoplanet/tests/air.page.test.mjs runs the check in the gates, so a change
// to a rule that moves a number on the page fails until the page is rewritten.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAB = join(ROOT, 'labs/assets/js/exoplanet');
const PAGE = join(ROOT, 'labs/exomania-air.html');
const imp = (f) => import(pathToFileURL(join(LAB, f)).href);
const { OBSERVED, PAPERS, SCENARIOS, SCENARIO_LABEL, SHORELINE, BARE, MR, V_ESC_EARTH, THICK_FROM, statusOf, bareDay, mapDay, pondAngle, percent, percentRange } = await imp('air.js');
const { DRAWS } = await imp('shoreline.js');
const { physics, lookOf, toParams, LOOKS } = await imp('data.js');
const { loadSnapshot } = await imp('catalog.js');

/* What the survey drew before ticket 2.13: data.js of commit c942fc9 (2026-11-15) run on the same snapshot,
   2026-11-16. Kept as a record: the code that made it is in the history, not in the tree. */
export const BEFORE = {
  commit: 'c942fc9',
  counts: { fluid: 4508, molten: 666, desert: 511, shrouded: 365, airless: 339, temperate: 44, ice: 31 },
  looks: { Mercury: 'airless', Venus: 'shrouded', Earth: 'temperate', Mars: 'desert', 'TRAPPIST-1 b': 'shrouded', 'TRAPPIST-1 c': 'shrouded',
    'TRAPPIST-1 d': 'desert', 'TRAPPIST-1 e': 'temperate', 'TRAPPIST-1 f': 'temperate', 'TRAPPIST-1 g': 'ice', 'TRAPPIST-1 h': 'ice',
    'Proxima Cen b': 'temperate', "Teegarden's Star b": 'temperate', 'Ross 128 b': 'temperate', 'LHS 1140 b': 'temperate', 'TOI-700 d': 'temperate',
    'Kepler-186 f': 'ice', 'Kepler-442 b': 'temperate', 'LHS 3844 b': 'desert', 'LTT 1445 A b': 'shrouded', '55 Cnc e': 'molten' },
};
const WORLDS = ['Mercury', 'Venus', 'Earth', 'Mars', 'TRAPPIST-1 b', 'TRAPPIST-1 c', 'TRAPPIST-1 d', 'TRAPPIST-1 e', 'TRAPPIST-1 f', 'TRAPPIST-1 g',
  'TRAPPIST-1 h', 'Proxima Cen b', "Teegarden's Star b", 'Ross 128 b', 'LHS 1140 b', 'TOI-700 d', 'Kepler-186 f', 'Kepler-442 b', 'LHS 3844 b', 'LTT 1445 A b', '55 Cnc e'];
const LOOK_WORD = { temperate: 'seas and cloud', fluid: 'cloud tops', ice: 'ice', molten: 'molten rock', airless: 'airless rock', desert: 'thin-air desert', shrouded: 'cloud deck' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const { int } = await imp('../kit/format.js');   // the labs' one way of writing a number
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const doiLink = (d) => `<a href="https://doi.org/${esc(d)}">doi:${esc(d)}</a>`;

const SUN = { st_teff: 5772, st_rad: 1, st_mass: 1, Teff: 5772, Rs: 1, Ms: 1 };
const sol = (pl_name, pl_rade, pl_masse, a, pl_orbper) => ({ pl_name, name: pl_name, pl_rade, pl_masse, pl_orbsmax: a, a, pl_orbper, pl_eqt: null, ...SUN });
const SOLAR = { Mercury: sol('Mercury', 0.383, 0.0553, 0.387, 87.97), Venus: sol('Venus', 0.949, 0.815, 0.723, 224.7), Earth: sol('Earth', 1, 1, 1, 365.25), Mars: sol('Mars', 0.532, 0.107, 1.524, 687) };

export async function catalogue() {
  const json = JSON.parse(readFileSync(join(ROOT, 'labs/assets/data/exomania/pscomppars-snapshot.json'), 'utf8'));
  const keep = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, body: null, json: async () => json, headers: { get: () => null } });
  try { return (await loadSnapshot()).list; } finally { globalThis.fetch = keep; }
}

/* ---- the parts ---- */
function observed(by) {
  const rows = OBSERVED.map((e) => {
    const p = by.get(e.name), ph = physics(p), drawn = ph.airKey;
    const sc = SCENARIOS.map((k) => {
      const st = statusOf(e, k), mark = k === drawn ? ' class="drawn"' : '';
      return `<li${mark}><b>${cap(SCENARIO_LABEL[k])}</b>: <span class="st st-${st.s}">${st.s}</span>${k === drawn ? ', <span class="dr">drawn</span>' : ''}. ${esc(st.why)}</li>`;
    }).join('');
    // the paper's own words behind each bound, observation and conclusion, with where they are
    const words = [...(e.observed ? [e.observed] : []), ...(e.concludes ? [e.concludes] : []), ...e.bounds];
    const seen = new Set();
    const quotes = words.filter((w) => !seen.has(w.quote) && seen.add(w.quote)).map((w) => `<li>“${esc(w.quote)}” (${esc(PAPERS[w.paper].cite)}, ${esc(w.where)})</li>`).join('');
    const why = ph.air.by === 'observed' ? 'the scenario observed' : ph.air.by === 'paper' ? 'the paper\'s conclusion' : `the fit: a ${percent(ph.air.fit.P)} chance of air`;
    const day = e.day ? `<p class="obs-day">Day side measured ${int(e.day.T)} K (−${e.day.lo}, +${e.day.hi}; ${esc(PAPERS[e.day.src].cite)}); drawn at ${int(mapDay(toParams(p).tsub, toParams(p).tnight))} K.</p>` : '';
    const papers = e.papers.map((k) => `<li>${esc(PAPERS[k].cite)}, ${esc(PAPERS[k].venue)}. ${esc(PAPERS[k].what)}. ${doiLink(PAPERS[k].doi)}</li>`).join('');
    return `<article class="obs" id="${esc(e.name.replace(/[^A-Za-z0-9]+/g, '-'))}">
  <header class="obs-h"><h3 class="world">${esc(e.name)}</h3><p class="obs-drawn">Drawn ${drawn === 'bare' ? 'as' : 'with'} <b>${SCENARIO_LABEL[drawn]}</b>, by ${why}. Look: ${LOOK_WORD[lookOf(p)]}.</p></header>
  <p class="obs-found">${esc(e.found)}</p>
  <ul class="obs-sc">${sc}</ul>
  <ul class="obs-quotes">${quotes}</ul>
  ${day}<ul class="obs-papers">${papers}</ul>
</article>`;
  });
  return rows.join('\n');
}

function famous(by) {
  const head = '<tr><th>World</th><th>Observed</th><th>Chance of air, and its 68% range</th><th>Drawn before</th><th>Drawn now</th></tr>';
  const rows = WORLDS.map((n) => {
    const p = SOLAR[n] || by.get(n), ph = physics(p), sc = ph.air;
    const obs = sc.observed ? sc.observed.papers.map((k) => PAPERS[k].cite + (PAPERS[k].preprint ? ', a preprint' : '')).join('; ') : 'no';
    return `<tr><th scope="row" class="world">${esc(n)}</th><td>${esc(obs)}</td><td class="num">${percent(sc.fit.P)}, ${percentRange(sc.fit.lo, sc.fit.hi)}${sc.fit.lo < 0.5 && sc.fit.hi > 0.5 ? '; cannot decide' : ''}${sc.minMass ? '; a lower bound' : ''}</td><td>${LOOK_WORD[BEFORE.looks[n]]}</td><td><b>${LOOK_WORD[lookOf(p)]}</b> (${SCENARIO_LABEL[ph.airKey]})</td></tr>`;
  });
  return `<table class="tab"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table>`;
}

function days(by) {
  const rows = OBSERVED.filter((e) => e.day).map((e) => {
    const ph = physics(by.get(e.name)), m = bareDay(ph.Teff, ph.Rstar, ph.a);
    const z = (m.Tday - e.day.T) / (m.Tday > e.day.T ? e.day.hi : e.day.lo);
    return `<tr><th scope="row" class="world">${esc(e.name)}</th><td>${SCENARIO_LABEL[ph.airKey]}</td><td class="num">${int(e.day.T)} K</td><td class="num">${int(m.Tday)} K</td><td class="num">${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)}</td><td class="num">${int(m.Tss)} K</td><td class="num">${pondAngle(toParams(by.get(e.name)).tsub) > 0 ? `${pondAngle(toParams(by.get(e.name)).tsub).toFixed(0)}°` : 'none'}</td></tr>`;
  });
  return `<table class="tab"><thead><tr><th>World</th><th>Drawn</th><th>Day side measured</th><th>Bare-rock model</th><th>Model minus measured, in σ</th><th>Model's hottest point</th><th>Open melt as drawn</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function counts(list) {
  const now = {}, by = { bare: 0, thin: 0, thick: 0 };
  let rocky = 0, observedN = 0;
  for (const p of list) {
    const l = lookOf(p); now[l] = (now[l] || 0) + 1;
    const ph = physics(p);
    if (!ph.isGiant) { rocky++; by[ph.airKey]++; if (ph.air.observed) observedN++; }
  }
  const order = Object.keys(LOOKS);
  const rows = order.map((k) => `<tr><th scope="row">${LOOK_WORD[k]}</th><td class="num">${int(BEFORE.counts[k])}</td><td class="num">${int(now[k] || 0)}</td></tr>`).join('');
  return `<p>Of the ${int(list.length)} planets of the snapshot, ${int(rocky)} are drawn with a surface. They are drawn with bare rock ${int(by.bare)} times, thin air ${int(by.thin)} times and thick air ${int(by.thick)} times; ${int(observedN)} of them by their own observation.</p>
<table class="tab narrow"><thead><tr><th>Look</th><th>Before (${BEFORE.commit})</th><th>Now</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function constants() {
  const K = SHORELINE;
  const med = (a) => { const t = [...a].sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
  return `<table class="tab narrow"><thead><tr><th>Constant</th><th>Median in the paper</th><th>68% interval in the paper</th><th>Median of the draws used</th></tr></thead><tbody>
<tr><th scope="row">log<sub>10</sub>(f<sub>0</sub>/f<sub>⊕</sub>)</th><td class="num">${K.logF0}</td><td class="num">−0.31, +0.45</td><td class="num">${med(DRAWS.logF0).toFixed(3)}</td></tr>
<tr><th scope="row">p (escape speed)</th><td class="num">${K.p}</td><td class="num">−0.43, +0.61</td><td class="num">${med(DRAWS.p).toFixed(3)}</td></tr>
<tr><th scope="row">q (luminosity)</th><td class="num">${K.q}</td><td class="num">−0.20, +0.28</td><td class="num">${med(DRAWS.q).toFixed(3)}</td></tr>
<tr><th scope="row">w (width, dex)</th><td class="num">${K.w}</td><td class="num">ln w = −1.40 (−0.30, +0.32)</td><td class="num">${med(DRAWS.w).toFixed(4)}</td></tr>
</tbody></table>
<table class="tab narrow"><thead><tr><th>Also used</th><th>Value</th><th>Source</th></tr></thead><tbody>
<tr><th scope="row">posterior draws</th><td class="num">${int(DRAWS.n)} of 200,000</td><td>Zenodo record 15858798, doi:10.5281/zenodo.15858798, licence CC BY 4.0; every 100th sample</td></tr>
<tr><th scope="row">v<sub>esc,⊕</sub></th><td class="num">${V_ESC_EARTH} km/s</td><td>NASA Earth fact sheet; the paper rounds it to 11.18</td></tr>
<tr><th scope="row">mass without a measured one</th><td class="num">e<sup>${MR.a}</sup> R<sup>${MR.b}</sup> under ${MR.upTo} R<sub>⊕</sub></td><td>the paper, Figure 1; above it, Chen &amp; Kipping 2017</td></tr>
<tr><th scope="row">thick air from</th><td class="num">${THICK_FROM} bar</td><td>Koll 2022</td></tr>
<tr><th scope="row">the main fit's flux limit</th><td class="num">${int(K.fluxMax)} f<sub>⊕</sub></td><td>the paper, Section II.4</td></tr>
</tbody></table>
<table class="tab narrow"><thead><tr><th>The bare rock</th><th>As used</th><th>Source</th></tr></thead><tbody>
<tr><th scope="row">Bond albedo A<sub>B</sub></th><td class="num">${BARE.albedo}</td><td>Zhang et al. 2024 (about 0.1); Zieba et al. 2026 (0.14, +0.13, −0.14)</td></tr>
<tr><th scope="row">day-side factor f</th><td class="num">2/3</td><td>Koll 2022, eq. 1</td></tr>
<tr><th scope="row">melt lock-up T<sub>lo</sub></th><td class="num">${int(BARE.Tlock)} K</td><td>Kite et al. 2016, eq. 1 and Table 1</td></tr>
<tr><th scope="row">night side</th><td class="num">${BARE.Tnight} K</td><td>Kite et al. 2016, Table 1 (Léger et al. 2011: 50 to 75 K)</td></tr>
</tbody></table>`;
}

function sources() {
  const extra = [
    ['Berta-Thompson, Wachiraphan & Murray 2026', 'ApJ 1011, 123', 'The 3D cosmic shoreline for nurturing planetary atmospheres; arXiv:2507.02136, v2 of 19 March 2026', '10.3847/1538-4357/ae77fd'],
    ['Koll 2022', 'ApJ 924, 134', 'A scaling for atmospheric heat redistribution on tidally locked rocky planets', '10.3847/1538-4357/ac3b48'],
    ['Kite, Fegley, Schaefer & Gaidos 2016', 'ApJ 828, 80', 'Atmosphere-interior exchange on hot, rocky exoplanets', '10.3847/0004-637X/828/2/80'],
    ['Berta-Thompson 2026', 'Zenodo record 15858798', 'posterior samples of the shoreline model, licence CC BY 4.0', '10.5281/zenodo.15858798'],
  ];
  const rows = extra.map(([c, v, t, d]) => `<li>${esc(c)}, ${esc(v)}. ${esc(t)}. ${doiLink(d)}</li>`)
    .concat(Object.values(PAPERS).map((x) => `<li>${esc(x.cite)}, ${esc(x.venue)}. ${esc(x.what)}. ${doiLink(x.doi)}</li>`));
  return `<ol class="src">${rows.join('')}</ol>`;
}

/* Each cell of a table body carries the name of its column, so that a narrow screen can set a row as a block of
   labelled lines (exomania-air.css) instead of a table wider than the screen. */
function labelled(html) {
  return html.replace(/<table([^>]*)><thead><tr>([\s\S]*?)<\/tr><\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/g, (all, attrs, head, body) => {
    const names = [...head.matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    const rows = body.replace(/<tr>([\s\S]*?)<\/tr>/g, (r, cells) => {
      let i = 0;
      return `<tr>${cells.replace(/<(th|td)([^>]*)>([\s\S]*?)<\/\1>/g, (c, tag, a, inner) => { const n = names[i++] || ''; return tag === 'td' ? `<td${a} data-label="${esc(n)}"><span>${inner}</span></td>` : c; })}</tr>`;
    });
    return `<table${attrs}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  });
}

export async function parts() {
  const list = await catalogue();
  const by = new Map(list.map((p) => [p.name, p]));
  return { observed: observed(by), famous: labelled(famous(by)), days: labelled(days(by)), counts: labelled(counts(list)), constants: labelled(constants()), sources: sources(), n: String(OBSERVED.length) };
}

const MARK = /<!-- air:([a-z]+) -->([\s\S]*?)<!-- \/air:\1 -->/g;
export function fill(html, p) {
  return html.replace(MARK, (all, name) => (name in p ? `<!-- air:${name} -->${p[name]}<!-- /air:${name} -->` : all));
}
export function differences(html, p) {
  const out = [], seen = new Set();
  const lf = (t) => t.replace(/\r\n/g, '\n');
  for (const m of lf(html).matchAll(MARK)) { seen.add(m[1]); if (!(m[1] in p)) out.push(`${m[1]}: no such part`); else if (m[2] !== lf(p[m[1]])) out.push(`${m[1]}: differs from what the code gives`); }
  for (const k of Object.keys(p)) if (!seen.has(k)) out.push(`${k}: not marked on the page`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2];
  const html = readFileSync(PAGE, 'utf8'), p = await parts();
  if (mode === 'write') { writeFileSync(PAGE, fill(html, p)); console.log('air_article: written'); }
  else if (mode === 'check') { const d = differences(html, p); d.forEach((x) => console.log(x)); console.log(`air_article: ${d.length} differences`); process.exit(d.length ? 1 : 0); }
  else { console.log('usage: node tools/dev/air_article.mjs write|check'); process.exit(2); }
}
