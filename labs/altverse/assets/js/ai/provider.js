/* ============================================================
   ai/provider.js — one streaming chat API over three backends.

   Usage:
     import { AIProvider } from './ai/provider.js';
     const ai = new AIProvider();
     await ai.detect();                       // -> 'ollama' | 'worker' | 'echo'
     await ai.chat({
       messages: [{ role:'user', content:'hi' }],
       onToken:     (t) => ...,               // spoken content, streamed
       onReasoning: (t) => ...,               // chain-of-thought (nvidia/ollama think)
       onDone:      (meta) => ...,
       signal,                                // AbortSignal
       echo: { speech:['...'], thought:['...'] }, // offline fallback script
     });

   Backends:
     ollama : POST /api/chat  -> NDJSON  {message:{content}, done}
     worker : POST /v1/chat   -> SSE     (OpenAI-compatible deltas)
     echo   : local scripted type-out, never touches the network
   ============================================================ */

import { AI_CONFIG } from './config.js';

const reduced = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = (ms, signal) =>
  new Promise((res) => {
    if (signal?.aborted) return res();
    const t = setTimeout(res, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });

const isLocal = () =>
  typeof location !== 'undefined' &&
  (location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname));

export class AIProvider {
  constructor(config = {}) {
    this.cfg = { ...AI_CONFIG, ...config };
    this.mode = 'unknown';
  }

  /* ---- pick the first reachable tier ---- */
  async detect() {
    for (const tier of this.cfg.tier) {
      if (tier === 'echo') { this.mode = 'echo'; return 'echo'; }
      if (tier === 'ollama' && isLocal() && (await this._pingOllama())) {
        this.mode = 'ollama'; return 'ollama';
      }
      if (tier === 'worker' && this.cfg.worker.base && (await this._pingWorker())) {
        this.mode = 'worker'; return 'worker';
      }
    }
    this.mode = 'echo';
    return 'echo';
  }

  async _pingOllama() {
    try {
      const r = await fetch(this.cfg.ollama.base + this.cfg.ollama.tagsPath, { cache: 'no-store' });
      return r.ok;
    } catch { return false; }
  }

  async _pingWorker() {
    try {
      const r = await fetch(this.cfg.worker.base + this.cfg.worker.healthPath, { cache: 'no-store' });
      return r.ok;
    } catch { return false; }
  }

  /* ---- unified streaming chat ---- */
  async chat(opts) {
    if (this.mode === 'unknown') await this.detect();
    try {
      if (this.mode === 'ollama') return await this._ollama(opts);
      if (this.mode === 'worker') return await this._worker(opts);
    } catch (e) {
      console.warn(`[ai] ${this.mode} failed -> echo:`, e.message);
      this.mode = 'echo';
    }
    return this._echo(opts);
  }

  /* ---- OLLAMA: native NDJSON stream ---- */
  async _ollama({ messages, model, temperature, onToken, onReasoning, onDone, signal }) {
    const res = await fetch(this.cfg.ollama.base + this.cfg.ollama.chatPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || this.cfg.ollama.defaultModel,
        messages,
        stream: true,
        options: { temperature: temperature ?? this.cfg.defaults.temperature },
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error('ollama http ' + res.status);
    await this._consumeNDJSON(res.body, (obj) => {
      if (obj.message?.thinking) onReasoning?.(obj.message.thinking);
      if (obj.message?.content) onToken?.(obj.message.content);
    }, signal);
    onDone?.({ mode: 'ollama' });
    return { mode: 'ollama' };
  }

  /* ---- WORKER: OpenAI-compatible SSE relayed by Cloudflare ---- */
  async _worker({ messages, provider, model, temperature, maxTokens,
                  top_p, chat_template_kwargs, reasoning_budget,
                  onToken, onReasoning, onDone, signal }) {
    const res = await fetch(this.cfg.worker.base + this.cfg.worker.chatPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider || this.cfg.worker.defaultProvider,
        model: model || this.cfg.worker.defaultModel,
        messages,
        temperature: temperature ?? this.cfg.defaults.temperature,
        max_tokens: maxTokens ?? this.cfg.defaults.maxTokens,
        // forward per-stage reasoning controls when supplied (were dropped before)
        ...(top_p != null ? { top_p } : {}),
        ...(chat_template_kwargs ? { chat_template_kwargs } : {}),
        ...(Number.isFinite(reasoning_budget) ? { reasoning_budget } : {}),
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error('worker http ' + res.status);
    let usage = null;
    await this._consumeSSE(res.body, (chunk) => {
      if (!chunk.choices?.length) { if (chunk.usage) usage = chunk.usage; return; }
      const d = chunk.choices[0].delta || {};
      if (d.reasoning_content) onReasoning?.(d.reasoning_content);
      if (d.content) onToken?.(d.content);
    }, signal);
    onDone?.({ mode: 'worker', usage });
    return { mode: 'worker', usage };
  }

  /* ---- ECHO: offline scripted performance ---- */
  async _echo({ echo, onToken, onReasoning, onDone, signal }) {
    const script = echo || { speech: ['(offline) the model is not reachable from here.'], thought: [] };
    const cps = this.cfg.defaults.typeCps;
    for (const frag of script.thought || []) {
      if (signal?.aborted) return { mode: 'echo' };
      await this._typeOut(frag + '\n', onReasoning, cps * 2, signal);
    }
    for (const seg of script.speech || []) {
      if (signal?.aborted) return { mode: 'echo' };
      await this._typeOut(seg, onToken, cps, signal);
      await wait(reduced() ? 0 : 160, signal);
    }
    onDone?.({ mode: 'echo' });
    return { mode: 'echo' };
  }

  /* ---- stream helpers ---- */
  async _consumeNDJSON(body, onObj, signal) {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done || signal?.aborted) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try { onObj(JSON.parse(line)); } catch { /* partial */ }
      }
    }
  }

  async _consumeSSE(body, onChunk, signal) {
    const reader = body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done || signal?.aborted) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        try { onChunk(JSON.parse(payload)); } catch { /* partial */ }
      }
    }
  }

  async _typeOut(text, emit, cps, signal) {
    if (!emit) return;
    if (reduced()) { emit(text); return; }
    const step = Math.max(1, Math.round(cps / 60));
    for (let i = 0; i < text.length; i += step) {
      if (signal?.aborted) return;
      emit(text.slice(i, i + step));
      await wait(1000 / 60, signal);
    }
  }
}
