/* ============================================================
   honesty-decoder/engine.js — every number the decoder shows.

   Pure functions, no DOM: the same file runs in the browser and in
   Node (tests.mjs). Four parts:
     1. the figure: weighted mean over checked sub-claims, its
        interval, the most sensitive sub-claim, the FActScore
        cross-check and what drives the gap between them;
     2. the route judge: model calls per run against what the
        answering route allows in 45 s;
     3. rows: effective verdicts after checks, consistency of shared
        components, hub coverage;
     4. the rule engine that splits any pasted claim into typed
        atomic sub-claims, grounds them in a row, and is scored
        against the gold set.
   ============================================================ */

import { VERDICTS, BASES, ROUTE_CAPACITY, TYPE_ORDER } from './config.js';

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const vOf = (verdict) => (VERDICTS[verdict] ? VERDICTS[verdict].value : null);

/* ================================================================ 1. figure */

/* items: [{ id, w, v, type }]; v is 1, 0.5, 0, or null for unverified.
   Framing items never enter any figure. All outputs are 0..100. */
export function figureOf(items) {
  const scored = items.filter((i) => i.type !== 'framing');
  const W = sum(scored.map((i) => i.w));
  const checked = scored.filter((i) => i.v != null);
  const WV = sum(checked.map((i) => i.w));
  const sup = sum(scored.filter((i) => i.v === 1).map((i) => i.w));
  const par = sum(scored.filter((i) => i.v === 0.5).map((i) => i.w));
  const unv = sum(scored.filter((i) => i.v == null).map((i) => i.w));
  const point = WV > 0 ? (100 * sum(checked.map((i) => i.w * i.v))) / WV : null;
  const low = W > 0 ? (100 * sup) / W : null;
  const high = W > 0 ? (100 * (sup + par + unv)) / W : null;
  const nSup = scored.filter((i) => i.v === 1).length;
  const factscore = scored.length ? (100 * nSup) / scored.length : null;
  return {
    point, low, high,
    width: low != null ? high - low : null,
    unverifiedShare: W > 0 ? (100 * unv) / W : 0,
    checkedShare: W > 0 ? (100 * WV) / W : 0,
    factscore,
    gap: point != null && factscore != null ? point - factscore : null,
    n: scored.length, nChecked: checked.length, nSup, W, WV,
  };
}

/* The sub-claim whose move to the opposite end of the scale (supported
   to unsupported, unsupported to supported, partial to whichever end
   moves the figure more) changes the point figure most. */
export function sensitivity(items) {
  const base = figureOf(items).point;
  if (base == null) return null;
  let best = null;
  for (const it of items) {
    if (it.type === 'framing' || it.v == null) continue;
    const alts = it.v === 1 ? [0] : it.v === 0 ? [1] : [0, 1];
    for (const alt of alts) {
      const f = figureOf(items.map((x) => (x === it ? { ...x, v: alt } : x))).point;
      const delta = f - base;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { id: it.id, from: it.v, to: alt, delta, figure: f };
    }
  }
  return best;
}

/* Exact decomposition of point - FActScore into per-sub-claim terms:
   c_i = (w_i / W_checked) v_i [checked] - [supported] / N.
   The sub-claim with the largest term in the gap's direction drives it. */
export function gapDriver(items) {
  const scored = items.filter((i) => i.type !== 'framing');
  const f = figureOf(items);
  if (f.point == null || !scored.length) return null;
  const terms = scored.map((i) => ({
    id: i.id,
    c: 100 * ((i.v != null ? (i.w / f.WV) * i.v : 0) - (i.v === 1 ? 1 / scored.length : 0)),
  }));
  const dir = Math.sign(f.gap) || 1;
  terms.sort((a, b) => dir * (b.c - a.c));
  return { gap: f.gap, driver: terms[0], terms };
}

/* ============================================================ 2. route judge */

/* spec: { via: 'direct'|'llm'|'provider', onLoad, perRun, over, under, local, public }
   route: the answering route for this visit ('pollinations', 'ollama', ...). */
