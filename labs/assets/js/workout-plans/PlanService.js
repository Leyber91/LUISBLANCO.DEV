/* ============================================================
   workout-plans/PlanService.js — the model layer.

   Owns the shared tiered AIProvider (ollama -> worker -> echo),
   builds the prompt + the offline echo script, runs the streaming
   chat, and parses the model's JSON answer into a plan object. No
   DOM here — it streams reasoning/answer tokens out through
   callbacks so the view stays the only thing that touches the page.

   On parse failure (or offline) the caller falls back to LocalCoach,
   which produces the same shape, so the output is never a dead box.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import { AI_CONFIG } from '../ai/config.js';
import { LocalCoach } from './LocalCoach.js';
import { MODEL, SYSTEM_PROMPT, USER_PROMPT } from './constants.js';

export class PlanService {
  constructor(coach = new LocalCoach()) {
    this.ai = new AIProvider();
    this.coach = coach;
  }

  /* detected backend tier ('ollama' | 'worker' | 'echo' | 'unknown') */
  get mode() { return this.ai.mode; }

  detect() { return this.ai.detect(); }

  buildMessages(i) {
    return [
      { role: 'system', content: SYSTEM_PROMPT(i) },
      { role: 'user',   content: USER_PROMPT(i) },
    ];
  }

  /* echo: a believable reasoning script + the local plan as the "answer" */
  buildEcho(i) {
    return {
      thought: this.coach.buildReasoningScript(i),
      speech: [JSON.stringify(this.coach.buildPlan(i))],
    };
  }

  /* stream a plan. Resolves to the accumulated answer text + whether
     any reasoning arrived. onReasoning/onToken stream live tokens. */
  async stream(i, { signal, onReasoning, onToken } = {}) {
    let answer = '';
    let gotReasoning = false;

    await this.ai.chat({
      // prefer the reasoning model on the relay (groq default -> nvidia)
      provider: AI_CONFIG.worker.defaultProvider === 'groq' ? MODEL.reasoningProvider : undefined,
      model: this.mode === 'worker' ? MODEL.reasoningModel : undefined,
      messages: this.buildMessages(i),
      temperature: MODEL.temperature,
      maxTokens: MODEL.maxTokens,
      signal,
      echo: this.buildEcho(i),
      onReasoning: (t) => { gotReasoning = true; onReasoning?.(t); },
      onToken: (t) => { answer += t; onToken?.(t); },
      onDone: () => {},
    });

    return { answer, gotReasoning };
  }

  /* parse the model's JSON answer into a plan, or null if invalid */
  extractPlan(text) {
    if (!text) return null;
    const s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a === -1 || b === -1 || b <= a) return null;
    try {
      const obj = JSON.parse(s.slice(a, b + 1));
      if (!obj || !Array.isArray(obj.split) || !obj.split.length) return null;
      return obj;
    } catch { return null; }
  }
}
