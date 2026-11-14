#!/usr/bin/env node
/* ============================================================
   dataspace/record.mjs — records real round-trips from a local
   Ollama into the run files the page replays.

   Each call sends the same messages labs/assets/js/ai/llm.js sends
   on its Ollama route (system prompt, plus the JSON suffix on JSON
   calls; temperature and seed in options; format "json" on JSON
   calls). Extra options a model needed on this machine (num_ctx,
   think) are kept in the stored request, so nothing is hidden.

   Raw replies are kept verbatim. Usage:
     node record.mjs calls  <out.jsonl> [--models a,b] [--presets x,y] [--repeats 3] [--priors 3]
     node record.mjs build  <in.jsonl...>   -> labs/assets/data/dataspace/runs-<preset>.json + priors.json
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS, LEVELS, PROMPTS, LLM_JSON_SUFFIX, LAB, wordCount, budgetFor, LIMITS } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../../data/dataspace');
const OLLAMA = 'http://127.0.0.1:11434';

/* Request extras, recorded with every call. num_ctx 8192 on every call keeps each model on the GPU and inside this
   machine's memory (llm.js sends the same since foundation commit 226231a); qwen3 runs with thinking off. */
const NUM_CTX = 8192;
const EXTRA = {
  'qwen3:8b': { think: false },
  'qwen3:4b': { think: false },
  'qwen3:1.7b': { think: false },
};

const args = process.argv.slice(2);
const flag = (name, dflt) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : dflt; };

async function chat(model, system, user, { json, seed }) {
  const extra = EXTRA[model] || {};
  const body = {
    model,
    messages: [{ role: 'system', content: system + (json ? LLM_JSON_SUFFIX : '') }, { role: 'user', content: user }],
    stream: false,
    options: { temperature: PROMPTS.temperature, seed, num_ctx: NUM_CTX, ...(extra.options || {}) },
    ...(json ? { format: 'json' } : {}),
    ...(extra.think !== undefined ? { think: extra.think } : {}),
  };
  let t0 = Date.now(), r = null, j = null, lastErr = null;
  for (let attempt = 0; attempt < 3 && !j; attempt++) {
    try {
      t0 = Date.now();
      r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      j = await r.json();
    } catch (e) {
      lastErr = e; console.log(`  (call failed: ${e.cause?.code || e.message}; retry in 15 s)`);
      await new Promise((res) => setTimeout(res, 15000));
    }
  }
  if (!j) return { request: body, status: 0, raw: '', thinking: '', promptTokens: null, completionTokens: null, ollamaMs: null,
    ms: Date.now() - t0, at: new Date(t0).toISOString(), error: String(lastErr?.cause?.code || lastErr?.message || lastErr) };
  return {
    request: body,
    status: r.status,
    raw: j.message?.content ?? '',
    thinking: j.message?.thinking ?? '',
    promptTokens: j.prompt_eval_count ?? null,
    completionTokens: j.eval_count ?? null,
    ollamaMs: j.total_duration ? Math.round(j.total_duration / 1e6) : null,
    ms: Date.now() - t0,
    at: new Date(t0).toISOString(),
    error: j.error || null,
  };
}

/* Parse the compress reply: one capsule per requested level, as llm.js's extractJSON would see it. */
function parseCapsules(raw, levels) {
  let obj = null;
  try { obj = JSON.parse(raw); } catch { const m = raw.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch { /* */ } } }
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const l of levels) {
    const v = obj['L' + l];
    if (typeof v !== 'string' || !v.trim()) return null;
    out[l] = v.trim().slice(0, LIMITS.capsuleChars);
  }
  return out;
}

async function modelInfo() {
  const [tags, ver] = await Promise.all([
    fetch(OLLAMA + '/api/tags').then((r) => r.json()),
    fetch(OLLAMA + '/api/version').then((r) => r.json()),
  ]);
  const info = {};
  for (const m of tags.models) info[m.name] = { digest: m.digest.slice(0, 12), quant: m.details?.quantization_level, params: m.details?.parameter_size };
  return { info, version: ver.version };
}