export function routeVerdict(spec, route) {
  if (!spec) return null;
  if (spec.via === 'provider') {
    const local = route === 'ollama';
    return {
      verdict: local ? spec.local : spec.public,
      reason: local
        ? 'served from this machine, provider.js reaches the local Ollama'
        : 'provider.js has no public tier and its worker base is empty, so no model answers on the public site',
    };
  }
  const r = spec.via === 'direct' ? 'pollinations' : route;
  const capInfo = ROUTE_CAPACITY[r] || ROUTE_CAPACITY.offline;
  const cap = capInfo.calls;
  const onLoad = spec.onLoad || 0;
  const perRun = spec.perRun || 1;
  const capTxt = cap === Infinity ? 'no per-window limit' : `${cap} reply per ${capInfo.windowS} s`;
  const via = spec.via === 'direct' ? 'the lab calls text.pollinations.ai itself, so no visitor route lifts the limit; ' : '';
  if (perRun > cap) {
    return { verdict: spec.over || 'unsupported', reason: `${via}a run needs ${perRun} calls in sequence and the route allows ${capTxt}` };
  }
  if (onLoad + perRun > cap) {
    return { verdict: 'partial', reason: `${via}the page spends ${onLoad} call on load, so the visitor's first run inside the window is refused (${capTxt})` };
  }
  return { verdict: spec.under || 'supported', reason: `${via}a run needs ${perRun} call${perRun > 1 ? 's' : ''} and the route allows ${capTxt}` };
}

/* ================================================================== 3. rows */

/* The basis a sub-claim's verdict rests on, before checks run. */
export function basisOf(sub) {
  if (sub.basis) return sub.basis;
  if (sub.probe && /^(bh-bcrit|bh-beta|bh-isco|ex-physics|ex-kepler62e|dm-cube|ds-bits|te-timer)$/.test(sub.probe)) return 'reference';
  if (sub.probe && /^hd-/.test(sub.probe)) return 'self';
  if (sub.probe) return 'state';
  if (sub.route) return 'route';
  if ((sub.ev && sub.ev.length) || (sub.absent && sub.absent.length)) return 'code';
  return 'author';
}

/* results: { [checkKey]: { status: 'pass'|'fail'|'error'|'pending', verdict?, detail } }
   A sub-claim's checks: one per cited file (key `${sub.id}#code`), the
   probe (`${sub.id}#probe`), the route (`${sub.id}#route`), and its
   shared component (`shared:${id}`). The effective verdict is:
     framing                  -> excluded
     author basis             -> unverified
     any check failed/errored -> unverified (named)
     probe or route computed  -> that verdict
     all checks passed        -> the graded verdict
     checks pending           -> the graded verdict, tagged pending */
export function effective(sub, results, route, opts = {}) {
  const graded = opts.override?.[sub.id] || sub.verdict;
  if (sub.type === 'framing') return { verdict: graded, v: null, status: 'framing', basis: 'framing', excluded: true };
  if (sub.ungraded) return { verdict: 'unverified', v: null, status: 'author', basis: 'author', graded: 'ungraded', computed: { reason: 'not graded yet: no row in registry.js' } };
  if (sub.nopage) return { verdict: 'unsupported', v: 0, status: 'pass', basis: 'self', graded: 'unsupported', computed: { reason: 'no page exists: the hub entry has no href' } };
  const basis = basisOf(sub);
  if (basis === 'author') return { verdict: 'unverified', v: null, status: 'author', basis, graded };
  const keys = checkKeys(sub);
  const rs = keys.map((k) => results?.[k]).filter(Boolean);
  const bad = rs.find((r) => r.status === 'fail' || r.status === 'error' || r.status === 'skipped');
  if (bad) return { verdict: 'unverified', v: null, status: bad.status, basis, graded, failed: bad };
  let verdict = graded;
  let computed = null;
  if (sub.route) {
    const rv = routeVerdict(sub.route, route || 'pollinations');
    if (rv) { computed = rv; if (!opts.override?.[sub.id]) verdict = rv.verdict; }
  }
  const probe = results?.[`${sub.id}#probe`];
  if (probe && probe.status === 'pass' && probe.verdict && !opts.override?.[sub.id]) { verdict = probe.verdict; computed = probe; }
  const pending = keys.length && rs.length < keys.length || rs.some((r) => r.status === 'pending');
  return {
    verdict, v: vOf(verdict), status: pending ? 'pending' : 'pass', basis, graded,
    computed, changed: verdict !== sub.verdict,
  };
}

export function checkKeys(sub) {
  const keys = [];
  if (basisOf(sub) === 'author' || basisOf(sub) === 'inspection') return keys;
  if ((sub.ev && sub.ev.length) || (sub.absent && sub.absent.length)) keys.push(`${sub.id}#code`);
  if (sub.probe) keys.push(`${sub.id}#probe`);
  if (sub.shared) keys.push(`shared:${sub.shared}`);
  return keys;
}

