/* ============================================================
   heptapod/editor.js — the semantic graph as a form.

   One row per role or feature. Changing a row changes the graph;
   the page redraws the semagram from the graph and rewrites the
   English from it. Hovering or focusing a row lights its strokes.
   ============================================================ */

import { NOUN_CLASSES, VERB_CLASSES, NOUN } from './lexicon.js';
import { ENUMS, normalizeProp, realize } from './grammar.js';

const clauseText = (p) => realize(p).replace(/[.?]$/, '').replace(/^./, (c) => c.toLowerCase());

const LABEL = {
  time: { past: 'past', present: 'present', future: 'future' },
  aspect: { simple: 'simple', progressive: 'ongoing', perfect: 'perfect' },
  mood: { indicative: 'tell', interrogative: 'ask', imperative: 'order', potential: 'can' },
  evid: { direct: 'seen', inferred: 'inferred', reported: 'reported' },
};
const ROW_NAME = { pred: 'predicate', agent: 'agent', patient: 'patient', recipient: 'recipient', time: 'time', aspect: 'aspect', mood: 'mood', neg: 'negation', evid: 'evidence' };

const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) n.append(c);
  return n;
};

function nounSelect(id, value, { allowNone, allowClause }) {
  const s = h('select', { id, class: 'ed-sel' });
  if (allowNone) s.append(h('option', { value: '', text: 'none' }));
  if (allowClause) s.append(h('option', { value: '@clause', text: 'a clause (that ...)' }));
  for (const cls of NOUN_CLASSES) {
    const g = h('optgroup', { label: cls.gloss });
    for (const n of cls.list) g.append(h('option', { value: n.id, text: n.id }));
    s.append(g);
  }
  s.value = value;
  return s;
}

function verbSelect(id, value) {
  const s = h('select', { id, class: 'ed-sel' });
  for (const cls of VERB_CLASSES) {
    const g = h('optgroup', { label: cls.gloss });
    for (const v of cls.list) g.append(h('option', { value: v.id, text: v.id }));
    s.append(g);
  }
  s.value = value;
  return s;
}

function seg(name, values, labels, value, disabled = false) {
  const wrap = h('div', { class: 'ed-seg', role: 'radiogroup', 'aria-label': name });
  for (const v of values) {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), 'data-v': v, class: v === value ? 'on' : '', text: labels[v] || v, disabled });
    wrap.append(b);
  }
  return wrap;
}

let uid = 0;

/**
 * Mount an editor for a proposition.
 * onChange(newProp, roleKey) fires on every edit; onHover(roleKey | null).
 * opts.depth: 1 for an embedded clause; opts.prefix: role prefix for highlights.
 */
