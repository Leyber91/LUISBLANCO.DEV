// The labs' model route: an OpenAI-compatible chat endpoint for visitors who have no key of their own, served by
// Workers AI on its free daily allowance, plus a pass-through for the providers whose APIs refuse browser calls.
//
// Nothing here stores or logs a request: no body, no header, no key. Observability is off in wrangler.toml.
// Pure helpers are exported for test.mjs; handle() is the only part that touches the network.

// Workers AI prices in neurons per million tokens, read from developers.cloudflare.com/workers-ai/platform/pricing
// on 2026-11-13. The free allowance is 10,000 neurons a day; past it, calls fail and this route answers 429.
export const MODELS = {
  '@cf/google/gemma-4-26b-a4b-it': { in: 9091, out: 27273 },
  '@cf/qwen/qwen3-30b-a3b-fp8': { in: 4625, out: 30475 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { in: 4119, out: 34868 },
  '@cf/ibm-granite/granite-4.0-h-micro': { in: 1542, out: 10158 },
};
export const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
// Models that think before answering. Measured 2026-11-13 on one two-sentence physics question: Gemma 4 with
// thinking took 12 to 33 s and 17 to 33 neurons and returned nothing inside 600 tokens; with thinking off it
// answered correctly in 2.1 s for 2.2 neurons. A lab reply has to arrive in seconds, so thinking is off here.
export const THINKERS = new Set(['@cf/google/gemma-4-26b-a4b-it', '@cf/qwen/qwen3-30b-a3b-fp8']);

// Providers whose APIs answered a browser preflight from the site with no CORS headers (measured 2026-11-13).
// The visitor's own key rides in the Authorization header for the length of one request and goes nowhere else.
export const PASSTHROUGH = {
  nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
  sambanova: 'https://api.sambanova.ai/v1/chat/completions',
  github: 'https://models.github.ai/inference/chat/completions',
};

// A lab batches its stages into one JSON reply, so the reply may be long; only generated tokens cost neurons.
export const LIMITS = { maxBodyBytes: 48_000, maxMessages: 24, maxChars: 32_000, maxTokens: 1600, defaultTokens: 1000 };

const SITE = ['https://luisblanco.dev', 'https://www.luisblanco.dev'];
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{2,5})?$/;
export const originAllowed = (origin) => typeof origin === 'string' && (SITE.includes(origin) || LOCAL.test(origin));

export function cors(origin) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin) ? origin : SITE[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const ROLES = new Set(['system', 'user', 'assistant']);

// returns {ok: true, value} or {ok: false, status, message}
export function validateChat(body) {
  const bad = (message, status = 400) => ({ ok: false, status, message });
  if (!body || typeof body !== 'object' || Array.isArray(body)) return bad('the body must be a JSON object');
  const { messages } = body;
  if (!Array.isArray(messages) || !messages.length) return bad('messages must be a non-empty array');
  if (messages.length > LIMITS.maxMessages) return bad(`at most ${LIMITS.maxMessages} messages`, 413);
  let chars = 0;
  for (const m of messages) {
    if (!m || !ROLES.has(m.role) || typeof m.content !== 'string') return bad('each message needs a role (system, user, assistant) and a string content');
    chars += m.content.length;
  }
  if (chars > LIMITS.maxChars) return bad(`at most ${LIMITS.maxChars} characters across the messages`, 413);
  const model = Object.hasOwn(MODELS, body.model) ? body.model : DEFAULT_MODEL;
  const want = Number.isFinite(body.max_tokens) ? body.max_tokens : LIMITS.defaultTokens;
  const max_tokens = Math.max(16, Math.min(LIMITS.maxTokens, Math.floor(want)));
  const value = { model, max_tokens, messages: messages.map((m) => ({ role: m.role, content: m.content })) };
  if (Number.isFinite(body.temperature)) value.temperature = Math.max(0, Math.min(1.5, body.temperature));
  if (Number.isInteger(body.seed)) value.seed = body.seed;
  if (body.response_format && body.response_format.type === 'json_object') value.json = true;
  return { ok: true, value };
}

// Workers AI answers in more than one shape depending on the model; take the text wherever it is.
export function textOf(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  const msg = result.choices && result.choices[0] && result.choices[0].message;
  if (msg && typeof msg.content === 'string' && msg.content.trim()) return msg.content;
  if (typeof result.response === 'string') return result.response;
  if (result.response && typeof result.response === 'object') return JSON.stringify(result.response);
  if (typeof result.output_text === 'string') return result.output_text;
  if (Array.isArray(result.output)) {
    return result.output.flatMap((o) => (Array.isArray(o.content) ? o.content : [])).map((c) => c.text || '').join('');
  }
  return '';
}

// A reasoning model may put its thinking in <think> tags; the visitor gets the answer, the lab may show the rest.
export function splitThinking(text) {
  const m = /<think>([\s\S]*?)<\/think>/i.exec(text);
  if (!m) return { content: text.trim(), reasoning: '' };
  return { content: text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(), reasoning: m[1].trim() };
}

// what the model thought, when the platform returns it apart from the answer
export function reasoningOf(result) {
  const msg = result && result.choices && result.choices[0] && result.choices[0].message;
  const r = msg && (msg.reasoning_content || msg.reasoning);
  return typeof r === 'string' ? r.trim() : '';
}

// the platform reports the neurons a call cost; the price table is the fallback
export function neurons(model, usage) {
  if (usage && Number.isFinite(usage.neurons)) return Math.round(usage.neurons * 100) / 100;
  const p = MODELS[model];
  if (!p || !usage) return null;
  const n = ((usage.prompt_tokens || 0) * p.in + (usage.completion_tokens || 0) * p.out) / 1e6;
  return Math.round(n * 100) / 100;
}

export function isAllowanceError(err) {
  const s = String((err && err.message) || err || '');
  return /4006|daily free allocation|neurons?.*(exceed|used|limit)|allocation.*(exceed|used)/i.test(s);
}

const json = (status, obj, origin, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(origin), ...extra },
});
const fail = (status, type, message, origin, extra) => json(status, { error: { type, message } }, origin, extra);

