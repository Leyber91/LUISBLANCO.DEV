/* Answer-quality evaluation for the timeline's ask box.
   node labs/assets/js/timeline/tests/eval.mjs            deterministic engine only
   node labs/assets/js/timeline/tests/eval.mjs --ollama   also the local model (http://localhost:11434),
                                                          given exactly the context the page sends
   Writes labs/assets/js/timeline/data/eval.json, which the page reads. Never calls a public route. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const E = await import('../engine.js');
const Q = await import('../qa.js');
E.setData(JSON.parse(readFileSync(join(root, 'data', 'events.json'), 'utf8')));
const { questions } = JSON.parse(readFileSync(join(here, 'questions.json'), 'utf8'));
const withModel = process.argv.includes('--ollama');
const modelName = (process.argv.find((a) => a.startsWith('--model=')) || '--model=llama3.1:8b').slice(8);

const SYSTEM = readFileSync(join(root, 'ask.js'), 'utf8').match(/const SYSTEM = \[([\s\S]*?)\]\.join/)[1]
  .split('\n').map((l) => l.trim()).filter((l) => l.startsWith("'")).map((l) => l.replace(/^'|',?$/g, '').replace(/\\'/g, "'")).join('\n');

function score(item, res) {
  const okRefuse = !!res.refused === !!item.refused;
  const okText = (item.contains || []).every((s) => (res.answer || '').toLowerCase().includes(s.toLowerCase()));
  const okCite = (item.cites || []).every((id) => (res.events || []).includes(id));
  const citeValid = (res.events || []).every((id) => E.byId.has(id) || E.layerById.has(id));
  return { correct: okRefuse && okText && okCite && citeValid, okRefuse, okText, okCite, citeValid };
}

async function modelAnswer(q, det) {
  if (!Q.needsModel(det)) return { ...det, route: 'no call' };
  const ctx = Q.packContext(q, det);
  const t0 = Date.now();
  const r = await fetch('http://localhost:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modelName, stream: false, format: 'json', options: { temperature: 0.2 },
      messages: [{ role: 'system', content: `${SYSTEM}\n${ctx.json}\n\nReply with one JSON object and nothing else.` }, { role: 'user', content: q }] }),
  });
  const j = await r.json();
  let parsed = null;
  try { parsed = JSON.parse(j.message?.content || ''); } catch { /* not JSON */ }
  const v = Q.validateModelReply(parsed, ctx.ids);
  if (!v) return { ...det, route: 'rejected', ms: Date.now() - t0 };
  if (v.refused && !det.refused) return { ...det, route: 'rejected (refused supported)', ms: Date.now() - t0 };
  const claims = Q.checkClaims(v.answer, ctx.json);
  if (!claims.some((c) => c.ok)) return { ...det, route: 'rejected (no supported sentence)', ms: Date.now() - t0 };
  // what the page shows as standing: the supported sentences; struck ones are counted
  return { ...v, answer: claims.filter((c) => c.ok).map((c) => c.text).join(' '), struck: claims.filter((c) => !c.ok).length, route: 'model', ms: Date.now() - t0 };
}

const rows = [];
const runs = [{ route: 'deterministic', correct: 0, refusedOk: 0, citeValid: 0 }];
const mrun = withModel ? { route: 'ollama', model: modelName, policy: 'computed answers never go to the model; retrieval answers are phrased by it and each sentence is checked against the context', correct: 0, refusedOk: 0, citeValid: 0, accepted: 0, rejected: 0, struck: 0 } : null;
if (mrun) runs.push(mrun);
for (const item of questions) {
  const det = Q.deterministicAnswer(item.q);
  const s = score(item, det);
  runs[0].correct += s.correct; runs[0].citeValid += s.citeValid; if (item.type === 'unanswerable' && s.okRefuse) runs[0].refusedOk++;
  const row = { q: item.q, type: item.type, det: { kind: det.kind, correct: s.correct, answer: det.answer.slice(0, 160) } };
  if (mrun) {
    const m = await modelAnswer(item.q, det);
    const ms = score(item, m);
    mrun.correct += ms.correct; mrun.citeValid += ms.citeValid; if (item.type === 'unanswerable' && ms.okRefuse) mrun.refusedOk++;
    if (m.route === 'model') { mrun.accepted++; mrun.struck += m.struck || 0; } else if (String(m.route).startsWith('rejected')) mrun.rejected++;
    row.model = { route: m.route, correct: ms.correct, answer: (m.answer || '').slice(0, 200), ms: m.ms };
  }
  rows.push(row);
  console.log(`${s.correct ? 'ok ' : 'NO '}${row.model ? (row.model.correct ? 'ok ' : 'NO ') : ''}[${item.type}] ${item.q}${s.correct ? '' : `  -> ${det.kind}: ${det.answer.slice(0, 110)}`}${row.model && !row.model.correct ? `  || model(${row.model.route}): ${row.model.answer.slice(0, 110)}` : ''}`);
}
let history = [];
try {
  const old = JSON.parse(readFileSync(join(root, 'data', 'eval.json'), 'utf8'));
  history = old.history || [];
  const om = (old.runs || []).find((r) => r.route !== 'deterministic');
  if (om && !om.policy && !history.some((h) => h.date === old.date && h.correct === om.correct)) history.push({ date: old.date, model: om.model, correct: om.correct, questions: old.questions, policy: 'the model phrased every answer, computed ones included' });
} catch { /* first run */ }
const out = {
  date: new Date().toISOString().slice(0, 10), questions: questions.length, history: withModel ? history : history,
  unanswerable: questions.filter((q) => q.type === 'unanswerable').length,
  runs, rows,
};
writeFileSync(join(root, 'data', 'eval.json'), JSON.stringify(out, null, 1) + '\n');
for (const r of runs) console.log(`${r.route}${r.model ? ` (${r.model})` : ''}: ${r.correct}/${questions.length} correct, ${r.refusedOk}/${out.unanswerable} unanswerable refused, ${r.citeValid}/${questions.length} with valid citations${r.accepted != null ? `, model accepted ${r.accepted}, rejected ${r.rejected}, sentences struck ${r.struck}` : ''}`);
