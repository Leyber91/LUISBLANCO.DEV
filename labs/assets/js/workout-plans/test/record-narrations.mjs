/* ============================================================
   test/record-narrations.mjs — records real model narrations for
   the claim-checker test. Run from the repo root with a local
   Ollama:  node labs/assets/js/workout-plans/test/record-narrations.mjs [model]
   Writes test/narrations.json: for 10 plans (varied inputs and
   logged weeks), the exact prompt PlanService sends and the raw
   reply. narration.test.mjs re-checks them offline.
   ============================================================ */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPlan, replan } from '../Planner.js';
import { allDecisions, planExerciseNames } from '../LocalCoach.js';
import { NARRATE_SYSTEM, NARRATE_USER } from '../constants.js';
import { CASES } from './cases.mjs';

const MODEL = process.argv[2] || 'llama3.1:8b';
const out = [];
for (const c of CASES) {
  const plan = buildPlan(c.inputs);
  const lived = replan(plan, c.log);
  const log = allDecisions(plan, lived).map((d) => ({ id: d.id, text: d.text, nums: d.nums }));
  const messages = [
    { role: 'system', content: NARRATE_SYSTEM + '\n\nReply with one JSON object and nothing else.' },
    { role: 'user', content: NARRATE_USER(plan.summary, log) },
  ];
  const t0 = Date.now();
  let reply = '';
  try {
    const r = await fetch('http://localhost:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, stream: false, format: 'json', options: { temperature: 0.3 } }),
    });
    reply = (await r.json()).message?.content || '';
  } catch (e) { reply = 'ERROR ' + e.message; }
  const decisions = allDecisions(plan, lived).map(({ id, text, say, nums }) => ({ id, text, say, nums }));
  out.push({ name: c.name, inputs: c.inputs, log: c.log, model: MODEL, ms: Date.now() - t0, decisions, planNames: planExerciseNames(plan, lived), reply });
  console.log(c.name, Math.round((Date.now() - t0) / 1000) + ' s', reply.slice(0, 80).replace(/\n/g, ' '));
}
writeFileSync(fileURLToPath(new URL('./narrations.json', import.meta.url)), JSON.stringify({ recorded: new Date().toISOString(), model: MODEL, cases: out }, null, 1));
