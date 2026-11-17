/* ============================================================
   blackhole/drawing.js — the instrument as one drawing (BAR_L1
   section 6): sheet 1 is the picture with its own scales, a line
   of type for what is drawn, a title block and the frames kept;
   sheets 2 and 3 are the readouts and the settings (the columns of
   cards, unchanged), sheet 4 the sources.

   Every graduation is the engine's (C12): the spin scale's ISCO and
   horizon marks are where kerr.js isco() and horizon() reach round
   radii at the state's charge; the mass scale's marks are OBJECTS'.
   Each scale is a slider (C13): role, value and bounds in aria,
   arrow keys and a drag. A drag holds the pointer on the scale's own
   svg, which is never replaced (only its marks are redrawn), so a
   drag cannot lose its pointer to a redraw (tour.js setHTML).
   The title block's numbers come from the same functions as the
   cards' (derive, measurement, s3, pmText), one per number (C15).
   ============================================================ */

import * as K from './kerr.js';
import { OBJECTS, VIEWS, COLOR_MODES, SCHEMA, COPY } from './config.js';
import { s3, sci, pmText, published, measurement, parsecs, deg, spinText } from './physics.js';
import { setHTML } from './tour.js';
import { linkLabel } from './record.js';

// a link's name never changes, and the strip is drawn on every change of state
const names = new Map();
const nameOf = (q) => { if (!names.has(q)) names.set(q, linkLabel(q)); return names.get(q); };

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

/* app: the page's app; choose: { object(id), view(id), colour(id), sheet(n) } from ui.js, the same actions as the
   cards' buttons; act: { plate(W), link(), json(), csv(), sources() }. */
