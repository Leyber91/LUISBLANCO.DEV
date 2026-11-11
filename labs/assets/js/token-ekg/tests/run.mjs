/* ============================================================
   token-ekg/tests/run.mjs — Node checks, no browser, no dependencies.

     node labs/assets/js/token-ekg/tests/run.mjs

   1. tokenizers: the two in-repo BPE implementations (Qwen3, Mistral
      v0.3) re-encode every text in data/tokenizer-reference.json and
      must give the reference library's ids exactly. The tiktoken pair
      (gpt-tokenizer) is checked the same way when the package can be
      imported (set GPT_TOKENIZER=<path to gpt-tokenizer/esm>); the page
      runs that check in the visitor's browser in any case.
   2. statistics: analyze() on shipped recordings against values worked
      out by hand from the same files.
   3. schema: every recording in data/traces.json and data/runs.json
      passes validateTrace().
   Exit 0 when every check passes.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { byteLevelFromText, sentencePieceFromText } from '../engine/bpe.js';
import { analyze, mannWhitney, lombScargle, intervals } from '../engine/stats.js';
import { validateTrace } from '../engine/schema.js';
import { patchBom } from '../engine/tokens.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const read = (p) => readFileSync(join(DATA, p), 'utf8');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- 1. tokenizers ---- */
const ref = JSON.parse(read('tokenizer-reference.json'));
const toks = {
  qwen3: byteLevelFromText('qwen3', read('tokenizers/qwen3.bpe.txt')),
  'mistral-v03': sentencePieceFromText('mistral-v03', read('tokenizers/mistral-v03.bpe.txt')),
};
if (process.env.GPT_TOKENIZER) {
  for (const enc of ['o200k_base', 'cl100k_base']) {
    const m = await import(pathToFileURL(join(process.env.GPT_TOKENIZER, 'encoding', enc + '.js')).href);
    patchBom(m.default.bytePairEncodingCoreProcessor); // the same fix the page applies
    toks[enc] = { encode: m.encode };
  }
}
for (const [name, tk] of Object.entries(toks)) {
  let bad = 0;
  for (const c of ref.cases) {
    const got = tk.encode(c.text);
    const want = c[name];
    const same = got.length === want.length && got.every((x, i) => x === want[i]);
    if (!same) { bad++; console.log(`  ${name} ${c.name}: got ${got.length} [${got.slice(0, 12)}] want ${want.length} [${want.slice(0, 12)}]`); }
  }
  ok(bad === 0, `${name}: ${bad} of ${ref.cases.length} texts differ from ${ref.references[name]}`);
  console.log(`tokenizer ${name}: ${ref.cases.length - bad}/${ref.cases.length} texts match ${ref.references[name]}`);
}

/* ---- 1b. the model's own tokenizer reproduces the server's count ----
   Ollama sends one token per chunk and counts one more (the end-of-turn token), so re-tokenizing
   the streamed text with the model's tokenizer must give the chunk count, and eval_count - 1. */
{
  const runs = JSON.parse(read('runs.json')).traces;
  for (const [prefix, tk] of [['qwen3', toks.qwen3], ['mistral', toks['mistral-v03']]]) {
    const sample = runs.filter((t) => t.model.startsWith(prefix)).slice(0, 12);
    let exact = 0;
    for (const t of sample) {
      const n = tk.encode(t.chunks.map((c) => c[2]).join('')).length;
      if (n === t.chunks.length && n === t.final.eval_count - 1) exact++;
    }
    ok(exact === sample.length && sample.length >= 3, `${prefix}: re-tokenized output = eval_count - 1 on ${exact}/${sample.length} runs`);
    console.log(`re-tokenize ${prefix}: ${exact}/${sample.length} runs give exactly eval_count - 1 tokens`);
  }
}

