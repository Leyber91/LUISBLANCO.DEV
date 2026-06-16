/* ============================================================
   altverse/nemotron-client.js — the throttle layer (Phase 2).
   Wraps AIProvider and governs WHEN calls fire. Reimplements the
   proven groq_html pattern (token bucket + concurrency + backoff)
   for THIS workload only:

   - token bucket ~1 req / 1.6s (~38 rpm), capacity = concurrency
   - bounded concurrency (1 default; the serial DAG barely overlaps)
   - per-call AbortController + stall-watchdog (no token for N s) +
     total-duration ceiling (MEASURED p95 — a 550B reasoning call is
     minutes, so the ceiling is generous, NOT 90s)
   - backoff on 429 / 5xx / connect-failures ONLY; a timeout is
     NEVER exponentially retried (the model is still working)
   - JSON extracted via json-extract; per-call telemetry recorded
   - explicitly passes provider:'nvidia' + the nemotron model
     (the worker default is groq)

   The full live DAG run + per-stage tuning is gated on a DEPLOYED
   worker (worker.base set) — see workers/ai-proxy/README.md.
   ============================================================ */

import { AIProvider } from '../ai/provider.js';
import { AI_CONFIG } from '../ai/config.js';
import { extractJSON } from './json-extract.js';

const NVIDIA = 'nvidia';
const MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';
const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class NemotronClient {
  constructor(opts = {}) {
    this.provider = opts.provider || new AIProvider();
    this.cfg = {
      rpmMs: 1600,          // ~38 rpm, under the 40 rpm rail
      concurrency: 1,       // serial DAG; raise only for the S8 overlap window
      stallMs: 60000,       // abort if NO token for 60s (a true hang)
      durationMs: 360000,   // total ceiling; tune to MEASURED p95 after first run
      maxRetries: 4,
      ...(AI_CONFIG.altverse || {}),
      ...opts.cfg,
    };
    this._lastDispatch = 0;
    this._active = 0;
    this._waiters = [];
    this.log = [];
  }

  detect() { return this.provider.detect(); }
  get mode() { return this.provider.mode; }

  async _acquire() {
    if (this._active >= this.cfg.concurrency) await new Promise((res) => this._waiters.push(res));
    const wait = Math.max(0, this.cfg.rpmMs - (now() - this._lastDispatch));
    if (wait > 0) await sleep(wait);
    this._lastDispatch = now();
    this._active++;
  }
  _release() { this._active--; const w = this._waiters.shift(); if (w) w(); }

  /**
   * One throttled, schema-targeted generation.
   * @returns {Promise<{ok,obj?,error?,raw,reasoning,telemetry}>}
   */
  async generateJSON({ system, user, profile = {}, echo, signal, onReasoning, onToken }) {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: user });
    const think = profile.enableThinking !== false;

    await this._acquire();
    const start = now();
    let tFirst = 0, reasoning = '', content = '', timedOut = false;
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let stall;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => { timedOut = 'stall'; ac.abort(); }, this.cfg.stallMs); };
    const dur = setTimeout(() => { timedOut = 'duration'; ac.abort(); }, this.cfg.durationMs);
    arm();

    try {
      let attempt = 0;
      while (true) {
        try {
          await this.provider.chat({
            messages, provider: NVIDIA, model: MODEL,
            temperature: profile.temperature ?? 0.6,
            maxTokens: profile.maxTokens ?? 3072,
            top_p: profile.topP ?? 0.95,
            chat_template_kwargs: { enable_thinking: think },
            reasoning_budget: think ? (profile.reasoningBudget ?? 3072) : 0,
            echo, signal: ac.signal,
            onReasoning: (t) => { reasoning += t; onReasoning?.(t); arm(); },
            onToken: (t) => { if (!tFirst) tFirst = now(); content += t; onToken?.(t); arm(); },
          });
          break;
        } catch (e) {
          attempt++;
          if (timedOut) break;                                   // never retry a timeout
          const transient = /http (429|5\d\d)|unreachable|network|failed to fetch/i.test(e.message || '');
          if (!transient || attempt > this.cfg.maxRetries) throw e;
          await sleep(Math.min(2000 * 2 ** (attempt - 1), 45000) + Math.random() * 400);
        }
      }
    } finally {
      clearTimeout(stall); clearTimeout(dur);
      signal?.removeEventListener('abort', onAbort);
      this._release();
    }

    const parsed = extractJSON(content);
    const telemetry = {
      ms: Math.round(now() - start),
      tFirst: tFirst ? Math.round(tFirst - start) : 0,
      reasonChars: reasoning.length, contentChars: content.length,
      ok: parsed.ok, timedOut: timedOut || false, mode: this.mode,
    };
    this.log.push(telemetry);
    return { ok: parsed.ok, obj: parsed.obj, error: parsed.error, raw: content, reasoning, telemetry };
  }

  /** think-OFF causal classifier: [[cause,effect],...] -> ['strong'|'weak'|'none',...] */
  async classify(pairs, { signal } = {}) {
    if (!pairs.length) return [];
    const user =
      'For each pair, answer strong | weak | none for whether CAUSE plausibly entails EFFECT. ' +
      'Return ONLY a JSON array of that many strings, in order.\n' +
      JSON.stringify(pairs.map(([c, e]) => ({ cause: c, effect: e })));
    const r = await this.generateJSON({
      system: 'You are a terse causal classifier. Output only a JSON array of strings.',
      user,
      profile: { enableThinking: false, temperature: 0.1, maxTokens: 512, reasoningBudget: 0 },
      signal,
      echo: { speech: [JSON.stringify(pairs.map(() => 'weak'))] },
    });
    return Array.isArray(r.obj) && r.obj.length === pairs.length ? r.obj : pairs.map(() => 'none');
  }

  stats() {
    const n = this.log.length || 1;
    return {
      calls: this.log.length,
      avgMs: Math.round(this.log.reduce((s, r) => s + r.ms, 0) / n),
      mode: this.mode,
      timeouts: this.log.filter((r) => r.timedOut).length,
    };
  }
}
