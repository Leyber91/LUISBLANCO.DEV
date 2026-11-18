/* ============================================================
   blackhole/drawing.js — the instrument as one drawing (BAR_L1
   section 6): sheet 1 is the picture with its own scales, a line
   of type for what is drawn, a title block and the frames kept;
   sheets 2 and 3 are the readouts and the settings (the columns of
   cards, unchanged), sheet 4 the record.

   Every graduation is the engine's or the store's (F2): the spin
   scale's ISCO and horizon marks are where kerr.js isco() and
   horizon() reach round radii at the state's charge, only where
   that charge lets the spin go; each scale spans the values the
   store allows; the mass scale's marks are OBJECTS'. Each hand is
   drawn from the eased view, so it moves with the picture.
   Each scale is a slider (F3): role, value, bounds and orientation
   in aria, arrow keys, Home and End, and a press or drag. A drag
   holds the pointer on the scale's own svg, which is never
   replaced (only its groups are redrawn).
   The title block shows only what a card shows, by the card's own
   function and rule (F5), and no number a scale already reads.
   The strip's button is the card's Keep: its words, its state and
   its being off are the card's (review_s4 2).
   No part of the drawing lies on another or on a panel (review_s4
   6, 7): the scales are fitted to the title block and the caption.
   ============================================================ */

import * as K from './kerr.js';
import { OBJECTS, VIEWS, COLOR_MODES, SCHEMA, COPY } from './config.js';
import { s3, sci, pmText, published, measurement, parsecs, deg, spinText } from './physics.js';
import { setHTML } from './tour.js';
import { linkLabel, openLink, identity } from './record.js';

// a link's names never change, and the strip is drawn on every change of state
const names = new Map(), shorts = new Map();
const nameOf = (q) => { if (!names.has(q)) names.set(q, linkLabel(q)); return names.get(q); };
/** A kept frame's caption, short enough for its picture and telling holes apart (review_s4b 5: every hole of one's
 *  own read "a hole of your own, cinematic"): the object, or a hole of one's own by its mass; its spin; the view when
 *  it is not the cinematic one. The whole name is the link's title. */
