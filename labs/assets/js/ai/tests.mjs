/* ============================================================
   ai/tests.mjs — where a prompt may go.

     node labs/assets/js/ai/tests.mjs

   The model route (llm.js) offers a prompt to routes in order.
   The rule under test: a route the visitor set up themselves, a
   local model or their own key, is never followed by one they
   did not. Every case counts the requests the page would make
   and reads the address of each, with fetch replaced by a
   recorder, so nothing here reaches a network.
   ============================================================ */

const calls = [];
let answer = () => ({ status: 500, body: {} });
globalThis.fetch = async (url, init = {}) => {
  const call = { url: String(url), auth: init.headers?.Authorization || '', body: init.body ? JSON.parse(init.body) : null };
  calls.push(call);
  const a = answer(call);
  if (a instanceof Error) throw a;
  return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };

const { LLM } = await import('./llm.js');
const { AI_CONFIG } = await import('./config.js');

let passed = 0;
const fails = [];
const ok = (cond, msg) => { if (cond) passed++; else fails.push(msg); };

const OWN = 'https://own.example.test/v1';
const WORKER = AI_CONFIG.route.base;
const PUBLIC = 'https://text.pollinations.ai';
const reply = (text) => ({ status: 200, body: { model: 'm', choices: [{ message: { content: text } }] } });
const hosts = () => calls.map((c) => new URL(c.url).origin);
const said = (c) => JSON.stringify(c.body?.messages || []);
const start = (fn) => { calls.length = 0; answer = fn; };
const PROMPT = 'what the visitor typed';

/* ---------------- the order itself ---------------- */
await LLM.clearOwnKey();
ok(JSON.stringify(LLM._chain('worker')) === '["worker","pollinations"]' && JSON.stringify(LLM._chain('pollinations')) === '["pollinations"]', 'without a key the labs\' route is followed by the public route, and the public route by nothing');
ok(JSON.stringify(LLM._chain('ollama')) === '["ollama"]', 'a local model is asked alone');
ok(LLM._private('ollama') && LLM._private('own-key') && !LLM._private('worker') && !LLM._private('pollinations'), 'a local model and an own key are the visitor\'s routes; the other two are not');
await LLM.setOwnKey({ base: OWN + '/', key: 'k-test', model: 'own-model' });
ok(JSON.stringify(LLM._chain('own-key')) === '["own-key"]', 'an own key is asked alone');
ok(JSON.stringify(LLM._chain('ollama')) === '["ollama","own-key"]', 'a local model is followed by the visitor\'s own key and by nothing else');
ok(LLM.ownKey().base === OWN, 'the address is kept without its trailing slash');

/* ---------------- a visitor's own key ---------------- */
let label = '';
LLM.onStatus((s) => { label = s.label; });

start(() => reply('from my provider'));
let r = await LLM.complete({ prompt: PROMPT, fallback: () => 'the lab\'s own answer', maxWaitMs: 0 });
ok(r.source === 'own-key' && r.text === 'from my provider' && calls.length === 1, `an own key that answers is the only request (${calls.length})`);
ok(calls[0].url === OWN + '/chat/completions' && calls[0].auth === 'Bearer k-test' && said(calls[0]).includes(PROMPT) && calls[0].body.model === 'own-model', 'it goes to the address the visitor entered, with their key and their model');

for (const [name, fn, err] of [
  ['answers with an error', () => ({ status: 500, body: {} }), /own-key: http 500/],
  ['refuses the key', () => ({ status: 401, body: {} }), /own-key: http 401/],
  ['cannot be reached', () => new Error('network down'), /own-key: network down/],
  ['answers with nothing', () => reply('   '), /own-key: empty reply/],
]) {
  start(fn);
  r = await LLM.complete({ prompt: PROMPT, fallback: () => 'the lab\'s own answer', maxWaitMs: 0 });
  ok(r.source === 'offline' && r.text === 'the lab\'s own answer', `when the visitor's address ${name}, the lab's own engine answers`);
  ok(calls.length === 1 && hosts()[0] === new URL(OWN).origin, `and the prompt went to that address only (${hosts().join(', ')})`);
  ok(err.test(r.errors.join('; ')) && /the prompt went nowhere else/.test(label), `the route control says why and that nothing went elsewhere: ${label}`);
}

start(() => reply('this is not json'));
r = await LLM.complete({ prompt: PROMPT, json: true, fallback: () => ({ from: 'engine' }), maxWaitMs: 0 });
ok(r.source === 'offline' && r.json.from === 'engine' && calls.length === 1, 'a reply that is not the JSON a lab asked for is a failure of that route, and still goes nowhere else');

start(() => ({ status: 500, body: {} }));
let thrown = null;
try { await LLM.complete({ prompt: PROMPT, maxWaitMs: 0 }); } catch (e) { thrown = e; }
ok(thrown && thrown.name === 'LLMUnavailable' && calls.length === 1 && /no fallback given; the prompt went nowhere else/.test(label), 'with no fallback the call fails, after one request, and says the same');

start(() => reply('from my provider'));
r = await LLM.complete({ prompt: PROMPT, model: 'another-model', fallback: () => 'x', maxWaitMs: 0 });
ok(calls.length === 1 && calls[0].body.model === 'another-model', 'a lab may name a model for one call; it still goes to the visitor\'s address');

/* ---------------- no key: the public order is as it was ---------------- */
await LLM.clearOwnKey();
ok(LLM.ownKey() === null && !mem.has('lb.llm.ownkey'), 'forgetting the key removes it from the browser');

start((c) => (c.url.startsWith(WORKER) ? reply('from the labs\' route') : reply('from the public route')));
r = await LLM.complete({ prompt: PROMPT, fallback: () => 'x', maxWaitMs: 0 });
ok(r.source === 'worker' && calls.length === 1 && calls[0].url === WORKER + '/v1/chat/completions' && calls[0].auth === '', 'without a key the labs\' own route is asked first, with no key');

start((c) => (c.url.startsWith(WORKER) ? { status: 429, body: {} } : reply('from the public route')));
r = await LLM.complete({ prompt: PROMPT, fallback: () => 'x', maxWaitMs: 0 });
ok(r.source === 'pollinations' && calls.length === 2 && hosts()[0] === new URL(WORKER).origin && hosts()[1] === PUBLIC, `when it does not answer the public route is asked (${hosts().join(', ')})`);
ok(said(calls[1]).includes(PROMPT), 'and the prompt goes there, which the privacy page says');

start(() => ({ status: 500, body: {} }));
r = await LLM.complete({ prompt: PROMPT, fallback: () => 'the lab\'s own answer', maxWaitMs: 0 });
ok(r.source === 'offline' && !/went nowhere else/.test(label), `when neither public route answers the engine answers, and the control does not claim the prompt stayed: ${label}`);

if (fails.length) { console.log(`ai tests: ${passed} passed, ${fails.length} FAILED`); for (const f of fails) console.log('  ' + f); process.exit(1); }
console.log(`ai tests: ${passed} passed, 0 failed`);
