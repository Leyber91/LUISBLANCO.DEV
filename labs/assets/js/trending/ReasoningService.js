/* ============================================================
   trending/ReasoningService.js — the one model call per scan.

   Goes through the shared route (ai/llm.js: the visitor's Ollama when
   served locally, their own key, a worker, the public keyless service,
   then this lab's deterministic engine). The public route allows one
   reply every 45 seconds per IP, so a scan makes exactly one request:
   the top signals batched into one JSON object. Validation, the
   number check and the per-entry fallback live in explain.js.
   ============================================================ */

import { LLM } from '../ai/llm.js';
import { TUNING } from './constants.js';
import { buildRequest, engineReply, reconcile, parseReply } from './explain.js';

export class ReasoningService {
  /**
   * items: the ranked top signals (hydrated, with .sc); facts: factsFor() per item;
   * ctxs: per-item engine context; topics: [{ label, keys }]; fixture: a recorded reply to use instead of a call.
   * Returns { source, model, ms, errors, entries, topics, digest, ... }.
   */
  async explain({ items, facts, ctxs, topics, scan, evidence, signal, fixture, engineOnly, scanFacts }) {
    const engine = engineReply(items, ctxs, topics, scan, evidence);
    if (engineOnly) {
      const out = reconcile(engine, items, facts, engine, scanFacts);
      for (const e of out.entries) { e.origin = 'engine'; e.flags = []; e.rule = engine.signals.find((x) => x.id === e.key)?.rule; }
      return { ...out, digestOrigin: 'engine', digestFlags: [], source: 'offline', model: 'deterministic', ms: 0, errors: ['model switched off by ?engine'] };
    }
    if (fixture) {
      const out = reconcile(fixture.reply, items, facts, engine, scanFacts);
      return { ...out, source: 'fixture', model: fixture.model, ms: 0, errors: [], label: fixture.label };
    }
    const { system, prompt } = buildRequest(facts, topics, scanFacts);
    // json: false on purpose: llm.js drops a reply it cannot parse whole, and a reply cut
    // off after four entries should still give four checked entries (measured 2026-11-11:
    // the public route answered this prompt with text that did not parse as one object).
    const r = await LLM.complete({
      system: `${system}\n\nReply with one JSON object and nothing else.`, prompt, json: false, temperature: 0.2, signal,
      timeoutMs: TUNING.modelTimeoutMs, maxWaitMs: TUNING.modelMaxWaitMs,
      fallback: () => JSON.stringify(engine),
    });
    const parsed = r.source === 'offline' ? engine : parseReply(r.text);
    const out = reconcile(parsed, items, facts, engine, scanFacts);
    if (r.source !== 'offline' && !parsed) out.unreadable = true;
    if (parsed?.salvaged) out.salvaged = true;
    if (r.source === 'offline') {
      for (const e of out.entries) { e.origin = 'engine'; e.note = ''; e.flags = []; e.rule = engine.signals.find((x) => x.id === e.key)?.rule; }
      out.digestOrigin = 'engine';
      out.digestFlags = [];
    }
    return { ...out, source: r.source, model: r.model, ms: r.ms, errors: r.errors || [], prompt, rawText: r.text };
  }
}