export function buildDrawing(app, { choose, act, keepRecord }) {
  const { store } = app;
  const body = document.body;
  const wide = () => !window.matchMedia('(max-width: 900px)').matches;

  /* ---------- the head: what is drawn, as one line of type ---------- */
  const head = el('nav', { class: 'bh-hl', id: 'bh-hl', 'aria-label': 'What is drawn' });
  const group = (k, items, pick) => {
    const g = el('span', { class: 'bh-hl-g' }, head);
    el('span', { class: 'bh-hl-k' }, g).textContent = k;
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
  // a child of the bar between its two ends: after Back on a wide screen, its own row under the bar on a phone
  document.querySelector('.bh-bar').insertBefore(head, document.querySelector('.bh-bar-r'));

  /* ---------- the scales ---------- */
  function scale({ id, key, label, toFrac, fromFrac, step, valueText }) {
    const svg = el('svg', { class: 'bh-scale', id, role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': String(BY[key].min), 'aria-valuemax': String(BY[key].max) });
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
      const v = k === 'Home' ? BY[key].min : k === 'End' ? BY[key].max : s + d;
      app.tour?.stop();
      store.set({ [key]: +Math.max(BY[key].min, Math.min(BY[key].max, v)).toFixed(BY[key].digits ?? 3) }, { dur: 250 });
    });
    return { svg, marks, hand, set(v) { svg.setAttribute('aria-valuenow', String(v)); svg.setAttribute('aria-valuetext', valueText(v)); } };
  }

  // spin: a nomogram along the foot of the drawing; the ISCO and the horizon read beneath it at the same place
  const AMAX = BY.a.max;
  const spin = scale({
    id: 'bh-sc-spin', key: 'a', label: 'spin a/M', step: 0.01,
    toFrac: (e, r) => (e.clientX - r.left - SP.x0) / SP.W,
    fromFrac: (f) => f * AMAX,
    valueText: (v) => `a = ${spinText(v)}, ISCO ${s3(K.isco(v, 1, store.get('q')))} M, horizon ${s3(K.horizon(v, store.get('q')))} M`,
  });
  const SP = { x0: 64, W: 520, H: 92 };
  // inclination: a protractor on the left edge, 0 at the spin axis, 90 in the disk's plane
  const incl = scale({
    id: 'bh-sc-incl', key: 'incl', label: 'inclination, degrees from the spin axis', step: 1,
    toFrac: (e, r) => { const x = e.clientX - r.left, y = e.clientY - (r.top + IN.oy); const d = Math.atan2(x, -y) * 180 / Math.PI; return d / 180; },
    fromFrac: (f) => Math.max(BY.incl.min, Math.min(BY.incl.max, f * 180)),
    valueText: (v) => `${deg(v)} degrees`,
  });
  const IN = { R: 108, oy: 138 };
  // mass: a log scale on the right edge with the known holes on it
  const LG = [0, 11];
  const mass = scale({
    id: 'bh-sc-mass', key: 'mass', label: 'mass, log10 of solar masses', step: 0.1,
    toFrac: (e, r) => 1 - (e.clientY - r.top - MS.y0) / MS.H,
    fromFrac: (f) => LG[0] + f * (LG[1] - LG[0]),
    valueText: (v) => `${sci(10 ** v)} solar masses`,
  });
  const MS = { y0: 18, H: 300, W: 150 };

  let lastQ = null;
  let compact = false;
  function drawSpinMarks(q) {
    const g = spin.marks; g.replaceChildren();
    const X = (a) => SP.x0 + (a / AMAX) * SP.W;
    el('line', { x1: SP.x0, y1: 30, x2: SP.x0 + SP.W, y2: 30, class: 'ink' }, g);
    for (let i = 0; i <= 20; i++) {
      const a = Math.min(AMAX, i * 0.05), big = i % 2 === 0;
      el('line', { x1: X(a), y1: 30, x2: X(a), y2: big ? 22 : 26, class: big ? 'ink' : 'faint' }, g);
      if (i % 4 === 0) svgText(g, { x: X(a), y: 18, 'text-anchor': 'middle' }, a.toFixed(1));
    }
    // the engine's radii: where isco() and horizon() reach round values at this charge (C12); on a phone the value
    // line under the hand reads them instead
    if (compact) return;
    const isco = (a) => K.isco(a, 1, q), hor = (a) => K.horizon(a, q);
    el('line', { x1: SP.x0, y1: 46, x2: SP.x0 + SP.W, y2: 46, class: 'faint' }, g);
    el('line', { x1: SP.x0, y1: 70, x2: SP.x0 + SP.W, y2: 70, class: 'faint' }, g);
    const r0 = isco(0), h0 = hor(0);
    svgText(g, { x: SP.x0, y: 60 }, `ISCO ${s3(r0)} M`);
    svgText(g, { x: SP.x0, y: 84 }, `horizon ${s3(h0)} M`);
    for (const r of [4, 3, 2]) { const a = spinFor(isco, r, AMAX); if (a == null || r >= r0) continue; el('line', { x1: X(a), y1: 46, x2: X(a), y2: 51, class: 'ink', 'data-r': String(r), 'data-a': String(a), 'data-of': 'isco' }, g); svgText(g, { x: X(a), y: 60, 'text-anchor': 'middle' }, `${r} M`); }
    for (const r of [1.6, 1.3]) { const a = spinFor(hor, r, AMAX); if (a == null || r >= h0) continue; el('line', { x1: X(a), y1: 70, x2: X(a), y2: 75, class: 'ink', 'data-r': String(r), 'data-a': String(a), 'data-of': 'horizon' }, g); svgText(g, { x: X(a), y: 84, 'text-anchor': 'middle' }, `${r} M`); }
  }
  function drawSpinHand(a, q) {
    const g = spin.hand; g.replaceChildren();
    const x = SP.x0 + (a / AMAX) * SP.W;
    el('line', { x1: x, y1: 20, x2: x, y2: compact ? 34 : 76, class: 'now' }, g);
    el('path', { d: `M${x - 5},30 l5,-7 l5,7 z`, class: 'tip' }, g);
    // the scale's title at its foot, on the reading's baseline: the top row is the ticks' numbers (they collided)
    svgText(g, { x: SP.x0, y: compact ? 50 : 104, class: 'cap' }, 'SPIN a/M');
    svgText(g, { x: SP.x0 + SP.W, y: compact ? 50 : 104, 'text-anchor': 'end', class: 'val' }, `a ${spinText(a)} · ISCO ${s3(K.isco(a, 1, q))} M · horizon ${s3(K.horizon(a, q))} M`);
    spin.set(a);
  }
  function drawInclMarks() {
    const g = incl.marks; g.replaceChildren();
    const P = (d, r) => [r * Math.sin(d * Math.PI / 180), IN.oy - r * Math.cos(d * Math.PI / 180)];
    // on the 0 label's baseline, past it: one line, '0  INCLINATION' (they collided)
    svgText(g, { x: 16, y: IN.oy - IN.R - 10, class: 'cap' }, 'INCLINATION');
    el('path', { d: `M${P(0, IN.R)} A${IN.R},${IN.R} 0 0 1 ${P(180, IN.R)}`, class: 'ink' }, g);
    for (let d = 0; d <= 180; d += 10) { const big = d % 30 === 0; const [x1, y1] = P(d, IN.R), [x2, y2] = P(d, IN.R - (big ? 9 : 5)); el('line', { x1, y1, x2, y2, class: big ? 'ink' : 'faint' }, g); if (big) { const [tx, ty] = P(d, IN.R + 13); svgText(g, { x: tx, y: ty + 3, 'text-anchor': 'middle' }, String(d)); } }
    el('line', { x1: 0, y1: IN.oy, x2: IN.R - 14, y2: IN.oy, class: 'faint', 'stroke-dasharray': '2 3' }, g);
    svgText(g, { x: 6, y: IN.oy + 14 }, 'the disk');
  }
  function drawInclHand(i) {
    const g = incl.hand; g.replaceChildren();
    const x = (IN.R - 2) * Math.sin(i * Math.PI / 180), y = IN.oy - (IN.R - 2) * Math.cos(i * Math.PI / 180);
    el('line', { x1: 0, y1: IN.oy, x2: x, y2: y, class: 'now' }, g);
    el('circle', { cx: x, cy: y, r: 3, class: 'tip' }, g);
    svgText(g, { x: x + 8, y: y - 6, class: 'val' }, `i ${deg(i)}°`);
    incl.set(i);
  }
  function drawMassMarks() {
    const g = mass.marks; g.replaceChildren();
    const Y = (lg) => MS.y0 + MS.H - ((lg - LG[0]) / (LG[1] - LG[0])) * MS.H;
    svgText(g, { x: MS.W, y: 8, 'text-anchor': 'end', class: 'cap' }, 'MASS, SOLAR MASSES');
    el('line', { x1: MS.W, y1: MS.y0, x2: MS.W, y2: MS.y0 + MS.H, class: 'ink' }, g);
    for (let lg = LG[0]; lg <= LG[1]; lg++) {
      el('line', { x1: MS.W, y1: Y(lg), x2: MS.W - (lg % 3 === 0 ? 8 : 4), y2: Y(lg), class: lg % 3 === 0 ? 'ink' : 'faint' }, g);
      if (lg % 3 === 0) { const t = svgText(g, { x: MS.W - 12, y: Y(lg) + 3, 'text-anchor': 'end' }, '10'); const sup = el('tspan', { 'baseline-shift': 'super', 'font-size': '7' }, t); sup.textContent = String(lg); }
    }
    for (const o of OBJECTS.filter((x) => x.mass >= 1 && !x.hypothetical)) {
      const y = Y(Math.log10(o.mass));
      el('line', { x1: MS.W, y1: y, x2: MS.W - 34, y2: y, class: 'faint', 'data-object': o.id }, g);
      svgText(g, { x: MS.W - 38, y: y + 3, 'text-anchor': 'end', 'data-label': o.id }, o.name);
    }
  }
  function drawMassHand(lg) {
    const g = mass.hand; g.replaceChildren();
    const y = MS.y0 + MS.H - ((Math.max(LG[0], Math.min(LG[1], lg)) - LG[0]) / (LG[1] - LG[0])) * MS.H;
    el('line', { x1: MS.W - 46, y1: y, x2: MS.W, y2: y, class: 'now' }, g);
    el('path', { d: `M${MS.W},${y} l-7,-5 l0,10 z`, class: 'tip' }, g);
    const near = OBJECTS.find((o) => o.mass >= 1 && !o.hypothetical && Math.abs(Math.log10(o.mass) - lg) < 0.02);
    for (const tx of mass.marks.querySelectorAll('text[data-label]')) tx.style.display = near && tx.dataset.label === near.id ? 'none' : '';
    svgText(g, { x: MS.W - 50, y: y + 3, 'text-anchor': 'end', class: 'val' }, `${near ? `${near.name} · ` : ''}${sci(10 ** lg)} M☉`);
    mass.set(lg);
  }
  drawInclMarks(); drawMassMarks();

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

  function sheet(n) {
    body.dataset.sheet = String(n);
    for (const [k, b] of Object.entries(tabBtn)) b.setAttribute('aria-selected', String(+k === n));
    choose.sheet?.(n);
    draw();
  }

  function drawTitle() {
    const s = store.all(), m = app.model, ms = measurement(s), o = m.obj, cmp = ms.cmp;
    const name = o ? `${esc(o.name)} <i>${esc(o.kind)}${o.distPc ? `, ${parsecs(o.distPc)}` : ''}</i>` : '<i>a hole of your own</i>';
    const c = (l, v, u = '') => `<div class="c"><span class="l">${l}</span><span class="v">${v}${u ? ` <small>${u}</small>` : ''}</span></div>`;
    setHTML(tbBody, `
      <div class="bh-tb-r bh-tb-h"><div class="c"><h1 class="t">${name}</h1><span class="sub">${esc(COPY.title)}</span></div><div class="c sheetno"><span class="l">sheet</span><span class="v" id="bh-tb-sheet">${body.dataset.sheet || 1} of 4</span></div></div>
      <div class="bh-tb-r g3">${c('mass', sci(m.massSun), 'M☉')}${c('spin a/M', spinText(s.a))}${c('scale', cmp ? pmText(cmp.pred.thetaG, cmp.pred.thetaErrP, cmp.pred.thetaErrM) : (m.thetaG ? s3(m.thetaG) : '--'), 'µas per M')}</div>
      <div class="bh-tb-r g2">${c(`shadow, far observer at ${deg(ms.incl)}°`, `${s3(ms.th.mean)} M${cmp ? ` · ${pmText(cmp.pred.value, cmp.pred.errP, cmp.pred.errM)}` : ''}`, cmp ? 'µas' : '')}${cmp && cmp.shadow ? c(`EHT shadow`, published(cmp.shadow.value, cmp.shadow.err, '±'), 'µas') : cmp && cmp.ring ? c('EHT ring of emission', published(cmp.ring.value, cmp.ring.err, '±'), 'µas') : c('EHT', 'not imaged')}</div>
      <div class="bh-tb-r g4 wideonly">${c('horizon r+', s3(m.rh), 'M')}${c('ISCO', s3(m.ri), 'M')}${c('photon orbit', s3(m.rph), 'M')}${c('Hawking T', sci(m.hawkingK), 'K')}</div>`);
    for (const [id, b] of Object.entries(objOpts)) b.setAttribute('aria-pressed', String(s.obj === id));
    own.textContent = s.obj === 'custom' ? 'a hole of your own' : '';
    for (const [id, b] of Object.entries(viewOpts)) b.setAttribute('aria-pressed', String(s.view === id));
    for (const [id, b] of Object.entries(colOpts)) b.setAttribute('aria-pressed', String(s.color === id));
  }

  /* ---------- the frames kept ---------- */
  const strip = el('div', { class: 'bh-strip', id: 'bh-strip', 'aria-label': 'Frames kept' });
  body.appendChild(strip);
  function drawStrip() {
    const rec = keepRecord(); if (!rec) return;
    const items = rec.kept.slice(0, 3).map((e) => `<a class="bh-fr" href="?${esc(e.q)}">${e.img ? `<img alt="" src="${esc(e.img)}">` : '<span class="ph"></span>'}<span class="cap">${esc(nameOf(e.q))}</span></a>`);
    setHTML(strip, `<span class="k">kept</span>${items.join('')}<button type="button" class="bh-fr add" id="bh-keep2">keep<br>this frame</button>`);
  }
  strip.addEventListener('click', (e) => { if (e.target.closest('#bh-keep2')) document.querySelector('#bh-keep')?.click(); });

  /* ---------- the layout of the scales, by the window ---------- */
  function place() {
    const W = innerWidth, H = innerHeight, phone = !wide();
    compact = phone;
    if (phone) {
      SP.x0 = 18; SP.W = W - 2 * 18 - 4;
      // under the head line, in the sky above the hole: below it the labels and the caption have the frame
      const hl = head.getBoundingClientRect();
      Object.assign(spin.svg.style, { left: '0px', top: Math.round((hl.height ? hl.bottom : 110) + 4) + 'px', width: W + 'px', height: '58px' });
      incl.svg.style.display = 'none'; mass.svg.style.display = 'none';
    } else {
      SP.x0 = 0; SP.W = Math.max(300, Math.min(480, W - 440 - 380 - 140));
      Object.assign(spin.svg.style, { left: '64px', top: (H - 60 - SP.H - 18) + 'px', width: SP.W + 4 + 'px', height: SP.H + 18 + 'px' });
      Object.assign(incl.svg.style, { display: '', left: '23px', top: Math.round(H * 0.47 - IN.oy) + 'px', width: IN.R + 70 + 'px', height: 2 * IN.oy + 'px' });
      Object.assign(mass.svg.style, { display: '', right: '23px', top: Math.round(H * 0.28) + 'px', width: MS.W + 2 + 'px', height: MS.y0 + MS.H + 10 + 'px' });
    }
    lastQ = null; draw();
  }

  function draw() {
    const s = store.all();
    if (s.q !== lastQ) { drawSpinMarks(s.q); lastQ = s.q; }
    const v = store.view(true);
    drawSpinHand(v.a, s.q); drawInclHand(s.incl); drawMassHand(s.mass);
    drawTitle(); drawStrip();
  }
  window.addEventListener('resize', place);
  sheet(1);
  place();

  return {
    draw,
    /** The band of the window the labels on the render may use on sheet 1, [left, right] in px. */
    openBand() { const a = incl.svg.getBoundingClientRect(), b = mass.svg.getBoundingClientRect(); return [incl.svg.style.display === 'none' ? 0 : a.right, mass.svg.style.display === 'none' ? innerWidth : b.left]; },
    sheet,
    /** The boxes of the drawing's own parts that show, [x0, y0, x1, y1]: a label on the render steps aside from them. */
    obstacles() {
      return [spin.svg, incl.svg, mass.svg, tb, strip].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none')
        .map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    },
  };
}