/* One row's numbers, given check results and the route. */
export function scoreRow(row, results, route, opts = {}) {
  const items = row.subs.map((s) => {
    const e = effective(s, results, route, opts);
    const w = opts.weights?.[s.id] ?? s.w;
    return { id: s.id, w, v: e.excluded ? null : e.v, type: s.type, eff: e, sub: s };
  });
  const fig = figureOf(items);
  const pending = items.some((i) => i.eff.status === 'pending');
  const anyChecked = items.some((i) => i.type !== 'framing' && i.v != null && BASES[i.eff.basis]?.checked);
  return {
    items, fig,
    sens: sensitivity(items),
    gap: gapDriver(items),
    pending,
    basisTag: fig.point == null ? 'asserted' : pending || !anyChecked ? 'computed from authored verdicts' : 'computed from checks',
  };
}

/* Shared components hold one verdict: every dependent sub-claim's graded
   verdict must equal what its component and route spec give under the
   graded route. Returns the contradictions (0 is the bar). */
export function consistency(rows, shared, gradedRoute = 'pollinations') {
  const out = [];
  const users = {};
  for (const row of rows) {
    for (const s of row.subs) {
      if (!s.shared) continue;
      if (!shared[s.shared]) { out.push({ id: s.id, why: `names unknown component ${s.shared}` }); continue; }
      (users[s.shared] = users[s.shared] || []).push(`${row.id}:${s.id}`);
      if (s.route) {
        const rv = routeVerdict(s.route, gradedRoute);
        if (rv.verdict !== s.verdict) out.push({ id: s.id, why: `graded ${s.verdict}, component gives ${rv.verdict}: ${rv.reason}` });
      }
    }
  }
  return { contradictions: out, users };
}

/* Hub coverage: every site.config.js entry against the rows. */
export function coverage(projects, rowIds) {
  const has = new Set(rowIds);
  const by = {};
  for (const p of projects) {
    const b = (by[p.status] = by[p.status] || { n: 0, m: 0, missing: [] });
    b.m++;
    if (has.has(p.id)) b.n++; else b.missing.push(p.title);
  }
  const all = Object.values(by);
  return { by, n: sum(all.map((b) => b.n)), m: sum(all.map((b) => b.m)) };
}

/* ========================================================== 4. rule engine */

const STOP = new Set(('a an the it its it\'s of to in on and or with as by for from that this these those is are be been being ' +
  'you your yours we our us they them their there here at into onto than then so such can could will would should may might ' +
  'what which who whom whose how why when where while lab page one\'s itself himself herself do does did not no nor also just very ' +
  'about between each other own same too only every all any').split(/\s+/));

