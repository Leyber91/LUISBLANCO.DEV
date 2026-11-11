/* ============================================================
   token-ekg/engine/routes/openai-sse.js — route adapter: any
   OpenAI-compatible POST /chat/completions with stream: true
   (server-sent events). Same record() shape as ollama.js.

   Used for the visitor's own key (the base, model and key they saved
   in the route panel; the key goes only to that base) and for Ollama's
   own OpenAI-compatible endpoint at /v1, which lets the page compare
   the two framings of one server.

   Timing semantics differ from Ollama's NDJSON: an SSE "chunk" is
   whatever the server flushed in one event, and a proxy may batch
   several events into one read. analyze() marks intervals under
   ANALYSIS.BUFFER_MS as buffered and keeps them out of the rate.
   Server counters: the usage object, when the server sends it
   (stream_options.include_usage). No durations are reported by this
   protocol, so there is no server-side rate to cross-check.
   ============================================================ */

export const ROUTE = { id: 'openai-compat', label: 'OpenAI-compatible /chat/completions (SSE)', path: '/chat/completions' };

const r2 = (x) => Math.round(x * 100) / 100;
// a 200 response that carries a notice instead of model tokens
export const NOTICE_RE = /reached its budget|raise the key budget|free limit reached|add usage credits|rate limit/i;

export async function record(o) {
  const clock = o.clock || (() => performance.now());
  const body = {
    model: o.model,
    messages: o.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(o.options?.temperature != null ? { temperature: o.options.temperature } : {}),
    ...(o.options?.num_predict != null ? { max_tokens: o.options.num_predict } : {}),
    ...(o.options?.seed != null ? { seed: o.options.seed } : {}),
  };
  const t0 = clock();
  const res = await fetch(o.base.replace(/\/+$/, '') + ROUTE.path, {
    method: 'POST', signal: o.signal,
    headers: { 'Content-Type': 'application/json', ...(o.key ? { Authorization: 'Bearer ' + o.key } : {}) },
    body: JSON.stringify(body),
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
  let buf = '', reads = 0, coalesced = 0, usage = null, model = o.model, tDone = null, finish = '', sawData = false, sample = '';

  const take = (line, t, counter) => {
    const L = line.trim();
    if (!sample && L) sample = L.slice(0, 120);
    if (!L.startsWith('data:')) return;
    sawData = true;
    const p = L.slice(5).trim();
    if (!p) return;
    if (p === '[DONE]') { tDone = t; return; }
    let j;
    try { j = JSON.parse(p); } catch { return; }
    if (j.error) throw new Error(String(j.error.message || j.error));
    if (j.model) model = j.model;
    if (j.usage) usage = j.usage;
    const ch = j.choices?.[0];
    if (ch?.finish_reason) finish = ch.finish_reason;
    const d = ch?.delta || {};
    const th = d.reasoning_content || d.reasoning || '';
    const ct = d.content || '';
    if (!th && !ct) return;
    counter.n++;
    const c = { t: r2(t), kind: th ? 't' : 'a', text: th ? th + ct : ct };
    chunks.push(c);
    o.onChunk?.(c, chunks);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const t = clock() - t0;
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
  if (tDone == null) tDone = clock() - t0;
  if (!sawData) throw new Error(`the body was not server-sent events${sample ? ': ' + sample : ''}`);

  const text = chunks.map((c) => c.text).join('');
  handler.sort((a, b) => a - b);
  return {
    model, think: null, options: o.options || {},
    tHeaders: r2(tHeaders), tDone: r2(tDone), reads, coalesced, chunks, final: null, usage, finish,
    notice: text.length < 600 && NOTICE_RE.test(text) ? text.slice(0, 160) : '',
    handlerMs: handler.length ? { median: handler[handler.length >> 1], max: handler[handler.length - 1] } : null,
  };
}
