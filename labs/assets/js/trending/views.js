/* ============================================================
   trending/views.js — render-only functions. Each takes a host node
   and the controller's model and draws; none fetch, rank or decide.
   Every live string goes through el() (textContent).
   ============================================================ */

import { SOURCES, SOURCE_ORDER, TUNING, SCORE_MODES, CAUSES } from './constants.js';
import { el, clear, utc, clock, kb, since, prefersReduced, wait } from './dom.js';
import { glyphIcon, changeIcon, sparkline } from './marks.js';
import { num, ageText } from './explain.js';
import { garwood } from './score.js';

const S = (src) => SOURCES[src];
export const unitOf = (it) => S(it.src).unit;
export const scoreText = (it, mode) => {
  if (mode === 'total') return `${num(it.sc.total)} ${S(it.src).total}`;
  if (it.sc.isNew) return 'new';
  return `${num(mode === 'rate' ? it.sc.rate : it.sc.lo)} ${unitOf(it)}`;
};
export const describe = (it, mode) => {
  const c = it.change ? (it.change.kind === 'new' ? 'new since the last scan' : it.change.kind === 'held' ? 'same rank as the last scan' : `${it.change.kind} ${it.change.n} since the last scan`) : 'first scan of this source';
  return `${it.title}. ${S(it.src).label}. ${mode === 'total' ? 'total' : 'score'} ${scoreText(it, mode)}${it.z != null ? `, z ${it.z.toFixed(2)}` : ''}. ${c}.`;
};

/* ---------------- controls ---------------- */
export function renderSources(host, model, onToggle) {
  clear(host);
  for (const src of SOURCE_ORDER) {
    const s = S(src);
    const on = model.enabled.has(src);
    const b = el('button', 'chip', null, { type: 'button', 'aria-pressed': String(on), 'data-src': src });
    b.append(glyphIcon(src));
    const name = el('span', null, s.label);
    name.title = s.feed;
    b.append(name);
    const st = model.sourceState[src] || {};
    const t = el('span', 'st num', st.text || (on ? '' : 'off'));
    t.dataset.s = st.s || '';
    b.append(t);
    b.addEventListener('click', () => onToggle(src));
    host.append(b);
  }
}

export function renderSeg(host, options, current, onPick) {
  clear(host);
  for (const [value, label] of options) {
    const b = el('button', null, label, { type: 'button', 'aria-pressed': String(value === current) });
    b.addEventListener('click', () => onPick(value));
    host.append(b);
  }
}

export function renderStamp(host, model) {
  clear(host);
  const o = model.origin;
  const pill = el('span', 'pill');
  pill.dataset.o = model.scanning ? 'scanning' : o;
  pill.append(el('i'), el('span', null, model.scanning ? 'scanning' : o === 'live' ? 'live scan' : o === 'stored' ? 'stored scan' : o === 'fixture' ? 'recorded + test fixture' : 'recorded scan'));
  host.append(pill);
  const t = model.scan?.t;
  host.append(el('span', 'num', t ? `${o === 'live' ? 'fetched' : 'captured'} ${utc(t)} (${since(t)})` : ''));
  const days = [...new Set(Object.values(model.scan?.sources || {}).map((v) => v.day).filter(Boolean))];
  if (days.length) host.append(el('span', null, `Wikipedia day ${days.join(', ')}`));
}

export function renderLegend(host) {
  clear(host);
  for (const src of SOURCE_ORDER) {
    const sp = el('span');
    sp.append(glyphIcon(src), el('span', null, S(src).label));
    host.append(sp);
  }
  const f = el('span', 'fire');
  f.append(glyphIcon('hn'), el('span', null, 'gold: the five called rising and explained'));
  host.append(f, el('span', null, 'area: comments, forks or 28-day views'), el('span', null, 'whisker: 95% interval'), el('span', null, 'trail: earlier stored scans'));
}

/* ---------------- trace: the scan as five stages ---------------- */
export const STAGES = [['request', 'request'], ['fetch', 'fetch'], ['rank', 'rank'], ['field', 'field'], ['reason', 'reason']];
export function renderTrace(host, stages) {
  clear(host);
  for (const [id, name] of STAGES) {
    const st = stages[id] || {};
    const li = el('li');
    li.dataset.s = st.s || '';
    li.append(el('b', null, name), el('span', 'd num', st.text || ''));
    host.append(li);
  }
}

/* ---------------- readout ---------------- */
export function firstWhy(model) {
  const [a, b] = model.items;
  if (!a) return '';
  if (!b) return `First because it is the only item shown.`;
  const verb = SCORE_MODES[model.mode].verb;
  if (model.merged) {
    const d = a.z - b.z, dp = Math.abs(d) < 0.01 ? 4 : 2;
    return `First in the shared unit: z ${a.z?.toFixed(dp)} against ${b.z?.toFixed(dp)} for the runner-up "${b.title}" (${S(b.src).label}), ${d.toFixed(dp)} units ahead. Each z is the log score's distance from its own source's median in MAD-scaled units.`;
  }
  const label = model.mode === 'total' ? 'total' : model.mode === 'rate' ? 'point rate' : 'lower 95% bound';
  return `${verb === 'largest' ? 'Largest' : 'First'} because its ${label}, ${scoreText(a, model.mode)}, is ${num(a.value - b.value)} ${model.mode === 'total' ? S(a.src).total : unitOf(a)} above the runner-up "${b.title}" (${scoreText(b, model.mode)}).`;
}