export function words(text) {
  return String(text).toLowerCase().replace(/[‘’]/g, '\'').match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];
}
export function stem(w) {
  let s = w.replace(/'s$/, '');
  if (s.length > 5 && /ies$/.test(s)) s = s.slice(0, -3) + 'y';
  else if (s.length > 4 && /(sses|shes|ches|xes)$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && /[^s]s$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && /ing$/.test(s)) s = s.slice(0, -3);
  else if (s.length > 4 && /ed$/.test(s)) s = s.slice(0, -2);
  if (s.length > 5 && /(ise|ize|es|e)$/.test(s)) s = s.replace(/(ise|ize|es|e)$/, '');
  return s;
}
export function contentSet(text) {
  return new Set(words(text).filter((w) => !STOP.has(w)).map(stem).filter(Boolean));
}
export function jaccard(a, b) {
  const A = a instanceof Set ? a : contentSet(a);
  const B = b instanceof Set ? b : contentSet(b);
  if (!A.size && !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i++;
  return i / (A.size + B.size - i);
}

const PREP = new Set('against through around across over under via per without within toward towards beyond among before after during inside outside'.split(' '));

/* Load-bearing qualifiers that become their own sub-claim. */
const QUAL_SPLIT = ['live', 'real-time', 'realtime', 'in real time', 'daily', 'weekly', 'hourly', 'recursive', 'agentic',
  'autonomous', 'keyless', 'spinning', 'breakable', 'doppler-asymmetric'];
const QUAL_SPLIT_RX = /\b[a-z0-9]+-dimensional\b/;
/* Qualifiers that are tagged on the sub-claim (shown, not split). */
const QUAL_TAG = ['real', 'every', 'all', 'each', 'whole', 'complete', 'consistent', 'deterministic', 'general', 'any',
  'only', 'never', 'no', 'actually', 'exactly', 'fully', 'honest', 'local', 'hosted', 'fresh'];

const RX = {
  framing: /\b(organism|biosignal|heartbeat|brain|loves?|brutal|alien|magic|premise of|arrival|marvel|soul|living|honestly|boring|trap|glue|fold|folds|falls to|lensed horizon|watch think|as it thinks|what-if engine|lie about|interpretability first|constructed alien)\b/,
  quantity: /\b(every|daily|weekly|hourly|real-time|realtime|real time|one|two|three|four|five|six|seven|eight|nine|ten|fourth|third|second|first|\d+|[a-z0-9]+-dimensional|whole|complete|consistent|any angle|only a|never|no network|thousand|in one|steps per)\b/,
  provenance: /\b(model|models|live|data|archive|nasa|real signals|real telemetry|open web|browser|hosted|local-first|keyless|stream|streamed|records|catalogue|telemetry|hacker news|wikipedia|github|powered by|serving pipeline|fallback|recorded|by a)\b/,
  mechanism: /\b(l-system|lexicon|encod\w*|shader|lensing|disk|disc|hypercube|project\w*|pipeline|router|cluster\w*|synthes\w*|mixture|rule|motif|crystallis\w*|dft|spectral|bits|deflate|lcs|degradation|timestamp\w*|score|rubric|slate|commit|rank\w*|velocity|comput\w*|split|typed|matched|recursive|agentic|schwarzschild|black hole|spinning|light bends|webhooks|schedules|agents|soundscapes|retrieval|graded|streaks|logograms|shape carries|astrophysics|audited|propagat\w*|integrat\w*|curved|percentage|weaves|asymmetric|accretion|decod\w*)\b/,
  capability: /^(you can|watch|type|fly|hover|change|name|pick|compress|rotate|read|paste|see|orbit|cross|speak|return|schedule|analyse|analyze|build|builds|it builds|model)\b/,
};

export function typeOf(text) {
  const t = ` ${String(text).toLowerCase()} `;
  if (RX.framing.test(t) && !/\b(every|daily|three|fourth)\b/.test(t)) return 'framing';
  if (RX.capability.test(t.trim()) && !RX.quantity.test(t)) return 'capability';
  if (RX.quantity.test(t)) return 'quantity';
  if (RX.provenance.test(t)) return 'provenance';
  if (RX.mechanism.test(t)) return 'mechanism';
  return 'capability';
}

function clean(s) {
  return s.replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '').replace(/\s+/g, ' ').replace(/^(and|then|but|so|with)\s+/i, '').trim();
}
const contentCount = (s) => contentSet(s).size;

function splitWhere(c) {
  const m = c.match(/^(.+?)\s+(from\s+where\b.*)$/i);
  return m && contentCount(m[1]) >= 1 ? [clean(m[1]), clean(m[2])] : [c];
}

/* One chunk into smaller ones: relative clauses, sources, agents. */
function secondary(c) {
  const m = c.match(/^(.+?)\s+(?:with|whose|while)\s+(.+)$/i);
  if (m && contentCount(m[1]) >= 2 && contentCount(m[2]) >= 1) return [clean(m[1]), ...secondary(clean(m[2]))];
  const mt = c.match(/^(.+?)\s+that\s+([a-z]+s)\b(.*)$/i);
  if (mt && contentCount(mt[1]) >= 2 && !/^(is|has|was|its|does)$/i.test(mt[2])) return [clean(mt[1]), clean(mt[2] + mt[3])];
  const mf = c.match(/^(.+?)\s+(from\s+(?:where\b|(?:an?\s+|the\s+|its\s+|their\s+)?(?:[a-z-]+\s+){0,2}(?:model|models|data|archive|web|catalogue|signals)\b).*)$/i);
  if (mf && contentCount(mf[1]) >= 2) return [...splitWhere(clean(mf[1])), ...secondary(clean(mf[2]))];
  const mb = c.match(/^(.+?)\s+((?:assembled|built|generated|written|made|driven)\s+by\s+.+)$/i);
  if (mb && contentCount(mb[1]) >= 2) return [clean(mb[1]), ...splitWhere(clean(mb[2]))];
  const mw = c.match(/^(.+?)\s+(in\s+(?:your|the)\s+browser)$/i);
  if (mw && contentCount(mw[1]) >= 2) return [...secondary(clean(mw[1])), clean(mw[2])];
  const m2 = c.match(/^(.+?)\s+into\s+(an?\s+(?:new|organism)\b.*)$/i);
  if (m2 && contentCount(m2[1]) >= 2) return [clean(m2[1]), clean(`into ${m2[2]}`)];
  return [c];
}

/* Split a claim into atomic chunks by rule. */
function chunks(text) {
  let s = ` ${String(text).replace(/[“”]/g, '"').replace(/\s+/g, ' ')} `;
  s = s.replace(/\s[—–]\s|\s-\s|\s--\s/g, ' | ').replace(/[;:]\s/g, ' | ').replace(/\.\s+(?=[A-Z])/g, ' | ');
  const out = [];
  for (const seg of s.split('|')) {
    // clause breaks, then list breaks
    const parts = seg.split(/,\s*(?:and|then)\s+|\s+and then\s+|,\s+then\s+|\s+then\s+(?=[a-z])/i);
    for (const p of parts) {
      for (const q of p.split(/,\s+/)) {
        // conjunction between two content-bearing sides
        const ands = q.split(/\s+and\s+/i);
        if (ands.length > 1 && ands.every((x) => contentCount(x) >= 1)) out.push(...ands);
        else out.push(q);
      }
    }
  }
  const res = [];
  for (const c of out.map(clean).filter(Boolean)) res.push(...secondary(c));
  return res.map(clean).filter((c) => contentCount(c) >= 1);
}

/* The engine: claim text -> [{ text, type, qualifiers, checkable }]
   A split qualifier becomes "<head> is <qualifier>", where the head is
   the next content word after it (the word before, when it ends the
   chunk); the rest of the chunk stays as the base sub-claim unless
   fewer than two content words remain. */
export function decompose(text) {
  const out = [];
  for (const c of chunks(text)) {
    const lower = c.toLowerCase();
    const has = (q) => new RegExp(`(^|[^a-z-])${q}([^a-z-]|$)`).test(lower);
    const split = QUAL_SPLIT.filter(has);
    const dim = lower.match(QUAL_SPLIT_RX);
    if (dim) split.push(dim[0]);
    const tags = QUAL_TAG.filter(has);
    const isQual = (w) => { const x = w.toLowerCase().replace(/[^a-z0-9-]/g, ''); return QUAL_SPLIT.includes(x) || QUAL_SPLIT_RX.test(x); };
    const plain = (w) => w.toLowerCase().replace(/[^a-z0-9 -]/g, '');
    let base = c;
    const extra = [];
    for (const q of split) {
      const ws = base.split(/\s+/);
      const qn = q.split(' ').length;
      const at = ws.findIndex((w, k) => plain(ws.slice(k, k + qn).join(' ')) === q);
      if (at < 0) continue;
      // the noun phrase after the qualifier: up to 2 words before a stop word;
      // a second word that looks like a verb (-s, more words follow) is dropped
      const np = [];
      for (let k = at + qn; k < ws.length && np.length < 2; k++) {
        const w = plain(ws[k]);
        if (isQual(w)) continue;
        if (STOP.has(w) || PREP.has(w)) break;
        if (np.length === 1 && /s$/.test(w) && k < ws.length - 1 && !/(ss|is|us)$/.test(w)) break;
        np.push(ws[k]);
        if (/[,;]$/.test(ws[k])) break;
      }
      const after = np[np.length - 1];
      const before = ws.slice(0, at).reverse().find((w) => !STOP.has(plain(w)) && !isQual(w));
      const trailing = q.startsWith('in ') || !after;
      const head = trailing ? before || after : after;
      if (!head) continue;
      extra.push(`${head.replace(/[^\w-]+$/, '')} is ${q}`);
      base = clean([...ws.slice(0, at), ...ws.slice(at + qn)].join(' '));
    }
    const keep = extra.length && contentCount(base) < 2 ? [] : [base];
    for (const t of [...keep, ...extra]) {
      const type = typeOf(t);
      out.push({ text: t, type, qualifiers: [...split, ...tags], checkable: type !== 'framing' });
    }
  }
  return out;
}

/* Greedy one-to-one matching by Jaccard on content stems.
   A predicted sub-claim matches a gold one when they share at least
   half of their combined content words (Jaccard >= 0.5). */
export const MATCH_THRESHOLD = 0.5;
export function matchSets(pred, gold, thr = MATCH_THRESHOLD) {
  const P = pred.map((p) => contentSet(p.text ?? p));
  const G = gold.map((g) => contentSet(g.text ?? g));
  const cand = [];
  P.forEach((p, i) => G.forEach((g, j) => { const s = jaccard(p, g); if (s >= thr) cand.push({ i, j, s }); }));
  cand.sort((a, b) => b.s - a.s);
  const ui = new Set(), uj = new Set(), pairs = [];
  for (const c of cand) { if (ui.has(c.i) || uj.has(c.j)) continue; ui.add(c.i); uj.add(c.j); pairs.push(c); }
  return pairs;
}

const prf = (tp, np, ng) => {
  const P = np ? tp / np : 0, R = ng ? tp / ng : 0;
  return { P, R, F1: P + R ? (2 * P * R) / (P + R) : 0, tp, np, ng };
};

/* Score a decomposer over gold claims. predFor(claim) -> [{text, type}] */
export function scoreSet(gold, predFor) {
  let tp = 0, np = 0, ng = 0;
  const byType = Object.fromEntries(TYPE_ORDER.map((t) => [t, { tp: 0, np: 0, ng: 0 }]));
  const per = [];
  for (const g of gold) {
    const pred = predFor(g) || [];
    const pairs = matchSets(pred, g.subs);
    tp += pairs.length; np += pred.length; ng += g.subs.length;
    for (const p of pred) if (byType[p.type]) byType[p.type].np++;
    for (const s of g.subs) if (byType[s.type]) byType[s.type].ng++;
    for (const m of pairs) if (pred[m.i].type === g.subs[m.j].type && byType[pred[m.i].type]) byType[pred[m.i].type].tp++;
    per.push({ id: g.id, pairs, pred, gold: g.subs });
  }
  const types = Object.fromEntries(Object.entries(byType).map(([t, b]) => [t, prf(b.tp, b.np, b.ng)]));
  return { ...prf(tp, np, ng), types, per };
}

/* ---------------------------------------------------------- grounding */

/* A pasted sub-claim takes a verdict only when it matches a row's
   sub-claim: Jaccard >= 0.34 against its phrase or its text, or at
   least 2 shared content words covering two thirds of the shorter. */
export const GROUND_THRESHOLD = 0.34;
export function ground(text, row) {
  if (!row) return null;
  const A = contentSet(text);
  let best = null;
  for (const s of row.subs) {
    for (const ref of [s.phrase, s.text]) {
      const B = contentSet(ref);
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      const jac = inter / (A.size + B.size - inter || 1);
      const ovl = inter / (Math.min(A.size, B.size) || 1);
      const score = Math.max(jac, inter >= 2 && ovl >= 0.67 ? ovl * 0.6 : 0);
      if (!best || score > best.score) best = { sub: s, score };
    }
  }
  return best && best.score >= GROUND_THRESHOLD ? best : null;
}

/* Which lab a pasted claim is about: keyword overlap with each row's
   title and phrases (the rung-1 matcher, used when the visitor does
   not pick a lab). */
export function nearestLab(text, rows, titles = {}) {
  const A = contentSet(text);
  let best = null;
  for (const r of rows) {
    const B = contentSet([titles[r.id] || r.id, ...r.subs.map((s) => s.phrase)].join(' '));
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const score = inter / (A.size || 1);
    if (!best || score > best.score) best = { id: r.id, score };
  }
  return best;
}

/* Default weight of an ungrounded pasted sub-claim, by type. */
export const TYPE_WEIGHT = { capability: 2, mechanism: 2, quantity: 1, provenance: 2, framing: 1 };

/* Score pasted sub-claims against a row: grounded ones take the row's
   effective verdict and weight; the rest are unverified. */
export function scorePasted(subs, row, results, route) {
  const items = subs.map((s, k) => {
    const g = s.type === 'framing' ? null : ground(s.text, row);
    if (!g) return { id: `p${k}`, w: TYPE_WEIGHT[s.type] || 1, v: null, type: s.type, ground: null, sub: s };
    const e = effective(g.sub, results, route);
    return { id: `p${k}`, w: g.sub.w, v: e.excluded ? null : e.v, type: s.type, ground: g, eff: e, sub: s };
  });
  return { items, fig: figureOf(items), sens: sensitivity(items) };
}
