/* ============================================================
   ai/llm.js — the labs' one route to a language model.

   A static site cannot hold a key, so a lab reaches a model by
   the first route that answers, in this order:

     1. ollama       the visitor's own machine; probed only when the
                     page is served from localhost or file://
     2. own key      an OpenAI-compatible endpoint and key the visitor
                     typed into the route panel; kept in their browser
                     (localStorage) and sent only to that endpoint
     3. worker       a proxy URL, if one is ever deployed (config.js
                     worker.base); empty today, so skipped
     4. pollinations text.pollinations.ai, keyless and public. Measured
                     2026-11-11: one reply every 45 seconds per IP
                     (HTTP 402 FREE_LIMIT otherwise), model gpt-oss-20b
     5. offline      the lab's own deterministic fallback, which every
                     caller must supply; the page says so

   Consequence for lab design: on the public route a lab gets about one
   model call per interaction. Batch every stage into one JSON request
   and let the deterministic engine do the rest.

   Non-streaming on purpose: on 2026-11-11 the anonymous streaming path
   answered with a key-budget notice instead of tokens.

   Usage:
     import { LLM } from './ai/llm.js';
     const r = await LLM.complete({
       system: 'You are ...',
       prompt: 'user text',          // or messages: [{role, content}]
       json: true,                    // parse a JSON object from the reply
       fallback: (req) => ({ ... }),  // used when no route answers
       maxWaitMs: 50000,              // how long to wait for the public
                                      // window (0 = never wait)
       signal,                        // optional AbortSignal
       model,                         // optional: a model id for this call (local
                                      // Ollama or own-key routes; the public route
                                      // serves one model)
     });
     r.text, r.json, r.source ('ollama'|'own-key'|'worker'|'pollinations'|'offline'),
     r.model, r.ms, r.reasoning, r.errors

     LLM.onStatus((s) => pill.textContent = s.label);  // s.readyIn: seconds
     LLM.publicReadyIn()   // seconds until the public route can answer
     LLM.localModels()     // the local model ids, once detected (for per-call model choice)
     LLM.setOwnKey({ base, key, model }) / LLM.clearOwnKey()
   ============================================================ */

import { AI_CONFIG } from './config.js';

const POLL_URL = 'https://text.pollinations.ai/openai';
const POLL_MODEL = 'openai';             // alias the anonymous tier serves
const POLL_WINDOW_MS = 46000;            // 45 s per IP, plus a second of slack
// 127.0.0.1, not localhost: on Windows localhost tries ::1 first and took 1.6 s to connect (2026-11-11).
const OLLAMA_BASE = 'http://127.0.0.1:11434';
const OLLAMA_PROBE_MS = 2500;
const OLLAMA_TAGS_MS = 15000;
const OLLAMA_NUM_CTX = 8192;
// Preference order for a local model, by a lab-task benchmark on 2026-11-11 (meaning-graph JSON, a grounded
// description, a trap question; num_ctx 8192): gemma4:e4b 3 of 3 correct at 107 to 131 tokens/s; qwen3.5:9b 3 of 3
// at about 47 tokens/s after long thinking; llama3.1:8b 2 of 3 (wrong JSON fields) at about 56 tokens/s.
const OLLAMA_PREFER = ['gemma4:e4b', 'qwen3.5:9b', 'llama3.1:8b', 'qwen3:8b'];
const DEFAULT_TIMEOUT_MS = 60000;
const OWN_KEY_STORE = 'lb.llm.ownkey';
const READY_STORE = 'lb.llm.pollReadyAt'; // shared across lab tabs on this origin

const BUDGET_RE = /reached its budget|raise the key budget|free limit reached/i;

const isLocalPage = () =>
  typeof location !== 'undefined' &&
  (location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname));

const store = {
  get(k) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, v); } catch { /* storage blocked */ } },
  del(k) { try { globalThis.localStorage?.removeItem(k); } catch { /* storage blocked */ } },
};

function abortError() {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(abortError());
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(abortError()); }, { once: true });
});

