/* ============================================================
   heptapod/grammar.js — the semantic graph, and English on both
   sides of it.

   A proposition is a graph, not a string:

     { type:'prop', pred, agent, patient, recipient,
       time, aspect, mood, neg, evid }

   agent / patient / recipient: an entity { c, num } or null; the
   patient may instead be a whole proposition (an embedded clause,
   one level deep). Two propositions joined by a relation:

     { type:'rel', rel:'because'|'despite'|'after'|'before', a, b }

   means "a REL b". This module validates graphs (the same check
   guards the model's JSON), parses a controlled English into
   them, and realises them back into English. The invariant the
   page relies on, tested in the lab's self-test: for every valid
   graph g, parse(realize(g)) equals g.
   ============================================================ */

import { NOUN, VERB, NOUN_FORMS, VERB_FORMS, NOUNS, VERBS } from './lexicon.js';

export const ENUMS = {
  time: ['past', 'present', 'future'],
  aspect: ['simple', 'progressive', 'perfect'],
  mood: ['indicative', 'interrogative', 'imperative', 'potential'],
  evid: ['direct', 'inferred', 'reported'],
  num: ['sg', 'pl'],
  rel: ['because', 'despite', 'after', 'before'],
};
export const ROLES = ['agent', 'patient', 'recipient'];

export const REL_WORD = { because: 'because', despite: 'even though', after: 'after', before: 'before' };

/* ---------------- validation ---------------- */

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function cleanEntity(e, path, errors) {
  if (e == null) return null;
  if (typeof e === 'string') e = { c: e };
  if (!isObj(e)) { errors.push(`${path}: not an entity`); return null; }
  let id = String(e.c ?? e.concept ?? e.id ?? '').toLowerCase().trim();
  let num = e.num ?? e.number;
  if (!NOUN[id]) {
    const f = NOUN_FORMS.get(id);
    if (f) { id = f.id; num = num || f.num; }
  }
  const n = NOUN[id];
  if (!n) { errors.push(`${path}: "${id || '?'}" is not a concept in the lexicon`); return null; }
  num = num === 'pl' || num === 'plural' ? 'pl' : 'sg';
  if (n.pron) num = n.num;
  return { c: id, num };
}

function cleanProp(p, path, depth, errors) {
  if (!isObj(p)) { errors.push(`${path}: not a proposition`); return null; }
  let pred = String(p.pred ?? p.predicate ?? p.verb ?? '').toLowerCase().trim();
  if (!VERB[pred]) {
    const f = VERB_FORMS.get(pred);
    if (f) pred = f[0].id;
  }
  if (!VERB[pred]) errors.push(`${path}.pred: "${pred || '?'}" is not a verb in the lexicon`);
  const pick = (k, v) => (ENUMS[k].includes(v) ? v : ENUMS[k][k === 'time' ? 1 : 0]);
  const out = {
    type: 'prop', pred,
    agent: cleanEntity(p.agent, path + '.agent', errors),
    patient: null,
    recipient: cleanEntity(p.recipient, path + '.recipient', errors),
    time: pick('time', p.time),
    aspect: pick('aspect', p.aspect),
    mood: pick('mood', p.mood),
    neg: p.neg === true || p.neg === 'true' || p.negated === true,
    evid: pick('evid', p.evid ?? p.evidentiality),
  };
  const pt = p.patient;
  if (isObj(pt) && (pt.type === 'prop' || pt.pred || pt.predicate)) {
    if (depth >= 1) errors.push(`${path}.patient: clauses nest one level deep in this script`);
    else out.patient = cleanProp(pt, path + '.patient', depth + 1, errors);
  } else out.patient = cleanEntity(pt, path + '.patient', errors);
  return normalizeProp(out, depth);
}

/** Canonical form: combinations English (and this script) cannot carry are folded. */
export function normalizeProp(p, depth = 0) {
  if (!p) return p;
  if (p.mood === 'imperative') { p.agent = null; p.time = 'present'; p.aspect = 'simple'; p.evid = 'direct'; }
  if (p.mood === 'interrogative') p.evid = 'direct';
  if (depth > 0 && (p.mood === 'interrogative' || p.mood === 'imperative')) p.mood = 'indicative';
  // no agent outside a command is a passive; a passive needs something to happen to
  if (p.mood !== 'imperative' && !p.agent && !p.patient) p.agent = { c: 'it', num: 'sg' };
  return p;
}