export function renderTop(host, model) {
  clear(host);
  const a = model.items[0];
  const k = el('div', 'k');
  k.append(el('span', 'rk', `01 · ${SCORE_MODES[model.mode].verb}`), el('span', null, a ? S(a.src).label : ''));
  host.append(k);
  if (!a) { host.append(el('p', 'why', model.emptyText || 'No source returned a usable item.')); return; }
  const t = el('a', 'ttl', a.title, { href: a.url, target: '_blank', rel: 'noopener' });
  host.append(t);
  const big = el('div', 'big num', model.mode === 'total' ? num(a.sc.total) : a.sc.isNew ? 'new' : num(model.mode === 'rate' ? a.sc.rate : a.sc.lo));
  big.append(el('small', null, model.mode === 'total' ? S(a.src).total : `${unitOf(a)}${model.mode === 'lower' ? ', lower 95%' : ''}`));
  host.append(big);
  if (!a.sc.isNew) host.append(el('div', 'iv num', `rate ${num(a.sc.rate)} ${unitOf(a)} · 95% interval ${num(a.sc.lo)} to ${num(a.sc.hi)}${a.z != null ? ` · z ${a.z.toFixed(2)}` : ''}`));
  const ex = model.explainOf(a);
  if (ex) host.append(explainBlock(ex, model, true));
  host.append(el('p', 'firstwhy', firstWhy(model)));
}

function originTag(ex, model) {
  const src = model.explain?.source;
  if (ex.origin === 'model' && src === 'fixture') return el('span', 'tag bad', 'test fixture');
  if (ex.origin === 'model' && src === 'recorded') return el('span', 'tag model', `recorded model · ${model.explain?.model || ''}`);
  if (ex.origin === 'model') return el('span', 'tag model', `model · ${model.explain?.model || ''}`);
  return el('span', 'tag engine', ex.rule ? `engine · ${ex.rule}` : 'engine');
}

/* Explanation text with numbers the fact-check could not find struck through. */
export function whyNode(text, flags, cls = 'why') {
  const p = el('p', cls);
  let at = 0;
  const fl = [...(flags || [])].sort((x, y) => x.index - y.index);
  for (const f of fl) {
    const i = text.indexOf(f.text, at);
    if (i < 0) continue;
    p.append(document.createTextNode(text.slice(at, i)));
    const s = el('s', null, f.text, { title: `${f.kind} not found in the fetched data` });
    p.append(s);
    at = i + f.text.length;
  }
  p.append(document.createTextNode(text.slice(at)));
  return p;
}

function explainBlock(ex, model, big) {
  const d = el('div');
  const line = el('div');
  line.append(originTag(ex, model), el('span', 'tag', `cause · `), el('span', 'cause', ex.cause), el('span', null, ` · confidence ${num(ex.confidence, 2)}`));
  d.append(line);
  const w = whyNode(ex.why, ex.flags, big ? 'why' : 'why');
  if (model.typing === ex.id) w.classList.add('thinking');
  d.append(w);
  if (ex.flags?.length) d.append(el('p', 'flagnote', `${ex.flags.length} figure${ex.flags.length > 1 ? 's' : ''} in this reply match nothing in the fetched data and are struck through.`));
  if (ex.note) d.append(el('p', 'flagnote', ex.note));
  if (ex.prob) d.append(el('p', 'note num', `P(still above baseline at ${ex.prob.horizon}) ${num(ex.prob.p, 2)}, from ${ex.prob.n} earlier calls in its score decile (${ex.prob.from}).`));
  return d;
}

export function renderExplained(host, model, routeNode) {
  clear(host);
  const ex = model.explain;
  if (routeNode) {
    routeNode.textContent = !ex ? (model.thinking ? 'asking a model: one request for all five' : '')
      : ex.resting ? 'engine at rest: no model has been asked about this scan. Scan live for one batched call.'
      : ex.source === 'fixture' ? `${routeLabel(ex)}: a test of the checks, not an explanation.`
      : `${routeLabel(ex)}. One request for all five; each entry checked on its own.`;
  }
  const ol = el('ol', 'exp-list');
  const list = model.explainedItems.slice(1);
  for (const it of list) {
    const e = model.explainOf(it);
    const li = el('li', 'fired');
    const a = el('a', 't', it.title, { href: it.url, target: '_blank', rel: 'noopener' });
    li.append(a, el('div', 'note num', `${S(it.src).label} · ${scoreText(it, 'lower')}`));
    if (e) li.append(explainBlock(e, model, false));
    else if (model.thinking) li.append(el('p', 'why thinking', ''));
    ol.append(li);
  }
  host.append(ol);
  if (ex?.unreadable) host.append(el('p', 'flagnote', 'The model answered, but no JSON object or entry could be read from its reply, so every explanation here comes from the engine.'));
  else if (ex?.salvaged) host.append(el('p', 'flagnote', 'The reply was not one complete JSON object; the complete entries in it were kept and checked, the rest come from the engine.'));
  if (ex?.malformed?.length) host.append(el('p', 'flagnote', `${ex.malformed.length} model entr${ex.malformed.length > 1 ? 'ies' : 'y'} failed the schema and fell back to the engine: ${ex.malformed.map((m) => `${m.key} (${m.reason})`).join('; ')}.`));
}

