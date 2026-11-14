/* ============================================================
   Heptapod Codec — boot and the hero.

   Data flow, one direction:
     English --parse / model--> semantic graph --geometry--> spec
       --stage--> the semagram on screen
       --codec--> a raster page --reader--> graph --realise--> English
   The hero sentence, the composition and the noise level live in the
   URL hash, so any state can be shared as a link.
   ============================================================ */

import { HERO, PRESETS, COMPOSE_PRESETS } from './config.js';
import { NOUNS, VERBS, NOUN, VERB, NOUN_CLASSES, VERB_CLASSES } from './lexicon.js';
import { parse, realize, diffGraphs, graphFields } from './grammar.js';
import { graphSpec } from './geometry.js';
import { inkPage, readPage, Raster } from './codec.js';
import { CATEGORIES } from './script.js';
import { SemaStage, Tier } from './stage.js';
import { mountEditor } from './editor.js';
import { mountKey, mountNoise, mountCompose, mountOnce, mountTour } from './views.js';
import { mountFermat } from './fermat.js';
import { graphFromModel } from './model.js';
import { mountRoutePanel } from '../ai/route-panel.js';

const $ = (id) => document.getElementById(id);
const state = { graph: null, source: 'parser', compose: null, lastSweep: null };

/* ---------- URL state ---------- */
function readHash() {
  const out = {};
  try {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    for (const k of ['s', 'a', 'r', 'b', 'n']) if (h.get(k)) out[k] = h.get(k).slice(0, 220);
  } catch { /* a malformed hash is ignored */ }
  return out;
}
function writeHash() {
  try {
    const h = new URLSearchParams();
    if (state.graph) h.set('s', realize(state.graph));
    const c = compose && compose.get();
    if (c && c.a && c.b) { h.set('a', c.a); h.set('r', c.rel); h.set('b', c.b); }
    if (state.noise) h.set('n', state.noise.type + ':' + (+state.noise.value.toFixed(3)));
    history.replaceState(null, '', '#' + h.toString());
  } catch { /* history blocked: the page still works */ }
}
state.onUrl = () => writeHash();

/* ---------- the hero ---------- */
const sem = $('sem');
const hero = new SemaStage(sem, { labels: true, head: true, onSettle: (spec) => readBack(spec) });
const input = $('sentence');
const status = $('status');

let readToken = 0;
function readBack(spec) {
  const my = ++readToken;
  const go = () => {
    if (my !== readToken) return;
    const t0 = performance.now();
    const rs = new Raster();
    inkPage(spec, 0, 1, rs);
    const r = readPage(rs);
    const ms = Math.round(performance.now() - t0);
    const d = diffGraphs(state.graph, r.graph);
    $('rb-text').textContent = realize(r.graph);
    $('rb-meta').textContent = `${d.total - d.diffs.length} of ${d.total} graph fields recovered from a 1400 x 840 raster; ${r.parts.p?.debug.hypCount ?? 128} layouts tried; ${ms} ms`;
    sem.setAttribute('aria-label', `Semagram for: ${realize(state.graph)} Read back from its pixels as: ${realize(r.graph)} Press the arrow keys to walk its parts.`);
  };
  (globalThis.requestIdleCallback ? requestIdleCallback(go, { timeout: 800 }) : setTimeout(go, 60));
}

/* ---------- the token strip: what the parser saw ---------- */
const TAGNAME = { N: 'noun', PRON: 'pronoun', V: 'verb', AUX: 'auxiliary', DET: 'determiner', NEG: 'negation', ADV: 'evidential adverb', COMP: 'complementiser', PREP: 'preposition', CONJ: 'connective', FW: 'function word', UNK: 'not in the lexicon', PUNCT: '' };
function showTags(tags) {
  const host = $('tags');
  host.textContent = '';
  for (const t of tags || []) {
    if (t.tag === 'PUNCT') continue;
    const s = document.createElement('span');
    s.className = 'tk t-' + t.tag.toLowerCase();
    s.title = (TAGNAME[t.tag] || t.tag) + (t.lemma ? ': ' + t.lemma : '');
    const w = document.createElement('b'); w.textContent = t.w;
    const g = document.createElement('i'); g.textContent = t.tag;
    s.append(w, g);
    host.append(s);
  }
}

