/* ============================================================
   token-ekg/engine/routes/ollama.js — route adapter: Ollama's
   native streaming chat (POST /api/chat, stream: true, NDJSON).

   Every route adapter exports the same record() shape:
     record({ base, model, messages, options, think, key, signal,
              clock, onChunk, onHeaders }) -> raw trace
   so the page and record-traces.mjs call any route the same way,
   and a new route is one new file in this folder.

   What is measured, and what is not:
   - t is when the reader handed us the bytes, on clock() (default
     performance.now()), in ms since the request was sent. Network,
     HTTP framing and the event loop sit between the server writing a
     line and this stamp. On localhost that gap is small; never zero.
   - Ollama writes one JSON line per generated token. Lines that
     arrive in one read share a timestamp ("coalesced").
   - The final line carries the server's own counters (eval_count,
     eval_duration, prompt_eval_*, load_duration, total_duration,
     durations in nanoseconds), kept untouched for the cross-check.
   - handler: the time this code spends per read (parse + callback),
     so the page can state its own overhead.
   Isomorphic: runs in the browser and under Node 18+.
   ============================================================ */

export const ROUTE = { id: 'ollama-local', label: 'Ollama /api/chat (NDJSON)', path: '/api/chat' };

const FINAL_KEYS = ['done_reason', 'total_duration', 'load_duration', 'prompt_eval_count', 'prompt_eval_cached_count',
  'prompt_eval_duration', 'eval_count', 'eval_duration'];
const r2 = (x) => Math.round(x * 100) / 100;

export async function record(o) {
  const clock = o.clock || (() => performance.now());
  const body = {
    model: o.model,
    messages: o.messages,
    stream: true,
    ...(o.think != null ? { think: !!o.think } : {}),
    ...(o.options ? { options: o.options } : {}),
  };
  const t0 = clock();
  const res = await fetch(o.base.replace(/\/+$/, '') + ROUTE.path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: o.signal,
  });
  const tHeaders = clock() - t0;
  if (!res.ok || !res.body) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 160); } catch { /* no body */ }
    throw new Error(`http ${res.status}${detail ? ': ' + detail : ''}`);
  }
  o.onHeaders?.(tHeaders);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const chunks = [], handler = [];
  let buf = '', reads = 0, coalesced = 0, final = null, tDone = null, model = o.model;

  const take = (line, t, counter) => {
    if (!line.trim()) return;
    let j;
    try { j = JSON.parse(line); } catch { return; }
    if (j.error) throw new Error(String(j.error));
    if (j.model) model = j.model;
    if (j.done) {
      final = {};
      for (const k of FINAL_KEYS) if (j[k] != null) final[k] = j[k];
      tDone = t;
      return;
    }
    const th = j.message?.thinking || '';
    const ct = j.message?.content || '';
    if (!th && !ct) return;
    counter.n++;
    const c = { t: r2(t), kind: th ? 't' : 'a', text: th ? th + ct : ct };
    chunks.push(c);
    o.onChunk?.(c, chunks);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const t = clock() - t0;          // stamp first, before any parsing or drawing
    reads++;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    const counter = { n: 0 };
    for (const line of lines) take(line, t, counter);
    if (counter.n > 1) coalesced += counter.n - 1;
    handler.push(clock() - t0 - t);
  }
  if (buf.trim()) take(buf, clock() - t0, { n: 0 });

  handler.sort((a, b) => a - b);
  return {
    model, think: o.think ?? null, options: o.options || {},
    tHeaders: r2(tHeaders), tDone: tDone == null ? null : r2(tDone), reads, coalesced, chunks, final, usage: null,
    handlerMs: handler.length ? { median: handler[handler.length >> 1], max: handler[handler.length - 1] } : null,
  };
}

/** The models an Ollama server can stream chat from (no embedding-only, no remote ":cloud" models). */
export async function listModels(base, signal) {
  const r = await fetch(base.replace(/\/+$/, '') + '/api/tags', { signal, cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  return (j.models || [])
    .filter((m) => !/(:|-)cloud$/.test(m.name))
    .filter((m) => !m.capabilities || m.capabilities.includes('completion'))
    .map((m) => ({
      name: m.name,
      params: m.details?.parameter_size || '',
      quant: m.details?.quantization_level || '',
      family: m.details?.family || '',
      bytes: m.size || 0,
      thinking: Array.isArray(m.capabilities) ? m.capabilities.includes('thinking') : false,
    }));
}

/** Which models the server holds in memory, and where. */
export async function resident(base) {
  const r = await fetch(base.replace(/\/+$/, '') + '/api/ps', { cache: 'no-store' });
  if (!r.ok) return [];
  return ((await r.json()).models || []).map((m) => ({ name: m.name, size: m.size, sizeVram: m.size_vram, contextLength: m.context_length }));
}

// kept for record-traces.mjs and older imports
export const recordOllamaStream = record;
export const listOllamaModels = listModels;