export function routeLabel(ex) {
  if (ex.source === 'offline') return ex.resting ? 'engine at rest' : (ex.errors || []).some((e) => /switched off/.test(e)) ? 'engine: model off (?engine)' : 'engine: no model route answered';
  if (ex.source === 'fixture' || ex.source === 'recorded') return ex.label || 'recorded reply';
  if (ex.source === 'stored') return `stored reply · ${ex.model}`;
  return `${ex.source} · ${ex.model}${ex.ms ? ` · ${(ex.ms / 1000).toFixed(1)} s` : ''}`;
}

export function renderDigest(host, model) {
  clear(host);
  const ex = model.explain;
  const k = el('div', 'k');
  k.append(el('span', null, 'digest of this scan'), el('span', null, ex ? (ex.digestOrigin === 'model' ? 'model' : 'engine') : ''));
  host.append(k);
  if (!ex) { host.append(el('p', 'note', model.thinking ? 'waiting for the model' : '')); return; }
  const p = whyNode(ex.digest, ex.digestFlags, 'why');
  host.append(p);
  const named = (ex.topics || []).filter((t) => t.label);
  if (named.length) host.append(el('p', 'note', `Model named topics: ${named.map((t) => `${t.label} (${t.members.join(', ')})`).join('; ')}`));
}

/* ---------------- board ---------------- */
export function renderBoard(head, list, model, on) {
  clear(list);
  const verb = SCORE_MODES[model.mode].verb;
  if (model.view === 'topics') return renderTopics(head, list, model, on);
  const shown = model.boardItems;
  head.textContent = `${shown.length} of ${model.items.length} signals, ${SCORE_MODES[model.mode].note}${model.merged ? ', merged across sources by z-score' : ''}. ${verb === 'largest' ? 'This view ranks size; it does not call anything rising.' : ''}`;
  if (!shown.length) { list.append(el('li', 'row', model.items.length ? 'No signal matches these filters.' : (model.emptyText || 'No signals.'))); return; }
  shown.forEach((it, i) => {
    const li = el('li', 'row' + (model.fired.has(it.key) ? ' fired' : '') + (model.selected === it.key ? ' sel' : ''), null, { tabindex: '0', 'data-key': it.key, 'aria-label': describe(it, model.mode) });
    li.append(el('span', 'rk num', String(i + 1).padStart(2, '0')));
    const chg = el('span', 'chg num');
    if (it.change) {
      chg.dataset.c = it.change.kind;
      chg.append(changeIcon(it.change.kind));
      if (it.change.n) chg.append(document.createTextNode(String(it.change.n)));
      chg.title = it.change.kind === 'new' ? 'new since the last stored scan' : `${it.change.kind} ${it.change.n || 0} since the last stored scan`;
    }
    li.append(chg, glyphIcon(it.src));
    const main = el('div', 'main');
    const a = el('a', 'ttl', it.title, { href: it.url, target: '_blank', rel: 'noopener' });
    main.append(a);
    if (it.terms?.length) {
      const ts = el('span', 'terms');
      for (const t of it.terms) ts.append(el('span', null, t));
      main.append(ts);
    }
    main.append(el('div', 'sub2 num', subLine(it, model)));
    li.append(main);
    const val = el('div', 'val num', scoreText(it, model.mode));
    val.append(el('small', null, it.sc.isNew ? 'no baseline' : `95% ${num(it.sc.lo)} to ${num(it.sc.hi)}${it.z != null ? ` · z ${it.z.toFixed(2)}` : ''}`));
    li.append(val);
    const sp = el('div', 'sp');
    const obs = (it.traj || []).filter((p) => p.kind !== 'origin');
    if (obs.length >= 3) {
      const s = sparkline(obs);
      s.setAttribute('aria-label', `${obs.length} observations from ${utc(obs[0].t)} to ${utc(obs[obs.length - 1].t)}`);
      sp.append(s, el('small', 'note num', `${shortT(obs[0])} to ${shortT(obs[obs.length - 1])}`));
    }
    li.append(sp);
    li.addEventListener('click', (e) => { if (e.target.closest('a')) return; on.open(it.key, li); });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('a')) { e.preventDefault(); on.open(it.key, li); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); li.nextElementSibling?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); li.previousElementSibling?.focus(); }
    });
    li.addEventListener('focus', () => on.select(it.key, { from: 'board' }));
    list.append(li);
  });
}
const shortT = (p) => (p.kind === 'backfill' || p.kind === 'now') && p.day ? p.day.slice(5) : new Date(p.t).toISOString().slice(11, 16);

export function accelText(a) {
  if (!Number.isFinite(a.rho)) return 'from zero';
  if (Math.abs(a.rho) > 1) return `rate x${num(1 + a.rho)} the interval before`;
  return `${a.rho >= 0 ? '+' : ''}${Math.round(a.rho * 100)}% on the interval before`;
}

