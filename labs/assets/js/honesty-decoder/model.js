/* ============================================================
   honesty-decoder/model.js — the one place this lab asks a model.

   Two requests, each a single LLM.complete() call through
   labs/assets/js/ai/llm.js, each validated against a schema, each with
   the rule engine as its fallback:
     decomposeOne(claim)   one pasted claim -> typed sub-claims
     decomposeMany(claims) the whole held-out gold half in ONE call,
                           for the Score control
   The public route allows one reply per 45 s per IP, so a visitor
   action is never more than one call.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { TYPES, ROUTE_CACHE_KEY } from './config.js';
import { decompose } from './engine.js';

const TYPE_NAMES = Object.keys(TYPES);

const RULES = `You split claims about software into atomic sub-claims, the way FActScore splits text into atomic facts.
Rules:
1. One sub-claim per independently checkable property: an action the visitor can take, a mechanism, a number or scope, a source.
2. A load-bearing qualifier (live, real-time, daily, every, deterministic, recursive, autonomous, general, real, "no X") that adds its own condition is its own sub-claim.
3. Metaphor, persona and evaluation are type "framing" and not checkable.
4. Keep the claim's own words. Short sub-claims, 2 to 12 words.
Types: ${TYPE_NAMES.map((t) => `${t} (${TYPES[t]})`).join('; ')}.`;

const ITEM_SHAPE = '{"text":"...","type":"capability|mechanism|quantity|provenance|framing","checkable":true,"evidence":"what would settle it, under 15 words"}';
const ONE_SHAPE = `{"subclaims":[${ITEM_SHAPE}]}`;

/* Schema: 1..14 sub-claims; text 2..200 chars; type in the vocabulary;
   checkable boolean (framing forces false); evidence a short string. */
export function validateSubclaims(arr) {
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 14) return { ok: false, why: 'subclaims must be an array of 1 to 14' };
  const out = [];
  for (const [i, s] of arr.entries()) {
    if (!s || typeof s.text !== 'string') return { ok: false, why: `item ${i}: text missing` };
    const text = s.text.trim();
    if (text.length < 2 || text.length > 200) return { ok: false, why: `item ${i}: text length ${text.length}` };
    const type = String(s.type || '').toLowerCase().trim();
    if (!TYPE_NAMES.includes(type)) return { ok: false, why: `item ${i}: type "${s.type}" not in the vocabulary` };
    out.push({ text, type, checkable: type !== 'framing' && s.checkable !== false, evidence: typeof s.evidence === 'string' ? s.evidence.slice(0, 160) : '' });
  }
  return { ok: true, subs: out };
}

const EVIDENCE = {
  capability: 'use the lab: does it let you do this?',
  mechanism: 'read the code: is the named mechanism there?',
  quantity: 'count or time it on the running page',
  provenance: 'watch the network: where does it come from?',
  framing: 'not checkable: metaphor or evaluation',
};
export const engineSubs = (claim) => decompose(claim).map((s) => ({ ...s, evidence: EVIDENCE[s.type] }));

function remember(r) {
  try { localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify({ route: r.source, model: r.model, ms: r.ms, ts: Date.now() })); } catch { /* storage blocked */ }
}

/* One pasted claim. Resolves { subs, source, model, ms, valid, why }. */
export async function decomposeOne(claim, { signal } = {}) {
  let why = '';
  const r = await LLM.complete({
    system: `${RULES}\nReturn ${ONE_SHAPE}`,
    prompt: `Claim: "${claim}"`,
    json: true, signal, maxWaitMs: 50000, timeoutMs: 120000,
    fallback: () => ({ subclaims: engineSubs(claim) }),
  });
  remember(r);
  if (r.source === 'offline') return { subs: engineSubs(claim), source: 'offline', model: 'rule engine', ms: r.ms, valid: false, why: (r.errors || []).join('; ') || 'no route answered' };
  const v = validateSubclaims(r.json?.subclaims);
  if (!v.ok) { why = v.why; return { subs: engineSubs(claim), source: r.source, model: r.model, ms: r.ms, valid: false, why: `reply failed the schema (${why}); the rule engine answered` }; }
  return { subs: v.subs, source: r.source, model: r.model, ms: r.ms, valid: true, why: '' };
}

/* Many claims in one call. Resolves { byId: {id: subs}, source, model, ms, valid: n, invalid: [ids] }. */
export async function decomposeMany(claims, { signal } = {}) {
  const list = claims.map((c) => `${c.id}. ${c.claim}`).join('\n');
  const r = await LLM.complete({
    system: `${RULES}\nYou will get numbered claims. Return {"results":[{"id":1,"subclaims":[...]}]} with one entry per claim, each subclaims item shaped ${ITEM_SHAPE}.`,
    prompt: list,
    json: true, signal, maxWaitMs: 50000, timeoutMs: 180000,
    fallback: () => ({ results: [] }),
  });
  remember(r);
  const byId = {}, invalid = [];
  const results = Array.isArray(r.json?.results) ? r.json.results : [];
  for (const c of claims) {
    const hit = results.find((x) => Number(x?.id) === c.id);
    const v = hit ? validateSubclaims(hit.subclaims) : { ok: false };
    if (v.ok) byId[c.id] = v.subs; else invalid.push(c.id);
  }
  return { byId, source: r.source, model: r.model, ms: r.ms, valid: claims.length - invalid.length, invalid, errors: r.errors || [] };
}

export function cachedRoute() {
  try {
    const x = JSON.parse(localStorage.getItem(ROUTE_CACHE_KEY) || 'null');
    return x && Date.now() - x.ts < 10 * 60 * 1000 ? x : null;
  } catch { return null; }
}
