/* ============================================================
   dimensions/folded.js: the page of Folded Space, level 1, first slice (BAR_L1.md): a drawing, the exact cells
   around it, and the call. The engine is the kill test's (mlp.js, split.js); the call's rules are call.js; the
   plate's geometry is plate.js. This file only draws and listens.
   ============================================================ */

import { forward, template, argmax } from './mlp.js';
import { mosaic, certify } from './split.js';
import { netFromFile, digitFrom, candidates, verdict, softmax, smallestFlip } from './call.js';
import { fnv1a } from '../kit/rng.js';
import { frameAlong, run } from './plate.js';
import { reduce } from './pad.js';
import { el } from '../kit/dom.js';
import { int, fixed } from '../kit/format.js';
import { tallySvg } from '../kit/controls.js';
import { startKeep } from './keep.js';
import { tallyOf, pixelsTo64, pixelsFrom64, modeOf } from './record.js';

/** The record's id of drawing i: 'ex-<test index>' for an example, 'pad-<n>' for the visitor's. */
const idOf = (i) => (S.digits[i].mine ? S.digits[i].index : 'ex-' + S.digits[i].index);
/** An action the visitor took, kept with its time and mode (atlas evidence.1.1). */
const act = (what, i = S.i) => { const id = idOf(i); S.keep.action({ t: Date.now(), mode: modeOf(id), what, drawing: id }); };

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

// Canvas colours from the site's tokens (atlas interface.2.2): the ground, the brightest ink, and the horizon blue.
const tok = (name, fallback) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); const m = /^#([0-9a-f]{6})$/i.exec(v);
  return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : fallback; };
const VOID = tok('--void', [6, 8, 13]), HI = tok('--text-bright', [234, 240, 251]), HORIZON = tok('--horizon', [159, 179, 214]);
const MID = VOID.map((v, i) => Math.round(v + (HORIZON[i] - v) * 0.16)), LO = VOID.map((v) => Math.round(v * 0.35));
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
function paint(canvas, colourAt) {
  const g = canvas.getContext('2d'), im = g.createImageData(28, 28);
  for (let p = 0; p < 784; p++) { const [r, gg, b] = colourAt(p); im.data.set([r, gg, b, 255], 4 * p); }
  g.putImageData(im, 0, 0);
}
const paintInk = (canvas, x) => paint(canvas, (p) => mix(VOID, HI, x[p]));
const paintSigned = (canvas, t) => { let m = 0; for (const v of t) m = Math.max(m, Math.abs(v)); paint(canvas, (p) => { const s = t[p] / (m || 1); return s >= 0 ? mix(MID, HI, s) : mix(MID, LO, -s); }); };
const paintCorner = (canvas, signs) => paint(canvas, (p) => (signs[p] > 0 ? mix(MID, HI, 0.55) : mix(MID, LO, 0.55)));

const S = { net: null, digits: [], xs: [], eps: 0.1, i: 0, cands: null, plate: null, picked: null, v: null, padMode: 'example', mine: 0, keep: null, ledgerNames: {} };

/* The pad: strokes of PAD_LINE px on a PAD px square (MNIST's strokes are about a tenth of a digit's height). Each
   stroke is read as it is drawn (the answer moves); on release the drawing joins the strip and gets its cells. */
const PAD = 280, PAD_LINE = 20;

/* Hardening (BAR_L1 part 10): the worker trains a copy; every 50 steps the page redraws the walls of the current
   plane with the new weights, so the visitor sees them move. Then the second call runs on the hardened network. */
