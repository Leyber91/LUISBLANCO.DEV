/* ============================================================
   timeline/qa.js — answering questions from the published data.
   Pure: no DOM, no network. The model path (ask.js) only ever
   sees what this module packs, which is built from the gated
   event list (engine.VIS).

   Order of work for a question:
     1. plot guard: questions about plot past the setup are
        refused without a model call;
     2. computed intents: a date in one calendar asked in the
        others, an age in another calendar's years, or "what was
        X doing when Y happened" are answered by the chronology
        engine;
     3. retrieval: weighted token match over titles and text,
        boosted by named worlds and named years;
     4. no supporting event: refuse, without a model call.
   ============================================================ */

import { WORLDS, LAYERS, NOW } from './config.js';
import { VIS, byId, layerById, worldById, stateAt, worldName, getGate, readable } from './engine.js';
import { fmtCE, fmtAT, fmtCycle, parseDate, parseAge, grp, convertYears } from './chronology.js';

const STOP = new Set('a an the of to in on at is are was were be been do does did what when where why how who which that this it its and or for with as by from about into than then there their they them will would can could should tell me please i you we our doing happening going year years have has had'.split(' '));
const ALIAS = [
  [/\bkha[\s-]?ren\w*/g, ' kharen '],
  [/\bartefact/g, ' artifact '],
  [/\bspheres?\b|\borb\b/g, ' artifact '],
  [/\bb\.?c\.?e?\.?(?=\s|$)/g, ' bce '],
];