function subLine(it, model) {
  const s = S(it.src);
  const parts = [s.label + (it.alsoIn ? ' + Show HN' : '')];
  if (s.kind === 'readership') {
    parts.push(`${num(it.sc.total)} views on ${it.day}`);
    if (!it.sc.isNew) parts.push(`weekday median ${num(it.sc.base)}`);
    if (it.prev) parts.push(`day before ${it.prevCensored ? '<' : ''}${num(it.prev)}`);
  } else {
    parts.push(`${num(it.sc.total)} ${s.total} in ${ageText(it.sc.ageH)}`, `${num(it.third || 0)} ${s.third}`);
  }
  if (it.measured) parts.push(`${it.measured.dc >= 0 ? '+' : ''}${num(it.measured.dc)} ${s.total} in ${ageText(it.measured.dtH)} = ${num(it.measured.rate)} ${s.unit}`);
  if (it.pace?.ratio != null) parts.push(`${num(it.pace.ratio)}x its own earlier pace`);
  if (it.accel) parts.push(`${it.accel.label} (${accelText(it.accel)})`);
  if (it.burst?.burst) parts.push(`burst since ${it.burst.onset} (CUSUM alarm ${it.burst.alarm})`);
  const ex = model.explainOf(it);
  const src = model.explain?.source;
  if (ex) parts.push(`cause: ${ex.cause} (${ex.origin !== 'model' ? 'keyword rule' : src === 'fixture' ? 'test fixture' : src === 'recorded' ? 'recorded model' : 'model'})`);
  if (it.prob) parts.push(`P(above baseline at ${it.prob.horizon}) ${num(it.prob.p, 2)}, n ${it.prob.n}`);
  return parts.join(' · ');
}

function renderTopics(head, list, model, on) {
  const ts = model.topics;
  head.textContent = `${ts.length} topics: groups of two or more signals joined by a Wikipedia entity phrase or by idf-weighted term overlap of at least ${TUNING.jaccard}. ${ts.filter((t) => t.sources.length > 1).length} join more than one source.`;
  if (!ts.length) { list.append(el('li', 'row', 'No two signals share a subject in this scan.')); return; }
  const byKey = new Map(model.items.map((it) => [it.key, it]));
  ts.forEach((t, i) => {
    const li = el('li', 'row trow', null, { tabindex: '0' });
    li.append(el('span', 'rk num', String(i + 1).padStart(2, '0')), el('span'), el('span'));
    const main = el('div', 'main');
    const title = t.entityUrl ? el('a', 'ttl', t.label, { href: t.entityUrl, target: '_blank', rel: 'noopener' }) : el('span', 'ttl', t.label);
    main.append(title);
    const b = el('span', 'badges');
    for (const s of t.sources) b.append(el('span', null, S(s).short));
    main.append(document.createTextNode(' '), b);
    main.append(el('div', 'sub2 num', `${t.members.length} members · rule: ${t.rule === 'entity' ? 'entity phrase' : 'term overlap'} · mean idf-weighted Jaccard ${num(t.meanSim, 2)}`));
    const mem = el('div', 'members');
    mem.textContent = t.members.map((k) => byKey.get(k)).filter(Boolean).map((it) => `${S(it.src).short}: ${it.title}`).join(' | ');
    main.append(mem);
    li.append(main, el('div', 'val num', `${t.sources.length} source${t.sources.length > 1 ? 's' : ''}`), el('div'));
    li.addEventListener('click', () => on.select(t.members[0], { from: 'topic' }));
    list.append(li);
  });
}

export function renderFilters(host, model, on) {
  clear(host);
  const src = el('select', null, null, { 'aria-label': 'Filter the board by source' });
  src.append(el('option', null, 'all sources', { value: '' }));
  for (const s of SOURCE_ORDER) { const o = el('option', null, S(s).label, { value: s }); if (model.only === s) o.selected = true; src.append(o); }
  src.addEventListener('change', () => on.only(src.value));
  const cause = el('select', null, null, { 'aria-label': 'Filter the board by cause' });
  cause.append(el('option', null, 'all causes', { value: '' }));
  for (const c of CAUSES) { const o = el('option', null, c, { value: c }); if (model.cause === c) o.selected = true; cause.append(o); }
  cause.addEventListener('change', () => on.cause(cause.value));
  host.append(src, cause);
}

/* ---------------- scan memory ---------------- */
export function renderStore(host, model, on) {
  clear(host);
  const kv = el('div', 'kv num');
  kv.append(kvItem('stored scans', String(model.store.count)), kvItem('storage', `${model.store.kb.toFixed(1)} KB`), kvItem('limit', `${TUNING.historyMaxScans} scans`));
  host.append(kv);
  const btns = el('div', 'btns');
  const mk = (t, f) => { const b = el('button', 'ghost sm', t, { type: 'button' }); b.addEventListener('click', f); btns.append(b); return b; };
  mk('Export JSON', on.exportJSON);
  mk('Export CSV', on.exportCSV);
  mk('Import JSON', on.importJSON);
  const clr = mk(model.confirmClear ? 'Press again to clear' : 'Clear history', on.clear);
  if (model.confirmClear) clr.setAttribute('aria-pressed', 'true');
  host.append(btns);
  if (model.store.note) host.append(el('p', 'note', model.store.note));
}
const kvItem = (k, v) => { const s = el('span', null, `${k} `); s.append(el('b', null, v)); return s; };