const HARDEN = { steps: 300, batch: 64, every: 50 };
let subsetData = null;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
async function harden() {
  if (S.hardening || S.hardened) return;
  S.hardening = true;
  const btn = $('harden'); btn.disabled = true; btn.textContent = 'Hardening';
  const stop = (said) => { S.hardening = false; btn.disabled = false; btn.textContent = 'Harden the network'; $('hardnote').textContent = said; };
  if (!subsetData) {
    try {
      const r = await fetch('assets/data/dimensions/subset.json');
      if (!r.ok) throw new Error(String(r.status));
      const o = await r.json();
      subsetData = { labels: o.labels, pixels: Uint8Array.from(atob(o.pixels), (c) => c.charCodeAt(0)) };
    } catch { stop('The digits for hardening did not load. Press Harden the network to try again.'); return; }
  }
  const extra = S.xs.map((x, k) => (S.digits[k].mine ? { x: Array.from(x), label: argmax(forward(S.net, x)) } : null)).filter(Boolean);
  const x0 = S.xs[S.i], name = S.digits[S.i].mine ? 'Your drawing' : `The example ${S.digits[S.i].label}`;
  const before = smallestFlip(S.net, x0);
  let worker;
  try { worker = new Worker(new URL('./harden.worker.js', import.meta.url), { type: 'module' }); }
  catch { stop('This browser could not start the hardening in the background. Press Harden the network to try again.'); return; }
  worker.onmessage = (e) => {
    const m = e.data, tmp = { sizes: S.net.sizes, W: m.W, b: m.b };
    $('hardnote').textContent = `Step ${int(m.step)} of ${int(m.steps)}, ${fixed(m.ms / 1000, 1)} s.`;
    document.body.dataset.hardenStep = String(m.step);
    if (!m.done && !reducedMotion()) {
      const M = mosaic(tmp, S.plate.fr);
      S.plate = { ...S.plate, M, R: run(M.cells, S.plate.fr.L) };
      drawPlate(false); $('t-cells').textContent = `${int(M.cells.length)}, exact`;
    }
    if (m.done) {
      worker.terminate();
      S.net = tmp; S.hardening = false; S.hardened = true;
      const after = smallestFlip(S.net, x0);
      S.ledgerNames[idOf(S.i)] = name;
      S.keep.ledger({ t: Date.now(), mode: modeOf(idOf(S.i)), drawing: idOf(S.i), before, after });
      btn.textContent = 'Hardened';
      $('hardnote').textContent = `Hardened in ${fixed(m.ms / 1000, 1)} s. Call again: the corners are the hardened network's own.`;
      show(S.i, { keepPad: S.digits[S.i].mine });
      Object.assign(document.body.dataset, { hardened: '1', ledgerBefore: String(before), ledgerAfter: String(after) });
    }
  };
  worker.onerror = () => { S.hardening = false; btn.disabled = false; btn.textContent = 'Harden the network'; $('hardnote').textContent = 'Hardening stopped. Press again to retry.'; };
  worker.postMessage({ sizes: S.net.sizes, W: S.net.W, b: S.net.b, pixels: subsetData.pixels, labels: subsetData.labels, extra, eps: S.eps,
    steps: HARDEN.steps, batch: HARDEN.batch, every: HARDEN.every, seed: fnv1a('folded|harden|' + S.digits[S.i].index) });
}
function padGray() {
  const d = $('pad').getContext('2d').getImageData(0, 0, PAD, PAD).data;
  const g = new Float64Array(PAD * PAD);
  for (let p = 0; p < g.length; p++) g[p] = d[4 * p] / 255;
  return g;
}
function clearPad() {
  const g = $('pad').getContext('2d'); g.fillStyle = 'rgb(' + VOID.join(',') + ')'; g.fillRect(0, 0, PAD, PAD);
}
function paintPadFrom(x) {
  const small = document.createElement('canvas'); small.width = small.height = 28; paintInk(small, x);
  clearPad();
  const g = $('pad').getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(small, PAD * 0.12, PAD * 0.12, PAD * 0.76, PAD * 0.76);
}
function liveRead() {
  const x = reduce(padGray(), PAD, PAD);
  if (!x.some((v) => v > 0)) return null;
  const z = Array.from(forward(S.net, x)), p = softmax(z), a = argmax(z);
  drawSimplex(p);
  $('readout').replaceChildren('Read as ', el('b', '', String(a)), ` at ${fixed(100 * p[a], 1)}%`);
  return { x, a };
}
function setupPad() {
  const cv = $('pad'), g = cv.getContext('2d');
  let down = false, last = null, queued = false;
  const at = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) * PAD) / r.width, ((e.clientY - r.top) * PAD) / r.height]; };
  const ink = () => { g.strokeStyle = 'rgb(' + HI.join(',') + ')'; g.lineWidth = PAD_LINE; g.lineCap = 'round'; g.lineJoin = 'round'; };
  cv.addEventListener('pointerdown', (e) => {
    if (S.padMode !== 'drawing') { clearPad(); S.padMode = 'drawing'; }
    down = true; cv.setPointerCapture?.(e.pointerId); last = at(e);
    ink(); g.beginPath(); g.arc(last[0], last[1], PAD_LINE / 2, 0, 2 * Math.PI); g.fillStyle = g.strokeStyle; g.fill();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down) return;
    const q = at(e); ink(); g.beginPath(); g.moveTo(last[0], last[1]); g.lineTo(q[0], q[1]); g.stroke(); last = q;
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; liveRead(); }); }
  });
  const end = () => {
    if (!down) return; down = false;
    const r = liveRead();
    if (r) commitDrawing(r.x, r.a);
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('clear').addEventListener('click', () => {
    act('clear');
    clearPad(); S.padMode = 'drawing';
    S.digits.forEach((d) => { if (d.mine) d.open = false; }); // the next stroke starts a new drawing
    $('hint').textContent = 'The pad is clear. Draw a digit.';
  });
}
function commitDrawing(x, a) {
  // The visitor's drawing: one entry in the strip, replaced while the same drawing grows stroke by stroke.
  const last = S.digits.length - 1;
  const growing = S.digits[last]?.mine && S.digits[last].open;
  if (growing) { S.xs[last] = x; } else { S.mine += 1; S.xs.push(x); S.digits.push({ index: 'pad-' + S.mine, label: null, mine: true, open: true }); addStripButton(S.xs.length - 1); }
  S.keep.drawing({ t: Date.now(), mode: 'pad', id: S.digits[S.xs.length - 1].index, pixels: pixelsTo64(x) });
  const j = S.xs.length - 1;
  paintInk($('strip').children[j].querySelector('canvas'), x);
  $('hint').textContent = `Your drawing is read as ${a}. Add strokes, or clear the pad for a new one.`;
  show(j, { keepPad: true });
  document.body.dataset.drawn = String(S.mine);
  document.body.dataset.read = String(a);
}
function addStripButton(j) {
  const b = el('button', ''); b.type = 'button'; b.setAttribute('role', 'listitem');
  b.setAttribute('aria-label', S.digits[j].mine ? `Your drawing ${S.mine}` : `Drawing ${j + 1}, a ${S.digits[j].label}`);
  const cv = el('canvas', ''); cv.width = cv.height = 28; paintInk(cv, S.xs[j]); b.append(cv);
  b.addEventListener('click', () => { act('pick', j); show(j); });
  $('strip').append(b);
}

