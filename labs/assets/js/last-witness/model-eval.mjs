/* ============================================================
   last-witness/model-eval.mjs — what a model adds over the engine,
   measured on a fixed set of 20 visitor lines.

   Run from the repository root with Ollama on this machine:
     node labs/assets/js/last-witness/model-eval.mjs [model]
   Default model: llama3.1:8b. Writes model-eval.json beside this file.

   For each line the engine plans the turn (same seed, same order).
   Every line is then sent to the model, heavy or not, with the same
   prompt the page uses, and the reply goes through the page's own
   validator. Reported per run:
     voiced    replies the validator accepted
     refused   replies it rejected, by reason
     intent    share of replies whose stated intent equals the engine's
   The engine-only mode passes by construction: its replies are the
   validator's reference. The page calls the model only on heavy turns.
   ============================================================ */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as P from './physics.js';
import { buildWorld } from './world.js';
import { Mind } from './mind.js';

const MODEL = process.argv[2] || 'llama3.1:8b';
const QUESTIONS = [
  'hello?', 'who are you', 'how long was I gone?', 'it felt like a few hours', 'what is that bright line?',
  'are you lonely?', 'what happened while I was gone?', 'what did my heartbeat become?', 'did you ever answer me?',
  'what do the stars look like now?', 'Tell them the sky down here is full of light. I will be home before the tea goes cold.',
  'I went because I wanted to see the light bend', 'what did they call the pulse?', 'what happened to the people?',
  'that must have been lonely', 'did they know it was me?', 'why are you still awake?', 'what is the noise burst in my log?',
  'what is the weather like down there today?', 'what should I do now?',
];

async function ask(req) {
  const r = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: false, format: 'json', options: { temperature: 0.6, seed: 7, num_ctx: 8192 },
      messages: [{ role: 'system', content: req.system + '\n\nReply with one JSON object and nothing else.' }, { role: 'user', content: req.prompt }] }),
  });
  if (!r.ok) throw new Error('http ' + r.status);
  const j = await r.json();
  return j.message?.content || '';
}

const plan = { ...P.planOrbit({ mSun: 4e6, delta: 1e-20, stayS: 10 ** 4.67, bodyL: 2, craftKg: 1e5 }), mSun: 4e6, delta: 1e-20 };
const world = buildWorld(plan, 'Tell them the sky down here is full of light. I will be home before the tea goes cold.');
const mind = new Mind(world);
mind.opening();
const history = [];
const rows = [];
for (const q of QUESTIONS) {
  const p = mind.respond(q);
  history.push({ who: 'you', text: q });
  const t0 = Date.now();
  let raw = '', json = null, v = { ok: false, why: 'no reply' };
  try {
    raw = await ask(mind.modelRequest(p, q, history));
    try { json = JSON.parse(raw); } catch { json = null; }
    v = mind.validate(json, p, q);
  } catch (e) { v = { ok: false, why: 'route: ' + e.message }; }
  const row = { q, engineIntent: p.intent, level: p.level, heavy: p.weight >= 2, modelIntent: json?.intent ?? null, trustDelta: json?.trust_delta ?? null,
    ok: v.ok, why: v.ok ? '' : v.why, ms: Date.now() - t0, reply: (json?.reply || raw).slice(0, 300) };
  rows.push(row);
  history.push({ who: 'tally', text: v.ok ? v.text : p.text });
  console.log(`${row.ok ? 'VOICED ' : 'REFUSED'} ${String(row.ms).padStart(6)} ms  ${q.slice(0, 40).padEnd(40)} engine=${row.engineIntent} model=${row.modelIntent} ${row.why}`);
}
const voiced = rows.filter((r) => r.ok).length;
const why = {};
rows.filter((r) => !r.ok).forEach((r) => { const k = r.why.split(':')[0]; why[k] = (why[k] || 0) + 1; });
const intentMatch = rows.filter((r) => r.modelIntent === r.engineIntent).length;
const out = {
  measured: new Date().toISOString(), model: MODEL, route: 'ollama (local)', questions: rows.length, validator: 'clock-roles',
  model_mode: { voiced, refused: rows.length - voiced, refused_by_reason: why, intent_matches_engine: intentMatch, heavy_turns: rows.filter((r) => r.heavy).length },
  engine_mode: { voiced: rows.length, refused: 0, note: 'the engine reply is the validator reference, so it passes by construction' },
  rows,
};
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'model-eval.json'), JSON.stringify(out, null, 2));
console.log(`\n${MODEL}: ${voiced}/${rows.length} voiced, ${rows.length - voiced} refused ${JSON.stringify(why)}, intent agrees with the engine on ${intentMatch}/${rows.length}`);