export function tokens(s) {
  let t = String(s || '').toLowerCase();
  for (const [re, rep] of ALIAS) t = t.replace(re, rep);
  return t.replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/* ---------------- the index, rebuilt whenever the gate changes ---------------- */

let IDX = null;
function index() {
  const v = getGate().version;
  if (IDX && IDX.v === v) return IDX;
  const docs = VIS.map((e) => ({ kind: 'event', id: e.id, world: e.world, y: e.y, title: e.title, text: e.text }));
  for (const l of LAYERS) docs.push({ kind: 'layer', id: l.id, world: l.id, y: null, title: l.title, text: l.text });
  for (const w of WORLDS) {
    const when = w.id === 'earth' ? 'reached its artifact in 2031' : `found its artifact in ${fmtCE(w.found, true)}`;
    docs.push({ kind: 'world', id: `why-${w.id}`, world: w.id, y: w.found, title: `Why ${w.name} answered with ${w.response}`,
      text: `${w.name} ${when}, as ${w.stage}. Its response was ${w.response}: ${w.responseLine}. The codex makes the timing of discovery the whole difference between the three humanities.` });
  }
  const D = docs.map((d) => ({ ...d, tt: new Set(tokens(d.title)), tx: new Set(tokens(d.text)), tw: new Set(tokens(worldName(d.world))) }));
  const df = new Map();
  for (const d of D) for (const w of new Set([...d.tt, ...d.tx])) df.set(w, (df.get(w) || 0) + 1);
  IDX = { v, D, df, N: D.length };
  return IDX;
}

/** Years named in a question, as candidate CE values. */
export function yearsIn(q) {
  const out = [];
  const s = String(q).toLowerCase().replace(/,(\d{3})/g, '$1');
  const re = /(\d{1,5})\s*(bce|bc|ce|ad|a\.?\s?t\.?)?/g;
  let m;
  while ((m = re.exec(s))) {
    const n = Number(m[1]);
    if (n < 100 && !m[2]) continue;
    const era = (m[2] || '').replace(/[\s.]/g, '');
    if (era === 'bce' || era === 'bc') out.push(-n);
    else if (era === 'at') out.push(n - 3537);
    else if (era === 'ce' || era === 'ad') out.push(n);
    else { out.push(n); if (n > 2100) out.push(-n); }
  }
  const cyc = s.match(/cycle\s*(\d{1,2})(?:\D+year\s*(\d{1,2}))?/);
  if (cyc) out.push(Number(cyc[1]) * 75 + Number(cyc[2] || 0) - 4750);
  return out;
}

const namedWorlds = (q) => {
  const t = tokens(q);
  return ['kharen', 'terra', 'earth'].filter((w) => t.includes(w));
};

export function search(q, k = 5, { excludeWorld = null } = {}) {
  const { D, df, N } = index();
  const qt = tokens(q);
  const ys = yearsIn(q);
  const named = namedWorlds(q);
  const scored = [];
  for (const d of D) {
    if (excludeWorld && d.world === excludeWorld) continue;
    let s = 0;
    for (const w of qt) {
      const idf = Math.log(1 + N / (df.get(w) || 0.5));
      if (d.tt.has(w)) s += 3 * idf;
      else if (d.tx.has(w)) s += idf;
      if (d.tw.has(w)) s += 1.5;
    }
    if (d.y != null && d.kind !== 'world') for (const y of ys) if (Math.abs(d.y - y) <= Math.max(3, Math.abs(y) * 0.015)) s += 8;
    if (d.kind === 'layer' && /\bwhat (?:is|are)\b/i.test(q)) s *= 1.3;
    if (d.kind === 'world' && /\bwhy\b|\bdiffer|\bchose|\bchoos|\bcontain|\baccelerat/.test(String(q).toLowerCase())) s *= 1.35;
    if (named.length === 1 && !excludeWorld) s *= d.world === named[0] ? 1.6 : worldById.has(d.world) ? 0.4 : 1;
    if (s > 0) scored.push({ d, s });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k);
}

/* ---------------- the plot guard ---------------- */

const PERSONAL = /\b(mother|father|daughter|son|wife|husband|brother|sister|children|family|married|lover|parents?)\b/i;
const BEYOND = /\b(ending|endings|twist|spoiler|spoil|sequel|later books?|book\s*(?:[2-9]|two|three|four|five|six|seven|eight|nine)|trilogy\s*(?:ii|iii|2|3)|finale|die|dies|died|death|kill|killed|kills|happens? (?:next|after|later)|after 2068|future of|how does it end|who wins|what happens to)\b/i;
const GUARD = 'That is not in the published timeline. This page carries the premise of the series and the setup of Book 1; plot beyond that is held for the books.';
const GUARD_PERSONAL = 'That is not in the published timeline. Characters appear here only as Book 1 introduces them; their lives beyond that are held for the books.';
export const isGuard = (r) => r?.kind === 'guard';

/* ---------------- computed intents ---------------- */

function conversion(q) {
  if (!/\b(calendar|calendars|convert|a\.?\s?t\.?|cycle|terra(?:n)?|kha-?ren|other|same|equivalent|in terms of)\b/i.test(q)) return null;
  const frag = String(q).match(/(cycle\s*\d{1,3}(?:[,\s]*year\s*\d{1,2})?|\d[\d,]*\s*(?:bce|bc|ce|ad|a\.?\s?t\.?)|\d[\d,]*\s*(?:ga|ma|ka|years ago))/i);
  if (!frag) return null;
  const p = parseDate(frag[1]);
  if (!p || p.ce < -5e9 || p.ce > NOW + 1) return null;
  const ce = p.ce;
  const near = VIS.filter((e) => Math.abs(e.y - ce) <= Math.max(2, Math.abs(ce) * 0.01)).slice(0, 3);
  const answer = `${p.read} is ${fmtCE(ce)} on Earth’s clock, ${fmtAT(ce)} on Terra and ${fmtCycle(ce)} in Kha-Ren, by the codex’s conversions, which are approximate.${near.length ? ` At that date: ${near.map((e) => `${e.title} (${worldName(e.world)})`).join('; ')}.` : ''}`;
  return { kind: 'conversion', answer, events: near.map((e) => e.id), refused: false, computed: true };
}

function age(q) {
  if (!/\b(age|old|years old|terran years|kha-?ren years|earth years)\b/i.test(q)) return null;
  const a = parseAge(q);
  if (!a) return null;
  const from = { ce: 'Earth', at: 'Terran', cycle: 'Kha-Ren' }[a.from];
  return { kind: 'age', refused: false, computed: true, events: [],
    answer: `${a.n} ${from} years is ${a.earth.toFixed(1)} Earth years, ${a.terra.toFixed(1)} Terran years (a Terran year is about 400 days) and ${a.kharen.toFixed(1)} Kha-Ren years, or ${(a.kharen / 75).toFixed(2)} Cycles.` };
}

/** "What was Kha-Ren doing when Terra found its artifact?", "When Terra reached post-scarcity,
    what was Kha-Ren doing?", "What was Terra like in 2200 BCE?". The subject is the world named
    in the main clause; the anchor is the event the "when" clause describes. */
const ASKS_STATE = /\b(doing|like|happening|going on|where was|what was|what were|state of)\b/i;
function crossDimension(q) {
  const s = String(q);
  if (!ASKS_STATE.test(s)) return null;
  let main = s, sub = '';
  const lead = s.match(/^\s*(?:when|while|during)\b([^,?]*),(.*)$/i);
  const mid = s.match(/^(.*?)\b(?:when|while|during|as)\b(.*)$/i);
  if (lead) { sub = lead[1]; main = lead[2]; }
  else if (mid && mid[1].trim()) { main = mid[1]; sub = mid[2]; }
  const target = namedWorlds(main)[0];
  if (!target) return null;
  let anchor = null;
  if (sub.trim()) {
    const subNamed = namedWorlds(sub);
    const hit = search(sub, 6).find((h) => h.d.kind === 'event' && h.d.world !== target && (!subNamed.length || subNamed.includes(h.d.world) || ['shared', 'vortex', 'core', 'haven'].includes(h.d.world)));
    if (hit && hit.s >= 3) anchor = byId.get(hit.d.id);
  }
  const ys = yearsIn(s);
  let y;
  if (anchor) y = anchor.y;
  else if (ys.length) y = ys[0];
  else return null;
  if (y > NOW + 1 || y < -5e9) return null;
  const st = stateAt(target, y);
  const when = anchor ? `At “${anchor.title.replace(/:.*$/, '')}” (${fmtCE(anchor.y, anchor.c)}, ${worldName(anchor.world)})` : `In ${fmtCE(y)}`;
  const parts = [`${when}, ${st.world.name} was at ${st.native}. ${st.status}`];
  if (st.held) parts.push(st.held.text);
  else if (st.era) parts.push(`Its era: ${st.era.name}. ${st.era.text}`);
  if (st.last) parts.push(`Its latest event before then: ${st.last.title} (${fmtCE(st.last.y, st.last.c)}).`);
  const ids = [anchor?.id, st.last?.id].filter(Boolean);
  return { kind: 'cross', answer: parts.join(' '), events: ids, refused: false, computed: true };
}

/** "How far apart are the Kha-Ren and Terra discoveries?" */
function gap(q) {
  if (!/\b(how (?:far apart|long|many years)|apart|gap|between)\b/i.test(q)) return null;
  const named = namedWorlds(q);
  if (named.length < 2 || !/\b(discover|found|find|artifact|reach)/i.test(q)) return null;
  const [a, b] = named.map((id) => WORLDS.find((w) => w.id === id)).sort((x, y) => x.found - y.found);
  const d = b.found - a.found;
  const ids = [a, b].map((w) => VIS.find((e) => e.world === w.id && Math.abs(e.y - w.found) < 1 && e.imp === 1)?.id).filter(Boolean);
  return { kind: 'gap', computed: true, refused: false, events: ids,
    answer: `${a.name} found its artifact about ${grp(d)} years before ${b.name} (${fmtCE(a.found, true)} and ${b.id === 'earth' ? '2031 CE, when Earth reached its own' : fmtCE(b.found, true)}). That is ${convertYears(d, 'ce', 'at').toFixed(0)} Terran years, or ${(d / 75).toFixed(1)} Kha-Ren Cycles.` };
}

/* ---------------- the deterministic answer ---------------- */

export function deterministicAnswer(q) {
  const text = String(q || '').trim();
  if (!text) return { kind: 'none', answer: '', events: [], refused: true };
  if (BEYOND.test(text)) return { kind: 'guard', answer: GUARD, events: [], refused: true };
  if (PERSONAL.test(text)) return { kind: 'guard', answer: GUARD_PERSONAL, events: [], refused: true };
  const computed = gap(text) || crossDimension(text) || conversion(text) || age(text);
  if (computed) return computed;
  const hits = search(text, 4);
  // support: the best match must share a title word with the question, or cover two thirds of its words
  const qt = [...new Set(tokens(text))];
  const top0 = hits[0]?.d;
  const cover = top0 ? qt.filter((w) => top0.tt.has(w) || top0.tx.has(w) || top0.tw.has(w)).length / Math.max(1, qt.length) : 0;
  const titled = top0 ? qt.some((w) => top0.tt.has(w)) : false;
  if (!hits.length || hits[0].s < 2.2 || (!titled && cover < 0.67)) {
    return { kind: 'none', answer: 'The published timeline does not contain that. Try a world (Kha-Ren, Terra, Earth), a layer (Vortex, Haven, Core), a year or a calendar date.', events: [], refused: true };
  }
  const top = hits[0].d;
  const dateOf = (d) => (d.y == null || d.kind === 'world' ? '' : ` (${fmtCE(d.y, byId.get(d.id)?.c)}, ${worldName(d.world)})`);
  let answer = `${top.title}${dateOf(top)}. ${top.text}`;
  const rel = hits.slice(1).filter((h) => h.s >= hits[0].s * 0.55 && h.d.kind === 'event').slice(0, 2);
  if (rel.length) answer += ` Related: ${rel.map((h) => `${h.d.title}${dateOf(h.d)}`).join('; ')}.`;
  const ids = [top, ...rel.map((h) => h.d)].map((d) => (d.kind === 'world' ? null : d.id)).filter((id) => id && (byId.has(id) || layerById.has(id)));
  if (top.kind === 'world') {
    const disc = VIS.find((e) => e.world === top.world && Math.abs(e.y - top.y) < 1 && e.imp === 1);
    if (disc) ids.unshift(disc.id);
  }
  return { kind: 'search', answer, events: [...new Set(ids)], refused: false };
}

/* ---------------- the model's context ---------------- */

/** The only data a model sees for this question: the retrieved events (gated), the
    worlds, the layers, the calendar rules and, when there is one, the computed answer. */
export function packContext(q, det) {
  const hits = search(q, 12).filter((h) => h.d.kind === 'event').map((h) => byId.get(h.d.id));
  const ids = new Set([...(det?.events || []).filter((id) => byId.has(id)), ...hits.map((e) => e.id)]);
  const events = [...ids].map((id) => byId.get(id)).filter(readable).map((e) => ({ id: e.id, world: worldName(e.world), date: fmtCE(e.y, e.c), title: e.title, text: e.text }));
  const ctx = {
    calendars: 'Earth CE; Terra A.T. = CE + 3537; Kha-Ren: CE = 75 x Cycle + Year - 4750; synchronised at 2068 CE = 5605 A.T. = Cycle 90, Year 68.',
    worlds: WORLDS.map((w) => ({ world: w.name, found: w.id === 'earth' ? '2031 CE (reached); divergence begins 2068' : fmtCE(w.found, true), stage: w.stage, response: `${w.response}: ${w.responseLine}` })),
    layers: LAYERS.map((l) => ({ id: l.id, title: l.title, text: l.text })),
    events,
  };
  if (det?.computed) ctx.computed = det.answer;
  return { json: JSON.stringify(ctx), ids: new Set(events.map((e) => e.id)) };
}

/** Accept a model reply only if it is well formed and cites nothing outside its context. */
export function validateModelReply(j, contextIds) {
  if (!j || typeof j !== 'object') return null;
  const answer = typeof j.answer === 'string' ? j.answer.trim().slice(0, 900) : '';
  if (!answer) return null;
  const cited = Array.isArray(j.events) ? j.events.filter((x) => typeof x === 'string') : [];
  if (cited.some((id) => !contextIds.has(id))) return null;
  return { answer, events: [...new Set(cited)].slice(0, 6), refused: j.refused === true };
}


/* ---------------- the model's part, and the check on it ---------------- */

/** Computed answers are exact; a model can only make them worse (measured: data/eval.json).
    Only retrieval answers are offered to a model to phrase. */
export const needsModel = (det) => det?.kind === 'search' && !det.refused;

const CLAIM = /(\d[\d,]*(?:\.\d+)?\s*(?:BCE|CE|A\.T\.|billion years|million years|years|kW|Hz|dB|km|percent|%)|Cycle \d+(?:, Year \d+)?)/gi;
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Split a model answer into sentences and mark each one supported when every date or
    quantity it states appears in the context it was given. */
export function checkClaims(answer, ctxJson) {
  const hay = squash(ctxJson);
  const sentences = String(answer).split(/(?<=[.!?])\s+(?=[A-Z“"])/);
  return sentences.map((t) => {
    const claims = (t.match(CLAIM) || []).map(squash);
    const missing = claims.filter((c) => !hay.includes(c));
    return { text: t.trim(), ok: missing.length === 0, missing };
  }).filter((x) => x.text);
}

export { grp };