/** Validate any graph (prop or rel). Returns { graph, errors }. */
export function validateGraph(g) {
  const errors = [];
  if (!isObj(g)) return { graph: null, errors: ['not a JSON object'] };
  if (g.graph && isObj(g.graph)) g = g.graph;
  let graph;
  if (g.type === 'rel' || g.rel) {
    const rel = ENUMS.rel.includes(g.rel) ? g.rel : (g.rel === 'although' || g.rel === 'even though' ? 'despite' : null);
    if (!rel) errors.push(`rel: "${g.rel}" is not one of ${ENUMS.rel.join(', ')}`);
    const a = cleanProp(g.a, 'a', 0, errors);
    const b = cleanProp(g.b, 'b', 0, errors);
    graph = { type: 'rel', rel: rel || 'because', a, b };
    if (a && a.mood === 'imperative') errors.push('a: an imperative cannot be joined by a relation here');
    if (b && (b.mood === 'imperative' || b.mood === 'interrogative')) errors.push('b: the second proposition must be a statement');
    if (a && a.mood === 'interrogative') errors.push('a: a question cannot be joined by a relation here');
  } else {
    graph = cleanProp(g, 'graph', 0, errors);
  }
  return { graph: errors.length ? null : graph, errors };
}

/* ---------------- equality and diff ---------------- */

const entEq = (x, y) => (!x && !y) || (x && y && x.c === y.c && x.num === y.num);

export function propFields(p, prefix = '') {
  const f = {};
  if (!p) return f;
  f[prefix + 'pred'] = p.pred;
  for (const r of ROLES) {
    const e = p[r];
    if (e && e.type === 'prop') {
      f[prefix + r] = 'clause';
      Object.assign(f, propFields(e, prefix + r + '.'));
    } else f[prefix + r] = e ? `${e.c}/${e.num}` : '-';
  }
  for (const k of ['time', 'aspect', 'mood', 'evid']) f[prefix + k] = p[k];
  f[prefix + 'neg'] = p.neg ? 'neg' : 'pos';
  return f;
}

export function graphFields(g) {
  if (!g) return {};
  if (g.type === 'rel') return { rel: g.rel, ...propFields(g.a, 'a.'), ...propFields(g.b, 'b.') };
  return propFields(g);
}

/** Field-by-field comparison: { total, same, diffs:[{field, want, got}] }. */
export function diffGraphs(want, got) {
  const a = graphFields(want), b = graphFields(got);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const diffs = [];
  for (const k of keys) if (a[k] !== b[k]) diffs.push({ field: k, want: a[k] ?? '-', got: b[k] ?? '-' });
  return { total: Object.keys(a).length, same: Object.keys(a).length - diffs.filter((d) => k_in(a, d.field)).length, diffs };
}
const k_in = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export const graphEqual = (x, y) => diffGraphs(x, y).diffs.length === 0;

/* ---------------- realisation: graph -> English ---------------- */

function np(e, kase) {
  const n = NOUN[e.c];
  if (n.pron) return kase === 'subj' ? n.subj : n.obj;
  if (e.num === 'pl') return (n.art === 'the' ? 'the ' : '') + n.pl;
  return (n.art ? n.art + ' ' : '') + n.sg;
}

const isThird = (e) => !e || (NOUN[e.c].third && e.num === 'sg');
const isI = (e) => e && e.c === 'i';

function be(time, agent) {
  if (time === 'past') return isI(agent) || isThird(agent) ? 'was' : 'were';
  return isI(agent) ? 'am' : isThird(agent) ? 'is' : 'are';
}
const have = (time, agent) => (time === 'past' ? 'had' : isThird(agent) ? 'has' : 'have');
const doAux = (time, agent) => (time === 'past' ? 'did' : isThird(agent) ? 'does' : 'do');