export function renderHistory(host, model, on) {
  clear(host);
  if (!model.store.scans.length) { host.append(el('li', null, 'No scans stored in this browser yet. Run a live scan; it is kept here.')); return; }
  [...model.store.scans].reverse().forEach((r) => {
    const li = el('li');
    const id = `h-${r.t}`;
    const cb = el('input', null, null, { type: 'checkbox', id });
    cb.checked = model.pick.includes(r.t);
    cb.addEventListener('change', () => on.pick(r.t, cb.checked));
    const lab = el('label', 'num', `${utc(r.t)}`, { for: id });
    const srcs = Object.entries(r.sources).filter(([, v]) => v.status === 'ok').map(([s]) => S(s).short).join(' ');
    li.append(cb, lab, el('span', 'o num', `${r.items.length} items · ${srcs}`));
    host.append(li);
  });
}

export function renderDiff(host, d, a, b) {
  clear(host);
  if (!d) { host.append(el('p', 'note', 'Tick two stored scans to compare them.')); return; }
  host.append(el('p', 'num', `${utc(a.t)} to ${utc(b.t)}: ${d.entered.length} entered, ${d.left.length} left, ${d.moved.length} moved, ${d.held.length} held their rank.`));
  const sec = (title, rows, f) => {
    if (!rows.length) return;
    host.append(el('b', null, title));
    const ul = el('ul');
    rows.slice(0, 8).forEach((r) => ul.append(el('li', 'num', f(r))));
    if (rows.length > 8) ul.append(el('li', null, `and ${rows.length - 8} more`));
    host.append(ul);
  };
  sec('Moved', d.moved, (r) => `${S(r.src).short} ${r.title}: ${r.from} to ${r.to} (${r.by > 0 ? 'up' : 'down'} ${Math.abs(r.by)})`);
  sec('Entered', d.entered, (r) => `${S(r.src).short} ${r.title} at ${r.to}`);
  sec('Left', d.left, (r) => `${S(r.src).short} ${r.title} (was ${r.from})`);
}

/* ---------------- verification ---------------- */
const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(0)}%`);
const ciText = (ci) => (ci ? `${pct(ci[0])} to ${pct(ci[1])}` : 'n/a');

export function renderVerify(host, model) {
  clear(host);
  const block = (title, data, note) => {
    host.append(el('h3', null, title));
    if (note) host.append(el('p', 'note', note));
    const wrap = el('div', 'tscroll');
    const tb = el('table', 't num');
    const hr = el('tr');
    for (const h of ['source', 'span', 'rank by rise (this page)', 'raw total', 'total over age / day-over-day', 'Spearman rho']) hr.append(el('th', null, h));
    tb.append(hr);
    let any = false;
    for (const src of SOURCE_ORDER) {
      const v = data[src];
      if (!v || !v.summary?.pairs) continue;
      any = true;
      const m = v.summary.methods;
      const tr = el('tr');
      tr.append(el('td', null, S(src).label), el('td', null, `${v.summary.pairs} ${v.summary.horizon === 'next day' ? 'days' : 'scan pairs'}${v.summary.span ? `, ${String(v.summary.span[0]).slice(0, 16)} to ${String(v.summary.span[1]).slice(0, 16)}` : ''}${v.summary.horizon !== 'next day' && v.summary.gapH ? `, median gap ${num(v.summary.gapH)} h` : ''}`));
      for (const k of ['method', 'total', 'alt']) {
        const x = m[k];
        const td = el('td');
        if (!x || !x.calls) td.textContent = 'n/a';
        else {
          td.textContent = `${pct(x.rate)} of ${x.calls} calls (90%: ${ciText(x.ci)})`;
          if (x.tooFew) td.append(el('span', 'few', ' too few to judge'));
          if (k !== 'method' && m.method?.rate != null && x.rate != null) td.append(el('div', 'note', `page minus this: ${m.method.rate >= x.rate ? '+' : ''}${((m.method.rate - x.rate) * 100).toFixed(0)} percentage points`));
        }
        tr.append(td);
      }
      const sp = v.summary.spearman;
      tr.append(el('td', null, sp?.rho == null ? 'n/a' : `${sp.rho.toFixed(2)} (n ${sp.n}; 90%: ${sp.ci ? sp.ci.map((x) => x.toFixed(2)).join(' to ') : 'n/a'})${sp.n < TUNING.minCallsToJudge ? ' too few' : ''}`));
      tb.append(tr);
    }
    wrap.append(tb);
    if (any) host.append(wrap);
    else host.append(el('p', 'note', 'No pair of observations yet. A call needs a later scan of the same source (HN and GitHub: at least 10 minutes later; Wikipedia: the next day).'));
  };
  block('Recorded record (ships with the page)', model.verify.archive,
    `Wikipedia: ${model.verify.archiveNote} HN, Show HN and GitHub: scans recorded on ${model.verify.recordedDay}, gain to the next recorded scan.`);
  const cal = Object.entries(model.verify.archive).filter(([, v]) => v.deciles && !v.deciles.tooFew);
  if (cal.length) {
    host.append(el('p', 'note', 'Calibration by score decile (lowest to highest): the share of calls still above their own baseline at the horizon. Wikipedia: views the next day over the same-weekday median. HN and GitHub: the rate 4 to 9 h later over the source median at the call.'));
    const ul = el('ul', 'steps num');
    for (const [s, v] of cal) ul.append(el('li', null, `${S(s).label}, ${v.deciles.n} calls: ${v.deciles.bins.map((b) => (b.p == null ? '-' : b.p.toFixed(2))).join('  ')}`));
    host.append(ul);
  }
  const reading = SOURCE_ORDER.map((s) => [s, model.verify.archive[s]?.summary]).filter(([s, x]) => x?.methods?.method?.calls >= TUNING.minCallsToJudge && S(s).kind === 'readership');
  if (reading.length) {
    const d = reading.map(([s, x]) => `${S(s).short} ${Math.round((x.methods.method.rate - x.methods.total.rate) * 100)}`).join(', ');
    const a = reading.map(([s, x]) => `${S(s).short} +${Math.round((x.methods.method.rate - x.methods.alt.rate) * 100)}`).join(', ');
    host.append(el('p', 'why', `Reading the record: on Wikipedia, ranking by rise against the weekday baseline beats the naive day-over-day ranking (${a} percentage points) but loses to plain size on next-day views (${d}), and its score barely predicts the size of the next day's gain (Spearman near zero). A spike is real and mostly stays above its own baseline the next day, but it decays: rising and large are different questions.`));
  }
  host.append(el('div', null, null, { style: 'height:14px' }));
  block('Your scans (this browser)', model.verify.local, 'Built from the scans stored in this browser. It grows with every scan you run.');
  if (model.revisits.length) {
    host.append(el('h3', null, 'The previous scan\'s calls, revisited'));
    const ul = el('ul', 'steps');
    model.revisits.slice(0, 12).forEach((r) => ul.append(el('li', 'num', `${S(r.src).short} ${r.title}: ${r.label}${r.then != null ? `, ${num(r.then)} then, ${num(r.since)} ${r.unit} since` : ''}, over ${num(r.gapH)} h`)));
    host.append(ul);
  }
}

