/* ============================================================
   token-ekg/engine/narrate.js — the sentence under the strip.

   Every caption is built from the trace's own numbers: the page
   says what the current trace shows, in plain words, while it plays.
   Nothing here is written per recording except the order of the tour.
   ============================================================ */

import { fmtMs } from './stats.js';

/** The tour played on load: one idea per recording, in this order. */
export const TOUR = ['llama-warm', 'qwen06', 'llama-131k', 'qwen8-think', 'llama-long-1', 'llama-long-2', 'llama-cold',
  'llama-shared', 'public-oneshot'];

const n0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString('en-US') : '-');
const n1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const gb = (b) => (b / 1e9).toFixed(1) + ' GB';

/** One or two sentences about what this trace shows. */
export function headline(t, a) {
  if (t.kind === 'oneshot') {
    const u = t.usage;
    const tail = u ? ` The route reported ${n0(u.prompt_tokens)} prompt tokens and ${n0(u.completion_tokens)} completion tokens.` : '';
    return `No stream: the whole reply arrived in one piece after ${fmtMs(t.tDone)}.${tail}`;
  }
  if (!a.n) return `${t.model}: waiting for the first token.`;
  const s = a.server;
  const parts = [];
  if (t.contention && t.contention.endMs > 0 && a.ttft > t.contention.endMs * 0.8) {
    parts.push(`Another request held the server until ${fmtMs(t.contention.endMs)}; this stream's first token came at ${fmtMs(a.ttft)}.`);
  } else if (s && s.loadMs > 1000) {
    parts.push(`${fmtMs(s.loadMs)} of the ${fmtMs(a.ttft)} wait before the first token was the server loading the weights.`);
  } else if (s && s.promptCount > 500 && s.promptCached > s.promptCount * 0.9) {
    parts.push(`${n0(s.promptCached)} of ${n0(s.promptCount)} prompt tokens came from the server's prompt cache, so the first token came after ${fmtMs(a.ttft)}.`);
  } else if (s && s.promptEvaluated > 500) {
    parts.push(`The server read ${n0(s.promptEvaluated)} prompt tokens in ${fmtMs(s.promptMs)} (${n0(s.prefillRate)} tokens/s) before the first token, at ${fmtMs(a.ttft)}.`);
  }
  if (a.think && Number.isFinite(a.ttfa)) {
    parts.push(`${n0(a.think.n)} chunks of reasoning came before the answer's first word, at ${fmtMs(a.ttfa)}.`);
  }
  if (t.placement && t.placement.size > 0 && t.placement.sizeVram < t.placement.size * 0.95) {
    parts.push(`Only ${gb(t.placement.sizeVram)} of ${gb(t.placement.size)} fit in GPU memory; each token took ${fmtMs(a.median)} (median).`);
  }
  if (!parts.length || parts.length === 1 && !a.think) {
    const srv = s && Number.isFinite(s.rate) ? `, ${n1(s.rate)} by the server's own count` : '';
    parts.push(`${t.params ? t.params + ' parameters' : t.model}: one token every ${fmtMs(a.median)} (median), ${n1(a.rate)} tokens/s measured here${srv}.`);
  }
  return parts.join(' ');
}

/** A short source line: what this is, when, on what. */
export function provenance(t) {
  const when = t.recorded ? new Date(t.recorded).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  const where = t.route === 'ollama-local' ? 'local Ollama' : t.route === 'pollinations' ? 'public route' : t.route || '';
  const what = t.origin === 'recording' ? 'recording' : t.origin === 'live' ? 'live' : t.origin === 'saved' ? 'saved here' : 'imported';
  return { what, when, where, model: t.model || '' };
}
