/* ============================================================
   trending/explain.js — what the model is asked, how its reply is
   checked, and the deterministic engine that answers when no model
   does. Pure functions (tests.mjs runs them on recorded replies).

   One request per scan carries the top signals with their measured
   numbers and fetched text (HN comments, GitHub descriptions, the
   Wikipedia daily series). The reply must be one JSON object:
     { signals: [{ id, cause, confidence, why }], topics: [{ label, members }], digest }
   Every entry is validated; a malformed entry is replaced by the
   engine's entry for that item, never left blank. Every number and
   ISO date in a reply is checked against the facts that were sent;
   a number found nowhere in them is flagged on the page.
   ============================================================ */

import { CAUSES, CAUSE_RULES, CAUSE_DEFAULT, SOURCES, TUNING } from './constants.js';

/* ---------------- formatting shared with the views ---------------- */
export function num(x, digits) {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x);
  if (digits != null) return x.toFixed(digits);
  if (Number.isInteger(x) && a < 1e4) return String(x);
  if (a >= 1e6) return (x / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return Math.round(x / 1e3) + 'k';
  if (a >= 100) return String(Math.round(x));
  if (a >= 10) return x.toFixed(1);
  return x.toFixed(2);
}
export const ageText = (h) => (h == null || !Number.isFinite(h) ? 'n/a' : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

/* ---------------- facts: what the prompt carries ---------------- */
export function factsFor(it, ev = {}, extra = {}) {
  const s = SOURCES[it.src], sc = it.sc;
  const f = { id: extra.key, source: s.label, kind: s.kind, title: it.title, url: it.url };
  if (s.kind === 'readership') {
    Object.assign(f, {
      views_on_day: sc.total, day: it.day, weekday_median: sc.base, ratio_to_baseline: sc.rate, ratio_lower_95: sc.lo,
      views_day_before: it.prev, last_7_days: (it.series || []).slice(-7).map(([d, v]) => `${d}:${v}`).join(' '),
    });
  } else {
    Object.assign(f, {
      [s.total]: sc.total, age_hours: Number(sc.ageH?.toFixed(1)), [`rate_${s.unit.replace('/', '_per_')}`]: Number(sc.rate.toFixed(2)),
      lower_95: Number(sc.lo.toFixed(2)), [s.third]: it.third, created: new Date(it.created).toISOString().slice(0, 10),
    });
    if (it.meta?.desc) f.description = it.meta.desc;
    if (it.meta?.lang) f.language = it.meta.lang;
    if (ev.comments?.length) f.top_comments = ev.comments;
  }
  if (extra.rankChange != null) f.rank_change_since_last_scan = extra.rankChange;
  if (extra.measured) {
    f.measured_rate_since_last_scan = Number(extra.measured.rate.toFixed(2));
    f.gain_since_last_scan = extra.measured.dc;
    f.minutes_since_last_scan = Math.round(extra.measured.dtH * 60);
  }
  if (s.kind === 'code' && Number.isFinite(sc.ageH)) f.age_days = Number((sc.ageH / 24).toFixed(1));
  if (extra.accel) f.trend = extra.accel.label;
  if (it.terms?.length) f.key_terms = it.terms;
  return f;
}

export function buildRequest(facts, topics, scanFacts = null) {
  const system =
    'You explain why items are rising in public web signals. You only use the facts given. ' +
    'You never invent numbers, dates or names. When the facts do not show a cause, say the cause is unclear.';
  const prompt =
    `Here are ${facts.length} rising signals measured from live APIs, with their numbers and fetched text:\n` +
    JSON.stringify(facts, null, 1) +
    (scanFacts ? `\nThe scan as a whole: ${JSON.stringify(scanFacts)}` : '') +
    (topics.length ? `\nTopics the page found joining several signals: ${JSON.stringify(topics.map((t) => ({ label: t.label, members: t.keys })))}` : '') +
    `\n\nReturn one JSON object with exactly these keys:\n` +
    `"signals": an array with one entry per signal, each {"id": the signal id, "cause": one of ${JSON.stringify(CAUSES)}, ` +
    `"confidence": a number from 0 to 1, "why": two plain sentences on why it is rising that quote at least one number from its facts}.\n` +
    `"topics": an array of {"label": a short name, "members": [signal ids]} for signals about the same subject (may be empty).\n` +
    `"digest": one paragraph of at most 70 words on what this scan shows.\n` +
    'Use only numbers that appear in the facts. No markdown.';
  return { system, prompt };
}

/* ---------------- the deterministic engine ---------------- */
export function causeByRules(it, ev = {}) {
  const text = [it.title, it.meta?.desc, ...(ev.comments || [])].filter(Boolean).join(' ');
  if (it.src === 'show') return { cause: 'launch', confidence: 0.6, rule: 'Show HN post' };
  for (const [cause, re] of CAUSE_RULES) {
    const m = text.match(re);
    if (m) return { cause, confidence: 0.5, rule: `keyword "${m[0].trim()}"` };
  }
  if (it.src === 'gh') return { cause: 'launch', confidence: 0.4, rule: 'new repository' };
  return { cause: CAUSE_DEFAULT, confidence: 0.3, rule: 'no keyword matched' };
}

export function engineWhy(it, ctx = {}) {
  const s = SOURCES[it.src], sc = it.sc;
  if (s.kind === 'readership') {
    const head = sc.isNew
      ? `${num(sc.total)} views on ${it.day} with no same-weekday baseline in the 4 prior weeks, so it is new rather than rising.`
      : `${num(sc.total)} views on ${it.day}, ${num(sc.rate)} times the median of the same weekday over the 4 prior weeks (${num(sc.base)} views).`;
    const tail = it.prev ? ` The day before it had ${it.prevCensored ? 'fewer than ' : ''}${num(it.prev)} views${ctx.accel ? `, so the trend is ${ctx.accel.label}` : ''}.` : '';
    return head + tail;
  }
  const unit = s.unit;
  let t = `${num(sc.total)} ${s.total} in ${ageText(sc.ageH)} since ${s.kind === 'forum' ? 'posting' : 'created_at'}: ${num(sc.rate)} ${unit}, lower 95% bound ${num(sc.lo)}.`;
  if (ctx.measured) t += ` Since the last scan it gained ${num(ctx.measured.dc)} ${s.total} in ${ageText(ctx.measured.dtH)} (${num(ctx.measured.rate)} ${unit}).`;
  else if (ctx.poolMedian) t += ` The median ${s.label} item in this scan runs at ${num(ctx.poolMedian)} ${unit}.`;
  if (it.meta?.desc) t += ` Its description reads: "${it.meta.desc.slice(0, 120)}${it.meta.desc.length > 120 ? '...' : ''}"`;
  return t;
}

export function scanFactsOf(scan, enabled) {
  const items = scan.items.filter((i) => !enabled || enabled.has(i.src));
  const ok = Object.entries(scan.sources).filter(([k, v]) => v.status === 'ok' && (!enabled || enabled.has(k))).map(([k]) => SOURCES[k].label);
  return { signals_scored: items.length, sources_answered: ok, sources_answered_count: ok.length, cross_source_topics: (scan.topics || []).filter((t) => t.sources.length > 1).map((t) => t.label) };
}

export function engineDigest(top, topics, scan) {
  const ok = Object.entries(scan.sources).filter(([, v]) => v.status === 'ok').map(([k]) => SOURCES[k].label);
  const lead = top[0];
  const cross = (scan.topics || topics).filter((t) => t.sources.length > 1).slice(0, 2);
  let d = `${scan.items.length} signals scored from ${ok.length} sources (${ok.join(', ')}).`;
  if (lead) d += ` The strongest by the shared unit is "${lead.title}" on ${SOURCES[lead.src].label}.`;
  d += cross.length
    ? ` ${cross.length === 1 ? 'One topic joins' : 'Topics joining'} several sources: ${cross.map((t) => `${t.label} (${t.sources.map((x) => SOURCES[x].short).join(' + ')})`).join('; ')}.`
    : ' No subject appears in more than one source in this scan.';
  return d;
}

export function engineReply(items, ctxs, topics, scan, evs = {}) {
  return {
    signals: items.map((it, i) => {
      const c = causeByRules(it, evs[it.id]);
      return { id: `s${i + 1}`, cause: c.cause, confidence: c.confidence, why: engineWhy(it, ctxs[i] || {}), rule: c.rule };
    }),
    topics: topics.filter((t) => t.keys.length > 1).map((t) => ({ label: t.label, members: t.keys })),
    digest: engineDigest(items, topics, scan),
  };
}

/* ---------------- reading the reply ---------------- */
/* The balanced {...} starting at i, string-aware; null when the text ends first (a truncated reply). */
function balanced(text, i) {
  let depth = 0, inStr = false, esc = false;
  for (let k = i; k < text.length; k++) {
    const c = text[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return text.slice(i, k + 1);
  }
  return null;
}

/**
 * Read a model reply. The whole JSON object when it parses; otherwise every
 * complete signal entry that can be salvaged (a reply cut off mid-way keeps
 * its finished entries, the rest fall back to the engine one by one).
 */
export function parseReply(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const src = (text.match(/```(?:json)?\s*([\s\S]*?)(```|$)/i) || [null, text])[1];
  const start = src.indexOf('{');
  if (start >= 0) {
    const whole = balanced(src, start);
    if (whole) { try { const j = JSON.parse(whole.replace(/,\s*([}\]])/g, '$1')); if (j && typeof j === 'object') return j; } catch { /* salvage below */ } }
  }
  const signals = [];
  const re = /\{\s*"id"\s*:/g;
  let m;
  while ((m = re.exec(src))) {
    const obj = balanced(src, m.index);
    if (!obj) break;
    try { signals.push(JSON.parse(obj.replace(/,\s*([}\]])/g, '$1'))); } catch { /* skip a broken entry */ }
  }
  const dm = src.match(/"digest"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  let digest = null;
  if (dm) { try { digest = JSON.parse(`"${dm[1]}"`); } catch { digest = null; } }
  if (!signals.length && !digest) return null;
  return { signals, topics: [], digest, salvaged: true };
}

