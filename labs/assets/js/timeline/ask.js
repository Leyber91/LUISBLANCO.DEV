/* ============================================================
   timeline/ask.js — one question, at most one model call.

   The deterministic engine (qa.js) answers at once. A model
   (through llm.js, whichever route answers) is asked only when
   that answer found supporting events; it gets those events and
   nothing else, may only restate them, and its reply is rejected
   if it cites an event outside its context. Plot questions past
   the setup and questions with no supporting event are refused
   without spending the public model window.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { deterministicAnswer, packContext, validateModelReply, needsModel, checkClaims } from './qa.js';

const SYSTEM = [
  'You answer visitor questions about the published timeline of TRIVERSE, an unpublished hard science fiction series.',
  'Use ONLY the CONTEXT below. You have no other reliable knowledge of this series.',
  'If CONTEXT has a "computed" field, it is the correct answer worked out by the page: restate it plainly and do not change its numbers or dates.',
  'If CONTEXT does not contain the answer, set "refused" to true and say that the published timeline does not contain it.',
  'Never guess about plot, endings, twists or anything after the setup of Book 1.',
  'Answer in at most three plain sentences: no lists, no markdown. Give dates as CONTEXT gives them.',
  'Return JSON: {"answer": string, "events": [ids of CONTEXT events that support the answer], "refused": boolean}.',
  'CONTEXT:',
].join('\n');

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';

/**
 * @param {string} q
 * @param {{signal?: AbortSignal, onInstant?: (r: object) => void}} opt
 */
export async function ask(q, { signal, onInstant } = {}) {
  const det = deterministicAnswer(q);
  onInstant?.(det);
  if (det.kind === 'guard') return { ...det, source: 'guard' };
  if (det.refused) return { ...det, source: 'no-support' };
  if (!needsModel(det)) return { ...det, source: 'computed' };
  // A local page's first probe of the visitor's own model can time out while it is busy.
  if (isLocal() && LLM.status().route !== 'ollama') { try { await LLM.detect(true); } catch { /* keep the route we have */ } }
  const ctx = packContext(q, det);
  const r = await LLM.complete({
    system: `${SYSTEM}\n${ctx.json}`, prompt: String(q).slice(0, 240), json: true, temperature: 0.2,
    maxWaitMs: 50000, timeoutMs: 70000, signal,
    fallback: () => ({ fallback: true }),
  });
  if (r.source === 'offline') return { ...det, source: 'offline', note: r.errors?.[r.errors.length - 1] || '' };
  const v = validateModelReply(r.json, ctx.ids);
  if (!v) return { ...det, source: 'rejected', model: r.model, note: 'the model reply cited something outside its context or was malformed' };
  if (v.refused && !det.refused) return { ...det, source: 'rejected', model: r.model, note: 'the model refused what the data supports' };
  const claims = checkClaims(v.answer, ctx.json);
  if (!claims.some((c) => c.ok)) return { ...det, source: 'rejected', model: r.model, note: 'no sentence of the reply was supported by its context' };
  return { ...v, claims, source: r.source, model: r.model, ms: r.ms, contextSize: ctx.ids.size };
}