function drawSimplex(p) {
  const root = $('simplex'); root.replaceChildren();
  const size = 260, R = size * 0.38, cx = size / 2, cy = size / 2;
  const V = Array.from({ length: 10 }, (_, k) => [cx + R * Math.cos(-Math.PI / 2 + (2 * Math.PI * k) / 10), cy + R * Math.sin(-Math.PI / 2 + (2 * Math.PI * k) / 10)]);
  for (let a = 0; a < 10; a++) for (let b = a + 1; b < 10; b++) root.append(svg('line', { x1: V[a][0], y1: V[a][1], x2: V[b][0], y2: V[b][1], class: 'edge' }));
  const top = argmax(p);
  V.forEach(([x, y], k) => { const t = svg('text', { x: cx + (x - cx) * 1.17, y: cy + (y - cy) * 1.17 + 4, class: 'vlabel' + (k === top ? ' on' : '') }); t.textContent = String(k); root.append(t); });
  const px = p.reduce((a, v, k) => a + v * V[k][0], 0), py = p.reduce((a, v, k) => a + v * V[k][1], 0);
  root.append(svg('circle', { cx: px, cy: py, r: 5, class: 'answer' }));
}

function drawPlate(revealed) {
  const root = $('plate'); root.replaceChildren();
  const { fr, M, R } = S.plate, size = 640, k = size / (2 * fr.H);
  const X = (u) => (u + fr.H) * k, Y = (v) => (fr.H - v) * k;
  for (let i = 1; i < 10; i++) { const g = (i * size) / 10; root.append(svg('line', { x1: g, y1: 0, x2: g, y2: size, class: 'grat' + (i === 5 ? ' axis' : '') }), svg('line', { x1: 0, y1: g, x2: size, y2: g, class: 'grat' + (i === 5 ? ' axis' : '') })); }
  for (let i = 1; i < 50; i++) { const g = (i * size) / 50; root.append(svg('line', { x1: g, y1: size / 2 - 3, x2: g, y2: size / 2 + 3, class: 'minor' }), svg('line', { x1: size / 2 - 3, y1: g, x2: size / 2 + 3, y2: g, class: 'minor' })); }
  const pts = (poly) => poly.map((q) => X(q[0]).toFixed(2) + ',' + Y(q[1]).toFixed(2)).join(' ');
  if (revealed) for (const o of R.passed) root.append(svg('polygon', { points: pts(o.cell.poly), class: 'persist' }));
  for (const c of M.cells) root.append(svg('polygon', { points: pts(c.poly), class: 'wall' }));
  const xa = -fr.L / 2, xb = fr.L / 2;
  if (revealed) {
    // Gold only for what fired: the run is gold when its corner changed the answer, and quiet ink when it did not.
    const q = S.cands.list.find((c) => c.kind === 'template').changes ? '' : ' quiet';
    root.append(svg('line', { x1: X(xa), y1: Y(0), x2: X(xb), y2: Y(0), class: 'run' + q }));
    for (const t of R.ticks) { const u = xa + t * fr.L; root.append(svg('line', { x1: X(u), y1: Y(0) - 6, x2: X(u), y2: Y(0) + 6, class: 'tick' + q })); }
    root.append(svg('circle', { cx: X(xb), cy: Y(0), r: 5, class: 'to' + q }));
  }
  root.append(svg('circle', { cx: X(xa), cy: Y(0), r: 5, class: 'from' }));
  const pct = (v) => (100 * v) / size + '%';
  const from = $('pl-from'), to = $('pl-to');
  from.textContent = `your ${S.cands.answer}`; from.style.left = pct(X(xa)); from.style.top = `calc(${pct(Y(0))} - 26px)`;
  const tmpl = S.cands.list.find((c) => c.kind === 'template');
  to.textContent = revealed ? `the template's corner, read ${tmpl.read}` : '';
  to.classList.toggle('quiet', revealed && !tmpl.changes);
  to.style.left = pct(X(xb) - 40); to.style.top = `calc(${pct(Y(0))} + 12px)`;
  $('t-walls').textContent = revealed ? String(R.ticks.length) : 'after the call';
}

