/* ============================================================
   workout-plans/PlanService.js — the one model call. No DOM.

   The planner has already decided everything. This asks a model,
   through the labs' shared route (ai/llm.js), to explain those
   decisions in plain prose, citing decision ids, in ONE JSON
   request. The reply is normalised and checked sentence by
   sentence against the decision log (LocalCoach.check). If no
   route answers, or the reply is unusable, the deterministic
   narrator's text is returned instead and the page says so.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { NARRATE_SYSTEM, NARRATE_USER } from './constants.js';
import { narrate, check, normalise, allDecisions, planExerciseNames } from './LocalCoach.js';

export async function narrateWithModel(plan, lived, { signal } = {}) {
  const log = allDecisions(plan, lived).map((d) => ({ id: d.id, text: d.text, nums: d.nums }));
  const fallback = () => ({ narration: narrate(plan, lived) });
  const r = await LLM.complete({
    system: NARRATE_SYSTEM,
    prompt: NARRATE_USER(plan.summary, log),
    json: true,
    temperature: 0.3,
    signal,
    timeoutMs: 120000,
    maxWaitMs: 47000,
    fallback,
  });
  let sentences = normalise(r.json);
  let source = r.source, note = '';
  if (r.source !== 'offline' && !sentences.length) {
    sentences = narrate(plan, lived);
    note = 'the reply had no usable sentences, so the deterministic narration stands';
    source = 'offline';
  }
  const checked = check(sentences, allDecisions(plan, lived), planExerciseNames(plan, lived));
  return {
    source, model: r.model, ms: r.ms, errors: r.errors || [], note,
    sentences: checked,
    ok: checked.filter((s) => s.ok).length,
  };
}

export function narrateLocal(plan, lived) {
  const checked = check(narrate(plan, lived), allDecisions(plan, lived), planExerciseNames(plan, lived));
  return { source: 'deterministic', model: 'planner', ms: 0, errors: [], note: '', sentences: checked, ok: checked.filter((s) => s.ok).length };
}
