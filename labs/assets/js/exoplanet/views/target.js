/* ============================================================
   views/target.js: sheet B, the numbers, set as a paper's table
   (three rules, values aligned, sources lettered, notes numbered)
   with each interval drawn on one shared log axis, as a forest
   plot draws its studies (bar sheet BAR_L2, shapes 01 and 02).
   Where a number comes from is its line type: continuous measured,
   dashed derived by a formula, chain estimated by a relation or by
   Monte Carlo over the catalogue's errors, phantom illustrative.
   A measured value's tick is gold. A value with no interval stands
   as a bare tick.

   It also writes the one live number of sheet A (the radius, with
   its interval) and holds the world's two actions: "Add to log",
   the page's one filled control, and "pin to compare".
   ============================================================ */

import {
  forecastFor, massFromRadiusMean, hasTrueMass, sizeClassOf, hasRadius, limitOf, limitKind, limitText, hzPosition, insolation,
  semiMajor, luminosity, starColour, spectralType, skyView, monteCarlo, isNum,
} from '../science.js';
import { starlightText, starlightNote, teqText, zoneWords, archiveDiffers, luminosityDiffers, orbitNote, orbitDiffers, starNum } from '../starlight.js';
import { TEQ, VALLEY, MC, LIMIT_FIELDS, CHEN_KIPPING, KOPPARAPU, PHYS } from '../config.js';
import { fmt, fmtInt } from './common.js';
import { el } from '../../kit/dom.js';
import { ivSvg, ivAxisSvg } from '../../kit/controls.js';
import { interval, range as span } from '../../kit/format.js';

/* "+0.11 −0.18", or "±0.11" when the two sides agree to 15%: the kit's one interval, in the table and the live number */
const errText = (e1, e2) => interval(e1, e2);
const range = (s, d = 2) => (s ? span(s.lo, s.hi, d) : '');
/* an archive bound as a value: "< 6.2" */
const boundV = (L, d = 3) => limitText(L, d).replace(/\s*[A-Za-z⊕☉°]+$/, '');

/* ---------- what sheet B prints, as rows: pure, so tests/onesource.test.mjs reads it for every planet ---------- */