/* Merge a caller signal with a timeout into one signal. */
function withTimeout(signal, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const stop = () => { clearTimeout(t); ctrl.abort(); };
  if (signal) {
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  }
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

/* Pull the first JSON object or array out of a model reply. Tolerates
   code fences, prose before and after, and trailing commas. */
export function extractJSON(text) {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : text;
  const start = src.search(/[{[]/);
  if (start < 0) return null;
  const open = src[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) {
      const body = src.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(body); } catch { return null; }
    }
  }
  return null;
}

class Route {
  constructor() {
    this.listeners = new Set();
    this.state = { route: 'unknown', model: '', label: 'model: chosen on first use', readyIn: 0 };
    this._detecting = null;
    this._ollamaModel = '';
    this._queue = Promise.resolve();
    this._tick = null;
  }

  /* ---------- status ---------- */
  onStatus(fn) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  status() { return this.state; }

  _emit(route, model, note = '') {
    const readyIn = route === 'pollinations' ? this.publicReadyIn() : 0;
    const label =
      route === 'ollama' ? `model: ${model} (your machine)` :
      route === 'own-key' ? `model: ${model} (your key)` :
      route === 'worker' ? `model: ${model} (worker)` :
      route === 'pollinations'
        ? `model: ${model || 'gpt-oss-20b'} via pollinations` + (readyIn > 0 ? ` · next reply in ${readyIn}s` : ' · ready')
        : route === 'offline' ? `offline: deterministic fallback${note}` : 'model: chosen on first use';
    this.state = { route, model, label, readyIn, note };
    this.listeners.forEach((fn) => { try { fn(this.state); } catch { /* the listener's problem */ } });
    this._scheduleTick();
  }

  /* Keep the countdown live while the public window is closed. */
  _scheduleTick() {
    if (this._tick || this.state.route !== 'pollinations' || this.publicReadyIn() <= 0) return;
    this._tick = setTimeout(() => { this._tick = null; this._emit(this.state.route, this.state.model); }, 1000);
  }

  /* ---------- the public window ---------- */
  _pollReadyAt() { return Number(store.get(READY_STORE)) || 0; }
  _setPollReadyAt(t) { store.set(READY_STORE, String(Math.round(t))); this._memReady = t; }
  publicReadyIn() {
    const at = Math.max(this._pollReadyAt(), this._memReady || 0);
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }

  /* ---------- the visitor's own key ---------- */
  ownKey() {
    try { const v = JSON.parse(store.get(OWN_KEY_STORE) || 'null'); return v && v.base && v.key && v.model ? v : null; }
    catch { return null; }
  }
  setOwnKey({ base, key, model }) {
    store.set(OWN_KEY_STORE, JSON.stringify({ base: String(base).replace(/\/+$/, ''), key, model }));
    this._detecting = null;
    return this.detect(true);
  }
  clearOwnKey() { store.del(OWN_KEY_STORE); this._detecting = null; return this.detect(true); }

  /* ---------- route detection ---------- */
  detect(force = false) {
    if (this._detecting && !force) return this._detecting;
    this._detecting = (async () => {
      if (isLocalPage()) {
        try {
          // Liveness from /api/version (answers in milliseconds); the model list from /api/tags can take
          // several seconds on a loaded machine (1 to 6 s measured 2026-11-11), so it gets its own budget.
          const t = withTimeout(null, OLLAMA_PROBE_MS);
          const v = await fetch(OLLAMA_BASE + '/api/version', { signal: t.signal, cache: 'no-store' });
          t.done();
          if (v.ok) {
            let tags = [];
            try {
              const t2 = withTimeout(null, OLLAMA_TAGS_MS);
              const r = await fetch(OLLAMA_BASE + '/api/tags', { signal: t2.signal, cache: 'no-store' });
              t2.done();
              if (r.ok) tags = (await r.json()).models?.map((m) => m.name) || [];
            } catch { /* list too slow: fall back to the preferred default */ }
            this._ollamaTags = tags;
            const pick = OLLAMA_PREFER.find((m) => tags.includes(m)) || tags[0] || OLLAMA_PREFER[1];
            this._ollamaModel = pick; this._emit('ollama', pick); return 'ollama';
          }
        } catch { /* no local model */ }
      }
      const own = this.ownKey();
      if (own) { this._emit('own-key', own.model); return 'own-key'; }
      if (AI_CONFIG.worker?.base) { this._emit('worker', AI_CONFIG.worker.defaultModel); return 'worker'; }
      this._emit('pollinations', 'gpt-oss-20b');
      return 'pollinations';
    })();
    return this._detecting;
  }

  localModels() { return (this._ollamaTags || []).slice(); }

  _chain(first) {
    const all = ['ollama', 'own-key', 'worker', 'pollinations'];
    return all.slice(all.indexOf(first));
  }

  /* ---------- transports ---------- */
  async _ollama(messages, opt, signal) {
    if (!this._ollamaModel) throw new Error('no local model');
    const model = opt.model || this._ollamaModel;
    const r = await fetch(OLLAMA_BASE + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({
        model, messages, stream: false,
        // num_ctx: an Ollama app set to a 262k context loads llama3.1:8b at 131k and 21.6 GB of memory
        // (measured 2026-11-11); 8k is ample for a lab call.
        options: { temperature: opt.temperature ?? 0.7, num_ctx: OLLAMA_NUM_CTX, ...(opt.seed != null ? { seed: opt.seed } : {}) },
        ...(opt.json ? { format: 'json' } : {}),
      }),
    });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    const text = j.message?.content || '';
    if (!text.trim()) throw new Error('empty reply');
    const usage = j.eval_count != null
      ? { prompt_tokens: j.prompt_eval_count ?? null, completion_tokens: j.eval_count, eval_duration_ns: j.eval_duration ?? null }
      : null;
    return { text, model: j.model || model, reasoning: j.message?.thinking || '', usage };
  }

  /* OpenAI-compatible chat/completions: the visitor's key, or a worker. */
  async _openaiCompat(base, key, model, messages, opt, signal) {
    const r = await fetch(base + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
      body: JSON.stringify({
        model, messages,
        ...(opt.temperature != null ? { temperature: opt.temperature } : {}),
        ...(opt.seed != null ? { seed: opt.seed } : {}),
        ...(opt.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    const msg = j.choices?.[0]?.message || {};
    const text = msg.content || '';
    if (!text.trim()) throw new Error('empty reply');
    return { text, model: j.model || model, reasoning: msg.reasoning || msg.reasoning_content || '', usage: j.usage || null };
  }

  async _pollinations(messages, opt, signal) {
    // One public call at a time from this page, and never inside the window.
    const run = this._queue.then(async () => {
      const waitS = this.publicReadyIn();
      if (waitS > 0) {
        if (waitS * 1000 > opt.maxWaitMs) throw new Error(`public window closed for ${waitS}s`);
        this._emit('pollinations', 'gpt-oss-20b');
        await sleep(waitS * 1000, signal);
      }
      this._setPollReadyAt(Date.now() + POLL_WINDOW_MS);
      const r = await fetch(POLL_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({
          // No temperature or seed: the anonymous route serves a reasoning model, and a call carrying
          // temperature 0.1 and seed 7 came back HTTP 400 (2026-11-11); calls without them succeed.
          model: POLL_MODEL, messages, referrer: 'luisblanco.dev',
          ...(opt.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (r.status === 402 || r.status === 429) {
        let retry = 45;
        try { const m = JSON.stringify(await r.json()).match(/retry after (\d+)s/i); if (m) retry = Number(m[1]); } catch { /* keep 45 */ }
        this._setPollReadyAt(Date.now() + (retry + 1) * 1000);
        throw new Error(`public window closed (HTTP ${r.status}), retry in ${retry}s`);
      }
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      const msg = j.choices?.[0]?.message || {};
      const text = msg.content || '';
      if (!text.trim()) throw new Error('empty reply');
      if (BUDGET_RE.test(text) && text.length < 600) throw new Error('refused: ' + text.slice(0, 80));
      return { text, model: j.model || 'gpt-oss-20b', reasoning: msg.reasoning || '', usage: j.usage || null };
    });
    this._queue = run.catch(() => {});
    return run;
  }

  /**
   * One completion. With a fallback it never throws for a route failure;
   * it throws AbortError when the caller aborts.
   */
  async complete(req) {
    const {
      system, prompt, messages: given, json = false, temperature, seed,
      signal, timeoutMs = DEFAULT_TIMEOUT_MS, fallback, maxWaitMs = 50000, model: wantModel,
    } = req;
    const messages = [];
    if (system) messages.push({ role: 'system', content: system + (json ? '\n\nReply with one JSON object and nothing else.' : '') });
    if (given) messages.push(...given);
    if (prompt) messages.push({ role: 'user', content: prompt });

    const first = await this.detect();
    const errors = [];
    const t0 = performance.now();
    const own = this.ownKey();
    const wk = AI_CONFIG.worker || {};

    for (const route of this._chain(first)) {
      if (route === 'own-key' && !own) continue;
      if (route === 'worker' && !wk.base) continue;
      if (route === 'ollama' && !this._ollamaModel) continue;
      const budget = route === 'pollinations' ? timeoutMs + maxWaitMs : timeoutMs;
      const t = withTimeout(signal, budget);
      try {
        const opt = { temperature, seed, json, maxWaitMs, model: wantModel };
        const out =
          route === 'ollama' ? await this._ollama(messages, opt, t.signal) :
          route === 'own-key' ? await this._openaiCompat(own.base, own.key, wantModel || own.model, messages, opt, t.signal) :
          route === 'worker' ? await this._openaiCompat(wk.base + '/v1', '', wk.defaultModel, messages, opt, t.signal) :
          await this._pollinations(messages, opt, t.signal);
        t.done();
        let parsed = null;
        if (json) {
          parsed = extractJSON(out.text);
          if (parsed == null) throw new Error('reply was not JSON');
        }
        this._emit(route, out.model);
        return { ...out, json: parsed, source: route, ms: Math.round(performance.now() - t0), errors };
      } catch (e) {
        t.done();
        if (signal?.aborted) throw abortError();
        errors.push(`${route}: ${e.message || e}`);
      }
    }

    if (typeof fallback !== 'function') {
      this._emit('offline', '', ' (no fallback given)');
      const e = new Error('no model route answered: ' + errors.join('; '));
      e.name = 'LLMUnavailable';
      e.errors = errors;
      throw e;
    }
    const fb = await fallback(req);
    this._emit('offline', '', errors.length ? ` (${errors[errors.length - 1]})` : '');
    const text = typeof fb === 'string' ? fb : JSON.stringify(fb);
    return {
      text, json: json ? (typeof fb === 'string' ? extractJSON(fb) : fb) : null,
      source: 'offline', model: 'deterministic', reasoning: '', usage: null,
      ms: Math.round(performance.now() - t0), errors,
    };
  }
}

export const LLM = new Route();
export default LLM;
