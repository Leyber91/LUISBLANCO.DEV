/* ============================================================
   heptapod/views.js — the panels below the hero: the key, the
   noise bench, the composer, and the simultaneous / sequential
   comparison. Each takes the DOM it needs and the shared state.
   ============================================================ */

import { GEOM, CODEC, SWEEP, COMPOSE_PRESETS } from './config.js';
import { NOUN } from './lexicon.js';
import { parse, realize, diffGraphs, graphFields, ENUMS, REL_WORD } from './grammar.js';
import { propSpec, graphSpec, specStrokes, functional, cellCenters, ringR } from './geometry.js';
import { inkPage, readPage, Raster } from './codec.js';
import { InkLayer, fitCanvas, fitXf, palette, prefersReduced, drawGuides } from './render.js';
import { SemaStage } from './stage.js';
import { mountEditor } from './editor.js';

const D2R = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const idle = (fn) => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 30));
const whenSeen = (node, fn, margin = '200px') => {
  let done = false;
  const io = new IntersectionObserver((es) => { if (!done && es.some((e) => e.isIntersecting)) { done = true; io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(node);
};

/* ======================= the key ======================= */

const BASE = { type: 'prop', pred: 'give', agent: { c: 'they', num: 'pl' }, patient: { c: 'gift', num: 'sg' }, recipient: null, time: 'present', aspect: 'simple', mood: 'indicative', neg: false, evid: 'direct' };
const withP = (o) => ({ ...clone(BASE), ...o });

const KEY = [
  { title: 'role', param: 'position on the ring', text: 'Clockwise from the top: predicate, then patient, recipient and agent, with the four slots between them.',
    vals: ['pred', 'patient', 'recipient', 'agent'].map((r) => ({ label: r === 'pred' ? 'predicate' : r, prop: withP({ recipient: { c: 'we', num: 'pl' } }), gold: r, focus: 'all' })) },
  { title: 'concept', param: 'curvature of six cells', text: 'Each cell swells out, lies flat or dips in. The first cell is the radical: beings, things, or ideas. The last is a check, so one misread cell is caught.',
    vals: [['human', 'being'], ['ship', 'thing'], ['language', 'idea'], ['heptapod', 'being']].map(([c, k]) => ({ label: `${c} (${k})`, prop: withP({ agent: { c, num: 'sg' } }), gold: 'agent', focus: 'agent' })) },
  { title: 'number', param: 'stroke weight', text: 'A plural entity doubles the weight of its sector. The reader measures thickness along the ray.',
    vals: [['sg', 'one'], ['pl', 'many']].map(([n, l]) => ({ label: l, prop: withP({ agent: { c: 'visitor', num: n } }), gold: 'agent', focus: 'agent' })) },
  { title: 'time', param: 'lean of the crown tendril', text: 'The tendril above the predicate leans back for the past, stands for the present, leans forward for the future.',
    vals: ENUMS.time.map((t) => ({ label: t, prop: withP({ time: t }), gold: 'time', focus: 'crown' })) },
  { title: 'mood', param: 'branch at the mood slot', text: 'Nothing for a statement, a hook outward for a question, a spear inward for a command, a stroke through the ring for can.',
    vals: ENUMS.mood.map((m) => ({ label: { indicative: 'statement', interrogative: 'question', imperative: 'command', potential: 'can' }[m], prop: withP({ mood: m }), gold: 'mood', focus: 'mood' })) },
  { title: 'aspect', param: 'branch at the aspect slot', text: 'Nothing for simple, an inward spiral for an action still going on, an outward loop for one completed.',
    vals: ENUMS.aspect.map((a) => ({ label: { simple: 'simple', progressive: 'ongoing', perfect: 'perfect' }[a], prop: withP({ aspect: a }), gold: 'aspect', focus: 'aspect' })) },
  { title: 'evidence', param: 'branch at the evidence slot', text: 'How the writer knows: nothing when seen, a chain of dots inward when inferred, a doubled line outward when reported by others.',
    vals: ENUMS.evid.map((e) => ({ label: { direct: 'seen', inferred: 'inferred', reported: 'reported' }[e], prop: withP({ evid: e }), gold: 'evid', focus: 'evid' })) },
  { title: 'negation', param: 'a cut in the ring', text: 'A denied proposition is not closed: the ring breaks at the negation slot.',
    vals: [[false, 'affirmed'], [true, 'not']].map(([n, l]) => ({ label: l, prop: withP({ neg: n }), gold: 'neg', focus: 'neg' })) },
  { title: 'embedded clause', param: 'a nested ring', text: 'A clause that fills the patient is written whole as a ring at 0.40 of the radius, and the patient sector splits into two lines that hold it.',
    vals: [['entity', withP({ pred: 'know', patient: { c: 'future', num: 'sg' } })], ['clause', withP({ pred: 'know', patient: { ...clone(BASE), agent: { c: 'we', num: 'pl' }, pred: 'fear', patient: { c: 'ship', num: 'sg' } } })]].map(([l, prop]) => ({ label: l, prop, gold: 'patient', focus: 'all' })) },
  { title: 'relation', param: 'the bridge between two rings', text: 'because flows from the cause on the right into the effect on the left; despite crosses; after arches over; before arches under.',
    vals: ENUMS.rel.map((r) => ({ label: r, graph: { type: 'rel', rel: r, a: withP({}), b: withP({ pred: 'arrive', patient: null, agent: { c: 'ship', num: 'sg' } }) }, gold: 'rel', focus: 'bridge' })) },
];

function focusBounds(spec, focus) {
  if (focus === 'bridge') return { x0: -0.8, x1: 0.8, y0: -0.8, y1: 0.8 };
  if (focus === 'all') return { x0: -1.5, x1: 1.5, y0: -1.5, y1: 1.5 };
  let th, r = 1.08, span = 0.5;
  if (focus === 'crown') { th = 0; r = 1.18; span = 0.42; }
  else { th = spec.lay.items[focus].center; if (['agent', 'patient', 'recipient', 'pred'].includes(focus)) { span = 0.56; r = 0.96; } }
  const x = Math.sin(th * D2R) * r, y = -Math.cos(th * D2R) * r;
  return { x0: x - span, x1: x + span, y0: y - span, y1: y + span };
}

export function mountKey(host) {
  const layer = new InkLayer();
  const jobs = [];
  for (const card of KEY) {
    const c = el('article', 'kcard');
    const param = el('span', 'param', card.param + ' ');
    param.append(el('span', 'tg i', 'illustrative'));
    c.append(el('h3', '', card.title), param, el('p', '', card.text));
    const vals = el('div', 'kvals');
    for (const v of card.vals) {
      const box = el('div', 'kval');
      const cv = el('canvas');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', `${card.title}: ${v.label}`);
      box.append(cv, el('span', '', v.label));
      vals.append(box);
      jobs.push(() => {
        const spec = v.graph ? graphSpec(v.graph) : propSpec(v.prop);
        const { w, h } = fitCanvas(cv, 2);
        const xf = fitXf(focusBounds(spec, v.focus), w, h, 0.02);
        const ink = specStrokes(spec);
        const g = v.gold;
        const gold = (role) => role === g || (g === 'patient' && role && role.startsWith('sub.')) || (g === 'rel' && role === 'rel');
        layer.render(cv, ink, xf, { gold, glow: 1, minW: 0.6 });
      });
    }
    c.append(vals);
    host.append(c);
  }
  const run = () => { const j = jobs.shift(); if (!j) return; j(); idle(run); };
  whenSeen(host, run, '600px');
}

/* ======================= the noise bench ======================= */

export function mountNoise(state) {
  const pageCv = $('np-page'), stripCv = $('np-strip'), chartCv = $('np-chart');
  const slider = $('sigma'), sliderV = $('sigma-v'), typeBox = $('np-type');
  const raster = new Raster();
  const page = document.createElement('canvas');
  page.width = CODEC.W; page.height = CODEC.H;
  // the noise types, each in its own unit; 'mixed' is one knob over all of them
  const TYPES = {
    mixed: { label: 'mixed', unit: 'sigma', min: 0, max: 1, step: 0.01, def: 0.18, toNoise: (v) => ({ sigma: v }), fmt: (v) => v.toFixed(2) },
    jitter: { label: 'jitter', unit: '% of radius', min: 0, max: 8, step: 0.1, def: 1.5, toNoise: (v) => ({ jitter: v / 100 }), fmt: (v) => v.toFixed(1) + ' %' },
    dropout: { label: 'dropout', unit: '% of stroke length', min: 0, max: 50, step: 0.5, def: 8, toNoise: (v) => ({ dropout: v / 100 }), fmt: (v) => v.toFixed(1) + ' %' },
    blots: { label: 'blots', unit: 'blots', min: 0, max: 150, step: 1, def: 20, toNoise: (v) => ({ blots: v }), fmt: (v) => String(Math.round(v)) },
  };
  const st = { type: 'jitter', value: 1.5, seed: 1, graph: null, spec: null, sweep: null, sweeping: false, lastRead: null, token: 0, brush: [], brushMode: 'erase', bench: null };

  for (const [k, t] of Object.entries(TYPES)) {
    const b = el('button', k === st.type ? 'on' : '', t.label);
    b.type = 'button'; b.dataset.v = k; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(k === st.type));
    typeBox.append(b);
  }
  function setType(k, value) {
    st.type = k;
    const t = TYPES[k];
    slider.min = t.min; slider.max = t.max; slider.step = t.step;
    st.value = value ?? t.def;
    slider.value = String(st.value);
    sliderV.textContent = t.fmt(st.value);
    $('sigma-u').textContent = t.unit === 'sigma' ? 'ink noise, mixed' : t.label + ', ' + t.unit;
    typeBox.querySelectorAll('button').forEach((x) => { const on = x.dataset.v === k; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
    state.noise = { type: k, value: st.value };
  }
  typeBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]');
    if (!b) return;
    setType(b.dataset.v);
    st.sweep = null; st.token++; st.sweeping = false;
    schedule(); drawChart(); state.onUrl?.();
  });

  function paintPage(read) {
    const P = palette();
    const pc = page.getContext('2d');
    const img = pc.createImageData(CODEC.W, CODEC.H);
    for (let i = 0; i < raster.d.length; i++) {
      const v = raster.d[i] / 255, o = i * 4;
      img.data[o] = 234 * v; img.data[o + 1] = 240 * v; img.data[o + 2] = 251 * v; img.data[o + 3] = 255;
    }
    pc.putImageData(img, 0, 0);
    const { w, h, dpr } = fitCanvas(pageCv);
    const ctx = pageCv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(page, 0, 0, w, h);
    const k = w / CODEC.W;
    const heads = (part) => {
      if (!part) return;
      const { cx, cy, R } = part.debug.frame;
      ctx.fillStyle = P.goldSoft; ctx.strokeStyle = P.gold; ctx.lineWidth = Math.max(1, dpr * 0.8);
      for (const rd of Object.values(part.debug.reads)) {
        rd.thetas.forEach((th, j) => {
          const r = 1 + GEOM.A * rd.m[j];
          ctx.beginPath(); ctx.arc((cx + Math.sin(th * D2R) * r * R) * k, (cy - Math.cos(th * D2R) * r * R) * k, Math.max(1.6, 1.4 * dpr), 0, Math.PI * 2); ctx.fill();
        });
      }
      ctx.globalAlpha = 0.5;
      for (const key of ['mood', 'neg', 'evid', 'aspect']) {
        const s = part.debug.lay.items[key];
        ctx.beginPath(); ctx.arc(cx * k, cy * k, R * 1.5 * k, (s.center - 10 - 90) * D2R, (s.center + 10 - 90) * D2R); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (part.sub) heads(part.sub);
    };
    if (read.frame === 'prop') heads(read.parts.p); else { heads(read.parts.a); heads(read.parts.b); }
  }

  function paintStrip(read) {
    const P = palette();
    const { w, h, dpr } = fitCanvas(stripCv);
    const ctx = stripCv.getContext('2d');
    const part = read.frame === 'prop' ? read.parts.p : read.parts.a;
    const { cx, cy, R } = part.debug.frame;
    const r0 = 0.55, r1 = 1.55;
    const img = ctx.createImageData(w, h);
    const X = (deg) => ((deg + 180) / 360) * w;
    for (let px = 0; px < w; px++) {
      const deg = (px / w) * 360 - 180, s = Math.sin(deg * D2R), c = -Math.cos(deg * D2R);
      for (let py = 0; py < h; py++) {
        const r = r1 - (py / h) * (r1 - r0);
        const v = raster.at(cx + s * r * R, cy + c * r * R);
        const o = (py * w + px) * 4;
        img.data[o] = 6 + 228 * v; img.data[o + 1] = 8 + 232 * v; img.data[o + 2] = 13 + 238 * v; img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const Y = (r) => ((r1 - r) / (r1 - r0)) * h;
    ctx.font = `500 ${9.5 * dpr}px 'IBM Plex Mono', monospace`;
    ctx.textBaseline = 'top';
    const lay = part.debug.lay;
    const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;
    for (const key of lay.keys) {
      const sec = lay.items[key];
      ctx.strokeStyle = P.lineB; ctx.lineWidth = dpr;
      ctx.beginPath(); ctx.moveTo(X(wrap(sec.start)), 0); ctx.lineTo(X(wrap(sec.start)), h); ctx.stroke();
      ctx.fillStyle = P.dim; ctx.textAlign = 'center';
      ctx.fillText({ pred: 'PRED', agent: 'AGT', patient: 'PAT', recipient: 'RCP', mood: 'MOOD', neg: 'NEG', evid: 'EVID', aspect: 'ASP' }[key], X(wrap(sec.center)), 4 * dpr);
    }
    ctx.strokeStyle = P.line; ctx.setLineDash([2 * dpr, 4 * dpr]);
    ctx.beginPath(); ctx.moveTo(0, Y(1)); ctx.lineTo(w, Y(1)); ctx.stroke(); ctx.setLineDash([]);
    for (const rd of Object.values(part.debug.reads)) {
      rd.thetas.forEach((th, j) => {
        const r = 1 + GEOM.A * rd.m[j];
        ctx.fillStyle = P.goldSoft;
        ctx.fillRect(X(wrap(th)) - dpr, Y(r) - 4 * dpr, 2 * dpr, 8 * dpr);
        const t = Math.round(Math.max(-1, Math.min(1, rd.m[j])));
        ctx.fillStyle = P.dim; ctx.textAlign = 'center';
        ctx.fillText(t > 0 ? '+' : t < 0 ? '-' : '0', X(wrap(th)), h - 14 * dpr);
      });
    }
    ctx.textAlign = 'left'; ctx.fillStyle = P.faint;
    ctx.fillText(read.frame === 'rel' ? 'left ring' : 'r = 1', 6 * dpr, Y(1) + 3 * dpr);
  }

  function showFields(want, got) {
    const box = $('np-fields');
    box.textContent = '';
    const a = graphFields(want), b = graphFields(got);
    for (const k of Object.keys(a)) {
      const li = el('li', a[k] === b[k] ? '' : 'bad');
      li.title = `${k}: written ${a[k]}, read ${b[k] ?? '-'}`;
      li.append(document.createTextNode((a[k] === b[k] ? '= ' : '≠ ') + k.replace(/patient\./g, 'clause.') + ' '), el('b', '', String(b[k] ?? '-')));
      box.append(li);
    }
  }

  const noiseNow = () => TYPES[st.type].toNoise(st.value);
  function applyBrush() {
    for (const b of st.brush) raster.disc(b.x, b.y, b.r, b.mode === 'erase');
  }
  function update() {
    if (!st.spec) return;
    const t0 = performance.now();
    inkPage(st.spec, noiseNow(), st.seed, raster);
    applyBrush();
    const read = readPage(raster);
    const ms = performance.now() - t0;
    st.lastRead = read;
    paintPage(read);
    paintStrip(read);
    const d = diffGraphs(st.graph, read.graph);
    $('np-text').textContent = realize(read.graph);
    const verdict = d.diffs.length ? `FAIL: ${d.diffs.length} of ${d.total} fields misread` : `PASS: all ${d.total} fields recovered`;
    $('np-verdict').textContent = verdict;
    $('np-verdict').className = 'verdict ' + (d.diffs.length ? 'fail' : 'pass');
    $('np-cap').textContent = `the page the decoder reads: ${TYPES[st.type].label} ${TYPES[st.type].fmt(st.value)}${st.brush.length ? `, ${st.brush.length} brush marks` : ''}; ${Math.round(ms)} ms to ink and read`;
    showFields(st.graph, read.graph);
  }

  let pending = 0;
  const schedule = () => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; update(); }); };
  slider.addEventListener('input', () => { st.value = Number(slider.value); sliderV.textContent = TYPES[st.type].fmt(st.value); state.noise = { type: st.type, value: st.value }; schedule(); drawChart(); });
  slider.addEventListener('change', () => state.onUrl?.());
  $('reink').addEventListener('click', () => { st.seed = (st.seed % 997) + 1; schedule(); });

  // directed damage: brush erasure or ink onto the page itself, then read again
  const brushBox = $('np-brush');
  brushBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-v]');
    if (!b) return;
    if (b.dataset.v === 'clear') { st.brush = []; schedule(); return; }
    st.brushMode = b.dataset.v;
    brushBox.querySelectorAll('button[data-v="erase"],button[data-v="ink"]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
  });
  let painting = false;
  const paintAt = (ev) => {
    const r = pageCv.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * CODEC.W, y = ((ev.clientY - r.top) / r.height) * CODEC.H;
    const last = st.brush[st.brush.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 6) return;
    st.brush.push({ x, y, r: 9, mode: st.brushMode });
    if (st.brush.length > 600) st.brush.shift();
    schedule();
  };
  pageCv.addEventListener('pointerdown', (ev) => { painting = true; pageCv.setPointerCapture(ev.pointerId); paintAt(ev); });
  pageCv.addEventListener('pointermove', (ev) => { if (painting) paintAt(ev); });
  pageCv.addEventListener('pointerup', () => { painting = false; });
  pageCv.addEventListener('pointercancel', () => { painting = false; });

  /* ---- the curves: the offline bench (200 propositions per level) and this sentence, live ---- */
  fetch(new URL('./bench.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => { st.bench = j; drawChart(); showBench(); }).catch(() => {});
  function showBench() {
    const b = st.bench;
    if (!b) return;
    const parts = Object.entries(b.types).map(([k, t]) => `${k} ${t.breaking ?? '>' + t.rows[t.rows.length - 1].value} (${t.unit})`);
    $('bench-cap').textContent = `Measured by bench.mjs on ${b.date}: ${b.propositions} random propositions per level, exact recovery of the whole graph. Breaking points, where recovery falls below half: ${parts.join('; ')}.`;
  }

  function drawChart() {
    const P = palette();
    const { w, h, dpr } = fitCanvas(chartCv);
    const ctx = chartCv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const L = 34 * dpr, Rm = 10 * dpr, T = 12 * dpr, B = 26 * dpr;
    const t = TYPES[st.type];
    const span = st.type === 'mixed' ? 1 : t.max;
    const X = (v) => L + (v / span) * (w - L - Rm), Y = (v) => T + (1 - v) * (h - T - B);
    ctx.strokeStyle = P.line; ctx.lineWidth = dpr;
    ctx.font = `500 ${9.5 * dpr}px 'IBM Plex Mono', monospace`; ctx.fillStyle = P.faint;
    for (const v of [0, 0.5, 1]) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(w - Rm, Y(v)); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`${v * 100}%`, L - 5 * dpr, Y(v)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) { const v = (span * i) / 4; ctx.fillText(st.type === 'mixed' ? v.toFixed(2) : String(+v.toFixed(1)), X(v), h - B + 6 * dpr); }
    ctx.textAlign = 'right'; ctx.fillText(t.unit, w - Rm, h - B + 16 * dpr);
    ctx.strokeStyle = P.lineB; ctx.setLineDash([2 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(X(st.value), T); ctx.lineTo(X(st.value), h - B); ctx.stroke(); ctx.setLineDash([]);
    const plot = (pts, color, width, dash) => {
      ctx.strokeStyle = color; ctx.lineWidth = width * dpr; ctx.setLineDash(dash ? [4 * dpr, 3 * dpr] : []);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(X(x), Y(y), 2 * dpr, 0, Math.PI * 2); ctx.fill(); }
    };
    const bt = st.bench && st.bench.types[st.type];
    if (bt) {
      plot(bt.rows.map((r) => [r.value, r.exact]), P.ink, 1.6);
      if (bt.breaking != null) {
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.2 * dpr;
        ctx.beginPath(); ctx.moveTo(X(bt.breaking), T); ctx.lineTo(X(bt.breaking), h - B); ctx.stroke();
        ctx.fillStyle = P.goldSoft; ctx.textAlign = bt.breaking > span * 0.6 ? 'right' : 'left'; ctx.textBaseline = 'top';
        ctx.fillText(` breaks at ${bt.breaking} `, X(bt.breaking), T + 2 * dpr);
      }
    }
    const sw = st.sweep;
    if (sw) plot(sw.rows.filter((r) => r.n).map((r) => [r.v, r.exact / r.n]), P.horizonDim, 1.2, true);
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = P.dim;
    ctx.fillText(bt ? 'solid: 200 random propositions per level' : '', L + 4 * dpr, h - B - 4 * dpr);
    if (sw) { ctx.fillStyle = P.horizonDim; ctx.fillText('dashed: this sentence', L + 4 * dpr, h - B - 16 * dpr); }
  }

  async function measure() {
    if (st.sweeping || !st.spec) return;
    st.sweeping = true;
    const token = ++st.token;
    const btn = $('measure');
    btn.disabled = true;
    const rs = new Raster();
    const t = TYPES[st.type];
    const levels = Array.from({ length: 9 }, (_, i) => (st.type === 'mixed' ? 1 : t.max) * i / 8);
    const sw = { rows: levels.map((v) => ({ v, n: 0, exact: 0 })), worst: {} };
    st.sweep = sw;
    const graph = st.graph, spec = st.spec;
    for (const row of sw.rows) {
      for (let k = 0; k < SWEEP.trials; k++) {
        await new Promise((r) => setTimeout(r, 0));
        if (token !== st.token) { st.sweeping = false; btn.disabled = false; return; }
        inkPage(spec, t.toNoise(row.v), 101 + k, rs);
        const d = diffGraphs(graph, readPage(rs).graph);
        row.n++;
        if (!d.diffs.length) row.exact++;
        for (const x of d.diffs) { const f = x.field.replace(/^(a|b)\./, '').replace(/patient\./, 'clause.'); sw.worst[f] = (sw.worst[f] || 0) + 1; }
      }
      drawChart();
    }
    let star = null;
    for (let i = 1; i < sw.rows.length; i++) {
      const a = sw.rows[i - 1], b = sw.rows[i], va = a.exact / a.n, vb = b.exact / b.n;
      if (va >= 0.5 && vb < 0.5) { star = a.v + (b.v - a.v) * (va - 0.5) / (va - vb); break; }
    }
    const worst = Object.entries(sw.worst).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
    $('chart-cap').textContent = `This sentence, ${SWEEP.trials} inkings per level: ${star != null ? `recovery falls below half at ${t.fmt(star)}` : 'it survives every level shown'}. First to fail: ${worst.join(', ') || 'nothing'}.`;
    state.lastSweep = { sentence: realize(graph), type: st.type, star, rows: sw.rows.map((r) => ({ level: r.v, exact: r.exact / r.n })) };
    drawChart();
    btn.disabled = false;
    st.sweeping = false;
  }
  $('measure').addEventListener('click', () => { st.sweeping = false; st.token++; measure(); });
  addEventListener('resize', () => { if (st.lastRead) { paintPage(st.lastRead); paintStrip(st.lastRead); } drawChart(); });

  let seen = false;
  whenSeen($('noise'), () => { seen = true; update(); drawChart(); }, '300px');
  setType('jitter', 1.5);

  return {
    setNoise(type, value) { if (TYPES[type]) setType(type, Math.max(TYPES[type].min, Math.min(TYPES[type].max, value))); },
    setGraph(graph, spec) {
      st.graph = graph; st.spec = spec; st.token++; st.sweeping = false; st.sweep = null; st.brush = [];
      $('measure').disabled = false;
      $('chart-cap').textContent = 'Measure this sentence to add its own curve.';
      if (seen) { update(); drawChart(); }
    },
  };
}

/* ======================= the composer ======================= */

export function mountCompose(state) {
  const a = $('cp-a'), b = $('cp-b'), relBox = $('cp-rel'), status = $('cp-status');
  const stage = new SemaStage($('cp'), { labels: true, head: false, onSettle: (spec) => readBack(spec) });
  let rel = 'because', ga = null, gb = null, building = 0;
  const RELLAB = { because: 'because', despite: 'despite', after: 'after', before: 'before' };
  for (const r of ENUMS.rel) {
    const btn = el('button', r === rel ? 'on' : '', RELLAB[r]);
    btn.type = 'button'; btn.dataset.v = r; btn.setAttribute('role', 'radio'); btn.setAttribute('aria-checked', String(r === rel));
    relBox.append(btn);
  }
  relBox.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-v]');
    if (!btn) return;
    rel = btn.dataset.v;
    relBox.querySelectorAll('button').forEach((x) => { const on = x === btn; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
    build('rel');
  });

  function readBack(spec) {
    const my = ++building;
    idle(() => {
      if (my !== building) return;
      const rs = new Raster();
      inkPage(spec, 0, 1, rs);
      const r = readPage(rs);
      const d = diffGraphs(spec.graph, r.graph);
      $('cp-rb').textContent = realize(r.graph) + (d.diffs.length ? `  (${d.diffs.length} fields misread)` : '');
    });
  }

  function setFromGraphs(how = 'morph') {
    const g = { type: 'rel', rel, a: ga, b: gb };
    const spec = graphSpec(g);
    spec.graph = g;
    stage.set(spec, how);
    state.compose = g;
    mountEditor($('cp-ed-a'), ga, { compact: true, prefix: 'a.', onHover: (r) => stage.setActive(r), onChange: (p) => { ga = p; a.value = realize(p); build('edit', false); } });
    mountEditor($('cp-ed-b'), gb, { compact: true, prefix: 'b.', onHover: (r) => stage.setActive(r), onChange: (p) => { gb = p; b.value = realize(p); build('edit', false); } });
    state.onUrl?.();
  }

  function build(why, reparse = true) {
    if (reparse) {
      const pa = parse(a.value), pb = parse(b.value);
      const bad = [];
      if (!pa.graph || pa.graph.type !== 'prop') bad.push('main: ' + (pa.errors[0] || 'one clause only'));
      if (!pb.graph || pb.graph.type !== 'prop') bad.push('second: ' + (pb.errors[0] || 'one clause only'));
      if (bad.length) { status.textContent = bad.join('; '); return; }
      if (pa.graph.mood === 'imperative' || pa.graph.mood === 'interrogative' || pb.graph.mood === 'imperative' || pb.graph.mood === 'interrogative') { status.textContent = 'a relation joins two statements'; return; }
      ga = pa.graph; gb = pb.graph;
    }
    status.textContent = `${realize({ type: 'rel', rel, a: ga, b: gb })}`;
    setFromGraphs(why === 'init' ? 'grow' : 'morph');
  }

  const pres = $('cp-presets');
  COMPOSE_PRESETS.forEach((pr) => {
    const c = el('button', 'chip', `${pr.a.replace(/\.$/, '')} ${REL_WORD[pr.rel]} ${pr.b[0].toLowerCase() + pr.b.slice(1)}`);
    c.type = 'button';
    c.addEventListener('click', () => {
      a.value = pr.a; b.value = pr.b; rel = pr.rel;
      relBox.querySelectorAll('button').forEach((x) => { const on = x.dataset.v === rel; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      build('preset');
    });
    pres.append(c);
  });
  for (const inp of [a, b]) inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); build('type'); } });
  for (const inp of [a, b]) inp.addEventListener('change', () => build('type'));

  return {
    init(pa, r, pb) {
      a.value = pa; b.value = pb; rel = r;
      relBox.querySelectorAll('button').forEach((x) => { const on = x.dataset.v === rel; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      whenSeen($('compose'), () => build('init'), '200px');
    },
    get() { return { a: a.value, rel, b: b.value }; },
  };
}

/* ======================= simultaneous vs sequential ======================= */

export function mountOnce(state) {
  const A = new SemaStage($('once-a'), { labels: false, head: false, order: 'ts', growMs: 3200 });
  const B = new SemaStage($('once-b'), { labels: false, head: false, order: 'tq', growMs: 5200 });
  let graph = null;
  const nums = (host, rows) => {
    host.textContent = '';
    for (const [k, v, g] of rows) { const dt = el('dt', '', k), dd = el('dd', g ? 'gold' : '', v); host.append(dt, dd); }
  };
  function cellError(spec) {
    let worst = 0;
    const walk = (s) => { for (const c of s.cells) worst = Math.max(worst, Math.abs(ringR(s.r, c.theta) - (1 + GEOM.A * c.trit)) / GEOM.A); if (s.sub) walk(s.sub); };
    walk(spec);
    return worst;
  }
  function run(how = 'grow') {
    if (!graph) return;
    const g = graph.type === 'rel' ? graph.a : graph;
    const v = propSpec(g), q = propSpec(g, undefined, 0, { sequential: true });
    A.set(v, 'none'); B.set(q, 'none');
    if (how === 'grow') { A.replay(); B.replay(); }
    idle(() => {
      const rs = new Raster();
      const read = (spec) => { inkPage(spec, 0, 1, rs); return diffGraphs(g, readPage(rs).graph); };
      const dv = read(v), dq = read(q);
      const Jv = functional(v) + (v.sub ? functional(v.sub) : 0), Jq = functional(q) + (q.sub ? functional(q.sub) : 0);
      nums($('once-na'), [
        ['energy J', Jv.toFixed(4) + '  (the minimum)'],
        ['arc left over', '0 deg: shared out'],
        ['worst cell off target', `${Math.round(cellError(v) * 100)}% of a lobe`],
        ['reader', dv.diffs.length ? `${dv.diffs.length} of ${dv.total} fields wrong` : `all ${dv.total} fields read`, !dv.diffs.length],
      ]);
      nums($('once-nb'), [
        ['energy J', `${Jq.toFixed(4)}  (${(Jq / Jv).toFixed(1)} x the minimum)`],
        ['arc left over', `${Math.round(q.seq.leftover)} deg at the end`],
        ['worst cell off target', `${Math.round(cellError(q) * 100)}% of a lobe`],
        ['reader', dq.diffs.length ? `${dq.diffs.length} of ${dq.total} fields wrong` : `all ${dq.total} fields read`, !!dq.diffs.length],
      ]);
    });
  }
  $('replay').addEventListener('click', () => run('grow'));
  let seen = false;
  whenSeen($('once'), () => { seen = true; run(prefersReduced() ? 'none' : 'grow'); }, '0px');
  return { setGraph(g) { graph = g; if (seen) run('none'); } };
}

/* ======================= the guided tour ======================= */

const TOUR = [
  ['They give.', 'A predicate and its agent. The predicate takes the crown; its six cells swell, lie flat or dip to spell "give". The agent "they" sits in the west sector, written heavy because it is plural.'],
  ['They give a gift.', 'Add a patient and every element moves: the east sector opens for "gift" and the slots give up arc to make room. The layout is solved for the whole proposition at once.'],
  ['They give us a gift.', 'A recipient takes the south sector. Same concepts, new role, new place: "us" is written where what is given ends up.'],
  ['The visitors gave us a gift.', 'The tendril above the crown leans back for the past. "visitors" replaces "they": a different code in the same sector, still heavy for plural.'],
  ['The visitors were giving us a gift.', 'An ongoing action: a spiral winds inward from the aspect slot, and that slot widens to hold it.'],
  ['The visitors were not giving us a gift.', 'Negation cuts the ring. A denied proposition does not close.'],
  ['Apparently, the visitors were not giving us a gift.', 'Evidence: the writer infers it. A chain of three dots steps inward from the evidence slot.'],
  ['We did not understand that the visitors were giving us a gift.', 'The whole earlier proposition becomes the patient of "understand": it is written as a ring nested inside, and the patient sector splits to hold it.'],
];

export function mountTour({ hero, setGraph, setPin, status }) {
  const bar = $('tourbar'), cap = $('tour-cap'), n = $('tour-n');
  let i = -1;
  const show = () => {
    const [s, c] = TOUR[i];
    const r = parse(s);
    if (!r.graph) return;
    setPin(null);
    setGraph(r.graph, { source: 'tour' });
    n.textContent = `step ${i + 1} of ${TOUR.length}`;
    cap.textContent = c;
    status.textContent = '';
    $('tour-prev').disabled = i === 0;
    $('tour-next').textContent = i === TOUR.length - 1 ? 'again' : 'next';
  };
  $('tour').addEventListener('click', () => { bar.hidden = false; i = 0; show(); bar.scrollIntoView?.({ block: 'nearest' }); });
  $('tour-next').addEventListener('click', () => { i = (i + 1) % TOUR.length; show(); });
  $('tour-prev').addEventListener('click', () => { if (i > 0) { i--; show(); } });
  $('tour-end').addEventListener('click', () => { bar.hidden = true; });
}
