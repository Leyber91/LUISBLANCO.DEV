/* ============================================================
   token-ekg/tests/run.mjs — Node checks, no browser, no dependencies.

     node labs/assets/js/token-ekg/tests/run.mjs

   1. tokenizers: every tokenizer in config.js re-encodes every text in
      data/tokenizer-reference.json and must give the reference
      library's ids exactly. Qwen3 is the in-repo BPE implementation;
      the tiktoken pair (gpt-tokenizer 3.4.0) is checked the same way:
      the test downloads the pinned ES modules from jsDelivr once (or
      uses GPT_TOKENIZER=<path to gpt-tokenizer/esm>) and applies the
      page's own fix. The fixture, the vocabulary folder and config.js
      must name the same tokenizers, so a withdrawn vocabulary cannot
      leave a file, a load path or a reference column behind.
   1b. re-tokenization: Qwen3 recordings, re-tokenized, give the
      server's eval_count. Models whose tokenizer the page does not
      ship (Mistral) keep their recordings, match no tokenizer, and
      their notes claim no check.
   2. statistics: analyze() on shipped recordings against values worked
      out by hand from the same files.
   3. schema: every recording in data/traces.json and data/runs.json
      passes validateTrace().
   Exit 0 when every check passes.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { byteLevelFromText } from '../engine/bpe.js';
import { analyze, mannWhitney, lombScargle, intervals } from '../engine/stats.js';
import { validateTrace } from '../engine/schema.js';
import { patchBom, loadTokenizer } from '../engine/tokens.js';
import { TOKENIZERS, NO_TOKENIZER } from '../config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const read = (p) => readFileSync(join(DATA, p), 'utf8');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- 1. tokenizers ---- */
/** Download the pinned gpt-tokenizer ES modules (the same files the page loads) into a temp folder, once. */
async function fetchGptTokenizer() {
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const V = '3.4.0';
  const dir = join(tmpdir(), `gpt-tokenizer-${V}`, 'esm');
  if (existsSync(join(dir, 'encoding', 'cl100k_base.js'))) return dir;
  const list = await (await fetch(`https://data.jsdelivr.com/v1/package/npm/gpt-tokenizer@${V}/flat`)).json();
  const files = list.files.map((f) => f.name).filter((n) => n.startsWith('/esm/') && n.endsWith('.js') && !n.includes('.test.'));
  for (const n of files) {
    const r = await fetch(`https://cdn.jsdelivr.net/npm/gpt-tokenizer@${V}${n}`);
    if (!r.ok) throw new Error(`${n}: http ${r.status}`);
    const out = join(tmpdir(), `gpt-tokenizer-${V}`, n);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await r.text());
  }
  writeFileSync(join(tmpdir(), `gpt-tokenizer-${V}`, 'package.json'), '{"type":"module"}');
  return dir;
}

const ref = JSON.parse(read('tokenizer-reference.json'));
const ids = TOKENIZERS.map((t) => t.id);