/* ---------------- method, worked example, why it is hard ---------------- */
export function renderMethod(host, model) {
  clear(host);
  const g = el('div', 'mgrid');
  const eq = {
    forum: `rate = points / max(age_h, ${TUNING.hnAgeFloorH})          [points/h]\n95%: Garwood exact Poisson limits on points, divided by the same age`,
    code: `rate = stars / max(age_h, ${TUNING.ghAgeFloorH}) x 24          [stars/day]\n95%: Garwood exact Poisson limits on stars, same division`,
    readership: `ratio = views(D) / median(views(D-7), views(D-14), views(D-21), views(D-28))   [x weekday median]\nfewer than 3 of the 4 weeks, or a median under ${TUNING.wikiMinBaseline}: labelled new, never an infinite ratio`,
  };
  for (const src of SOURCE_ORDER) {
    const s = S(src);
    const d = el('div');
    d.append(el('h3', null, `${s.label} · ${s.feed}`), el('p', null, s.what), el('div', 'eq', eq[s.kind]),
      el('p', null, `Caveat: ${s.caveat}`), el('p', null, `Rate limit: ${s.limit}. Request budget per scan: at most ${s.budget} (${s.budgetNote}).`));
    g.append(d);
  }
  const d1 = el('div');
  d1.append(el('h3', null, 'Shared unit across sources'), el('div', 'eq', `z = (ln x - median(ln x_source)) / (${TUNING.madScale} x MAD(ln x_source))`),
    el('p', null, 'x is the chosen score (lower bound, point rate or total). The median and MAD come from the scored items of the same source in the same scan. With one source shown the board ranks in its own unit; with several it ranks by z.'));
  const d2 = el('div');
  d2.append(el('h3', null, 'Trend and acceleration'), el('div', 'eq', `r1, r2 = rates between the last three observations\nrho = (r2 - r1) / r1:  accelerating if rho > +${TUNING.accelThreshold}, decaying if rho < -${TUNING.accelThreshold}, else steady`),
    el('p', null, 'HN and GitHub: the first observation is the item itself at its creation time (1 point, 0 stars), the others are stored scans at least 9 minutes apart. Wikipedia: the last two full days of its daily series.'));
  const d3 = el('div');
  d3.append(el('h3', null, 'Topics'), el('div', 'eq', `(a) entity: a Wikipedia title, disambiguation removed, appears as a phrase in the other title\n(b) terms: sum idf(shared) / sum idf(union) >= ${TUNING.jaccard}, shared idf >= 2.5\nidf = ln(N / df) over every title in the scan`),
    el('p', null, 'Key terms are the 1 to 3 highest-idf content words of each title (binary TF-IDF). Wikipedia candidates include up to 2 articles per edition that an HN or GitHub title names, so a subject in two kinds of source can meet.'));
  const d5 = el('div');
  d5.append(el('h3', null, 'Burst onset (Wikipedia)'), el('div', 'eq', `x = ln(views + 1); mean and sd from the days before the last ${TUNING.cusumMonitorDays}
S = max(0, S + (x - mean) / sd - ${TUNING.cusumK});  burst when S > ${TUNING.cusumH}
onset = the first day of the run that crossed`),
    el('p', null, 'A one-sided CUSUM change-point test (Page, Biometrika 41, 1954) on the daily series of each article, so a burst is dated, not only ranked. HN and GitHub items rarely have the 21 observations it needs and are not tested.'));
  const d4 = el('div');
  d4.append(el('h3', null, 'The model'), el('p', null, `One call per scan, for the top ${TUNING.explainTop} signals, through the shared route (your Ollama when the page is served locally, a key you bring, the public keyless service limited to one reply per 45 s per IP, then this page's engine). The reply must be one JSON object; each entry is validated, a malformed one is replaced by the engine's, and every number and date in it is checked against the facts that were sent. The check matches numbers, not what they measure: a right number in the wrong unit passes it.`));
  g.append(d1, d2, d5, d3, d4);
  host.append(g);
  if (model.budget) host.append(el('p', 'note num', model.budget));
}