/* The verb group as a list of words, plus where the subject goes in a question. */
function verbGroup(p) {
  const v = VERB[p.pred];
  const a = p.agent;
  const neg = p.neg;
  const nt = neg ? ['not'] : [];
  if (p.mood === 'imperative') return { aux: null, rest: neg ? ['do', 'not', v.base] : [v.base] };
  if (p.mood === 'potential') {
    const tail = p.aspect === 'progressive' ? ['be', v.ing] : p.aspect === 'perfect' ? ['have', v.pp] : [v.base];
    if (p.time === 'future') return { aux: 'will', rest: [...nt, 'be', 'able', 'to', ...tail] };
    return { aux: p.time === 'past' ? 'could' : 'can', rest: [...nt, ...tail] };
  }
  if (p.time === 'future') {
    const tail = p.aspect === 'progressive' ? ['be', v.ing] : p.aspect === 'perfect' ? ['have', v.pp] : [v.base];
    return { aux: 'will', rest: [...nt, ...tail] };
  }
  if (p.aspect === 'progressive') return { aux: be(p.time, a), rest: [...nt, v.ing] };
  if (p.aspect === 'perfect') return { aux: have(p.time, a), rest: [...nt, v.pp] };
  // a past form identical to the base (read) is written with did, so the reader can tell it is past
  const ambiguousPast = p.time === 'past' && v.past === v.base && !isThird(a);
  if (neg || p.mood === 'interrogative' || ambiguousPast) return { aux: doAux(p.time, a), rest: [...nt, v.base] };
  return { aux: null, rest: [p.time === 'past' ? v.past : isThird(a) ? v.s : v.base] };
}

/* The passive: no agent is written, the patient becomes the subject. */
function passiveGroup(p, s) {
  const v = VERB[p.pred];
  const nt = p.neg ? ['not'] : [];
  const pp = v.pp;
  const tail = p.aspect === 'progressive' ? ['be', 'being', pp] : p.aspect === 'perfect' ? ['have', 'been', pp] : ['be', pp];
  if (p.mood === 'potential') {
    if (p.time === 'future') return { aux: 'will', rest: [...nt, 'be', 'able', 'to', ...tail] };
    return { aux: p.time === 'past' ? 'could' : 'can', rest: [...nt, ...tail] };
  }
  if (p.time === 'future') return { aux: 'will', rest: [...nt, ...tail] };
  if (p.aspect === 'progressive') return { aux: be(p.time, s), rest: [...nt, 'being', pp] };
  if (p.aspect === 'perfect') return { aux: have(p.time, s), rest: [...nt, 'been', pp] };
  return { aux: be(p.time, s), rest: [...nt, pp] };
}

function objects(p) {
  const v = VERB[p.pred];
  const out = [];
  const pt = p.patient, rc = p.recipient;
  if (pt && pt.type === 'prop') {
    if (rc) out.push(np(rc, 'obj'));
    out.push('that', clauseWords(pt, 1).join(' '));
    return out;
  }
  if (rc && pt) {
    if (NOUN[rc.c].pron && v.ditrans) out.push(np(rc, 'obj'), np(pt, 'obj'));
    else out.push(np(pt, 'obj'), 'to', np(rc, 'obj'));
  } else if (pt) out.push(np(pt, 'obj'));
  else if (rc) out.push('to', np(rc, 'obj'));
  return out;
}

const EVID_WORD = { inferred: 'apparently', reported: 'reportedly' };

function clauseWords(p, depth) {
  const words = [];
  if (p.evid !== 'direct') words.push(EVID_WORD[p.evid] + (depth === 0 ? ',' : ''));
  if (!p.agent && p.mood !== 'imperative') {
    const clause = p.patient && p.patient.type === 'prop';
    const sEnt = clause ? null : p.patient;
    const vg = passiveGroup(p, sEnt);
    const subj = clause ? 'it' : np(sEnt, 'subj');
    if (p.mood === 'interrogative') words.push(vg.aux, subj, ...vg.rest);
    else words.push(subj, vg.aux, ...vg.rest);
    if (p.recipient) words.push('to', np(p.recipient, 'obj'));
    if (clause) words.push('that', clauseWords(p.patient, 1).join(' '));
    return words;
  }
  const vg = verbGroup(p);
  const subj = p.agent ? np(p.agent, 'subj') : null;
  if (p.mood === 'imperative') words.push(...vg.rest);
  else if (p.mood === 'interrogative') {
    words.push(vg.aux, subj, ...vg.rest);
  } else {
    words.push(subj);
    if (vg.aux) words.push(vg.aux);
    words.push(...vg.rest);
  }
  words.push(...objects(p));
  return words;
}