/* the fixture, the folder and config.js name the same tokenizers */
{
  const refKeys = Object.keys(ref.references);
  ok(refKeys.length === ids.length && ids.every((id) => refKeys.includes(id)),
    `reference fixture names ${refKeys.join(', ')}; config.js names ${ids.join(', ')}`);
  const stale = ref.cases.filter((c) => Object.keys(c).some((k) => k !== 'name' && k !== 'text' && !ids.includes(k)));
  ok(stale.length === 0, `${stale.length} reference cases carry ids for a tokenizer config.js does not list`);
  const missing = ref.cases.filter((c) => ids.some((id) => !Array.isArray(c[id])));
  ok(missing.length === 0, `${missing.length} reference cases lack ids for a listed tokenizer`);
  ok(ref.cases.length >= 30, `reference fixture has ${ref.cases.length} texts (want >= 30)`);
  const files = TOKENIZERS.filter((t) => t.file).map((t) => t.file.replace(/^data\/tokenizers\//, ''));
  ok(files.length > 0 && files.every((f) => existsSync(join(DATA, 'tokenizers', f))), `every vocabulary file in config.js exists: ${files.join(', ')}`);
  const extra = readdirSync(join(DATA, 'tokenizers')).filter((f) => !files.includes(f) && !/^LICENSE/.test(f));
  ok(extra.length === 0, `data/tokenizers holds only listed vocabularies and their licence; extra: ${extra.join(', ')}`);
  ok(TOKENIZERS.every((t) => t.kind === 'gpt-tokenizer' || t.kind === 'bytelevel'), 'every listed tokenizer has a loader (gpt-tokenizer or bytelevel)');
  let refused = '';
  await loadTokenizer('mistral-v03', new URL('file:///')).then(() => { refused = 'loaded'; }, (e) => { refused = e.message; });
  ok(refused === 'unknown tokenizer mistral-v03', `the withdrawn Mistral vocabulary has no load path (loadTokenizer says: ${refused})`);
  console.log(`fixture: ${ref.cases.length} texts x ${refKeys.length} tokenizers, the same ${ids.length} that config.js lists`);
}

const toks = {};
for (const t of TOKENIZERS.filter((x) => x.kind === 'bytelevel')) toks[t.id] = byteLevelFromText(t.id, readFileSync(join(DATA, '..', t.file), 'utf8'));
const gptDir = process.env.GPT_TOKENIZER || await fetchGptTokenizer().catch((e) => { console.log('  gpt-tokenizer not fetched: ' + e.message); return null; });
if (gptDir) {
  for (const t of TOKENIZERS.filter((x) => x.kind === 'gpt-tokenizer')) {
    const m = await import(pathToFileURL(join(gptDir, 'encoding', t.id + '.js')).href);
    patchBom(m.default.bytePairEncodingCoreProcessor); // the same fix the page applies
    toks[t.id] = { encode: m.encode };
  }
} else console.log('  SKIP: the tiktoken pair was not checked (no network and no GPT_TOKENIZER path)');
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
   the streamed text with the model's tokenizer must give the chunk count, and eval_count - 1.
   Every dataset run of a model whose tokenizer the page ships is checked, not a sample. */
const modelTok = (model) => TOKENIZERS.find((t) => t.match && t.match.test(model || '')) || null;
const noTok = (model) => (modelTok(model) ? null : NO_TOKENIZER.find((t) => t.match.test(model || '')) || null);
{
  const runs = JSON.parse(read('runs.json')).traces;
  for (const def of TOKENIZERS.filter((t) => t.match)) {
    const sample = runs.filter((t) => def.match.test(t.model));
    let exact = 0;
    for (const t of sample) {
      const n = toks[def.id].encode(t.chunks.map((c) => c[2]).join('')).length;
      if (n === t.chunks.length && n === t.final.eval_count - 1) exact++;
    }
    ok(exact === sample.length && sample.length >= 3, `${def.id}: re-tokenized output = eval_count - 1 on ${exact}/${sample.length} runs`);
    console.log(`re-tokenize ${def.id}: ${exact}/${sample.length} dataset runs give exactly eval_count - 1 tokens`);
  }
}

{
  // three prompts; one of them (retok-qwen-code) cut by the length limit (no end-of-turn token)
  const rec = JSON.parse(read('traces.json')).traces.filter((t) => t.group === 'retok');
  const checkable = rec.filter((t) => modelTok(t.model));
  for (const t of checkable) {
    const n = toks[modelTok(t.model).id].encode(t.chunks.map((c) => c[2]).join('')).length;
    const eos = t.final.done_reason === 'stop' ? 1 : 0;
    ok(n + eos === t.final.eval_count, `${t.id}: re-tokenized ${n} + ${eos} end-of-turn = eval_count ${t.final.eval_count}`);
  }
  const prompts = new Set(checkable.map((t) => t.promptKey)).size;
  ok(prompts >= 3, `re-tokenization recordings cover ${prompts} prompts with a shipped tokenizer (want >= 3)`);
  ok(checkable.some((t) => t.final.done_reason === 'stop') && checkable.some((t) => t.final.done_reason !== 'stop'),
    're-tokenization covers a run that stopped by itself and one cut by the length limit');
  console.log(`re-tokenize: ${checkable.length} recordings on ${prompts} prompts checked against eval_count`);
}

{
  // models with no tokenizer here: recordings stay, no tokenizer is matched, and no note claims a check
  const all = [...JSON.parse(read('traces.json')).traces, ...JSON.parse(read('runs.json')).traces];
  ok(NO_TOKENIZER.every((g) => !TOKENIZERS.some((t) => t.match && g.match.source === t.match.source)), 'no model is listed both with and without a tokenizer');
  const gaps = all.filter((t) => noTok(t.model));
  ok(gaps.length === 13, `${gaps.length} recordings of models without a tokenizer here stay on the page (want the 13 Mistral runs)`);
  const claims = gaps.filter((t) => /equals the server's eval_count|re-tokenized with/i.test(t.note || ''));
  ok(claims.length === 0, `notes of recordings without a tokenizer claim no re-tokenization check; offending: ${claims.map((t) => t.id).join(', ')}`);
  console.log(`no tokenizer: ${gaps.length} recordings (${[...new Set(gaps.map((t) => t.model))].join(', ')}) kept, cross-check marked unavailable`);
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
  /* decode rate against the server's own rate, on every recording that has one.
     The page's rate is (n - 1) / (t_last - t_first). On every valid local recording it must
     agree with the server's eval_count / eval_duration within 6% (the worst, retok-qwen-script,
     carries 54 tokens in 51 chunks: 5.5%), and the median gap must stay under 1%.
     ds-qwen3-4b-3 is the case the old formula, count(waits >= 2 ms) / sum(those waits), got
     wrong: 141 of its 457 waits are buffered, and it showed 65.8 tok/s against the server's 96.6. */
  const runs = JSON.parse(read('runs.json')).traces.map((t) => ({ ...t, chunks: t.chunks.map(([t0, k, x]) => ({ t: t0, kind: k, text: x })) }));
  const every = [...rec, ...runs];
  const gaps = [];
  let formula = 0, wide = [];
  for (const t of every) {
    const a = analyze(t);
    if (!a.server || !Number.isFinite(a.server.rate) || a.invalid || a.n < 2) continue;
    const ch = t.chunks;
    if (near(a.rate, (ch.length - 1) / ((ch[ch.length - 1].t - ch[0].t) / 1000), 1e-9)) formula++;
    const gap = Math.abs(a.rate / a.server.rate - 1);
    gaps.push(gap);
    if (!(gap < 0.06)) wide.push(`${t.id} ${a.rate.toFixed(1)} vs ${a.server.rate.toFixed(1)}`);
  }
  gaps.sort((x, y) => x - y);
  const medGap = gaps[(gaps.length - 1) >> 1];
  ok(gaps.length >= 70, `decode rate checked on ${gaps.length} recordings with server counters (want >= 70)`);
  ok(formula === gaps.length, `decode rate = (n - 1) / (t_last - t_first) on ${formula}/${gaps.length} recordings`);
  ok(wide.length === 0, `decode rate within 6% of eval_count / eval_duration on every recording; outside: ${wide.join(', ')}`);
  ok(medGap < 0.01, `median gap to the server's rate ${(medGap * 100).toFixed(2)}% (want < 1%)`);
  console.log(`decode rate: ${gaps.length} recordings, gap to the server's rate median ${(medGap * 100).toFixed(2)}%, max ${(gaps[gaps.length - 1] * 100).toFixed(2)}%`);

  const q = runs.find((t) => t.id === 'ds-qwen3-4b-3');
  const qa = analyze(q);
  ok(qa.coalesced > 100, `ds-qwen3-4b-3 has ${qa.coalesced} buffered waits (the case that broke the old formula)`);
  ok(qa.rate.toFixed(1) === '94.8', `ds-qwen3-4b-3 decode rate ${qa.rate.toFixed(1)} = (458 - 1) / span = 94.8 tok/s`);
  ok(Math.abs(qa.rate / qa.server.rate - 1) < 0.025, `ds-qwen3-4b-3 within 2.5% of the server's ${qa.server.rate.toFixed(1)} tok/s`);
  const kept = qa.iti.filter((x) => x >= 2);
  const old = kept.length / (kept.reduce((s, x) => s + x, 0) / 1000);
  ok(old < 0.75 * qa.server.rate, `the old formula gives ${old.toFixed(1)} tok/s here, over 25% under the server: the regression this guards`);
  console.log(`ds-qwen3-4b-3: ${qa.rate.toFixed(1)} tok/s here, ${qa.server.rate.toFixed(1)} by the server; the old formula gave ${old.toFixed(1)}`);

  // a window: a replay stopped at chunk k shows (k - 1) / (t_(k-1) - t_0), the chunks so far
  const k = 200, ch = q.chunks;
  ok(near(analyze(q, k).rate, (k - 1) / ((ch[k - 1].t - ch[0].t) / 1000), 1e-9), 'replay window: rate over chunks 1 to 200 = 199 / (t_199 - t_0)');
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