/* Provenance of the scan on screen: one row per source, from the requests actually made. */
export function renderProvenance(host, model) {
  clear(host);
  const wrap = el('div', 'tscroll');
  const tb = el('table', 't num');
  const hr = el('tr');
  for (const h of ['source', 'status', 'fetched (UTC)', 'window the data covers', 'requests', 'received', 'first request']) hr.append(el('th', null, h));
  tb.append(hr);
  for (const src of SOURCE_ORDER) {
    const v = model.scan.sources[src];
    if (!v) continue;
    const tr = el('tr');
    const rate = v.rate?.remaining != null ? `, ${v.rate.remaining} of ${v.rate.limit} search calls left` : '';
    tr.append(el('td', null, S(src).label),
      el('td', null, `${v.status}${v.reshown ? ' (last stored result, no new request)' : ''}${v.error ? `: ${v.error}` : ''}${rate}`),
      el('td', null, v.fetchedAt ? utc(v.fetchedAt).slice(0, 16) : 'n/a'),
      el('td', null, v.window || 'n/a'),
      el('td', 'n', v.requests != null ? String(v.requests) : 'n/a'),
      el('td', 'n', v.bytes != null ? kb(v.bytes) : 'n/a'));
    const td = el('td');
    if (v.urls?.[0]) td.append(el('code', null, v.urls[0]));
    tr.append(td);
    tb.append(tr);
  }
  wrap.append(tb);
  host.append(el('p', 'note', `Origin of the scan on screen: ${model.origin === 'live' ? 'fetched live from this browser' : model.origin === 'stored' ? 'stored in this browser' : 'recorded with the same engine on the date shown'}.`), wrap);
}

export function renderWorked(host, model) {
  clear(host);
  const it = model.items[0];
  if (!it) return;
  const s = S(it.src), sc = it.sc;
  host.append(el('p', 'note', `Recomputing "${it.title}" (${s.label}) by hand from the fields its API returned. Request: ${it.rawUrl || 'n/a'}`));
  const ol = el('ol', 'steps num');
  const add = (t) => ol.append(el('li', null, t));
  if (s.kind === 'readership') {
    const d = sc.detail;
    add(`views on ${d.day}: ${d.views} (per-article series, field "views" at timestamp ${d.day.replace(/-/g, '')}00)`);
    add(`same weekday, 4 prior weeks: ${d.weeks.join(', ')} views; median = ${num(d.base, 1)}`);
    if (sc.isNew) add('baseline missing or under 1: labelled new');
    else {
      add(`ratio = ${d.views} / ${num(d.base, 1)} = ${num(sc.rate, 3)}x`);
      add(`Garwood 95% on ${d.views} views: ${num(d.cl, 1)} to ${num(d.ch, 1)}; divided by ${num(d.base, 1)}: ${num(sc.lo, 3)} to ${num(sc.hi, 3)}x. The board ranks by ${num(sc.lo, 3)}.`);
    }
  } else {
    const d = sc.detail;
    add(`${s.total}: ${d.count} (field "${s.kind === 'forum' ? 'points' : 'stargazers_count'}")`);
    add(`created: ${new Date(d.created).toISOString()} (field "${s.kind === 'forum' ? 'created_at_i' : 'created_at'}"); fetched ${new Date(d.t).toISOString()}`);
    add(`age = ${num(d.ageH, 3)} h; floor ${d.floor} h; age used = ${num(d.ageEff, 3)} h`);
    add(`rate = ${d.count} / ${num(d.ageEff, 3)}${d.per === 24 ? ' x 24' : ''} = ${num(sc.rate, 3)} ${s.unit}`);
    add(`Garwood 95% on ${d.count}: ${num(d.cl, 2)} to ${num(d.ch, 2)} ${s.total}; same division: ${num(sc.lo, 3)} to ${num(sc.hi, 3)} ${s.unit}. The board ranks by ${num(sc.lo, 3)}.`);
  }
  if (it.z != null) add(`shared unit: z = (ln ${num(it.value, 3)} - ${num(model.scalerOf(it)?.med, 3)}) / ${num(model.scalerOf(it)?.scale, 3)} = ${it.z.toFixed(3)}`);
  host.append(ol);
  if (it.raw) { const pre = el('pre', 'raw'); pre.textContent = JSON.stringify(it.raw, null, 1); host.append(pre); }
}

