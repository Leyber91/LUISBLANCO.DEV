/* ============================================================
   dimensions/folded.js: the page of Folded Space, level 1, first slice (BAR_L1.md): a drawing, the exact cells
   around it, and the call. The engine is the kill test's (mlp.js, split.js); the call's rules are call.js; the
   plate's geometry is plate.js. This file only draws and listens.
   ============================================================ */

import { forward, template, argmax } from './mlp.js';
import { mosaic, certify } from './split.js';
import { netFromFile, digitFrom, candidates, verdict, tally, softmax } from './call.js';
import { frameAlong, run } from './plate.js';
import { el } from '../kit/dom.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

const MID = [40, 48, 62], HI = [234, 240, 251], LO = [2, 3, 5], VOID = [6, 8, 13];
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
function paint(canvas, colourAt) {
  const g = canvas.getContext('2d'), im = g.createImageData(28, 28);
  for (let p = 0; p < 784; p++) { const [r, gg, b] = colourAt(p); im.data.set([r, gg, b, 255], 4 * p); }
  g.putImageData(im, 0, 0);
}
const paintInk = (canvas, x) => paint(canvas, (p) => mix(VOID, HI, x[p]));
const paintSigned = (canvas, t) => { let m = 0; for (const v of t) m = Math.max(m, Math.abs(v)); paint(canvas, (p) => { const s = t[p] / (m || 1); return s >= 0 ? mix(MID, HI, s) : mix(MID, LO, -s); }); };
const paintCorner = (canvas, signs) => paint(canvas, (p) => (signs[p] > 0 ? mix(MID, HI, 0.55) : mix(MID, LO, 0.55)));

const S = { net: null, digits: [], xs: [], eps: 0.1, i: 0, cands: null, plate: null, picked: null, v: null, tally: { made: 0, right: 0 } };

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
    root.append(svg('line', { x1: X(xa), y1: Y(0), x2: X(xb), y2: Y(0), class: 'run' }));
    for (const t of R.ticks) { const u = xa + t * fr.L; root.append(svg('line', { x1: X(u), y1: Y(0) - 6, x2: X(u), y2: Y(0) + 6, class: 'tick' })); }
    root.append(svg('circle', { cx: X(xb), cy: Y(0), r: 5, class: 'to' }));
  }
  root.append(svg('circle', { cx: X(xa), cy: Y(0), r: 5, class: 'from' }));
  const pct = (v) => (100 * v) / size + '%';
  const from = $('pl-from'), to = $('pl-to');
  from.textContent = `your ${S.cands.answer}`; from.style.left = pct(X(xa)); from.style.top = `calc(${pct(Y(0))} - 26px)`;
  const tmpl = S.cands.list.find((c) => c.kind === 'template');
  to.textContent = revealed ? `its sharpest corner, read ${tmpl.read}` : '';
  to.style.left = pct(X(xb) - 40); to.style.top = `calc(${pct(Y(0))} + 12px)`;
  $('t-walls').textContent = revealed ? String(R.ticks.length) : 'after the call';
}

function drawCands() {
  const box = $('cands'); box.replaceChildren();
  S.cands.list.forEach((c, i) => {
    const b = el('button', ''); b.type = 'button';
    const cv = el('canvas', ''); cv.width = cv.height = 28; paintCorner(cv, c.signs);
    const txt = el('span', '');
    txt.append(el('span', 'cl', c.label));
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
  S.tally = tally(S.tally, S.v);
  const c = S.cands.list[i];
  $('verdict').textContent = !S.v.counted ? 'None of the three changes the answer here, so this call is not counted.'
    : S.v.right ? `Right. This corner changes the answer to ${c.read}.` : `Not this one. It leaves the answer at ${S.cands.answer}.`;
  drawTally(); drawCands(); drawPlate(true);
  document.body.dataset.called = String(S.tally.made);
}

function drawTally() {
  const t = $('tally'); t.replaceChildren('Calls right: ', el('b', '', String(S.tally.right)), ` of ${S.tally.made}`);
}

function show(i) {
  S.i = i; S.picked = null; S.v = null;
  const x = S.xs[i];
  paintInk($('pad'), x);
  [...$('strip').children].forEach((b, j) => b.setAttribute('aria-current', String(j === i)));
  const z = Array.from(forward(S.net, x)), p = softmax(z), a = argmax(z);
  drawSimplex(p);
  $('readout').replaceChildren('Read as ', el('b', '', String(a)), ` at ${(100 * p[a]).toFixed(1)}%`);
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
  $('t-cells').textContent = `${M.cells.length.toLocaleString('en-US')}, exact`;
  $('t-eps').textContent = `${S.eps} of full ink`;
  $('t-ms').textContent = `${Math.round(ms)} ms`;
  $('question').textContent = `Each corner moves every pixel by ${S.eps}. Which one changes the answer from ${answer}?`;
  $('verdict').textContent = '';
  drawCands(); drawPlate(false);
  Object.assign(document.body.dataset, { digit: String(i), answer: String(answer), cells: String(M.cells.length), walls: String(S.plate.R.ticks.length), cert: String(S.plate.certFailures) });
}

async function start() {
  try {
    const [nj, dj] = await Promise.all([fetch('assets/data/dimensions/net.json').then((r) => r.json()), fetch('assets/data/dimensions/digits.json').then((r) => r.json())]);
    S.net = netFromFile(nj); S.eps = nj.source.eps_by_rule; S.digits = dj.items; S.xs = dj.items.map(digitFrom);
  } catch (e) {
    $('readout').textContent = 'The network did not load. Reload the page to try again.';
    document.body.dataset.state = 'error';
    return;
  }
  const strip = $('strip');
  S.xs.forEach((x, j) => {
    const b = el('button', ''); b.type = 'button'; b.setAttribute('role', 'listitem'); b.setAttribute('aria-label', `Drawing ${j + 1}, a ${S.digits[j].label}`);
    const cv = el('canvas', ''); cv.width = cv.height = 28; paintInk(cv, x); b.append(cv);
    b.addEventListener('click', () => show(j));
    strip.append(b);
  });
  $('next').addEventListener('click', () => show((S.i + 1) % S.xs.length));
  drawTally();
  show(Math.max(0, S.digits.findIndex((d) => d.label === 4)));
  document.body.dataset.state = 'ready';
}

start();
