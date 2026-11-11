/* ============================================================
   token-ekg/engine/schema.js — the trace record, version 1.

   One shape for recordings, saved runs, imports and exports.
   validateTrace() returns a list of problems (empty when valid);
   tests/run.mjs runs it over every shipped file, and the page runs
   it on every import.

   {
     id, label            strings
     kind                 'stream' | 'oneshot'
     route                'ollama-local' | 'openai-compat' | 'pollinations' | ...
     model                the model name as the server reported it
     recorded             ISO 8601 time the request was sent
     recorder             what took the timestamps
     chunks               [[t_ms, kind, text], ...] stored, or {t, kind, text} in memory;
                          t = ms since the request was sent, non-decreasing;
                          kind 'a' answer, 't' thinking
     tDone                ms when the stream ended (null if it never did)
     final                the server's own counters or null (Ollama: ns durations)
     usage                OpenAI-style usage or null
     promptChars, promptTokens (optional), options, think, placement, contention, note
   }
   ============================================================ */

export const SCHEMA = { version: 1 };

const isStr = (x) => typeof x === 'string';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function validateTrace(t) {
  const e = [];
  if (!t || typeof t !== 'object') return ['not an object'];
  if (!isStr(t.id) || !t.id) e.push('id');
  if (!isStr(t.label)) e.push('label');
  if (t.kind != null && t.kind !== 'stream' && t.kind !== 'oneshot') e.push('kind');
  if (!isStr(t.route)) e.push('route');
  if (!isStr(t.model)) e.push('model');
  if (!isStr(t.recorded) || Number.isNaN(Date.parse(t.recorded))) e.push('recorded');
  if (!Array.isArray(t.chunks)) { e.push('chunks'); return e; }
  let last = -Infinity;
  for (let i = 0; i < t.chunks.length; i++) {
    const c = t.chunks[i];
    const tt = Array.isArray(c) ? c[0] : c?.t;
    const k = Array.isArray(c) ? c[1] : c?.kind;
    const x = Array.isArray(c) ? c[2] : c?.text;
    if (!isNum(tt) || tt < last) { e.push(`chunk ${i} time`); break; }
    if (k !== 'a' && k !== 't') { e.push(`chunk ${i} kind`); break; }
    if (!isStr(x)) { e.push(`chunk ${i} text`); break; }
    last = tt;
  }
  if (t.tDone != null && !isNum(t.tDone)) e.push('tDone');
  if (t.final != null) {
    for (const k of ['eval_count', 'eval_duration', 'total_duration']) if (t.final[k] != null && !isNum(t.final[k])) e.push('final.' + k);
  }
  return e;
}