/* ---------------- validation and fact-check ---------------- */
export function validateEntry(e, ids) {
  if (!e || typeof e !== 'object') return 'entry is not an object';
  if (!ids.includes(e.id)) return `unknown id ${JSON.stringify(e.id)}`;
  if (!CAUSES.includes(e.cause)) return `cause ${JSON.stringify(e.cause)} is not in the fixed list`;
  if (typeof e.confidence !== 'number' || !(e.confidence >= 0 && e.confidence <= 1)) return 'confidence is not a number from 0 to 1';
  if (typeof e.why !== 'string' || e.why.trim().length < 30) return 'why is missing or under 30 characters';
  if (e.why.length > 900) return 'why is over 900 characters';
  return null;
}

const NUM_RE = /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?[kKmM](?![a-z]))?(%)?/g;
const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;

export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(NUM_RE)) {
    let v = Number(m[1].replace(/,/g, ''));
    const suf = (m[2] || '').trim().toLowerCase();
    if (suf === 'k') v *= 1e3;
    if (suf === 'm') v *= 1e6;
    out.push({ text: m[0], value: v, index: m.index, pct: !!m[3] });
  }
  return out;
}

function factNumbers(fact) {
  const vals = [];
  const walk = (x) => {
    if (x == null) return;
    if (typeof x === 'number') vals.push(x);
    else if (typeof x === 'string') for (const n of numbersIn(x)) vals.push(n.value);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(fact);
  return vals;
}

/**
 * Numbers and dates in `text` that match nothing in `fact`. A number
 * matches a fact within 3% (or 0.05 absolute below 10), or as that fact
 * rounded the way people round (12,345 as 12k or 12.3k). Dates must
 * appear verbatim in the facts.
 */
/* The method's own parameters, which any explanation may quote: the 95% interval,
   the 90% bootstrap, 4 weeks, 7, 14 and 28 days, 24 and 48 hours, the top 5 and top 10. */
const METHOD_NUMBERS = [95, 90, 4, 5, 7, 10, 14, 24, 28, 48];

export function factCheck(text, fact) {
  const vals = [...factNumbers(fact), ...METHOD_NUMBERS];
  const dates = new Set(JSON.stringify(fact).match(DATE_RE) || []);
  const bad = [];
  const masked = String(text).replace(DATE_RE, (d) => ' '.repeat(d.length));
  for (const n of numbersIn(masked)) {
    if (n.value <= 2 && !n.pct) continue;   // "one", "2 sentences", the 1 in "1.0" are not measurements
    const ok = vals.some((v) => {
      const tol = Math.abs(v) < 10 ? 0.051 : Math.abs(v) * 0.03;
      if (Math.abs(n.value - v) <= tol) return true;
      if (n.pct && Math.abs(n.value - v * 100) <= Math.max(0.6, Math.abs(v * 100) * 0.03)) return true;
      return false;
    });
    if (!ok) bad.push({ kind: 'number', text: text.slice(n.index, n.index + n.text.length).trim(), index: n.index });
  }
  for (const m of String(text).matchAll(DATE_RE)) {
    if (!dates.has(m[0])) bad.push({ kind: 'date', text: m[0], index: m.index });
  }
  return bad;
}

/**
 * Turn a reply (model JSON or engine) into the page's explanation.
 * Returns { entries[{ key, id, cause, confidence, why, origin, flags[], note }], topics, digest, malformed }.
 */
export function reconcile(reply, items, facts, engine, scanFacts = null) {
  const keys = items.map((_, i) => `s${i + 1}`);
  const got = new Map();
  const malformed = [];
  const list = Array.isArray(reply?.signals) ? reply.signals : [];
  if (!Array.isArray(reply?.signals)) malformed.push({ key: '*', reason: 'reply has no signals array' });
  for (const e of list) {
    const why = validateEntry(e, keys);
    if (why) malformed.push({ key: e?.id ?? '?', reason: why });
    else if (!got.has(e.id)) got.set(e.id, e);
  }
  const entries = keys.map((k, i) => {
    const e = got.get(k);
    if (!e) {
      const fb = engine.signals[i];
      const m = malformed.find((x) => x.key === k) || { reason: 'no entry for this signal' };
      return { key: k, id: items[i].id, cause: fb.cause, confidence: fb.confidence, why: fb.why, origin: 'engine', rule: fb.rule, flags: [], note: `model entry rejected: ${m.reason}` };
    }
    return { key: k, id: items[i].id, cause: e.cause, confidence: e.confidence, why: e.why.trim(), origin: 'model', flags: factCheck(e.why, facts[i]), note: '' };
  });
  const topics = Array.isArray(reply?.topics)
    ? reply.topics.filter((t) => t && typeof t.label === 'string' && Array.isArray(t.members) && t.members.every((m) => keys.includes(m)) && t.members.length > 1)
      .map((t) => ({ label: t.label.slice(0, 60), members: t.members }))
    : [];
  let digest = typeof reply?.digest === 'string' && reply.digest.trim().length >= 30 ? reply.digest.trim() : null;
  let digestOrigin = 'model';
  if (!digest) { digest = engine.digest; digestOrigin = 'engine'; }
  const allFacts = { items: facts, scan: scanFacts, sources: Object.keys(SOURCES).length, explainTop: TUNING.explainTop };
  const digestFlags = digestOrigin === 'model' ? factCheck(digest, allFacts) : [];
  return { entries, topics, digest, digestOrigin, digestFlags, malformed };
}