const cap = (s) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

export function realize(g) {
  if (!g) return '';
  if (g.type === 'rel') {
    return cap(clauseWords(g.a, 0).join(' ') + ' ' + REL_WORD[g.rel] + ' ' +
      clauseWords(g.b, 0).join(' ').replace(/,$/, '')).replace(/ (apparently|reportedly), /g, ' $1 ') + '.';
  }
  const body = cap(clauseWords(g, 0).join(' '));
  return body + (g.mood === 'interrogative' ? '?' : '.');
}

/* ---------------- parsing: controlled English -> graph ---------------- */

const CONTRACT = [
  [/\bcan't\b|\bcannot\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bshan't\b/g, 'shall not'],
  [/\b(do|does|did|is|are|was|were|has|have|had|could|would|should|must|might)n't\b/g, '$1 not'],
  [/\bi'm\b/g, 'i am'], [/\b(we|you|they)'re\b/g, '$1 are'], [/\b(he|she|it)'s\b/g, '$1 is'],
  [/\b(i|we|you|they)'ve\b/g, '$1 have'], [/\b(i|we|you|they|he|she|it)'ll\b/g, '$1 will'],
  [/\b(i|we|you|they|he|she|it)'d\b/g, '$1 had'],
];
const DETS = new Set(['the', 'a', 'an', 'some', 'this', 'these', 'those']);
const POSS = new Set(['their', 'our', 'my', 'your', 'his', 'its']);
const INFER = new Set(['apparently', 'evidently', 'seemingly', 'probably', 'presumably']);
const REPORT = new Set(['reportedly', 'allegedly', 'supposedly']);
const CONN = { because: 'because', although: 'despite', though: 'despite', after: 'after', before: 'before' };

class ParseError extends Error {}
const fail = (msg) => { throw new ParseError(msg); };

function tokenize(text) {
  let s = ' ' + String(text).toLowerCase().replace(/[’‘]/g, "'") + ' ';
  for (const [re, rep] of CONTRACT) s = s.replace(re, rep);
  return s.match(/[a-z]+|[?.,;!]/g) || [];
}

function verbForm(word, form) {
  return (VERB_FORMS.get(word) || []).find((f) => f.form === form) || null;
}
const anyVerb = (word) => (VERB_FORMS.get(word) || [])[0] || null;

class Cursor {
  constructor(toks, warnings, fallback = []) { this.t = toks; this.i = 0; this.w = warnings; this.fallback = fallback; }
  peek(k = 0) { return this.t[this.i + k]; }
  next() { return this.t[this.i++]; }
  eat(word) { if (this.peek() === word) { this.i++; return true; } return false; }
  done() { return this.i >= this.t.length; }
}

function parseNP(cur, { optional = false } = {}) {
  const start = cur.i;
  let w = cur.peek();
  if (w === undefined) { if (optional) return null; fail('expected a noun phrase at the end'); }
  let hadDet = false;
  if (DETS.has(w)) { cur.next(); w = cur.peek(); hadDet = true; }
  else if (POSS.has(w)) { cur.next(); cur.w.push(`"${w}" was dropped: possession is not written in this script`); w = cur.peek(); hadDet = true; }
  // qualities are not written: an unknown word between a determiner and a noun is dropped, and said so
  while (hadDet && w !== undefined && !KNOWN.has(w) && /^[a-z]+$/.test(w) && NOUN_FORMS.has(cur.peek(1))) {
    cur.w.push(`"${w}" was dropped: qualities are not written in this script`);
    cur.next();
    w = cur.peek();
  }
  const f = w !== undefined ? NOUN_FORMS.get(w) : null;
  if (!f) {
    // a content word nothing in the lexicon can name is written with the fallback radical
    if (w !== undefined && /^[a-z]+$/.test(w) && !KNOWN.has(w) && (hadDet || !optional)) {
      cur.next();
      cur.w.push(`"${w}" is not in the lexicon: written with the fallback radical, read back as "something"`);
      cur.fallback.push(w);
      return { c: 'something', num: 'sg' };
    }
    cur.i = start;
    if (optional) return null;
    fail(w === undefined ? 'expected a noun at the end' : `"${w}" is not a noun in the lexicon`);
  }
  cur.next();
  if (f.syn) cur.w.push(`"${w}" was written as "${f.id}"`);
  return { c: f.id, num: f.num };
}

/* The verb group after the subject. Returns { pred, time, aspect, mood, neg, passive }. */
function parseVG(cur, inverted = null, subject = null) {
  let neg = false, time = 'present', aspect = 'simple', mood = 'indicative', passive = false;
  const expect = (form) => {
    const w = cur.next();
    const f = w && verbForm(w, form);
    if (!f) fail(w ? `expected the ${form === 'ing' ? '-ing' : form === 'pp' ? 'past participle' : 'base'} form of a verb, found "${w}"` : 'expected a verb');
    return f.id;
  };
  const isForm = (k, form) => !!verbForm(cur.peek(k), form);
  const negs = () => { if (cur.eat('not') || cur.eat('never')) neg = true; };
  let aux = inverted || cur.peek();
  if (!inverted && ['will', 'can', 'could', 'may', 'might', 'has', 'have', 'had', 'am', 'is', 'are', 'was', 'were', 'do', 'does', 'did'].includes(aux)) cur.next();
  else if (!inverted) aux = null;
  if (aux) negs();
  let pred;
  // after will / can / could: be V-ing, be V-en, be being V-en, have V-en, have been V-en, or the base
  const tailAfterModal = () => {
    if (cur.peek() === 'be') {
      if (cur.peek(1) === 'being' && isForm(2, 'pp')) { cur.i += 2; aspect = 'progressive'; passive = true; return expect('pp'); }
      if (isForm(1, 'ing')) { cur.i += 1; aspect = 'progressive'; return expect('ing'); }
      if (isForm(1, 'pp')) { cur.i += 1; passive = true; return expect('pp'); }
    }
    if (cur.peek() === 'have') {
      if (cur.peek(1) === 'been' && isForm(2, 'pp')) { cur.i += 2; aspect = 'perfect'; passive = true; return expect('pp'); }
      if (isForm(1, 'pp')) { cur.i += 1; aspect = 'perfect'; return expect('pp'); }
    }
    return expect('base');
  };
  const afterBe = () => {
    if (cur.peek() === 'being' && isForm(1, 'pp')) { cur.i += 1; aspect = 'progressive'; passive = true; return expect('pp'); }
    if (isForm(0, 'ing')) { aspect = 'progressive'; return expect('ing'); }
    passive = true;
    return expect('pp');
  };
  const afterHave = () => {
    aspect = 'perfect';
    if (cur.peek() === 'been' && isForm(1, 'pp')) { cur.i += 1; passive = true; return expect('pp'); }
    return expect('pp');
  };
  switch (aux) {
    case 'will':
      time = 'future';
      if (cur.peek() === 'be' && cur.peek(1) === 'able' && cur.peek(2) === 'to') { cur.i += 3; mood = 'potential'; }
      pred = tailAfterModal();
      break;
    case 'can': case 'may': mood = 'potential'; pred = tailAfterModal(); break;
    case 'could': case 'might': mood = 'potential'; time = 'past'; pred = tailAfterModal(); break;
    case 'has': case 'have': pred = afterHave(); break;
    case 'had': time = 'past'; pred = afterHave(); break;
    case 'am': case 'is': case 'are': pred = afterBe(); break;
    case 'was': case 'were': time = 'past'; pred = afterBe(); break;
    case 'do': case 'does': pred = expect('base'); break;
    case 'did': time = 'past'; pred = expect('base'); break;
    default: {
      negs();
      const w = cur.next();
      if (!w) fail('expected a verb');
      const forms = VERB_FORMS.get(w) || [];
      const past = forms.find((f) => f.form === 'past');
      const pres = forms.find((f) => f.form === 's' || f.form === 'base');
      if (!past && !pres) fail(NOUN_FORMS.has(w) ? `expected a verb after the subject, found the noun "${w}"` : `"${w}" is not a verb in the lexicon`);
      // a form that is both base and past (read): with a third-person singular subject it can only be past
      const third = subject && NOUN[subject.c].third && subject.num === 'sg';
      if (pres && pres.form === 'base' && past && third) { pred = past.id; time = 'past'; }
      else if (pres) pred = pres.id;
      else { pred = past.id; time = 'past'; }
    }
  }
  return { pred, time, aspect, mood, neg, passive };
}

/* After a passive verb group: [NP] [to NP] [by NP], or 'that' CLAUSE after an empty 'it'. */
function parsePassiveObjects(cur, p, subject, depth) {
  p.patient = subject;
  p.agent = null;
  const stop = () => cur.done() || ['.', '?', '!', ',', ';'].includes(cur.peek());
  const isIt = subject && subject.c === 'it';
  if (!stop() && !['to', 'by', 'that'].includes(cur.peek())) { p.recipient = subject; p.patient = parseNP(cur); }
  for (let k = 0; k < 3 && !stop(); k++) {
    if (cur.eat('to')) p.recipient = parseNP(cur);
    else if (cur.eat('by')) p.agent = parseNP(cur);
    else if (isIt && cur.peek() === 'that') {
      cur.next();
      if (depth >= 1) fail('clauses nest one level deep in this script');
      p.patient = parseClause(cur, depth + 1);
    } else break;
  }
}

function parseObjects(cur, p, depth) {
  const v = VERB[p.pred];
  const stop = () => cur.done() || ['.', '?', '!', ',', ';'].includes(cur.peek());
  if (stop()) return;
  if (cur.peek() === 'that') {
    cur.next();
    if (depth >= 1) fail('clauses nest one level deep in this script');
    p.patient = parseClause(cur, depth + 1);
    return;
  }
  if (cur.peek() === 'to') { cur.next(); p.recipient = parseNP(cur); return; }
  const first = parseNP(cur);
  if (stop()) { p.patient = first; return; }
  if (cur.peek() === 'that') {
    cur.next();
    if (depth >= 1) fail('clauses nest one level deep in this script');
    p.recipient = first;
    p.patient = parseClause(cur, depth + 1);
    return;
  }
  if (cur.eat('to')) { p.patient = first; p.recipient = parseNP(cur); return; }
  const second = parseNP(cur, { optional: true });
  if (second) {
    if (!v.ditrans) cur.w.push(`"${v.base}" rarely takes two objects; read as recipient then patient`);
    p.recipient = first; p.patient = second; return;
  }
  fail(`"${cur.peek()}" is not something this grammar can place`);
}

function parseClause(cur, depth) {
  const p = { type: 'prop', pred: null, agent: null, patient: null, recipient: null,
    time: 'present', aspect: 'simple', mood: 'indicative', neg: false, evid: 'direct' };
  const w0 = cur.peek();
  if (INFER.has(w0)) { cur.next(); cur.eat(','); p.evid = 'inferred'; }
  else if (REPORT.has(w0)) { cur.next(); cur.eat(','); p.evid = 'reported'; }
  else if (w0 === 'it' && cur.peek(1) === 'seems' && cur.peek(2) === 'that') { cur.i += 3; p.evid = 'inferred'; }

  const w = cur.peek();
  const AUXQ = ['do', 'does', 'did', 'will', 'is', 'are', 'am', 'was', 'were', 'has', 'have', 'had', 'can', 'could', 'may', 'might'];
  const isQuestion = depth === 0 && cur.t[cur.t.length - 1] === '?';
  if (isQuestion && AUXQ.includes(w)) {
    cur.next();
    const notFirst = cur.eat('not');
    const subj = parseNP(cur);
    const vg = parseVG(cur, w, subj);
    if (vg.mood === 'potential') fail('the mood slot holds one value: a modal question ("can we ...?") cannot be written; try "We can ..." or "Do we ...?"');
    const { passive, ...rest } = vg;
    Object.assign(p, rest, { mood: 'interrogative' });
    if (notFirst) p.neg = true;
    if (passive) parsePassiveObjects(cur, p, subj, depth);
    else { p.agent = subj; parseObjects(cur, p, depth); }
  } else if (depth === 0 && w === 'do' && cur.peek(1) === 'not' && verbForm(cur.peek(2), 'base')) {
    cur.i += 2; p.mood = 'imperative'; p.neg = true; p.pred = verbForm(cur.next(), 'base').id;
    parseObjects(cur, p, depth);
  } else if (depth === 0 && w && verbForm(w, 'base') && !NOUN_FORMS.has(w)) {
    cur.next(); p.mood = 'imperative'; p.pred = verbForm(w, 'base').id;
    parseObjects(cur, p, depth);
  } else {
    const save = cur.i;
    try {
      const subj = parseNP(cur);
      const { passive, ...vg } = parseVG(cur, null, subj);
      Object.assign(p, vg);
      if (passive) parsePassiveObjects(cur, p, subj, depth);
      else { p.agent = subj; parseObjects(cur, p, depth); }
    } catch (e) {
      // a word that is both a noun and a verb (answer, fear) may open an imperative
      if (!(e instanceof ParseError) || depth > 0 || !verbForm(w, 'base')) throw e;
      cur.i = save + 1;
      Object.assign(p, { agent: null, time: 'present', aspect: 'simple', mood: 'imperative', neg: false, pred: verbForm(w, 'base').id });
      parseObjects(cur, p, depth);
    }
  }
  return p;
}

function splitRelation(toks) {
  // "because B, A" (fronted) or "A because B" / "A even though B" / "A although B"
  const first = toks[0];
  if (CONN[first] && first !== 'though') {
    const comma = toks.indexOf(',');
    if (comma < 0) fail(`a sentence that starts with "${first}" needs a comma before its main clause`);
    return { rel: CONN[first], a: toks.slice(comma + 1), b: toks.slice(1, comma) };
  }
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i];
    if (t === 'even' && toks[i + 1] === 'though') {
      return { rel: 'despite', a: toks.slice(0, i), b: toks.slice(i + 2) };
    }
    if (CONN[t] && !(t === 'though')) return { rel: CONN[t], a: toks.slice(0, i), b: toks.slice(i + 1) };
  }
  return null;
}

const stripPunct = (t) => {
  const out = t.slice();
  while (out.length && ['.', '!', ';', ','].includes(out[out.length - 1])) out.pop();
  while (out.length && out[0] === ',') out.shift();
  while (out.length && out[out.length - 1] === ',') out.pop();
  return out;
};

function parseWhole(toks, warnings, fallback) {
  const cur = new Cursor(toks, warnings, fallback);
  const p = parseClause(cur, 0);
  while (!cur.done() && ['.', '?', '!'].includes(cur.peek())) cur.next();
  if (!cur.done()) fail(`"${cur.t.slice(cur.i).join(' ')}" was left over`);
  return p;
}

/** Parse controlled English. Returns { graph, errors, warnings, unknown, fallback, tags }. */
export function parse(text) {
  const warnings = [], fallback = [];
  const toks = tokenize(text);
  if (!toks.length) return { graph: null, errors: ['type a sentence'], warnings, unknown: [], fallback, tags: [] };
  const unknown = [...new Set(toks.filter((t) => /^[a-z]+$/.test(t) && !KNOWN.has(t)))];
  try {
    let graph;
    const split = splitRelation(toks);
    if (split) {
      const a = parseWhole(stripPunct(split.a), warnings, fallback);
      const b = parseWhole(stripPunct(split.b), warnings, fallback);
      graph = { type: 'rel', rel: split.rel, a, b };
    } else graph = parseWhole(toks, warnings, fallback);
    const v = validateGraph(graph);
    if (!v.graph) return { graph: null, errors: v.errors, warnings, unknown, fallback, tags: tagTokens(toks, null) };
    return { graph: v.graph, errors: [], warnings, unknown, fallback, tags: tagTokens(toks, v.graph) };
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    const rest = unknown.filter((u) => !fallback.includes(u));
    const msg = rest.length ? `${e.message} (not in the lexicon: ${rest.map((u) => '"' + u + '"').join(', ')})` : e.message;
    return { graph: null, errors: [msg], warnings, unknown, fallback, tags: tagTokens(toks, null) };
  }
}

/* Part-of-speech tags and lemmas from the rule tables, disambiguated by the parsed graph
   (a word that is both a noun and a verb takes the role it plays there). */
const AUXES = new Set(['will', 'can', 'could', 'may', 'might', 'has', 'have', 'had', 'am', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'be', 'being', 'been', 'able']);
function graphConcepts(g, acc = { n: new Set(), v: new Set() }) {
  if (!g) return acc;
  if (g.type === 'rel') { graphConcepts(g.a, acc); graphConcepts(g.b, acc); return acc; }
  acc.v.add(g.pred);
  for (const r of ROLES) {
    const e = g[r];
    if (!e) continue;
    if (e.type === 'prop') graphConcepts(e, acc); else acc.n.add(e.c);
  }
  return acc;
}

export function tagTokens(toks, graph) {
  const used = graphConcepts(graph);
  return toks.map((w) => {
    if (/^[?.,;!]$/.test(w)) return { w, tag: 'PUNCT' };
    if (DETS.has(w) || POSS.has(w)) return { w, tag: 'DET' };
    if (w === 'not' || w === 'never') return { w, tag: 'NEG' };
    if (INFER.has(w) || REPORT.has(w)) return { w, tag: 'ADV', lemma: INFER.has(w) ? 'evidence: inferred' : 'evidence: reported' };
    if (w === 'that') return { w, tag: 'COMP' };
    if (w === 'to' || w === 'by') return { w, tag: 'PREP' };
    if (CONN[w] || w === 'even') return { w, tag: 'CONJ' };
    const nf = NOUN_FORMS.get(w), vf = VERB_FORMS.get(w);
    if (AUXES.has(w) && !(vf && used.v.has(vf[0].id))) return { w, tag: 'AUX' };
    if (nf && (!vf || used.n.has(nf.id) || !used.v.has(vf[0].id))) {
      return { w, tag: NOUN[nf.id].pron ? 'PRON' : 'N', lemma: nf.id + (nf.num === 'pl' && !NOUN[nf.id].pron ? ', plural' : '') };
    }
    if (vf) return { w, tag: 'V', lemma: vf[0].id + ' (' + [...new Set(vf.map((f) => f.form))].join('/') + ')' };
    return { w, tag: KNOWN.has(w) ? 'FW' : 'UNK' };
  });
}

const FUNCTION_WORDS = ['the', 'a', 'an', 'some', 'this', 'these', 'those', 'that', 'to', 'not', 'never', 'do', 'does', 'did', 'being', 'been', 'by',
  'will', 'can', 'could', 'may', 'might', 'has', 'have', 'had', 'am', 'is', 'are', 'was', 'were', 'be', 'able',
  'because', 'although', 'though', 'even', 'after', 'before', 'it', 'seems', 'their', 'our', 'my', 'your', 'his', 'its',
  ...INFER, ...REPORT];
const KNOWN = new Set([...FUNCTION_WORDS, ...NOUN_FORMS.keys(), ...VERB_FORMS.keys()]);

/* ---------------- random graphs, for the self-test and the sweep ---------------- */

export function randomProp(rnd, depth = 0) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ent = () => { const n = pick(NOUNS); return { c: n.id, num: n.pron ? n.num : (rnd() < 0.4 ? 'pl' : 'sg') }; };
  const v = pick(VERBS);
  const p = {
    type: 'prop', pred: v.id, agent: ent(), patient: null, recipient: null,
    time: pick(ENUMS.time), aspect: pick(ENUMS.aspect), mood: pick(ENUMS.mood), neg: rnd() < 0.3, evid: pick(ENUMS.evid),
  };
  const r = rnd();
  if (depth === 0 && v.clause && r < 0.3) p.patient = randomProp(rnd, 1);
  else if (r < 0.85) p.patient = ent();
  if (rnd() < 0.3) p.recipient = ent();
  if (p.recipient && !p.patient) p.recipient = null;
  if (p.patient && rnd() < 0.15) p.agent = null; // an agentless passive
  return normalizeProp(p, depth);
}

export function randomGraph(rnd) {
  if (rnd() < 0.3) {
    const a = randomProp(rnd), b = randomProp(rnd);
    if (a.mood === 'imperative' || a.mood === 'interrogative') a.mood = 'indicative';
    if (b.mood === 'imperative' || b.mood === 'interrogative') b.mood = 'indicative';
    if (!a.agent) a.agent = { c: 'we', num: 'pl' };
    if (!b.agent) b.agent = { c: 'they', num: 'pl' };
    return { type: 'rel', rel: ENUMS.rel[Math.floor(rnd() * 4)], a, b };
  }
  return randomProp(rnd);
}

export function lexiconForPrompt() {
  const nouns = NOUNS.map((n) => n.id).join(', ');
  const verbs = VERBS.map((v) => v.id).join(', ');
  return { nouns, verbs };
}