/* ---------- pinning a part of the semagram ---------- */
const ORDER_KEYS = ['pred', 'time', 'mood', 'patient', 'neg', 'recipient', 'evid', 'agent', 'aspect'];
let pinned = null;
function codeText(code) { return code.map((t) => (t > 0 ? '+' : t < 0 ? '-' : '0')).join(' '); }
function explain(prop, role) {
  if (!prop || !role) return '';
  const sub = role.startsWith('sub.');
  const p = sub && prop.patient && prop.patient.type === 'prop' ? prop.patient : prop;
  const key = role.replace(/^sub\./, '');
  const where = sub ? 'in the nested clause, ' : '';
  const cat = CATEGORIES[key === 'neg' ? 'neg' : key];
  if (!cat) return '';
  if (key === 'pred') {
    const v = VERB[p.pred];
    const cls = VERB_CLASSES.find((c) => c.name === v.cls);
    return `${where}PREDICATE: ${v.id}, "${v.gloss}". Radical: ${cls.gloss} (first cell ${v.code[0] > 0 ? '+' : v.code[0] < 0 ? '-' : '0'}). Code ${codeText(v.code)}, the last cell a check. ${cat.reason}`;
  }
  if (key === 'agent' || key === 'patient' || key === 'recipient') {
    const e = p[key];
    if (!e) return `${where}${cat.name.toUpperCase()}: none written; the sector takes no arc and the others share it.`;
    if (e.type === 'prop') return `${where}PATIENT: a clause, "${realize(e).replace(/[.?]$/, '')}". ${CATEGORIES.embed.reason}`;
    const n = NOUN[e.c];
    const cls = NOUN_CLASSES.find((c) => c.name === n.cls);
    return `${where}${cat.name.toUpperCase()}: ${e.c}${e.num === 'pl' ? ', plural (double weight)' : ''}, "${n.gloss}". Radical: ${cls.gloss}. Code ${codeText(n.code)}. ${cat.reason}`;
  }
  const value = key === 'neg' ? String(!!p.neg) : p[key];
  const v = cat.values?.[value];
  return v ? `${where}${cat.name.toUpperCase()}: ${key === 'neg' ? (p.neg ? 'denied' : 'affirmed') : value}. ${cat.param}: ${v.op}. ${v.reason}` : '';
}
function setPin(role) {
  pinned = role;
  hero.setActive(role);
  $('pin').textContent = role ? explain(state.graph, role) : '';
  document.querySelectorAll('#editor .ed-row').forEach((r) => r.classList.toggle('lit', !!role && r.dataset.role === role));
  hero.wake();
}
sem.tabIndex = 0;
sem.addEventListener('pointermove', (ev) => {
  if (pinned) return;
  const role = hero.pick(ev.clientX, ev.clientY);
  hero.setActive(role);
  sem.style.cursor = role ? 'pointer' : 'default';
  document.querySelectorAll('#editor .ed-row').forEach((r) => r.classList.toggle('lit', !!role && r.dataset.role === role));
});
sem.addEventListener('pointerleave', () => { if (!pinned) { hero.setActive(null); document.querySelectorAll('#editor .ed-row.lit').forEach((r) => r.classList.remove('lit')); } });
sem.addEventListener('click', (ev) => {
  const role = hero.pick(ev.clientX, ev.clientY);
  if (erasing) { eraseAt(role); return; }
  setPin(role && role !== pinned ? role : null);
});

