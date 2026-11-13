// Tests of the model route with a fake AI binding and a fake upstream. Run: node workers/model-route/test.mjs
import { handle, validateChat, textOf, splitThinking, reasoningOf, neurons, originAllowed, isAllowanceError, cors, LIMITS, DEFAULT_MODEL } from './src/core.js';

let failed = 0, n = 0;
const ok = (name, cond) => { n++; if (!cond) { failed++; console.log('FAIL ' + name); } };
const SITE = 'https://luisblanco.dev';
const post = (path, body, headers = {}) => new Request('https://x.workers.dev' + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE, 'CF-Connecting-IP': '203.0.113.7', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const msgs = [{ role: 'user', content: 'hello' }];
const ai = (impl) => ({ run: impl });
const reply = { response: 'hi there', usage: { prompt_tokens: 800, completion_tokens: 400, total_tokens: 1200 } };

// pure helpers
ok('site origin allowed', originAllowed(SITE) && originAllowed('http://127.0.0.1:8818') && originAllowed('http://localhost:5173'));
ok('other origins refused', !originAllowed('https://evil.example') && !originAllowed('https://luisblanco.dev.evil.example') && !originAllowed(null));
ok('cors never echoes a foreign origin', cors('https://evil.example')['Access-Control-Allow-Origin'] === SITE);
ok('valid chat passes with defaults', (() => { const v = validateChat({ messages: msgs }); return v.ok && v.value.model === DEFAULT_MODEL && v.value.max_tokens === LIMITS.defaultTokens; })());
ok('unknown model falls back to the default', validateChat({ messages: msgs, model: '@cf/other/huge' }).value.model === DEFAULT_MODEL);
ok('max_tokens is clamped', validateChat({ messages: msgs, max_tokens: 99999 }).value.max_tokens === LIMITS.maxTokens);
ok('temperature is clamped', validateChat({ messages: msgs, temperature: 9 }).value.temperature === 1.5);
ok('json mode is carried', validateChat({ messages: msgs, response_format: { type: 'json_object' } }).value.json === true);
ok('empty messages fail', !validateChat({ messages: [] }).ok && !validateChat({}).ok && !validateChat(null).ok);
ok('a tool role fails', !validateChat({ messages: [{ role: 'tool', content: 'x' }] }).ok);
ok('non-string content fails', !validateChat({ messages: [{ role: 'user', content: [{ type: 'text' }] }] }).ok);
ok('too many messages is 413', validateChat({ messages: Array.from({ length: 30 }, () => msgs[0]) }).status === 413);
ok('too many characters is 413', validateChat({ messages: [{ role: 'user', content: 'x'.repeat(LIMITS.maxChars + 1) }] }).status === 413);
ok('extra fields are dropped', (() => { const v = validateChat({ messages: [{ role: 'user', content: 'a', name: 'x' }], tools: [1] }); return !('tools' in v.value) && !('name' in v.value.messages[0]); })());
ok('text from a response string', textOf({ response: 'a' }) === 'a');
ok('text from a response object', textOf({ response: { a: 1 } }) === '{"a":1}');
ok('text from choices', textOf({ choices: [{ message: { content: 'b' } }] }) === 'b');
ok('text from an output array', textOf({ output: [{ content: [{ text: 'c' }, { text: 'd' }] }] }) === 'cd');
ok('text of nothing is empty', textOf(null) === '' && textOf({}) === '');
ok('thinking is split off', (() => { const s = splitThinking('<think>plan</think>\nanswer'); return s.content === 'answer' && s.reasoning === 'plan'; })());
ok('no thinking leaves the text', splitThinking(' plain ').content === 'plain');
ok('neurons for a typical reply on the default model', neurons(DEFAULT_MODEL, reply.usage) === 18.18);
ok('neurons without usage is null', neurons(DEFAULT_MODEL, null) === null);
ok('the platform neuron count wins', neurons(DEFAULT_MODEL, { prompt_tokens: 50, completion_tokens: 65, neurons: 2.2272727 }) === 2.23);
ok('choices win over an empty response string', textOf({ response: '', choices: [{ message: { content: 'b' } }] }) === 'b');
ok('a null content with a response string still reads', textOf({ response: 'r', choices: [{ message: { content: null } }] }) === 'r');
ok('reasoning is read from the message', reasoningOf({ choices: [{ message: { content: 'a', reasoning_content: ' plan ' } }] }) === 'plan' && reasoningOf({}) === '');
ok('allowance errors are recognised', isAllowanceError(new Error('4006: you have used up your daily free allocation of 10,000 neurons')) && !isAllowanceError(new Error('model timed out')));

// the route
const res = async (req, env) => { const r = await handle(req, env); let j = null; try { j = await r.clone().json(); } catch { /* not json */ } return { r, j }; };
{
  const { r } = await res(new Request('https://x.workers.dev/v1/chat/completions', { method: 'OPTIONS', headers: { Origin: SITE } }), {});
  ok('preflight is 204 with the origin', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === SITE);
}
{
  const { r, j } = await res(new Request('https://x.workers.dev/health'), {});
  ok('health answers', r.status === 200 && j.ok && j.models.includes(DEFAULT_MODEL));
}
{
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }, { Origin: 'https://evil.example' }), { AI: ai(async () => reply) });
  ok('a foreign origin is refused', r.status === 403 && j.error.type === 'origin');
}
{
  let seen = null;
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs, temperature: 0.2, response_format: { type: 'json_object' } }), { AI: ai(async (m, input) => { seen = { m, input }; return reply; }) });
  ok('a chat answers in the OpenAI shape', r.status === 200 && j.choices[0].message.content === 'hi there' && j.usage.total_tokens === 1200 && j.neurons === 18.18);
  ok('the model gets the validated input', seen.m === DEFAULT_MODEL && seen.input.max_tokens === LIMITS.defaultTokens && seen.input.temperature === 0.2 && seen.input.response_format.type === 'json_object');
  ok('thinking is switched off on a thinking model', seen.input.chat_template_kwargs.enable_thinking === false);
  ok('the reply is never cached', r.headers.get('Cache-Control') === 'no-store');
}
{
  const { r, j } = await res(post('/v1/chat/completions', '{not json'), { AI: ai(async () => reply) });
  ok('bad JSON is 400', r.status === 400 && j.error.type === 'invalid_request');
}
{
  const { r } = await res(post('/v1/chat/completions', { messages: [{ role: 'user', content: 'x'.repeat(LIMITS.maxBodyBytes) }] }), { AI: ai(async () => reply) });
  ok('an oversized body is 413', r.status === 413);
}
{
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => reply), FREE_LIMIT: { limit: async () => ({ success: false }) } });
  ok('a rate-limited visitor gets 429 with Retry-After', r.status === 429 && j.error.type === 'rate_limit' && r.headers.get('Retry-After') === '60');
}
{
  let key = null;
  await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => reply), FREE_LIMIT: { limit: async (o) => { key = o.key; return { success: true }; } } });
  ok('the limit is keyed by the visitor address', key === '203.0.113.7');
}
{
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => { throw new Error('4006: daily free allocation of 10,000 neurons used'); }) });
  ok('a used-up allowance is 429 daily_allowance', r.status === 429 && j.error.type === 'daily_allowance');
}
{
  let calls = 0;
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs, response_format: { type: 'json_object' } }), { AI: ai(async (m, input) => { calls++; if (input.response_format) throw new Error('JSON mode not supported'); return { response: '{"a":1}' }; }) });
  ok('JSON mode refused by a model is retried without it', r.status === 200 && calls === 2 && j.choices[0].message.content === '{"a":1}');
}
{
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => ({ response: '   ' })) });
  ok('an empty reply is 502', r.status === 502 && j.error.type === 'upstream');
}
{
  const { r } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => { throw new Error('timeout'); }) });
  ok('a model failure is 502', r.status === 502);
}
{
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => ({ response: '<think>hm</think>ok' })) });
  ok('reasoning is separated from the answer', r.status === 200 && j.choices[0].message.content === 'ok' && j.choices[0].message.reasoning === 'hm');
}
{
  let seen = null;
  await res(post('/v1/chat/completions', { messages: msgs, model: '@cf/ibm-granite/granite-4.0-h-micro' }), { AI: ai(async (m, input) => { seen = input; return reply; }) });
  ok('a model that does not think gets no thinking switch', !('chat_template_kwargs' in seen));
}
{
  const shaped = { choices: [{ message: { content: 'the answer', reasoning_content: 'the plan' }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 65, total_tokens: 115, neurons: 2.2272727 } };
  const { r, j } = await res(post('/v1/chat/completions', { messages: msgs }), { AI: ai(async () => shaped) });
  ok('the platform shape is read: content, reasoning and real neurons', r.status === 200 && j.choices[0].message.content === 'the answer' && j.choices[0].message.reasoning === 'the plan' && j.neurons === 2.23);
}
{
  const misfiled = { choices: [{ message: { content: '', reasoning_content: 'Phobos and Deimos.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 8 } };
  const a = await res(post('/v1/chat/completions', { messages: msgs, model: '@cf/qwen/qwen3-30b-a3b-fp8' }), { AI: ai(async () => misfiled) });
  ok('an answer filed under reasoning with thinking off is returned as the answer', a.r.status === 200 && a.j.choices[0].message.content === 'Phobos and Deimos.' && !('reasoning' in a.j.choices[0].message));
  const b = await res(post('/v1/chat/completions', { messages: msgs, model: '@cf/ibm-granite/granite-4.0-h-micro' }), { AI: ai(async () => misfiled) });
  ok('a model that does not think gets no such rescue', b.r.status === 502);
}
// pass-through
const realFetch = globalThis.fetch;
{
  let seen = null;
  globalThis.fetch = async (u, init) => { seen = { u, init }; return new Response('{"choices":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const { r } = await res(post('/v1/passthrough/nvidia/chat/completions', { model: 'm', messages: msgs }, { Authorization: 'Bearer nvapi-test-key-123' }), {});
  ok('pass-through forwards to the provider with the visitor key', r.status === 200 && seen.u === 'https://integrate.api.nvidia.com/v1/chat/completions' && seen.init.headers.Authorization === 'Bearer nvapi-test-key-123');
  ok('pass-through answers with the site origin', r.headers.get('Access-Control-Allow-Origin') === SITE);
  globalThis.fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
  const bad = await res(post('/v1/passthrough/nvidia/chat/completions', { messages: msgs }, { Authorization: 'Bearer nvapi-test-key-123' }), {});
  ok("the provider's own error status comes back", bad.r.status === 401);
  globalThis.fetch = realFetch;
}
{
  const { r, j } = await res(post('/v1/passthrough/nvidia/chat/completions', { messages: msgs }), {});
  ok('pass-through without a key is 401', r.status === 401 && j.error.type === 'no_key');
}
{
  const { r } = await res(post('/v1/passthrough/anywhere/chat/completions', { messages: msgs }, { Authorization: 'Bearer some-long-key-1' }), {});
  ok('an unknown provider is 404, never an open proxy', r.status === 404);
}
{
  const { r } = await res(post('/v1/passthrough/nvidia/chat/completions', { messages: msgs }, { Authorization: 'Bearer some-long-key-1', Origin: 'https://evil.example' }), {});
  ok('pass-through refuses a foreign origin', r.status === 403);
}
{
  const { r } = await res(new Request('https://x.workers.dev/v1/chat/completions', { method: 'GET', headers: { Origin: SITE } }), {});
  ok('GET on the chat route is 405', r.status === 405);
}
{
  const { r } = await res(post('/v1/other', { messages: msgs }), {});
  ok('an unknown path is 404', r.status === 404);
}

console.log(`model-route tests: ${n - failed}/${n}`);
process.exit(failed ? 1 : 0);