function measuredRows(p, A) {
  const L = luminosity(p), a = semiMajor(p), S = insolation(p), rf = p.refs || {}, rows = [];
  if (hasRadius(p)) {
    rows.push({ key: 'R', n: 'radius', v: fmt(p.R, 3), u: 'R\u2295', pm: errText(p.Rerr1, p.Rerr2), refs: [rf.R], kind: p.measuredR === false ? 'e' : 'm',
      note: [p.measuredR === false ? 'The radius is the archive\'s estimate from the mass.' : '', classNote(p, A)].filter(Boolean).join(' '), iv: { value: p.R, lo: isNum(p.Rerr2) ? p.R - Math.abs(p.Rerr2) : null, hi: isNum(p.Rerr1) ? p.R + Math.abs(p.Rerr1) : null } });
  } else if (limitOf(p, 'R')) {
    const RL = limitOf(p, 'R');
    rows.push({ key: 'R', n: 'radius', v: boundV(RL), u: 'R⊕', pm: limitKind(RL), refs: [rf.R], note: 'A bound, not a measurement: no radius is measured.', iv: false });
  } else rows.push({ key: 'R', n: 'radius', v: 'none', pm: 'no radius measured', iv: false });
  const ML = limitOf(p, 'M');
  if (ML) rows.push({ key: 'M', n: 'mass', v: boundV(ML), u: 'M⊕', pm: limitKind(ML), refs: [rf.M], note: 'A bound, not a measurement: the mass is never used as this value.', iv: false });
  else if (!isNum(p.M)) rows.push({ key: 'M', n: 'mass', v: 'none', pm: 'not measured', iv: false });
  else if (p.Mprov === 'M-R relationship') rows.push({ key: 'M', n: 'mass', v: fmt(p.M, 3), u: 'M⊕', pm: 'estimated', kind: 'e', refs: [rf.M], note: 'The archive\'s estimate from the radius, not a measurement.', iv: { value: p.M } });
  else rows.push({ key: 'M', n: p.Mprov === 'Msini' ? 'mass (min.)' : 'mass', v: fmt(p.M, 3), u: 'M⊕', pm: errText(p.Merr1, p.Merr2), refs: [rf.M], kind: 'm',
    note: p.Mprov === 'Msini' ? 'A minimum mass, M sin i: the tilt of the orbit is not known.' : '', iv: { value: p.M, lo: isNum(p.Merr2) ? p.M - Math.abs(p.Merr2) : null, hi: isNum(p.Merr1) ? p.M + Math.abs(p.Merr1) : null } });
  if (isNum(p.P)) rows.push({ key: 'P', n: 'period', v: fmt(p.P, 4), u: 'd', refs: [rf.P], kind: 'm', iv: { value: p.P } });
  else if (limitOf(p, 'P')) rows.push({ key: 'P', n: 'period', v: boundV(limitOf(p, 'P'), 4), u: 'd', pm: limitKind(limitOf(p, 'P')), refs: [rf.P], iv: false });
  else rows.push({ key: 'P', n: 'period', v: 'none', pm: 'not in the archive', iv: false });
  if (a.a && a.src === 'archive') rows.push(orbitRow(p, a));   // the archive's orbit stands with the measured; Kepler's with the inferred
  else if (!a.a && limitOf(p, 'a')) rows.push({ key: 'a', n: 'orbit', v: boundV(limitOf(p, 'a')), u: 'AU', pm: limitKind(limitOf(p, 'a')), iv: false });
  else if (!a.a) rows.push({ key: 'a', n: 'orbit', v: 'none', pm: eText(p), note: orbitNote(a), iv: false });
  if (S.S && S.src === 'archive') rows.push(starlightRow(p, S));   // the archive's value stands with the measured
  else if (!S.S && limitOf(p, 'S')) rows.push({ key: 'S', n: 'insolation', v: boundV(limitOf(p, 'S')), u: 'S⊕', pm: limitKind(limitOf(p, 'S')), iv: false });
  const starPm = errText(p.TeffErr, p.TeffErr);   // the ± column holds the temperature's interval; the radius has its own row
  const col = starColour(p.Teff), sp = spectralType(p.Teff);
  const starNote = [isNum(p.Rs) ? '' : 'The star\'s radius is missing: the picture scales it from its temperature.', L.L ? `Its luminosity is ${starNum(L.L, 3)} L\u2609${L.src === 'archive' ? `, the archive's${luminosityDiffers(L) ? `; its radius and temperature give ${starNum(L.fromStar, 3)}` : ''}` : ', from its radius and temperature: the archive gives none'}.` : '',
    isNum(p.Teff) ? `Its colour, its Planck spectrum seen through the CIE 1931 observer, is ${col.hex}${sp === '?' ? '' : `, a ${sp}-type star`}.` : ''].filter(Boolean).join(' ');
  if (isNum(p.Teff)) rows.push({ key: 'star', n: 'star', v: fmtInt(p.Teff), swatch: col.hex, u: 'K', pm: starPm, refs: [rf.star], kind: isNum(p.Rs) ? 'm' : 'e',
    note: starNote, iv: { value: p.Teff, lo: isNum(p.TeffErr) ? p.Teff - Math.abs(p.TeffErr) : null, hi: isNum(p.TeffErr) ? p.Teff + Math.abs(p.TeffErr) : null } });
  else if (limitOf(p, 'Teff')) rows.push({ key: 'star', n: 'star', v: boundV(limitOf(p, 'Teff'), 4), u: 'K', pm: starPm, iv: false });
  else rows.push({ key: 'star', n: 'star', v: 'none', pm: 'no temperature in the archive', iv: false });
  if (isNum(p.Rs)) rows.push({ key: 'Rs', n: 'star radius', v: fmt(p.Rs, 3), u: 'R\u2609', pm: errText(p.RsErr, p.RsErr), refs: [rf.star], kind: 'm',
    iv: { value: p.Rs, lo: isNum(p.RsErr) ? p.Rs - Math.abs(p.RsErr) : null, hi: isNum(p.RsErr) ? p.Rs + Math.abs(p.RsErr) : null } });
  for (const k of ['Teq', 'b', 'depth', 'dur'].filter((x) => limitOf(p, x))) {
    const LL = limitOf(p, k);
    rows.push({ key: 'lim-' + k, n: { Teq: 'Teq (archive)', b: 'impact b', depth: 'depth', dur: 'duration' }[k], v: boundV(LL), u: (LIMIT_FIELDS[k] || ['', ''])[1].trim(), pm: limitKind(LL), note: 'An archive bound, never used as a value.', iv: false });
  }
  return rows;
}