function drawCands() {
  const box = $('cands'); box.replaceChildren();
  S.cands.list.forEach((c, i) => {
    const b = el('button', ''); b.type = 'button';
    const cv = el('canvas', ''); cv.width = cv.height = 28; paintCorner(cv, c.signs);
    const txt = el('span', '');
    // Before the call a corner is named by its place only, so its name is not the key (atlas practice.1.1).
    txt.append(el('span', 'cl', S.v ? c.label : `Corner ${i + 1}`));
    const res = el('span', 'cr', '');
    if (S.v) { res.textContent = c.changes ? `read as ${c.read}` : `still read as ${S.cands.answer}`; if (c.changes) res.classList.add('fired'); }
    txt.append(res);
    b.append(cv, txt);
    b.setAttribute('aria-pressed', String(S.picked === i));
    b.dataset.kind = c.kind;
    if (S.v) b.disabled = true; else b.addEventListener('click', () => call(i));
    box.append(b);
  });
}

function call(i) {
  if (S.v) return;
  S.picked = i;
  S.v = verdict(S.cands, i);
  const c = S.cands.list[i], d = S.digits[S.i];
  S.keep.call({ t: Date.now(), mode: d.mine ? 'pad' : 'example', drawing: d.mine ? d.index : 'ex-' + d.index, kind: c.kind, answer: S.cands.answer, read: c.read,
    right: S.v.right, counted: S.v.counted, network: S.hardened ? 'hardened' : 'original' });
  $('verdict').textContent = !S.v.counted
    ? (S.hardened ? `None of these three corners changes it now: after hardening, each of these steps of ${S.eps} of full ink keeps the answer at ${S.cands.answer}. This call is not counted.`
      : 'None of the three changes the answer here, so this call is not counted.')
    : S.v.right ? `Right. This corner changes the answer to ${c.read}.` : `Not this one. It leaves the answer at ${S.cands.answer}.`;
  drawCands(); drawPlate(true); showTemplate(true);
  nextAction(S.hardened ? 'Next: draw your own digit, or pick another, and call again.' : 'Next: harden the network, then call the same drawing again.');
}

function drawTally() {
  // The tally is computed from the calls the store confirmed (the store is the truth).
  const t = tallyOf(S.keep ? S.keep.current() : { calls: [] });
  $('tally').replaceChildren('Calls right: ', el('b', t.right > 0 ? '' : 'none', int(t.right)), ` of ${int(t.made)}`, tallySvg(t.made, t.right, 180).svg);
  document.body.dataset.called = String(t.made); document.body.dataset.right = String(t.right);
}
function nextAction(s) { $('nextline').textContent = s; }
/** The template and its sentence, shown once the call is made (its sign is the key). */
function showTemplate(on) {
  $('tplbox').hidden = !on;
  if (!on) return;
  const { rival, answer } = S.cands;
  $('tplnote').textContent = `Inside this cell, the network's score for ${rival} against ${answer} is this picture times the drawing, plus a constant [REAL]. Its sign is the corner that changes that score most to first order; a step can cross walls, where the picture changes.`;
}
function drawLedger(rec) {
  const fmt = (v) => (v === null ? 'over 0.5' : fixed(v, 3));
  const name = (id) => S.ledgerNames[id] || (id.startsWith('pad-') ? 'Your drawing' : `The example ${S.digits.find((d) => 'ex-' + d.index === id)?.label ?? ''}`);
  $('ledgernote').hidden = rec.ledger.length > 0;
  $('ledger').replaceChildren(...rec.ledger.slice(-6).map((l) => { const row = el('tr', ''); row.append(el('td', '', name(l.drawing)), el('td', 'n', fmt(l.before)), el('td', 'n', fmt(l.after))); return row; }));
}
function restoreDrawings(rec) {
  // The visitor's drawings kept from an earlier visit join the strip once, as closed drawings.
  for (const d of rec.drawings) {
    if (S.digits.some((x) => x.index === d.id)) continue;
    const n = Number(d.id.slice(4)); if (n > S.mine) S.mine = n;
    S.xs.push(pixelsFrom64(d.pixels)); S.digits.push({ index: d.id, label: null, mine: true, open: false }); addStripButton(S.xs.length - 1);
  }
}