function captionOf(q) {
  const id = Object.fromEntries(identity(q).map((x) => [x.d.key, x.v]));
  const o = OBJECTS.find((x) => x.id === id.obj);
  return `${o ? o.name : id.mass} · a ${id.a}${id.view !== 'cinematic' ? ` · ${id.view}` : ''}`;
}
const shortOf = (q) => { if (!shorts.has(q)) shorts.set(q, captionOf(q)); return shorts.get(q); };

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BY = Object.fromEntries(SCHEMA.map((d) => [d.key, d]));
const el = (tag, attrs = {}, parent = null) => {
  const e = tag === 'svg' || ['line', 'path', 'text', 'g', 'circle', 'tspan', 'rect'].includes(tag) ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const svgText = (parent, attrs, text) => { const t = el('text', attrs, parent); t.textContent = text; return t; };

/** The spin at which f(a) reaches target, f decreasing in a on [0, aMax]; null where it does not. */
function spinFor(f, target, aMax) {
  if (f(0) < target || f(aMax) > target) return null;
  let lo = 0, hi = aMax;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(m) > target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
/** The highest spin the store lets a hole of charge q have (state.js: a^2 + q^2 is held at 0.996 or less). */
const spinTop = (q) => (q > 0 ? Math.min(BY.a.max, Math.sqrt(Math.max(0, 0.996 - q * q))) : BY.a.max);   // with no charge, the store's 0.998

/* app: the page's app; choose: { object(id), view(id), colour(id), sheet(n) } from ui.js, the same actions as the
   cards' buttons; act: { plate(W), link(), json(), csv(), sources() }; keepRecord(): the record the card shows. */
export function buildDrawing(app, { choose, act, keepRecord }) {
  const { store } = app;
  const body = document.body;
  const wide = () => !window.matchMedia('(max-width: 900px)').matches;

  /* ---------- the head: what is drawn, as one line of type ---------- */
  const head = el('nav', { class: 'bh-hl', id: 'bh-hl', 'aria-label': 'What is drawn' });
  const group = (k, items, pick) => {
    // a group named for a reader (review_s4 8): its visible name is the same word
    const g = el('span', { class: 'bh-hl-g', role: 'group', 'aria-label': k }, head);
    el('span', { class: 'bh-hl-k', 'aria-hidden': 'true' }, g).textContent = k;
    const btns = {};
    for (const [id, label] of items) {
      const b = el('button', { type: 'button', class: 'bh-opt', 'aria-pressed': 'false' }, g);
      b.textContent = label;
      b.addEventListener('click', () => pick(id));
      btns[id] = b;
    }
    return btns;
  };
  const objOpts = group('object', OBJECTS.map((o) => [o.id, o.name]), (id) => choose.object(id));
  const own = el('span', { class: 'bh-hl-own' }, head.firstChild);
  const viewOpts = group('view', Object.entries(VIEWS).map(([id, v]) => [id, v.label.toLowerCase()]), (id) => choose.view(id));
  const colOpts = group('colour', Object.entries(COLOR_MODES).map(([id, m]) => [id, m.label.toLowerCase()]), (id) => choose.colour(id));
  // the colour's key on sheet 1, after the colour line (ui.js draws the key into every [data-modekey])
  el('span', { class: 'bh-legend bh-hl-key', 'data-modekey': '' }, head);
  // a child of the bar between its two ends: after Back on a wide screen, its own row under the bar on a phone
  document.querySelector('.bh-bar').insertBefore(head, document.querySelector('.bh-bar-r'));

  /* ---------- the scales ---------- */
  function scale({ id, key, label, orient, toFrac, fromFrac, step, valueText }) {
    const svg = el('svg', { class: 'bh-scale', id, role: 'slider', tabindex: '0', 'aria-label': label, 'aria-orientation': orient, 'aria-valuemin': String(BY[key].min), 'aria-valuemax': String(BY[key].max) });
    const marks = el('g', {}, svg), hand = el('g', { class: 'hand' }, svg);
    body.appendChild(svg);
    let dragging = false;
    const setFrom = (e) => {
      const f = toFrac(e, svg.getBoundingClientRect());
      if (f == null) return;
      const v = fromFrac(Math.max(0, Math.min(1, f)));
      app.tour?.stop();
      store.set({ [key]: +v.toFixed(BY[key].digits ?? 3) }, { dur: 250 });
    };
    // the pointer is held by the svg itself, which is never replaced (only its groups are redrawn)
    svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture?.(e.pointerId); setFrom(e); });
    svg.addEventListener('pointermove', (e) => { if (dragging) setFrom(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => svg.addEventListener(t, () => { dragging = false; }));
    svg.addEventListener('keydown', (e) => {
      const k = e.key, s = store.get(key);
      const d = k === 'ArrowRight' || k === 'ArrowUp' ? step : k === 'ArrowLeft' || k === 'ArrowDown' ? -step : k === 'PageUp' ? step * 10 : k === 'PageDown' ? -step * 10 : 0;
      if (!d && k !== 'Home' && k !== 'End') return;
      e.preventDefault();
      const top = key === 'a' ? spinTop(store.get('q')) : BY[key].max;   // the spin stops where the charge lets it
      const v = Math.min(top, k === 'Home' ? BY[key].min : k === 'End' ? top : s + d);
      app.tour?.stop();
      // a step keeps the value's own digits (float noise aside): rounded to the schema's 2, M87*'s 9.8129 came back from a
      // right and a left as 9.81
      store.set({ [key]: +Math.max(BY[key].min, Math.min(BY[key].max, v)).toFixed(6) }, { dur: 250 });
    });
    return { svg, marks, hand, set(v) { svg.setAttribute('aria-valuenow', String(v)); svg.setAttribute('aria-valuetext', valueText(v)); } };
  }

  // spin: a nomogram along the foot of the drawing; the ISCO and the horizon read beneath it at the same place
  const AMAX = BY.a.max;
  const SP = { x0: 64, W: 520, H: 92 };
  const spin = scale({
    id: 'bh-sc-spin', key: 'a', label: 'spin a/M', orient: 'horizontal', step: 0.01,
    toFrac: (e, r) => (e.clientX - r.left - SP.x0) / SP.W,
    // never past the spin the charge allows, so a press keeps the charge and the marks do not move under it
    fromFrac: (f) => Math.min(f * AMAX, spinTop(store.get('q'))),
    valueText: (v) => `a = ${spinText(v)}, ISCO ${s3(K.isco(v, 1, store.get('q')))} M, horizon ${s3(K.horizon(v, store.get('q')))} M`,
  });
  // inclination: a protractor on the left edge, 0 at the spin axis, 90 in the disk's plane. Its 180 end lies on the svg's
  // edge, so a pointer left of it is read as on it (review_s4 4: 1 px either side read 1 and 179)
  const IN = { R: 108, oy: 152 };
  const incl = scale({
    id: 'bh-sc-incl', key: 'incl', label: 'inclination, degrees from the spin axis', orient: 'vertical', step: 1,
    toFrac: (e, r) => { const x = Math.max(0, e.clientX - r.left), y = e.clientY - (r.top + IN.oy); return Math.atan2(x, -y) * 180 / Math.PI / 180; },
    fromFrac: (f) => Math.max(BY.incl.min, Math.min(BY.incl.max, f * 180)),
    valueText: (v) => `${deg(v)} degrees`,
  });
  // mass: a log scale on the right edge over every mass the store allows (review_s4 1: it stopped at 10^0, so Primordial's
  // 10^-18 sat on 10^0), with the known holes on it
  const LG = [BY.mass.min, BY.mass.max];
  const MS = { y0: 18, H: 300, W: 150 };
  const mass = scale({
    id: 'bh-sc-mass', key: 'mass', label: 'mass, log10 of solar masses', orient: 'vertical', step: 0.1,
    toFrac: (e, r) => 1 - (e.clientY - r.top - MS.y0) / MS.H,
    fromFrac: (f) => LG[0] + f * (LG[1] - LG[0]),
    valueText: (v) => `${sci(10 ** v)} solar masses`,
  });
  const massY = (lg) => MS.y0 + MS.H - ((Math.max(LG[0], Math.min(LG[1], lg)) - LG[0]) / (LG[1] - LG[0])) * MS.H;

  let lastQ = null;
  let compact = false;
  function drawSpinMarks(q) {
    const g = spin.marks; g.replaceChildren();
    const X = (a) => SP.x0 + (a / AMAX) * SP.W;
    // the spin this charge allows: past it the ruler is dotted and carries no mark (review_s4 9: a press on an ISCO mark
    // past it lowered the charge, and the hole's ISCO was not the mark's)
    const top = spinTop(q);
    el('line', { x1: SP.x0, y1: 30, x2: X(top), y2: 30, class: 'ink' }, g);
    if (top < AMAX) el('line', { x1: X(top), y1: 30, x2: X(AMAX), y2: 30, class: 'faint', 'stroke-dasharray': '2 3' }, g);
    for (let i = 0; i * 0.05 < AMAX; i++) {
      const a = i * 0.05, big = i % 2 === 0;
      el('line', { x1: X(a), y1: 30, x2: X(a), y2: big ? 22 : 26, class: big ? 'ink' : 'faint', 'data-tick': a.toFixed(2) }, g);
      if (i % 4 === 0) svgText(g, { x: X(a), y: 18, 'text-anchor': 'middle' }, a.toFixed(1));
    }
    // the scale's end is the store's highest spin and says so (it read 1.0 at 0.998)
    el('line', { x1: X(AMAX), y1: 30, x2: X(AMAX), y2: 20, class: 'ink', 'data-tick': String(AMAX) }, g);
    svgText(g, { x: X(AMAX), y: 18, 'text-anchor': 'middle' }, String(AMAX));
    if (compact) return;
    const isco = (a) => K.isco(a, 1, q), hor = (a) => K.horizon(a, q);
    el('line', { x1: SP.x0, y1: 46, x2: SP.x0 + SP.W, y2: 46, class: 'faint' }, g);
    el('line', { x1: SP.x0, y1: 70, x2: SP.x0 + SP.W, y2: 70, class: 'faint' }, g);
    const r0 = isco(0), h0 = hor(0);
    svgText(g, { x: SP.x0, y: 60 }, `ISCO ${s3(r0)} M`);
    svgText(g, { x: SP.x0, y: 84 }, `horizon ${s3(h0)} M`);
    for (const r of [4, 3, 2]) { const a = spinFor(isco, r, top); if (a == null || r >= r0) continue; el('line', { x1: X(a), y1: 46, x2: X(a), y2: 51, class: 'ink', 'data-r': String(r), 'data-a': String(a), 'data-of': 'isco' }, g); svgText(g, { x: X(a), y: 60, 'text-anchor': 'middle' }, `${r} M`); }
    for (const r of [1.6, 1.3]) { const a = spinFor(hor, r, top); if (a == null || r >= h0) continue; el('line', { x1: X(a), y1: 70, x2: X(a), y2: 75, class: 'ink', 'data-r': String(r), 'data-a': String(a), 'data-of': 'horizon' }, g); svgText(g, { x: X(a), y: 84, 'text-anchor': 'middle' }, `${r} M`); }
  }
  function drawSpinHand(a, q) {
    const g = spin.hand; g.replaceChildren();
    const x = SP.x0 + (a / AMAX) * SP.W;
    // the hand ends at the ruler; on the two rows below it a short tick, so it never crosses their marks' words (review_s4 7)
    el('line', { x1: x, y1: 20, x2: x, y2: 34, class: 'now', 'data-hand': String(a) }, g);
    el('path', { d: `M${x - 5},30 l5,-7 l5,7 z`, class: 'tip' }, g);
    if (!compact) { el('line', { x1: x, y1: 44, x2: x, y2: 50, class: 'now' }, g); el('line', { x1: x, y1: 68, x2: x, y2: 74, class: 'now' }, g); }
    // the scale's title at its foot, on the reading's baseline: the top row is the ticks' numbers
    const y = compact ? 50 : 104;
    const title = svgText(g, { x: SP.x0, y, class: 'cap' }, 'SPIN a/M');
    const val = svgText(g, { x: SP.x0 + SP.W, y, 'text-anchor': 'end', class: 'val' }, `a ${spinText(a)} · ISCO ${s3(K.isco(a, 1, q))} M · horizon ${s3(K.horizon(a, q))} M`);
    // the title on the reading's line where both fit, on the line under it where they would cross (review_s4b 3: they
    // crossed at 1280 and at 360)
    const tw = title.getComputedTextLength ? title.getComputedTextLength() : 60, vw = val.getComputedTextLength ? val.getComputedTextLength() : 270;
    if (tw + 12 > SP.W - vw) title.setAttribute('y', String(y + 13));
  }
  const P = (d, r) => [r * Math.sin(d * Math.PI / 180), IN.oy - r * Math.cos(d * Math.PI / 180)];
  function drawInclMarks() {
    const g = incl.marks; g.replaceChildren();
    // on the 0 label's baseline, past it: one line, '0  INCLINATION'
    svgText(g, { x: 16, y: IN.oy - IN.R - 10, class: 'cap' }, 'INCLINATION');
    el('path', { d: `M${P(0, IN.R)} A${IN.R},${IN.R} 0 0 1 ${P(180, IN.R)}`, class: 'ink' }, g);
    for (let d = 0; d <= 180; d += 10) { const big = d % 30 === 0; const [x1, y1] = P(d, IN.R), [x2, y2] = P(d, IN.R - (big ? 9 : 5)); el('line', { x1, y1, x2, y2, class: big ? 'ink' : 'faint', 'data-deg': String(d) }, g); if (big) { const [tx, ty] = P(d, IN.R + 13); svgText(g, { x: tx, y: ty + 3, 'text-anchor': 'middle' }, String(d)); } }
    el('line', { x1: 0, y1: IN.oy, x2: IN.R - 14, y2: IN.oy, class: 'faint', 'stroke-dasharray': '2 3' }, g);
    svgText(g, { x: 6, y: IN.oy + 14 }, 'the disk');
  }
  function drawInclHand(i) {
    const g = incl.hand; g.replaceChildren();
    const [x, y] = P(i, IN.R - 2), [lx, ly] = P(i, IN.R + 30);
    el('line', { x1: 0, y1: IN.oy, x2: x, y2: y, class: 'now', 'data-hand': String(i) }, g);
    el('circle', { cx: x, cy: y, r: 3, class: 'tip' }, g);
    // the value outside the graduations' numbers, along the hand (it sat on "30" at Sgr A*: review_s4 7)
    svgText(g, { x: lx, y: ly + 4, class: 'val' }, `i ${deg(i)}°`);
  }
  function drawMassMarks() {
    const g = mass.marks; g.replaceChildren();
    svgText(g, { x: MS.W, y: 8, 'text-anchor': 'end', class: 'cap' }, 'MASS, SOLAR MASSES');
    el('line', { x1: MS.W, y1: MS.y0, x2: MS.W, y2: MS.y0 + MS.H, class: 'ink' }, g);
    // a decade's number steps aside where a known hole's name sits within 10 px (on 30 decades Sgr A*'s name lay on 10^6)
    const named = OBJECTS.filter((x) => x.mass >= 1 && !x.hypothetical).map((o) => massY(Math.log10(o.mass)));
    for (let lg = Math.ceil(LG[0]); lg <= LG[1]; lg++) {
      el('line', { x1: MS.W, y1: massY(lg), x2: MS.W - (lg % 3 === 0 ? 8 : 4), y2: massY(lg), class: lg % 3 === 0 ? 'ink' : 'faint', 'data-lg': String(lg) }, g);
      if (lg % 6 === 0 && !named.some((y) => Math.abs(y - massY(lg)) < 10)) { const t = svgText(g, { x: MS.W - 12, y: massY(lg) + 3, 'text-anchor': 'end' }, '10'); const sup = el('tspan', { 'baseline-shift': 'super', 'font-size': '7' }, t); sup.textContent = String(lg); }
    }
    for (const o of OBJECTS.filter((x) => x.mass >= 1 && !x.hypothetical)) {
      const y = massY(Math.log10(o.mass));
      el('line', { x1: MS.W, y1: y, x2: MS.W - 34, y2: y, class: 'faint', 'data-object': o.id }, g);
      svgText(g, { x: MS.W - 38, y: y + 3, 'text-anchor': 'end', 'data-label': o.id }, o.name);
    }
  }
  function drawMassHand(lg) {
    const g = mass.hand; g.replaceChildren();
    const y = massY(lg);
    el('line', { x1: MS.W - 46, y1: y, x2: MS.W, y2: y, class: 'now', 'data-hand': String(lg) }, g);
    el('path', { d: `M${MS.W},${y} l-7,-5 l0,10 z`, class: 'tip' }, g);
    // a hole is named on the hand only when the state is that hole (review_s4 9: a hole of one's own near M87*'s mass was
    // named M87*); its mark's own name then steps aside
    const o = OBJECTS.find((x) => x.id === store.get('obj'));
    // the hand's words win: a mark's name within 12 px of the hand steps aside, whatever the hole (review_s4b 1: a hole of
    // one's own at M87*'s mass had both words on one baseline)
    for (const tx of mass.marks.querySelectorAll('text[data-label]')) tx.style.display = Math.abs(+tx.getAttribute('y') - 3 - y) < 12 ? 'none' : '';
    svgText(g, { x: MS.W - 50, y: y + 3, 'text-anchor': 'end', class: 'val' }, `${o ? `${o.name} · ` : ''}${sci(10 ** lg)} M☉`);
    mass.set(lg);
  }
  drawInclMarks();

  /* ---------- the title block ---------- */
  const tb = el('aside', { class: 'bh-tb', id: 'bh-tb', 'aria-label': 'Title block' });
  body.appendChild(tb);
  const tbBody = el('div', { class: 'bh-tb-body' }, tb);
  const take = el('div', { class: 'bh-tb-r bh-tb-take' }, tb);
  take.innerHTML = '<span class="l">take away</span>';
  for (const [label, fn] of [['plate 1920', () => act.plate(1920)], ['3840', () => act.plate(3840)], ['link', () => act.link()], ['state json', () => act.json()], ['csv', () => act.csv()], ['sources', () => act.sources()]]) {
    const b = el('button', { type: 'button', class: 'bh-tk' }, take); b.textContent = label; b.addEventListener('click', fn);
  }
  const tabs = el('div', { class: 'bh-tb-r bh-tabs', role: 'tablist', 'aria-label': 'Sheets' }, tb);
  const SHEETS = [[1, 'the picture'], [2, 'the readouts'], [3, 'the settings'], [4, 'kept']];
  const tabBtn = {};
  for (const [n, label] of SHEETS) { const b = el('button', { type: 'button', role: 'tab', class: 'bh-tab', 'aria-selected': 'false', 'data-sheet': String(n) }, tabs); b.textContent = `${n} ${label}`; b.addEventListener('click', () => sheet(n)); tabBtn[n] = b; }
  // the tabs by keyboard, as a tab list is (review_s4 8): the arrows move along them, Home and End to the ends
  tabs.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(k)) return;
    e.preventDefault();
    const cur = +(body.dataset.sheet || 1);
    const n = k === 'Home' ? 1 : k === 'End' ? 4 : ((cur - 1 + (k === 'ArrowRight' ? 1 : 3)) % 4) + 1;
    sheet(n); tabBtn[n].focus();
  });

  function sheet(n) {
    body.dataset.sheet = String(n);
    for (const [k, b] of Object.entries(tabBtn)) { b.setAttribute('aria-selected', String(+k === n)); b.tabIndex = +k === n ? 0 : -1; }
    choose.sheet?.(n);
    draw();
  }

  function drawTitle() {
    const s = store.all(), m = app.model, ms = measurement(s), o = m.obj, cmp = ms.cmp;
    const name = o ? `${esc(o.name)} <i>${esc(o.kind)}${o.distPc ? `, ${parsecs(o.distPc)}` : ''}</i>` : '<i>a hole of your own</i>';
    const c = (l, v, u = '') => `<div class="c"><span class="l">${l}</span><span class="v">${v}${u ? ` <small>${u}</small>` : ''}</span></div>`;
    // only what a card shows, by the card's rule (review_s4 5): the scale and the comparison only where the Measure
    // card has them; the ring of emission with the card's words; nothing a scale already reads (mass, spin, ISCO,
    // horizon: review_s4 12)
    const eht = cmp && cmp.shadow ? c('EHT shadow', published(cmp.shadow.value, cmp.shadow.err, '±'), 'µas')
      : cmp && cmp.ring ? c('EHT ring of emission (no σ: a different quantity)', published(cmp.ring.value, cmp.ring.err, '±'), 'µas')
        : c('EHT', 'not imaged');
    // the visitor's own date (toISOString is UTC: between 00:00 and 01:00 in Barcelona it read yesterday)
    const now = new Date(), two = (n) => String(n).padStart(2, '0');
    const drawn = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
    setHTML(tbBody, `
      <div class="bh-tb-r bh-tb-h"><div class="c"><h1 class="t">${name}</h1><span class="sub">${esc(COPY.title)}</span></div><div class="c sheetno"><span class="l">sheet</span><span class="v" id="bh-tb-sheet">${body.dataset.sheet || 1} of 4</span></div></div>
      <div class="bh-tb-r g2">${c(`shadow, far observer at ${deg(ms.incl)}°`, `${s3(ms.th.mean)} M${cmp ? ` · ${pmText(cmp.pred.value, cmp.pred.errP, cmp.pred.errM)}` : ''}`, cmp ? 'µas' : '')}${eht}</div>
      <div class="bh-tb-r g4">${c('scale θ_g', cmp ? pmText(cmp.pred.thetaG, cmp.pred.thetaErrP, cmp.pred.thetaErrM) : '--', cmp ? 'µas per M' : '')}${c('photon orbit', s3(m.rph), 'M')}${c('Hawking T', sci(m.hawkingK), 'K')}${c('drawn', drawn)}</div>`);
    for (const [id, b] of Object.entries(objOpts)) b.setAttribute('aria-pressed', String(s.obj === id));
    own.textContent = s.obj === 'custom' ? 'a hole of your own' : '';
    for (const [id, b] of Object.entries(viewOpts)) b.setAttribute('aria-pressed', String(s.view === id));
    for (const [id, b] of Object.entries(colOpts)) b.setAttribute('aria-pressed', String(s.color === id));
  }

  /* ---------- the frames kept ---------- */
  const strip = el('div', { class: 'bh-strip', id: 'bh-strip', role: 'group', 'aria-label': 'Frames kept' });
  body.appendChild(strip);
  el('span', { class: 'k' }, strip).textContent = 'kept';
  const frames = el('span', { class: 'bh-frs' }, strip);
  // one button, kept across redraws, so a key press on it keeps its focus (review_s4 8)
  const keepBtn = el('button', { type: 'button', class: 'bh-fr add', id: 'bh-keep2', 'aria-pressed': 'false' }, strip);
  function drawStrip() {
    const rec = keepRecord(); if (!rec) return;
    // the button is the card's Keep: its words, whether it is pressed, and whether it is off (the record not yet read,
    // a newer version's record, Labs OS not started, a press being written: review_s4 2)
    const card = document.querySelector('#bh-keep');
    const kept = !!card && card.getAttribute('aria-pressed') === 'true';
    keepBtn.disabled = !card || card.disabled;
    keepBtn.setAttribute('aria-disabled', card ? card.getAttribute('aria-disabled') || 'false' : 'true');
    keepBtn.setAttribute('aria-pressed', String(kept));
    keepBtn.setAttribute('aria-busy', card ? card.getAttribute('aria-busy') || 'false' : 'false');
    const words = kept ? 'kept' : 'keep this frame';
    if (keepBtn.textContent !== words) keepBtn.textContent = words;
    // a link through openLink, as the card's (the empty link would start the tour); one short line under the picture,
    // the whole name for a reader and on hover
    setHTML(frames, rec.kept.slice(0, 3).map((e) => `<a class="bh-fr" href="${esc(location.pathname + openLink(e.q))}" title="${esc(nameOf(e.q))}" aria-label="${esc(nameOf(e.q))}">${e.img ? `<img alt="" src="${esc(e.img)}">` : '<span class="ph"></span>'}<span class="cap">${esc(shortOf(e.q))}</span></a>`).join(''));
  }
  // the second click of a double-click is not a press (review_s3c 1); a press on an off button does nothing
  keepBtn.addEventListener('click', (e) => { if (e.detail > 1 || keepBtn.disabled || keepBtn.getAttribute('aria-disabled') === 'true') return; document.querySelector('#bh-keep')?.click(); });

  /* ---------- the layout of the scales, by the window ---------- */
  let tbRoom = 260, footRoom = 38;   // px, the title block's and the footer's tallest so far, until the window changes
  function place() {
    const W = innerWidth, H = innerHeight, phone = !wide();
    compact = phone;
    // the title block: on a phone the first block of the sheet, under the picture; on a wide screen the drawing's corner
    const stage = document.querySelector('.bh-stage'), handle = stage && stage.querySelector('.bh-sheet-h');
    if (phone && handle && handle.nextElementSibling !== tb) handle.after(tb);
    if (!phone && tb.parentElement !== body) body.appendChild(tb);
    // what stands at the foot stands on the footer as it is: its tags wrap on a narrow screen and it grows (at 960 x 640
    // the caption lay on its first line)
    const footEl = document.getElementById('bh-foot');
    // the room kept for it only grows: its words change while the render refines ("refining 45%"), and a footer that
    // wrapped and unwrapped moved the scales under the pointer (a press on the mass scale read 6.31 for 6.63)
    footRoom = Math.max(footRoom, !phone && footEl && footEl.getClientRects().length ? Math.round(H - footEl.getBoundingClientRect().top) : 38);
    const footTop = H - footRoom;
    document.documentElement.style.setProperty('--bh-above-foot', `${footRoom + 8}px`);
    if (phone) {
      SP.x0 = 18; SP.W = W - 2 * 18 - 4;
      // under the head line, in the sky above the hole: below it the labels and the caption have the frame
      const hl = head.getBoundingClientRect();
      Object.assign(spin.svg.style, { left: '0px', top: Math.round((hl.height ? hl.bottom : 110) + 4) + 'px', width: W + 'px', height: '72px' });
      incl.svg.style.display = 'none'; mass.svg.style.display = 'none';
    } else {
      // the spin ruler at the foot, clear of the caption on sheet 1. Where the caption leaves it under 300 px (901 to 1207 px
      // wide: review_s4 6), the foot has no room between the protractor, the caption and the title block, so the ruler
      // goes where the phone puts it: under the head line, in the sky, left of the kept frames
      const capEl = document.getElementById('bh-caption'), cap = capEl && capEl.getClientRects().length ? capEl.getBoundingClientRect() : null;
      const room = cap ? cap.left - 64 - 24 : 480, foot = !cap || room >= 300;
      const stripLeft = strip.getClientRects().length ? strip.getBoundingClientRect().left : W;
      SP.x0 = 0; SP.W = Math.max(300, foot ? Math.min(480, W - 440 - 380 - 140, room) : Math.min(480, stripLeft - 64 - 24));
      const low = Math.round(footTop - 8 - (SP.H + 32)), hl = head.getBoundingClientRect();
      const top = foot ? low : Math.round((hl.height ? hl.bottom : 80) + 8);
      Object.assign(spin.svg.style, { left: '64px', top: top + 'px', width: SP.W + 4 + 'px', height: SP.H + 32 + 'px' });
      // the protractor below the ruler when the ruler is under the head line (review_s4b 9: on a short window its title
      // lay on the ruler's)
      const inTop = Math.round(foot ? H * 0.47 - IN.oy : Math.max(H * 0.47 - IN.oy, top + SP.H + 32 + 8));
      // the protractor only where it fits above the caption it would reach: on a small window it is left off, as on a
      // phone, and the inclination stays on the settings sheet (960 x 640: it ran into the caption)
      const inLeft = 23, inRight = inLeft + IN.R + 96;
      const inFits = !cap || cap.left >= inRight || cap.right <= inLeft || inTop + 2 * IN.oy <= cap.top - 8;
      Object.assign(incl.svg.style, { display: inFits ? '' : 'none', left: inLeft + 'px', top: inTop + 'px', width: IN.R + 96 + 'px', height: 2 * IN.oy + 'px' });
      // the mass scale from 28% of the height down to above the title block, which it never reaches (review_s4 6: at
      // 1280 x 720 the block covered 128 px of it, Cygnus X-1's mark included)
      // the room kept for the title block only grows, so a change of its words (a hole of one's own, a ring's label) never
      // moves the mass scale under the pointer (it did: a spin press made M87* one's own and the scale jumped)
      tbRoom = Math.max(tbRoom, tb.getClientRects().length ? tb.getBoundingClientRect().height : 0);
      const mTop = Math.round(H * 0.28), tbTop = footTop - 8 - tbRoom;
      // the room above the title block, down to 80 px (a floor of 140 brought the cover back below 657 px tall)
      MS.H = Math.min(300, tbTop - 16 - mTop - MS.y0 - 10);
      // under 80 px the mass scale's 30 decades do not read: left off, the settings sheet keeps the mass
      const msFits = MS.H >= 80; if (!msFits) MS.H = 80;
      Object.assign(mass.svg.style, { display: msFits ? '' : 'none', right: '23px', top: mTop + 'px', width: MS.W + 2 + 'px', height: MS.y0 + MS.H + 10 + 'px' });
    }
    drawMassMarks();
    lastQ = null; draw();
  }

  // the hands follow the eased view, so they move with the picture (the bar: "the hand moves along its scale with the
  // value as the state eases"; review_s4 10); drawn again only when one of their values changed
  let handKey = '';
  function drawHands() {
    const s = store.all(), v = store.view();
    const key = `${v.a}|${v.q}|${v.incl}|${s.a}|${s.incl}|${s.mass}|${s.obj}|${SP.W}|${MS.H}`;
    if (key === handKey) return;
    handKey = key;
    // the eased spin with the eased charge: the hole the picture shows (review_s4b 6: the target's charge with the eased
    // spin read ISCO 1.00 mid-ease)
    drawSpinHand(v.a, v.q); drawInclHand(v.incl); drawMassHand(s.mass);
    // a reader hears the state's value, not the values on the way to it (review_s4b 7)
    spin.set(s.a); incl.set(s.incl);
  }
  function draw() {
    const s = store.all();
    if (s.q !== lastQ) { drawSpinMarks(s.q); lastQ = s.q; }
    handKey = '';
    drawHands(); drawTitle(); drawStrip();
  }
  window.addEventListener('resize', () => { tbRoom = 260; footRoom = 38; place(); });
  // the caption's height changes with the tour's words after the drawing is placed: the spin scale is placed again
  // against it, so it never lies under it (seen at 1100 x 800)
  const capEl = document.getElementById('bh-caption');
  // and as the kept frames and the title block change size (review_s4b 2: the strip grew over the ruler's end)
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (wide()) place(); }); for (const e of [capEl, strip, tb, document.getElementById('bh-foot')]) if (e) ro.observe(e); }
  sheet(1);
  place();

  return {
    draw,
    /** The hands again, from the eased view (ui.js's tick, every frame: it draws only when a value moved). */
    drawHands,
    /** The band of the window the labels on the render may use on sheet 1, [left, right] in px. */
    openBand() { const a = incl.svg.getBoundingClientRect(), b = mass.svg.getBoundingClientRect(); return [incl.svg.style.display === 'none' ? 0 : a.right, mass.svg.style.display === 'none' ? innerWidth : b.left]; },
    sheet,
    /** The kept frames again: the record changed (keep.js onDraw). */
    drawStrip,
    /** The boxes of the drawing's own parts that show, and the caption's, [x0, y0, x1, y1]: a label on the render steps
     *  aside from them. */
    obstacles() {
      return [spin.svg, incl.svg, mass.svg, tb, strip, document.getElementById('bh-caption')].filter((e) => e && e.getClientRects().length && getComputedStyle(e).display !== 'none')
        .map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    },
  };
}