function inferredRows(p, A) {
  const rows = [], mc = monteCarlo(p, A);
  const fc = hasTrueMass(p) ? null : forecastFor(p);
  if (fc) {
    const det = massFromRadiusMean(p.R);
    const cmp = [p.Mprov === 'M-R relationship' && isNum(p.M) && det ? `the archive gives ${fmt(p.M, 3)}, this page's mean ${fmt(det, 3)}` : '', fc.bounded ? `cut at the ${fmt(fc.bound, 3)} M⊕ ${fc.bounded} limit` : ''].filter(Boolean).join('; ');
    rows.push({ key: 'Mf', n: 'mass', v: fmt(fc.median, 2), u: 'M⊕', pm: `${fmt(fc.lo, 2)} to ${fmt(fc.hi, 2)}`, refs: [CHEN_KIPPING.ref], kind: 'e',
      note: `The mass is forecast from the radius (${fc.regime})${cmp ? `; ${cmp}` : ''}.`, iv: { value: fc.median, lo: fc.lo, hi: fc.hi } });
  }
  if (mc.hasR) {
    if (mc.g) rows.push({ key: 'g', n: 'gravity', v: fmt(mc.g.med, 2), u: 'g', pm: range(mc.g), kind: fc ? 'e' : 'd', iv: { value: mc.g.med, lo: mc.g.lo, hi: mc.g.hi } });
    if (mc.rho && !fc) rows.push({ key: 'rho', n: 'density', v: fmt(mc.rho.med, 2), u: 'g/cm³', pm: range(mc.rho), kind: 'd', note: 'Earth\'s density is 5.51 g/cm³.', iv: { value: mc.rho.med, lo: mc.rho.lo, hi: mc.rho.hi } });
  }
  const a = semiMajor(p);
  if (a.a && a.src !== 'archive') rows.push(orbitRow(p, a));
  const S = insolation(p);
  if (S.S && S.src !== 'archive') rows.push(starlightRow(p, S));
  const tq = teqText(mc.teq);
  rows.push({ key: 'teq', n: 'equilibrium T', v: mc.teq ? tq.v : 'none', u: mc.teq ? 'K' : '', pm: mc.teq ? tq.pm || (tq.point ? 'point value' : '') : 'needs the starlight', kind: 'd',
    note: `The equilibrium temperature takes the starlight${S.src === 'archive' ? ', the archive\'s,' : ''} with the albedo below and full redistribution of heat${tq.point ? ', and has no range because the starlight has none' : ''}${isNum(p.Teq) ? `; the archive publishes ${fmtInt(p.Teq)} K` : ''}.`, iv: mc.teq ? { value: mc.teq.med, lo: mc.teq.lo, hi: mc.teq.hi } : false });
  if (mc.H) rows.push({ key: 'H', n: 'scale height', v: fmt(mc.H.med, 2), u: 'km', pm: range(mc.H), kind: 'e',
    note: `The scale height assumes a mean molecular weight of ${p.R > 1.8 ? MC.muEnvelope + ', a hydrogen envelope' : MC.muSecondary + ', an air like nitrogen'}.`, iv: { value: mc.H.med, lo: mc.H.lo, hi: mc.H.hi } });
  if (!mc.hasR) {
    const ML = limitOf(p, 'M');
    if (ML && !fc) rows.push({ key: 'Mf', n: 'mass', v: 'none', pm: 'no forecast', kind: 'e', note: `The mass is only a${ML.dir > 0 ? 'n' : ''} ${limitKind(ML)}, and there is no radius to forecast from.`, iv: false });
  }
  const hz = hzPosition(p), e = hz.edges;
  rows.push({ key: 'zone', n: 'zone', word: true, v: zoneWords(hz, 'word'), kind: 'd', refs: e ? [KOPPARAPU.ref] : [],
    note: e ? `The habitable zone, the conservative one, runs from ${fmt(e.sOuter, 2)} to ${fmt(e.sInner, 2)} times Earth's sunlight, the optimistic one from ${fmt(e.sOuterOpt, 2)} to ${fmt(e.sInnerOpt, 2)}; this world is ${hz.label}.` : '', iv: false });
  return rows;
}

/* The eccentricity as the orbit's row prints it beside the size. */
function eText(p) {
  const eL = limitOf(p, 'ecc');
  return isNum(p.ecc) ? `e ${fmt(p.ecc, 2)}` : eL ? `e ${limitText(eL, 2)}` : 'e unknown';
}
/* The orbit's row: where it stands (the measured group for the archive's orbit, the inferred group for Kepler's) is the
   caller's; its value and note are starlight.js's semiMajor and orbitNote. */