export function mountEditor(host, prop, { onChange, onHover, depth = 0, prefix = '', compact = false } = {}) {
  host.textContent = '';
  const id = 'ed' + (uid++);
  const p = JSON.parse(JSON.stringify(prop));
  const rows = h('div', { class: 'ed' + (compact ? ' compact' : '') });
  host.append(rows);

  const emit = (role) => { normalizeProp(p, depth); onChange?.(JSON.parse(JSON.stringify(p)), prefix + role); };
  const row = (role, ...ctl) => {
    const r = h('div', { class: 'ed-row', 'data-role': prefix + role });
    r.append(h('span', { class: 'ed-k', text: ROW_NAME[role] }), h('span', { class: 'ed-v' }, ...ctl));
    r.addEventListener('pointerenter', () => onHover?.(prefix + role));
    r.addEventListener('pointerleave', () => onHover?.(null));
    r.addEventListener('focusin', () => onHover?.(prefix + role));
    r.addEventListener('focusout', () => onHover?.(null));
    rows.append(r);
    return r;
  };

  // predicate
  const vs = verbSelect(id + '-pred', p.pred);
  vs.setAttribute('aria-label', 'predicate');
  vs.addEventListener('change', () => { p.pred = vs.value; emit('pred'); });
  row('pred', vs);

  // roles
  for (const role of ['agent', 'patient', 'recipient']) {
    if (role === 'agent' && p.mood === 'imperative') {
      row(role, h('span', { class: 'ed-note', text: 'the addressee (a command has no written agent)' }));
      continue;
    }
    const e = p[role];
    const isClause = e && e.type === 'prop';
    const val = !e ? '' : isClause ? '@clause' : e.c;
    const sel = nounSelect(`${id}-${role}`, val, { allowNone: role !== 'agent', allowClause: role === 'patient' && depth === 0 });
    sel.setAttribute('aria-label', role);
    const n = e && !isClause ? NOUN[e.c] : null;
    const numBtn = h('button', {
      type: 'button', class: 'ed-num' + (e && !isClause && e.num === 'pl' ? ' on' : ''),
      'aria-pressed': String(!!(e && !isClause && e.num === 'pl')),
      title: 'plural: doubles the stroke weight of this sector', text: e && !isClause && e.num === 'pl' ? 'many' : 'one',
      disabled: !e || isClause || (n && n.pron),
    });
    sel.addEventListener('change', () => {
      if (sel.value === '') p[role] = null;
      else if (sel.value === '@clause') p[role] = { type: 'prop', pred: 'offer', agent: { c: 'they', num: 'pl' }, patient: { c: 'gift', num: 'sg' }, recipient: null, time: p.time, aspect: 'progressive', mood: 'indicative', neg: false, evid: 'direct' };
      else {
        const nn = NOUN[sel.value];
        p[role] = { c: sel.value, num: nn.pron ? nn.num : (e && !isClause ? e.num : 'sg') };
      }
      if (role === 'patient' && !p.patient) p.recipient = p.recipient || null;
      emit(role);
    });
    numBtn.addEventListener('click', () => { if (!p[role] || p[role].type === 'prop') return; p[role].num = p[role].num === 'pl' ? 'sg' : 'pl'; emit(role); });
    const r = row(role, sel, numBtn);
    if (isClause) {
      const det = h('details', { class: 'ed-clause' });
      if (host.dataset.clauseOpen === '1') det.open = true;
      det.addEventListener('toggle', () => { host.dataset.clauseOpen = det.open ? '1' : '0'; });
      det.append(h('summary', { text: 'the clause: ' + clauseText(e) }));
      const sub = h('div', { class: 'ed-sub' });
      det.append(sub);
      r.after(det);
      mountEditor(sub, e, {
        depth: 1, prefix: prefix + 'sub.', compact: true, onHover,
        onChange: (np, rk) => { p.patient = np; normalizeProp(p, depth); onChange?.(JSON.parse(JSON.stringify(p)), rk); },
      });
    }
  }

  // features
  const imp = p.mood === 'imperative';
  const feature = (key, disabled) => {
    const sg = seg(ROW_NAME[key], ENUMS[key], LABEL[key], p[key], disabled);
    sg.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-v]');
      if (!b || b.disabled) return;
      p[key] = b.dataset.v;
      if (key === 'mood' && p.mood !== 'imperative' && !p.agent) p.agent = { c: 'we', num: 'pl' };
      emit(key);
    });
    sg.addEventListener('keydown', (ev) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
      const i = ENUMS[key].indexOf(p[key]);
      const j = (i + (ev.key === 'ArrowRight' ? 1 : -1) + ENUMS[key].length) % ENUMS[key].length;
      p[key] = ENUMS[key][j];
      emit(key);
      ev.preventDefault();
    });
    row(key, sg);
  };
  feature('time', imp);
  feature('aspect', imp);
  const moods = depth > 0 ? ['indicative', 'potential'] : ENUMS.mood;
  {
    const sg = seg('mood', moods, LABEL.mood, p.mood);
    sg.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-v]');
      if (!b) return;
      p.mood = b.dataset.v;
      if (p.mood !== 'imperative' && !p.agent) p.agent = { c: 'we', num: 'pl' };
      emit('mood');
    });
    row('mood', sg);
  }
  {
    const b = h('button', { type: 'button', class: 'ed-num' + (p.neg ? ' on' : ''), 'aria-pressed': String(p.neg), text: p.neg ? 'not' : 'affirmed' });
    b.addEventListener('click', () => { p.neg = !p.neg; emit('neg'); });
    row('neg', b);
  }
  feature('evid', imp || p.mood === 'interrogative');
  return rows;
}