async function limited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return false;   // absent in tests and local runs
  const { success } = await binding.limit({ key });
  return !success;
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > LIMITS.maxBodyBytes) return { tooLarge: true };
  try { return { body: JSON.parse(raw) }; } catch { return { invalid: true }; }
}

async function chat(request, env, origin, ip) {
  if (await limited(env.FREE_LIMIT, ip)) return fail(429, 'rate_limit', 'This route answers a few requests a minute per visitor. Connect your own AI for full speed.', origin, { 'Retry-After': '60' });
  const { body, tooLarge, invalid } = await readBody(request);
  if (tooLarge) return fail(413, 'too_large', 'The request is too large for this route.', origin);
  if (invalid) return fail(400, 'invalid_request', 'The body is not valid JSON.', origin);
  const v = validateChat(body);
  if (!v.ok) return fail(v.status, 'invalid_request', v.message, origin);
  const { model, messages, max_tokens, temperature, seed, json: wantJson } = v.value;
  const input = { messages, max_tokens };
  if (temperature != null) input.temperature = temperature;
  if (seed != null) input.seed = seed;
  if (wantJson) input.response_format = { type: 'json_object' };
  if (THINKERS.has(model)) input.chat_template_kwargs = { enable_thinking: false };
  let result;
  try {
    result = await env.AI.run(model, input);
  } catch (err) {
    if (isAllowanceError(err)) return fail(429, 'daily_allowance', "Today's shared allowance on this route is used up. It resets at 00:00 UTC. Connect your own AI to keep going.", origin, { 'Retry-After': '3600' });
    if (wantJson) {
      // some models reject JSON mode; the lab validates and repairs the reply itself
      try { delete input.response_format; result = await env.AI.run(model, input); }
      catch (err2) {
        if (isAllowanceError(err2)) return fail(429, 'daily_allowance', "Today's shared allowance on this route is used up. It resets at 00:00 UTC.", origin, { 'Retry-After': '3600' });
        return fail(502, 'upstream', 'The model did not answer.', origin);
      }
    } else return fail(502, 'upstream', 'The model did not answer.', origin);
  }
  const split = splitThinking(textOf(result));
  let content = split.content;
  let reasoning = split.reasoning || reasoningOf(result);
  // with thinking off, some models still file the whole answer under reasoning (measured on Qwen3, 2026-11-13)
  if (!content && reasoning && THINKERS.has(model)) { content = reasoning; reasoning = ''; }
  if (!content) return fail(502, 'upstream', 'The model returned an empty reply.', origin);
  const u = (result && result.usage) || null;
  const usage = u ? { prompt_tokens: u.prompt_tokens ?? null, completion_tokens: u.completion_tokens ?? null, total_tokens: u.total_tokens ?? null } : null;
  const cost = neurons(model, u);
  return json(200, {
    id: 'labs-' + crypto.randomUUID(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content, ...(reasoning ? { reasoning } : {}) }, finish_reason: 'stop' }],
    usage, neurons: cost,
  }, origin);
}

async function passthrough(request, env, origin, ip, provider) {
  const upstream = PASSTHROUGH[provider];
  if (!upstream) return fail(404, 'not_found', 'Unknown provider.', origin);
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer \S{8,}$/.test(auth)) return fail(401, 'no_key', 'This provider needs your own key.', origin);
  if (await limited(env.PASS_LIMIT, ip)) return fail(429, 'rate_limit', 'Too many requests in a minute.', origin, { 'Retry-After': '60' });
  const raw = await request.text();
  if (raw.length > 4 * LIMITS.maxBodyBytes) return fail(413, 'too_large', 'The request is too large.', origin);
  let res;
  try {
    res = await fetch(upstream, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: raw });
  } catch { return fail(502, 'upstream', 'The provider did not answer.', origin); }
  // the provider's own status and body go back unchanged, so its rate-limit and key errors stay legible
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store', ...cors(origin) } });
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, { ok: true, default_model: DEFAULT_MODEL, models: Object.keys(MODELS), passthrough: Object.keys(PASSTHROUGH), limits: LIMITS }, origin);
  }
  if (request.method !== 'POST') return fail(405, 'method', 'POST only.', origin);
  // browsers send Origin; anything else is not a visitor of the site
  if (!originAllowed(origin)) return fail(403, 'origin', 'This route serves luisblanco.dev.', origin);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (url.pathname === '/v1/chat/completions') return chat(request, env, origin, ip);
  const m = /^\/v1\/passthrough\/([a-z]+)\/chat\/completions$/.exec(url.pathname);
  if (m) return passthrough(request, env, origin, ip, m[1]);
  return fail(404, 'not_found', 'No such route.', origin);
}