function show(i, { keepPad = false } = {}) {
  S.i = i; S.picked = null; S.v = null;
  const x = S.xs[i];
  // A drawing of the visitor's stays on the pad as drawn; a later stroke on another drawing starts a new one.
  S.digits.forEach((d, k) => { if (d.mine && k !== i) d.open = false; });
  if (!keepPad) { if (S.digits[i].mine) S.digits[i].open = false; paintPadFrom(x); S.padMode = 'example'; }
  [...$('strip').children].forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
  const z = Array.from(forward(S.net, x)), p = softmax(z), a = argmax(z);
  drawSimplex(p);
  $('readout').replaceChildren('Read as ', el('b', '', String(a)), ` at ${fixed(100 * p[a], 1)}%`);
  S.cands = candidates(S.net, x, S.eps, S.digits[i].index);
  const { rival, answer } = S.cands;
  paintSigned($('tpl'), template(S.net, x, rival, answer));
  const tmpl = S.cands.list.find((c) => c.kind === 'template');
  const third = S.xs.find((_, j) => j !== i && S.digits[j].label === rival) || S.xs[(i + 1) % S.xs.length];
  const fr = frameAlong(x, tmpl.xc, third, 1.5);
  const t0 = performance.now();
  const M = mosaic(S.net, fr);
  const ms = performance.now() - t0;
  S.plate = { fr, M, R: run(M.cells, fr.L), ms, certFailures: certify(S.net, fr, M.cells) };
  $('t-cells').textContent = `${int(M.cells.length)}, exact`;
  $('t-eps').textContent = `${S.eps} of full ink`;
  $('t-ms').textContent = `${int(Math.round(ms))} ms`;
  nextAction(`Next: call which corner changes the ${answer}.`);
  showTemplate(false);
  $('question').textContent = `${S.hardened ? 'The network is hardened. ' : ''}Each corner moves every pixel by ${S.eps} of full ink. Which one changes the answer from ${answer}?`;
  $('verdict').textContent = '';
  drawCands(); drawPlate(false);
  Object.assign(document.body.dataset, { digit: String(i), answer: String(answer), cells: String(M.cells.length), walls: String(S.plate.R.ticks.length), cert: String(S.plate.certFailures) });
}

async function start() {
  try {
    const get = (f, tag) => fetch(`assets/data/dimensions/${f}`).then((r) => { if (!r.ok) throw new Error(tag); return r.json(); }).catch((err) => { throw new Error(err && err.message === tag ? tag : tag); });
    const [nj, dj] = await Promise.all([get('net.json', 'network'), get('digits.json', 'digits')]);
    S.net = netFromFile(nj); S.eps = nj.source.eps_by_rule; S.digits = dj.items; S.xs = dj.items.map(digitFrom);
  } catch (e) {
    $('readout').textContent = `${e && e.message === 'digits' ? 'The example digits' : 'The network\'s file'} did not load. Reload the page to try again.`;
    document.body.dataset.state = 'error';
    return;
  }
  S.xs.forEach((_, j) => addStripButton(j));
  setupPad();
  $('next').addEventListener('click', () => { const j = (S.i + 1) % S.xs.length; act('next', j); show(j); });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'n' || e.key === 'N') $('next').click();
    if (e.key === 'c' || e.key === 'C') $('clear').click();
  });
  $('harden').addEventListener('click', harden);
  S.keep = startKeep({
    onRecord: (rec, line) => { restoreDrawings(rec); drawTally(); drawLedger(rec); $('health').textContent = line; document.body.dataset.kept = String(rec.calls.length); },
    onSay: (s) => { $('keepnote').textContent = s; },
  });
  drawTally();
  show(Math.max(0, S.digits.findIndex((d) => d.label === 4)));
  document.body.dataset.state = 'ready';
}

start();