export function renderHard(host, model) {
  clear(host);
  const items = model.allScored;
  if (!items.length) return;
  const byTotal = [...items].filter((x) => S(x.src).kind !== 'readership').sort((a, b) => b.sc.total - a.sc.total)[0];
  const byRate = [...items].filter((x) => S(x.src).kind !== 'readership').sort((a, b) => b.sc.lo - a.sc.lo)[0];
  const widest = [...items].filter((x) => !x.sc.isNew && x.sc.lo > 0).sort((a, b) => b.sc.hi / b.sc.lo - a.sc.hi / a.sc.lo)[0];
  const li = (b, t) => { const n = el('li'); n.append(el('b', null, b), el('span', 'num', t)); host.append(n); };
  if (byTotal && byRate) li('Size is not rise', `The largest item in this scan is "${byTotal.title}" with ${num(byTotal.sc.total)} ${S(byTotal.src).total}; the fastest by lower bound is "${byRate.title}" at ${num(byRate.sc.lo)} ${S(byRate.src).unit}. ${byTotal === byRate ? 'Today they are the same item.' : 'A list sorted by totals would put the old and big first.'}`);
  if (widest) li('Small counts are noisy', `The widest interval on the board is "${widest.title}": ${num(widest.sc.lo)} to ${num(widest.sc.hi)} ${S(widest.src).unit}, a factor of ${num(widest.sc.hi / widest.sc.lo)}. Ranking by the lower bound keeps a lucky early burst from beating a proven climb.`);
  const a = model.items[0];
  if (a) li('Units do not compare', `"${a.title}" scores ${scoreText(a, 'lower')} in its own unit${a.z != null ? ` and z ${a.z.toFixed(2)} in the shared unit` : ''}. Points per hour, stars per day and a ratio to a weekday median only meet after each is measured against its own source.`);
}

export function renderEvidence(host, model) {
  clear(host);
  const ev = (tag, text) => { const p = el('p', 'ev'); p.append(el('i'), el('span')); p.lastChild.append(el('b', null, tag), document.createTextNode(' ' + text)); host.append(p); };
  ev('[REAL]', 'Every count, rate, interval, baseline, topic and verification figure is computed in this page from API responses fetched live from your browser, or recorded from the same APIs on the date printed. Hacker News via the Algolia HN Search API; GitHub REST search; Wikimedia Analytics pageviews (CC0, Wikimedia Foundation).');
  ev('[REAL]', 'Intervals: Garwood, Fiducial limits for the Poisson distribution, Biometrika 28 (1936) 437-442. Robust scale: the median absolute deviation, scaled by 1.4826 (Rousseeuw and Croux, JASA 88, 1993). Rank agreement: Spearman, American Journal of Psychology 15 (1904).');
  ev('[REAL]', 'Model text is a model\'s output, labelled with the route that answered, and checked number by number against the fetched data; a figure it cannot find is struck through. It is never used as a source of numbers.');
  ev('[ILLUSTRATIVE]', 'The cause labels the deterministic engine assigns are keyword rules, a guess shown as "keyword rule" wherever it appears. No data on this page is invented.');
  host.append(el('p', 'note', `Recorded data in this page: ${model.archiveNote}. The original Trending Topics template was replaced by this plate on 2026-11-11.`));
}

/* ---------------- detail dialog ---------------- */
export function renderDetail(host, it, model, on) {
  clear(host);
  const s = S(it.src);
  const x = el('button', 'ghost sm x', 'Close', { type: 'button' });
  x.addEventListener('click', on.close);
  host.append(x, el('div', 'k', `${s.label} · ${s.feed}`));
  const h = el('h3', null, it.title, { id: 'detail-title' });
  host.append(h);
  const links = el('p', 'note');
  links.append(el('a', null, 'open at the source', { href: it.url, target: '_blank', rel: 'noopener' }));
  if (it.discuss && it.discuss !== it.url) { links.append(document.createTextNode(' · ')); links.append(el('a', null, 'discussion', { href: it.discuss, target: '_blank', rel: 'noopener' })); }
  host.append(links);
  host.append(el('p', 'why num', subLine(it, model)));
  host.append(el('h3', null, 'metric history'));
  const seen = (it.traj || []).filter((p) => p.kind !== 'origin');
  const pts = seen.length >= 3 ? seen : it.traj || [];
  if (pts.length >= 2) {
    const sp = sparkline(pts, { w: 480, h: 120, cls: 'dspark' });
    const how = s.kind === 'readership' ? 'Line and hollow: daily views backfilled from the per-article series; last point: the scan day.'
      : pts === seen ? 'Stored scans, then this scan. The creation point is left out so the scans are readable.' : 'First point: the item at its creation; then stored scans; last: this scan.';
    host.append(sp, el('p', 'note num', `${pts.length} observations, first ${utc(pts[0].t)}, last ${utc(pts[pts.length - 1].t)}. ${how}`));
  } else host.append(el('p', 'note', 'One observation so far. Every later scan adds one.'));
  host.append(el('h3', null, 'raw origin'));
  const raw = el('div', 'raw');
  raw.append(el('p', null, 'Request:'), el('code', null, it.rawUrl || 'n/a'));
  const pre = el('pre');
  pre.textContent = JSON.stringify(it.raw || {}, null, 1);
  raw.append(el('p', null, 'Fields the score was computed from:'), pre);
  host.append(raw);
  host.append(el('h3', null, 'ask the model about this item'));
  const ask = el('button', 'ghost', model.askLabel || 'Ask one question', { type: 'button' });
  ask.addEventListener('click', () => on.ask(it, out, ask));
  const out = el('div', 'why');
  host.append(ask, out);
}

/* ---------------- typing ---------------- */
export async function typeInto(node, text, signal) {
  if (prefersReduced()) { node.textContent = text; return; }
  node.textContent = '';
  for (let i = 0; i < text.length; i += TUNING.typeStepChars) {
    if (signal?.aborted) { node.textContent = text; return; }
    node.textContent += text.slice(i, i + TUNING.typeStepChars);
    await wait(TUNING.typeDelayMs);
  }
}

export { clock, kb, garwood };
