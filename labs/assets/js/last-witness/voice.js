/* ============================================================
   last-witness/voice.js — the one adapter between TALLY's engine
   and a language model. Nothing else in the lab imports llm.js.

   One call per heavy turn. The model receives TALLY's profile, the
   current disclosure tier, the facts it may use and the engine's
   draft, and must return JSON:
     { "reply": string, "intent": string, "trust_delta": number }
   mind.validate() checks that object against the schema and against
   the engine's facts; anything that fails falls back to the draft.
   ============================================================ */

import { LLM } from '../ai/llm.js';

export const MODEL_SCHEMA = {
  reply: 'string, 8 to 900 characters, TALLY speaking',
  intent: 'one of the engine intent names, or "open"',
  trust_delta: 'number between -0.1 and 0.1: how this turn should move trust',
};

export function routeStatus() {
  const st = LLM.status();
  return { route: st.route, model: st.model, readyIn: LLM.publicReadyIn() };
}

/**
 * Voice one heavy turn. Never throws for a route failure.
 * Returns { text, source, model, note, json, check }.
 */
export async function voiceTurn({ mind, plan, visitorText, history, signal }) {
  const req = mind.modelRequest(plan, visitorText, history);
  try {
    const r = await LLM.complete({
      system: req.system, prompt: req.prompt, json: true, temperature: 0.6, signal,
      timeoutMs: 40000, maxWaitMs: 48000, fallback: () => ({ reply: plan.text }),
    });
    if (r.source === 'offline') return { text: plan.text, source: 'engine', note: 'no model route answered' };
    const check = mind.validate(r.json, plan, visitorText);
    if (!check.ok) return { text: plan.text, source: 'engine', note: `a model reply was refused (${check.why})`, refused: true, json: r.json, check, model: r.model, route: r.source };
    return { text: check.text, source: r.source, model: r.model, json: r.json, check };
  } catch (e) {
    return { text: plan.text, source: 'engine', note: e.name === 'AbortError' ? 'you chose not to wait for a model' : 'model error' };
  }
}