async function cmdCalls(out) {
  const models = (flag('models', 'llama3.1:8b,qwen3:8b,mistral:7b')).split(',');
  const presets = (flag('presets', PRESETS.map((p) => p.id).join(','))).split(',');
  const repeats = Number(flag('repeats', '3'));
  const priors = Number(flag('priors', '0'));
  const { info, version } = await modelInfo();
  const write = (rec) => fs.appendFileSync(out, JSON.stringify(rec) + '\n');
  const levels = LEVELS.map((l) => l.id);
  for (const model of models) {
    const meta = { model, digest: info[model]?.digest, quant: info[model]?.quant, params: info[model]?.params, ollamaVersion: version };
    for (let p = 0; p < priors; p++) {
      const seed = 101 + p;
      const c = await chat(model, PROMPTS.rebuildSystem, PROMPTS.rebuildUser(''), { json: false, seed });
      write({ kind: 'prior', ...meta, seed, repeat: p + 1, promptVersion: PROMPTS.version, call: c });
      console.log(`prior ${model} #${p + 1} ${c.ms} ms`);
    }
    for (const pid of presets) {
      const preset = PRESETS.find((x) => x.id === pid);
      const source = preset.text.slice(0, LIMITS.sourceChars);
      const words = wordCount(source);
      const budgets = levels.map((l) => ({ level: l, words: budgetFor(words, l) }));
      for (let r = 1; r <= repeats; r++) {
        let seed = r, caps = null, comp = null, tries = 0;
        while (!caps && tries < 3) {
          comp = await chat(model, PROMPTS.compressSystem, PROMPTS.compressUser(source, budgets), { json: true, seed });
          caps = parseCapsules(comp.raw, levels);
          write({ kind: 'compress', ...meta, preset: pid, repeat: r, seed, budgets, promptVersion: PROMPTS.version, ok: !!caps, call: comp });
          console.log(`compress ${model} ${pid} r${r} seed ${seed} ${comp.ms} ms ${caps ? 'ok' : 'INVALID'}`);
          if (!caps) { tries++; seed += 10; }
        }
        if (!caps) continue;
        for (const l of levels) {
          const c = await chat(model, PROMPTS.rebuildSystem, PROMPTS.rebuildUser(caps[l]), { json: false, seed });
          write({ kind: 'rebuild', ...meta, preset: pid, repeat: r, seed, level: l, budget: budgets[l - 1].words,
            capsule: caps[l], compressAt: comp.call?.at || comp.at, promptVersion: PROMPTS.version, call: c });
          console.log(`  rebuild L${l} ${c.ms} ms ${c.completionTokens} tok`);
        }
      }
    }
  }
}

/* Group the call log into one run file per preset, plus the priors. Measures are not stored here:
   the page computes them from the texts, and tests.mjs re-scores every run against measures.snapshot.json. */
function cmdBuild(files) {
  const recs = files.flatMap((f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)));
  const slug = (m) => m.replace(/[^a-z0-9.]+/gi, '-');
  const byPreset = {};
  const priors = [];
  const compressById = {};
  for (const r of recs) {
    if (r.kind === 'prior') {
      priors.push({ id: `prior.${slug(r.model)}.r${r.repeat}`, model: r.model, digest: r.digest, quant: r.quant,
        ollamaVersion: r.ollamaVersion, seed: r.seed, promptVersion: r.promptVersion, date: r.call.at, call: r.call });
      continue;
    }
    const f = (byPreset[r.preset] ||= { schema: LAB.runSchema, preset: r.preset, calls: {}, runs: [] });
    if (r.kind === 'compress') {
      const id = `c.${r.preset}.${slug(r.model)}.r${r.repeat}.s${r.seed}`;
      f.calls[id] = { id, stage: 'compress', ok: r.ok, model: r.model, seed: r.seed, budgets: r.budgets, ...r.call };
      if (r.ok) compressById[`${r.preset}|${r.model}|${r.repeat}`] = id;
    } else if (r.kind === 'rebuild') {
      const cid = compressById[`${r.preset}|${r.model}|${r.repeat}`];
      if (!cid) { console.log(`skipped an orphan rebuild (${r.preset} ${r.model} r${r.repeat} L${r.level}): no compress call in the log`); continue; }
      const id = `${r.preset}.${slug(r.model)}.r${r.repeat}.L${r.level}`;
      const rid = `b.${id}`;
      f.calls[rid] = { id: rid, stage: 'rebuild', ok: !!r.call.raw, model: r.model, seed: r.seed, ...r.call };
      f.runs.push({
        id, kind: 'recorded', preset: r.preset, level: r.level, budgetWords: r.budget,
        capsule: r.capsule, rebuild: r.call.raw,
        provenance: {
          route: 'ollama, local recorder (record.mjs)', model: r.model, digest: r.digest, quant: r.quant, params: r.params,
          ollamaVersion: r.ollamaVersion, date: r.call.at, promptVersion: r.promptVersion, seed: r.seed,
          temperature: PROMPTS.temperature, repeat: r.repeat, compressCall: cid, rebuildCall: rid,
        },
      });
    }
  }
  for (const [pid, f] of Object.entries(byPreset)) {
    f.generatedAt = new Date().toISOString();
    const file = path.join(DATA, `runs-${pid}.json`);
    fs.writeFileSync(file, JSON.stringify(f, null, 1) + '\n');
    console.log(`${file}: ${f.runs.length} runs, ${Object.keys(f.calls).length} calls`);
  }
  if (priors.length) {
    const file = path.join(DATA, 'priors.json');
    fs.writeFileSync(file, JSON.stringify({ schema: LAB.runSchema, generatedAt: new Date().toISOString(), priors }, null, 1) + '\n');
    console.log(`${file}: ${priors.length} priors`);
  }
}

const cmd = args[0];
if (cmd === 'calls') await cmdCalls(args[1]);
else if (cmd === 'build') cmdBuild(args.slice(1).filter((a) => !a.startsWith('--')));
else { console.log('usage: node record.mjs calls <out.jsonl> [...] | build <in.jsonl...>'); process.exit(1); }