/* ---- 2. statistics ---- */
const rec = JSON.parse(read('traces.json')).traces.map((t) => ({ ...t, chunks: t.chunks.map(([t0, k, x]) => ({ t: t0, kind: k, text: x })) }));
const byId = Object.fromEntries(rec.map((t) => [t.id, t]));
{
  const t = byId['llama-warm'];
  const a = analyze(t);
  ok(a.n === 118, 'llama-warm chunk count 118');
  ok(near(a.ttft, 106.53, 0.01), 'llama-warm ttft 106.53 ms');
  ok(a.server.evalCount === 119, 'llama-warm eval_count 119');
  // decode rate: (n - 1) / (t_last - t_first), recomputed here from the raw file
  const ch = t.chunks;
  const rate = (ch.length - 1) / ((ch[ch.length - 1].t - ch[0].t) / 1000);
  ok(near(a.rate, rate, 1e-9), 'llama-warm decode rate formula');
  ok(near(a.server.rate, 119 / (t.final.eval_duration / 1e9), 1e-9), 'server rate = eval_count / eval_duration');
  const iti = intervals(ch);
  const sorted = [...iti].sort((x, y) => x - y);
  ok(near(a.median, (sorted[58] + sorted[58]) / 2, 1e-9) || near(a.median, sorted[Math.floor((sorted.length - 1) / 2)], 1e-9) || near(a.median, (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2, 1e-9), 'median of 117 intervals');
  const m = iti.reduce((s, x) => s + x, 0) / iti.length;
  ok(near(a.mean, m, 1e-9), 'mean interval');
  const d = iti.slice(1).map((x, i) => x - iti[i]);
  ok(near(a.rmssd, Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length), 1e-9), 'RMSSD formula');
}
{
  const a = analyze(byId['qwen8-think']);
  ok(a.think && a.think.n === 264, 'qwen8-think: 264 thinking chunks');
  ok(a.answer && a.answer.n === 122, 'qwen8-think: 122 answer chunks');
  ok(a.server.evalCount === 391, 'qwen8-think: eval_count 391');
}
{
  const a = analyze(byId['llama-long-2']);
  ok(a.server.promptCached === 2050 && a.server.promptCount === 2051, 'llama-long-2: 2050 of 2051 prompt tokens cached');
  const b = analyze(byId['llama-long-1']);
  ok(b.ttft > 5 * a.ttft, 'uncached long prompt: first token over 5x later than cached');
}
{
  // a stall the rule must find: one interval of 10 x the median in a steady series
  const chunks = [];
  let t = 100;
  for (let i = 0; i < 50; i++) { chunks.push({ t, kind: 'a', text: 'x' }); t += i === 25 ? 200 : 20; }
  const a = analyze({ chunks, final: null });
  ok(a.stalls.length === 1 && a.stalls[0].index === 26 && near(a.stalls[0].ms, 200, 1e-9), 'stall rule finds the 200 ms gap at chunk 26');
  // coalesced: two chunks in one read
  const c2 = chunks.map((c) => ({ ...c }));
  c2[10].t = c2[9].t;
  const b = analyze({ chunks: c2, final: null });
  ok(b.coalesced === 1, 'one coalesced arrival counted');
}
{
  // Mann-Whitney: identical samples give p near 1, shifted samples give p near 0
  const x = Array.from({ length: 60 }, (_, i) => 10 + (i % 7));
  const y = x.map((v) => v + 5);
  ok(mannWhitney(x, x).p > 0.9, 'Mann-Whitney identical p > 0.9');
  ok(mannWhitney(x, y).p < 1e-6, 'Mann-Whitney shifted p < 1e-6');
  // Lomb-Scargle finds a 5 Hz sinusoid sampled unevenly
  const ts = [], ys = [];
  let tt = 0;
  for (let i = 0; i < 400; i++) { tt += 0.01 + 0.01 * ((i * 7919) % 13) / 13; ts.push(tt); ys.push(Math.sin(2 * Math.PI * 5 * tt)); }
  const ls = lombScargle(ts, ys, { fmax: 20, n: 400 });
  const peak = ls.freq[ls.power.indexOf(Math.max(...ls.power))];
  ok(near(peak, 5, 0.15), `Lomb-Scargle peak at 5 Hz (got ${peak.toFixed(2)})`);
}

/* ---- 3. schema ---- */
const files = ['traces.json'];
try { readFileSync(join(DATA, 'runs.json')); files.push('runs.json'); } catch { /* not built yet */ }
for (const f of files) {
  const doc = JSON.parse(read(f));
  let bad = 0;
  for (const t of doc.traces) { const errs = validateTrace(t); if (errs.length) { bad++; console.log(`  ${f} ${t.id}: ${errs.join('; ')}`); } }
  ok(bad === 0, `${f}: ${bad} traces fail the schema`);
  console.log(`schema ${f}: ${doc.traces.length - bad}/${doc.traces.length} traces valid (schema ${doc.schema?.version ?? '?'})`);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