function orbitRow(p, a) {
  const sky = skyView(p);
  const skyNote = sky ? `From its surface its star spans ${fmt(sky.angDeg, 2)}\u00b0, ${fmt(sky.vsSun, 2)} times the Sun's width from Earth.` : '';
  return { key: 'a', n: 'orbit', v: fmt(a.a, 3), u: 'AU', pm: eText(p), kind: a.src === 'archive' ? 'm' : 'd', refs: a.src === 'archive' || orbitDiffers(a) ? [COMPOSITE] : [],
    note: [orbitNote(a), limitOf(p, 'ecc') ? 'The eccentricity is only a bound, so orbits are drawn circular.' : '', skyNote].filter(Boolean).join(' '), iv: { value: a.a } };
}

/* The archive's composite table, the source of an insolation the sheet shows (config.js DATA.snapshotLabel gives its
   DOI). Short, because the line of sources keeps each on one line: the full label took that line to 493 px at 390. */
const COMPOSITE = { label: 'PSCompPars', url: 'https://doi.org/10.26133/NEA13' };

/* The starlight's row: where it stands (sheet B's measured group for the archive's value, the inferred group for the
   one computed from the star) is the caller's; its value, range and note are starlight.js's. */
function starlightRow(p, S) {
  const t = starlightText(S);
  return { key: 'S', n: 'insolation', v: t.v, u: 'S⊕', pm: t.pm || (t.point ? 'point value' : ''), kind: S.src === 'archive' ? 'm' : 'd', refs: S.src === 'archive' || archiveDiffers(S) ? [COMPOSITE] : [],
    note: starlightNote(p, S), iv: { value: S.S, lo: S.lo, hi: S.hi } };
}


/* the size class the radius gives, with the share of the draws in each class, and where it stands to the valley */
function classNote(p, A) {
  const mc = monteCarlo(p, A), sc = sizeClassOf(p);
  if (!mc.hasR) return sc ? `Every radius the bound allows makes it ${sc.label}.` : 'With no radius there is no size class, gravity, density or scale height.';
  const probs = mc.probs.slice().sort((x, y) => y.p - x.p).filter((c) => c.p >= 0.01).map((c) => `${c.label} ${Math.round(c.p * 100)}%`).join(', ');
  const valley = p.R < VALLEY.lo ? 'below the radius valley' : p.R <= VALLEY.hi ? 'inside the radius valley' : 'above the radius valley';
  return `Its draws fall in the size classes as ${probs}; the radius puts it ${valley} (${VALLEY.ref}).`;
}

/* Sheet B's rows for a world at albedo A: the measured group and the inferred group, in order. */
export const sheetRows = (p, A = TEQ.albedo) => ({ measured: measuredRows(p, A), inferred: inferredRows(p, A) });

/* The inferred group's heading, from the rows it holds: it names 68% ranges only where a row carries one, and point
   values where a row with a value carries none (a derived orbit, a starlight without every error). At most 38
   characters: a heading of 61 took a 390 px page to 405 px. */
const hasRange = (r) => r.iv && isNum(r.iv.lo) && isNum(r.iv.hi);
export function inferredHeading(rows) {
  const ranged = rows.some(hasRange), point = rows.some((r) => r.iv && !hasRange(r));
  if (ranged && point) return 'Inferred: 68% ranges and point values';
  if (ranged) return `Inferred: 68% ranges from ${MC.draws} draws`;
  return point ? 'Inferred: point values' : 'Inferred';
}

/* Sheet A's line under the name says where the world sits against the zone in these words. */
export const reticleZone = (p) => zoneWords(hzPosition(p), 'reticle');