/* ---------- inverse editing: erase a stroke, then read the proposition from the drawing ---------- */
let erasing = false;
const eraseBtn = $('erase');
eraseBtn.addEventListener('click', () => {
  erasing = !erasing;
  eraseBtn.classList.toggle('on', erasing);
  eraseBtn.setAttribute('aria-pressed', String(erasing));
  sem.classList.toggle('erasing', erasing);
  status.textContent = erasing ? 'Erase mode: click a branch, the tendril or the cut on the semagram.' : '';
});
function eraseAt(role) {
  if (!role || !state.graph || state.graph.type !== 'prop') return;
  const key = role.replace(/^sub\./, '');
  if (!['mood', 'aspect', 'evid', 'neg', 'time'].includes(key)) {
    status.textContent = 'Only branches, the tendril and the cut can be erased; a role sector holds a word.';
    return;
  }
  const spec = graphSpec(state.graph);
  const target = role.startsWith('sub.') ? spec.sub : spec;
  if (!target) return;
  if (key === 'neg') target.gap = { ...target.gap, open: 0 };
  else target.marks = target.marks.filter((m) => m.key !== key);
  const rs = new Raster();
  inkPage(spec, 0, 1, rs);
  const read = readPage(rs).graph;
  const before = realize(state.graph);
  setGraph(read, { source: 'drawing' });
  status.textContent = `Erased the ${key === 'neg' ? 'cut' : key === 'time' ? 'tendril' : key + ' branch'}; read back from the edited drawing: ${realize(read)} (was: ${before})`;
}
Tier.onChange((name, ms) => { $('tier').textContent = name === 'lite' ? `render tier: lite (median frame ${ms.toFixed(0)} ms)` : 'render tier: full'; });
sem.addEventListener('keydown', (ev) => {
  if (!state.graph || state.graph.type !== 'prop') return;
  const present = ORDER_KEYS.filter((k) => {
    if (['agent', 'patient', 'recipient'].includes(k)) return !!state.graph[k];
    return true;
  });
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
    const i = present.indexOf(pinned);
    const j = i < 0 ? 0 : (i + (ev.key === 'ArrowRight' ? 1 : present.length - 1)) % present.length;
    setPin(present[j]);
    ev.preventDefault();
  } else if (ev.key === 'Escape') setPin(null);
  else if ((ev.key === 'Enter' || ev.key === ' ') && !pinned) { setPin(present[0]); ev.preventDefault(); }
});

/* ---------- graph in, everything out ---------- */
function setGraph(graph, { source = 'parser', how = 'morph', fromInput = false } = {}) {
  state.graph = graph;
  state.source = source;
  const spec = graphSpec(graph);
  hero.set(spec, how);
  if (!fromInput) input.value = realize(graph);
  $('g-count').textContent = `${diffGraphs(graph, graph).total} fields`;
  if (graph.type === 'prop') {
    mountEditor($('editor'), graph, {
      onHover: (role) => { if (!pinned) hero.setActive(role); },
      onChange: (p, role) => { setGraph(p, { source: 'editor' }); setPin(role); showTags(parse(input.value).tags); },
    });
  } else {
    $('editor').textContent = '';
    const n = document.createElement('p');
    n.className = 'hint';
    n.textContent = 'Two propositions joined by a relation. Edit their roles in the composition section below.';
    $('editor').append(n);
  }
  if (pinned) $('pin').textContent = explain(graph, pinned);
  noise.setGraph(graph, spec);
  once.setGraph(graph);
  document.querySelectorAll('#presets .chip').forEach((c) => c.classList.toggle('on', c.dataset.s === realize(graph)));
  writeHash();
}

function writeSentence(text, { how = 'morph', live = false } = {}) {
  const r = parse(text);
  showTags(r.tags);
  if (!r.graph) {
    status.textContent = '';
    const s = document.createElement('span');
    s.className = 'warn';
    s.textContent = r.errors[0] + '. ';
    status.append(s, document.createTextNode(live ? 'Keep typing, or ask the model to map free English onto the script.' : 'The offline parser reads a controlled English; ask the model to map free English onto the script.'));
    return false;
  }
  status.textContent = r.warnings.length ? r.warnings.join('; ') : 'read by the offline parser';
  if (state.graph && diffGraphs(state.graph, r.graph).diffs.length === 0 && live) return true;
  setGraph(r.graph, { source: 'parser', how, fromInput: live });
  return true;
}

let typing = 0;
input.addEventListener('input', () => {
  clearTimeout(typing);
  typing = setTimeout(() => writeSentence(input.value, { live: true }), 320);
});
$('write').addEventListener('submit', (ev) => { ev.preventDefault(); clearTimeout(typing); writeSentence(input.value); });

