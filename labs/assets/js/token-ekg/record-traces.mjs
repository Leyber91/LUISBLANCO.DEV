/* ============================================================
   token-ekg/record-traces.mjs — how data/traces.json was made.

   Runs under Node 18+ on a machine with Ollama on localhost:11434:
     node labs/assets/js/token-ekg/record-traces.mjs [plan.json] > traces.raw.json

   It calls the same recordOllamaStream() the page runs in the browser
   (engine/routes/ollama.js), so a recording and a live trace come from one
   parser and one clock rule. Each run notes which models were resident
   on the server when it started, because a shared machine is a confound:
   another process using the GPU changes the cadence.

   The plan is a list of runs:
     [{ id, label, model, prompt: 'short'|'long', think, options, warm: true|false, warmup, repeat: 1,
        contend: { prompt, leadMs } }]
   warm:false unloads the model first (keep_alive 0), so load time lands
   in the time to first token. Not part of the page; kept for reproducibility.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { recordOllamaStream } from './engine/routes/ollama.js';
import { OLLAMA, PROMPTS, longContext } from './config.js';

const base = OLLAMA.base;
const UDHR_XML = 'https://raw.githubusercontent.com/eric-muller/udhr/588b3f4b2d0467aff54842a4b926551b69d5a66a/data/udhr/udhr_eng.xml';

const DEFAULT_PLAN = [
  { id: 'llama-short', label: 'llama3.1:8b, short answer', model: 'llama3.1:8b', prompt: 'short', options: { temperature: 0.7, seed: 11 }, warm: true },
];

async function json(path, body) {
  const r = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(path + ' http ' + r.status);
  return r.json();
}

async function udhrEnglish() {
  const xml = await (await fetch(UDHR_XML)).text();
  // every <para> in document order, tags stripped; titles kept as headings
  const out = [];
  const re = /<(title|para)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  return out.join('\n');
}

const plan = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : DEFAULT_PLAN;
const version = (await json('/api/version')).version;
const tags = (await json('/api/tags')).models;
const doc = plan.some((p) => p.prompt === 'long') ? await udhrEnglish() : '';
const results = [];

for (const run of plan) {
  const meta = tags.find((t) => t.name === run.model)?.details || {};
  const prompt = run.prompt === 'long' ? longContext(doc, PROMPTS.long.text) : PROMPTS[run.prompt].text;
  if (run.warm === false) {
    await json('/api/generate', { model: run.model, keep_alive: 0 });
    await new Promise((r) => setTimeout(r, 1500));
  } else if (run.warmup) {
    // load the model with these options first, on a different prompt, so load time is not in the trace
    await json('/api/chat', { model: run.model, stream: false, messages: [{ role: 'user', content: 'Say ready.' }], options: run.options, ...(run.think != null ? { think: run.think } : {}) });
  }
  for (let i = 0; i < (run.repeat || 1); i++) {
    const resident = ((await json('/api/ps')).models || []).map((m) => m.name);
    const options = run.repeat > 1 ? { ...run.options, seed: (run.options?.seed ?? 1) + i } : run.options;
    const started = new Date().toISOString();
    // contend: a second, non-streamed request to the same server, started leadMs before the measured one,
    // so the trace shows what a shared GPU does to a stream. Its start and end are kept on the same clock.
    let bg = null;
    if (run.contend) {
      const b0 = performance.now();
      bg = { model: run.model, b0, end: null, evalCount: null };
      bg.done = fetch(base + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: run.model, stream: false, messages: [{ role: 'user', content: run.contend.prompt }], options }) })
        .then((r) => r.json()).then((j) => { bg.end = performance.now(); bg.evalCount = j.eval_count ?? null; });
      await new Promise((r) => setTimeout(r, run.contend.leadMs || 0));
    }
    const tStart = performance.now();
    const raw = await recordOllamaStream({ base, model: run.model, messages: [{ role: 'user', content: prompt }], think: run.think, options });
    let contention = null;
    if (bg) {
      await bg.done;
      contention = { prompt: run.contend.prompt, startMs: Math.round(bg.b0 - tStart), endMs: Math.round(bg.end - tStart), evalCount: bg.evalCount };
    }
    const ps = ((await json('/api/ps')).models || []).find((m) => m.name === run.model) || {};
    results.push({
      id: run.repeat > 1 ? `${run.id}-${i + 1}` : run.id,
      label: run.repeat > 1 ? `${run.label}, run ${i + 1} of ${run.repeat}${run.warm === false && i === 0 ? ', cold' : ''}` : run.label,
      group: run.group || null,
      recorded: started,
      route: 'ollama-local',
      recorder: `node ${process.versions.node}, engine/routes/ollama.js`,
      server: `Ollama ${version}`,
      params: meta.parameter_size || '',
      quant: meta.quantization_level || '',
      promptKey: run.prompt,
      promptChars: prompt.length,
      promptPreview: run.prompt === 'long' ? `[the full UDHR in English, ${doc.length} characters] ${PROMPTS.long.text}` : prompt,
      residentAtStart: resident,
      warm: !(run.warm === false && i === 0),
      // how the server placed the model for this run: total bytes, bytes in GPU memory, context window
      placement: { size: ps.size || 0, sizeVram: ps.size_vram || 0, contextLength: ps.context_length || 0 },
      contention,
      ...raw,
    });
    process.stderr.write(`${run.id} #${i + 1}: ${raw.chunks.length} chunks, eval_count ${raw.final?.eval_count}, ttft ${raw.chunks[0]?.t} ms\n`);
  }
}

process.stdout.write(JSON.stringify(results));