export function createTarget(host, store, actions) {
  host.replaceChildren();
  const table = el('table', 'nums'); table.id = 'nums';
  const cap = el('caption', 'sr', 'The selected world\'s numbers: measured, then inferred, each with its interval on one log axis');
  const meas = document.createElement('tbody'), inf = document.createElement('tbody'), alb = document.createElement('tbody'), foot = document.createElement('tfoot');
  const cols = document.createElement('colgroup');
  for (const c of ['n', 'v', 'u', 'pm', 'r', 'iv']) { const col = document.createElement('col'); col.className = `c-${c}`; cols.append(col); }
  table.append(cap, cols, meas, inf, alb, foot);
  /* under the table, as under a paper's: where the world was found and how far it is, the sources by letter, and the
     numbered notes, closed */
  const notes = el('div', 'tnotes'); notes.id = 'tnotes';
  const found = el('p', 'tfound'), refsLine = el('span', 'trefs');
  const more = el('details', 'tmore'), moreS = el('summary'), moreL = el('ol', 'tnote-list');
  more.append(moreS, moreL);
  const refsRow = el('p', 'trow'); refsRow.append(refsLine);
  notes.append(found, refsRow, more);
  const acts = el('div', 'tbl-act');
  const add = el('button', 'fill log-add', 'Add to log'); add.type = 'button'; add.dataset.act = 'log'; add.disabled = true; add.title = 'The log is being read';
  const pin = el('button', 'plain', 'pin to compare'); pin.type = 'button'; pin.dataset.act = 'pin'; pin.disabled = true; pin.title = 'The log is being read';
  acts.append(add, pin);
  const said = el('p', 'tp-said'); said.setAttribute('role', 'status');
  host.append(table, notes, acts, said);
  acts.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.act) actions.exportAs(b.dataset.act, b); });

  /* the albedo, on an engraved scale: it sets the equilibrium temperature and what follows from it */
  let A = TEQ.albedo;
  const albRow = document.createElement('tr'); albRow.className = 'albedo';
  const albName = el('td', 'n'); albName.append(el('label', '', 'albedo')); albName.firstChild.htmlFor = 'albedo';
  const albCell = el('td'); albCell.colSpan = 5;
  const albWrap = el('div', 'albedo-scale');
  const albedo = document.createElement('input'); albedo.type = 'range'; albedo.id = 'albedo'; albedo.className = 'engraved'; albedo.min = '0'; albedo.max = '0.9'; albedo.step = '0.01'; albedo.value = String(TEQ.albedo);
  albedo.setAttribute('aria-describedby', 'albedo-v');
  const albV = el('span', 'rv', A.toFixed(2)); albV.id = 'albedo-v';
  albWrap.append(albedo, albV); albCell.append(albWrap); albRow.append(albName, albCell); alb.append(albRow);
  albedo.addEventListener('input', () => { A = +albedo.value; albV.textContent = A.toFixed(2); if (store.state.sel) draw(store.state.sel, false); });

  const ivWidth = () => (host.clientWidth && host.clientWidth < 420 ? 70 : 130);

  /* one row: name, value, unit, the interval in words, its source letters and note numbers, the interval drawn */
  function row(tb, r, ctx) {
    const tr = document.createElement('tr');
    if (r.key) tr.dataset.row = r.key;
    const marks = [...(r.refs || []).map((x) => ctx.letter(x)), ...(r.note ? [ctx.number(r.note)] : [])].filter(Boolean).join(' ');
    tr.append(el('td', 'n', r.n));
    const v = el('td', 'v');
    if (r.swatch) { const d = el('i', 'sw-dot'); d.style.setProperty('--star-col', r.swatch); v.append(d); }
    v.append(r.v);
    if (r.word) { v.className = 'v word'; v.colSpan = 3; tr.append(v, el('td', 'r', marks)); }   // a value in words takes the unit's and the interval's cells
    else tr.append(v, el('td', 'u', r.u || ''), el('td', 'pm', r.pm || ''), el('td', 'r', marks));
    const iv = el('td', 'iv');
    if (r.iv !== false) iv.append(ivSvg({ value: r.iv ? r.iv.value : NaN, lo: r.iv ? r.iv.lo : null, hi: r.iv ? r.iv.hi : null, kind: r.kind || 'm', width: ivWidth() }));
    tr.append(iv);
    tb.append(tr);
  }
  const group = (tb, text) => { const tr = document.createElement('tr'); tr.className = 'g'; const td = el('td'); td.colSpan = 6; td.append(el('span', '', text)); tr.append(td); tb.append(tr); };

  /* the sources, lettered in the order they are first used, and the notes, numbered */
  function context() {
    const refs = new Map(), notesList = [];
    return {
      refs, notes: notesList,
      letter(x) { if (!x) return ''; const key = typeof x === 'string' ? x : x.url || x.label; if (!refs.has(key)) refs.set(key, { l: 'abcdefghij'[refs.size] || '', x }); return refs.get(key).l; },
      number(t) { let i = notesList.indexOf(t); if (i < 0) { notesList.push(t); i = notesList.length - 1; } return String(i + 1); },
    };
  }

  /* the line under the table: how far the world is, when and how it was found, and its page at the archive */
  function caption(p, ctx) {
    found.replaceChildren();
    const rf = p.refs || {};
    const far = isNum(p.dist) ? `${fmtInt(p.dist * PHYS.PC_LY)} light-years away` : 'at an unknown distance';
    if (isNum(p.year)) {
      const l = rf.disc ? ctx.letter(rf.disc) : '';
      found.append(`Found in ${p.year}${p.method ? ' by ' + p.method.toLowerCase() : ''}${p.facility ? ', ' + p.facility : ''}${l ? ` (${l})` : ''}, ${far}. `);
    } else found.append(`Confirmed after the archive's snapshot, from its weekly roster; ${far}. `);
    const a = el('a', 'ref', 'Archive page'); a.href = `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(p.name)}`; a.target = '_blank'; a.rel = 'noopener';
    found.append(a, '.');
  }

  function draw(p, full = true) {
    const ctx = context();
    caption(p, ctx);
    const mrows = measuredRows(p, A), irows = inferredRows(p, A);
    if (full) { meas.replaceChildren(); group(meas, 'Measured, from the archive'); mrows.forEach((r) => row(meas, r, ctx)); }
    else mrows.forEach((r) => { ctx.letter((r.refs || [])[0]); for (const x of (r.refs || []).slice(1)) ctx.letter(x); if (r.note) ctx.number(r.note); });
    inf.replaceChildren(); group(inf, inferredHeading(irows));
    irows.forEach((r) => row(inf, r, ctx));
    foot.replaceChildren();
    const ax = document.createElement('tr'); ax.className = 'ax'; const pad = el('td'); pad.colSpan = 5; const axc = el('td', 'iv'); axc.append(ivAxisSvg({ width: ivWidth() })); ax.append(pad, axc); foot.append(ax);
    // the notes: the sources by letter, then the numbered notes
    refsLine.replaceChildren();
    for (const { l, x } of ctx.refs.values()) {
      const s = el('span', 'ref-l'); s.append(el('b', '', l));
      if (typeof x === 'object' && x.url) { const a = el('a', 'ref', x.label); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; s.append(a); }
      else { const full = String(x.label || x), short = el('span', '', full.replace(/^([^,]+ \d{4}[a-z]?),.*$/, '$1')); short.title = full; s.append(short); }
      refsLine.append(s, ' ');
    }
    moreS.textContent = ctx.notes.length === 1 ? '1 note on these numbers' : `${ctx.notes.length} notes on these numbers`;
    more.hidden = !ctx.notes.length;
    moreL.replaceChildren(...ctx.notes.map((t) => el('li', '', t)));
  }

  /* the one live number on sheet A: the radius with its interval, or why there is none */
  function live(p) {
    const box = document.getElementById('live'); if (!box) return;
    box.replaceChildren();
    if (hasRadius(p)) {
      box.append(el('span', 'v', fmt(p.R, 3)), el('span', 'u', 'R⊕'));
      box.append(ivSvg({ value: p.R, lo: isNum(p.Rerr2) ? p.R - Math.abs(p.Rerr2) : null, hi: isNum(p.Rerr1) ? p.R + Math.abs(p.Rerr1) : null, kind: p.measuredR === false ? 'e' : 'm', width: 120 }));
      const e = errText(p.Rerr1, p.Rerr2) ? `${errText(p.Rerr1, p.Rerr2)}, ` : '';
      box.append(el('span', 'pm', `${e}${p.measuredR === false ? 'estimated from the mass' : 'measured'}`));
    } else if (limitOf(p, 'R')) {
      const RL = limitOf(p, 'R');
      box.append(el('span', 'v', boundV(RL)), el('span', 'u', 'R⊕'), el('span', 'pm', `${limitKind(RL)}: no radius is measured`));
    } else box.append(el('span', 'pm', 'no radius measured: the picture is drawn at a stand-in size'));
  }

  return {
    update(p) {
      if (!p) return;
      said.textContent = '';   // what was said about the world before does not stand for this one
      said.classList.remove('quiet');
      draw(p, true);
      live(p);
    },
    albedo: () => A,
    /* A line under the actions: what a press did. A success is for a screen reader only, because the button shows it;
       why a press did not do what it says is shown. The line is a status region and only its text changes. */
    say(text, ok = false) { said.classList.toggle('quiet', !!ok); said.textContent = text; },
  };
}