/* ---------- one model call, compared with the engine ---------- */
let asking = null;
function showCompare(text, model, engine) {
  const box = $('compare');
  box.hidden = false;
  box.textContent = '';
  const head = document.createElement('p');
  head.className = 'mini';
  head.textContent = 'two readings of: ' + text;
  box.append(head);
  const diffs = engine ? diffGraphs(engine, model).diffs : [];
  const col = (title, g, pick) => {
    const c = document.createElement('div');
    c.className = 'cmp-col';
    const h = document.createElement('span'); h.className = 'mini'; h.textContent = title;
    const e = document.createElement('p'); e.className = 'cmp-en'; e.textContent = g ? realize(g) : 'could not read it';
    const ul = document.createElement('ul'); ul.className = 'cmp-f';
    if (g) {
      const f = graphFields(g);
      for (const d of diffs) { const li = document.createElement('li'); li.textContent = `${d.field}: ${f[d.field] ?? '-'}`; ul.append(li); }
    }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'act ghost'; b.textContent = 'draw this one'; b.disabled = !g;
    b.addEventListener('click', () => { setGraph(g, { source: pick, fromInput: true }); box.querySelectorAll('.cmp-col').forEach((x) => x.classList.toggle('on', x === c)); });
    c.append(h, e, ul, b);
    return c;
  };
  const row = document.createElement('div');
  row.className = 'cmp-row';
  const mc = col('the model (' + (state.lastModel || 'model') + ')', model, 'model');
  const ec = col('the offline engine', engine, 'parser');
  mc.classList.add('on');
  row.append(mc, ec);
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = engine ? (diffs.length ? `${diffs.length} field${diffs.length > 1 ? 's' : ''} differ, listed under each reading.` : 'Both readings give the same graph.') : 'The engine could not read this sentence; only the model\'s reading can be drawn.';
  box.append(row, note);
}
$('ask').addEventListener('click', async () => {
  const text = input.value.trim();
  if (!text) return;
  if (asking) asking.abort();
  asking = new AbortController();
  const btn = $('ask');
  btn.disabled = true;
  status.textContent = 'asking the model for the graph (one call)...';
  try {
    const r = await graphFromModel(text, { signal: asking.signal });
    const engine = parse(text).graph;
    state.lastModel = r.model;
    if (r.graph && r.source !== 'offline' && !r.errors.length) {
      setGraph(r.graph, { source: r.source, fromInput: true });
      showCompare(text, r.graph, engine);
      status.textContent = `${r.note}. Written as: ${realize(r.graph)}`;
    } else if (r.graph) {
      setGraph(r.graph, { source: 'parser', fromInput: true });
      $('compare').hidden = true;
      status.textContent = r.note;
    } else status.textContent = r.note;
  } catch (e) {
    if (e.name !== 'AbortError') status.textContent = 'the model call failed: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    asking = null;
  }
});

const presets = $('presets');
for (const s of PRESETS) {
  const c = document.createElement('button');
  c.type = 'button'; c.className = 'chip'; c.textContent = s; c.dataset.s = s;
  c.addEventListener('click', () => { input.value = s; $('compare').hidden = true; writeSentence(s); });
  presets.append(c);
}

/* ---------- panels ---------- */
mountRoutePanel($('route'));
mountKey($('keygrid'));
const noise = mountNoise(state);
const once = mountOnce(state);
const compose = mountCompose(state);
mountFermat({ canvas: $('fm'), mode: $('fm-mode'), aim: $('fm-aim'), aimV: $('fm-aim-v'), snap: $('fm-snap'), nums: $('fm-nums'), n2: $('fm-n2'), n2v: $('fm-n2-v') });
mountTour({ hero, setGraph, setPin, status });
$('lexn').textContent = String(NOUNS.length + VERBS.length);
document.querySelectorAll('.lexn').forEach((n) => { n.textContent = String(NOUNS.length + VERBS.length); });

/* ---------- boot ---------- */
const h = readHash();
if (h.n) { const [t, v] = h.n.split(':'); noise.setNoise(t, Number(v)); }
if (!(h.s && writeSentence(h.s, { how: 'grow' }))) writeSentence(HERO, { how: 'grow' });
const c0 = COMPOSE_PRESETS[0];
compose.init(h.a || c0.a, ['because', 'despite', 'after', 'before'].includes(h.r) ? h.r : c0.rel, h.b || c0.b);

// ?perf: the median of 20 parse, layout, solve, stroke and render runs for a 20-word sentence
const PERF_SENTENCE = 'Reportedly, the visitors were not giving the linguists a language because the soldiers had feared that the ship was leaving.';
if (/[?&]perf\b/.test(location.search)) {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const g = parse(PERF_SENTENCE).graph;
    const spec = graphSpec(g);
    hero.set(spec, 'none');
    hero.frame(performance.now());
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  setGraph(parse(PERF_SENTENCE).graph, { how: 'none' });
  status.textContent = `perf: median ${((times[9] + times[10]) / 2).toFixed(1)} ms to parse, lay out, solve, stroke and render a 20-word sentence (20 runs)`;
}
// a deterministic still for screenshots: ?still pins the agent
if (/[?&]still\b/.test(location.search)) setPin('agent');
