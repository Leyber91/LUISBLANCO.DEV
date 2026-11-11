/* ============================================================
   altverse/pipeline.js — the orchestrator of the multipath.

   Two passes over the same stage graph:

   1. engine pass (always, instant): every stage runs on the
      deterministic engine in topological order; a stage whose
      precondition fails is pruned and says why. This is the world.

   2. model pass (when a route answers), through ai/llm.js only:
      - staged, when the route is fast (local Ollama or the
        visitor's own key): one call per stage, each prompt carrying
        the validated output of the stages before it, the trace
        lighting stage by stage;
      - batched, on the public route (one reply per 45 s per IP) or
        a worker: ONE call returns every stage as one JSON object,
        then each stage's part is validated in graph order.
      Every reply passes validate.js; accepted items join the world
      tagged as the model's, rejected ones are kept with the rule
      that rejected them. With no route, llm.js returns the engine's
      own reply and the world stays as the engine made it.
   ============================================================ */

import { LLM, extractJSON } from '../ai/llm.js';
import { STAGE_ORDER, TIMING } from './config.js';
import { newWorld, buildContext, runStage } from './engine.js';
import { validateStage, validateName, ledger } from './validate.js';
import { SYSTEM, stagePrompt, batchPrompt, engineReply, engineBatch, repairPrompt } from './prompts.js';

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (!ms) return res();
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});

/* ---- pass 1: the engine ---- */
export async function enginePass(seed, path, parentWorld, { onStage = () => {}, pause = TIMING.stageEngine, signal } = {}) {
  const w = newWorld(seed, path, parentWorld);
  const ctx = buildContext(w);
  w.ctx = ctx;
  for (const id of STAGE_ORDER) {
    onStage(id, 'active', { route: 'engine' });
    const t0 = performance.now();
    w.stages[id] = runStage(id, w, ctx);
    const ms = Math.round(performance.now() - t0);
    const pruned = !!w.stages[id].pruned;
    w.trace.push({ stage: id, route: 'engine', ms, status: pruned ? 'pruned' : 'done', note: pruned ? w.stages[id].pruned : `${(w.stages[id].items || []).length + ((w.stages[id].events || []).filter((e) => e.kind !== 'inherited').length)} items` });
    onStage(id, pruned ? 'pruned' : 'done', { route: 'engine', ms }, w);
    if (pause) await sleep(pause, signal);
  }
  w.ledger = ledger(w);
  w.rejected = [];
  w.repaired = [];
  return w;
}

/* synchronous weave for replays (URL, compare, parents) */
export function weaveSync(seed, path, parentWorld) {
  const w = newWorld(seed, path, parentWorld);
  const ctx = buildContext(w);
  w.ctx = ctx;
  for (const id of STAGE_ORDER) {
    w.stages[id] = runStage(id, w, ctx);
    w.trace.push({ stage: id, route: 'engine', ms: 0, status: w.stages[id].pruned ? 'pruned' : 'done' });
  }
  w.ledger = ledger(w);
  w.rejected = []; w.repaired = [];
  return w;
}

/* merge a validated patch into a stage */
export function applyPatch(w, stage, res) {
  const st = w.stages[stage];
  const { patch } = res;
  if (patch.summary) { st.engineSummary = st.engineSummary || st.summary; st.summary = patch.summary; st.summaryOrigin = 'model'; }
  if (patch.items.length) st.items = [...st.items, ...patch.items];
  if (patch.events.length) { st.events = [...st.events, ...patch.events].sort((a, b) => a.year - b.year); }
  for (const [id, v] of Object.entries(patch.names || {})) {
    const list = stage === 'geography' ? st.regions : st.peoples;
    const r = list && list.find((x) => x.id === id);
    if (r) { r.engineName = r.engineName || r.name; r.name = v.name; if (v.text) r.note = v.text; r.origin = 'model'; }
  }
  st.modelCount = res.count || st.modelCount || 0;
  w.rejected.push(...res.rejected.map((r) => ({ ...r, stage })));
  w.repaired.push(...res.repaired.map((r) => ({ ...r, stage })));
}

export function routeMode(route) {
  return route === 'ollama' || route === 'own-key' ? 'staged' : route === 'worker' || route === 'pollinations' ? 'batched' : 'engine';
}

/* ---- pass 2: the model ---- */
export async function modelPass(w, { mode = 'auto', onStage = () => {}, signal, only = null, timeoutMs = 90000 } = {}) {
  const route = await LLM.detect();
  let run = mode === 'auto' ? routeMode(route) : mode;
  const live = STAGE_ORDER.filter((s) => s !== 'divergence' && !w.stages[s].pruned && (!only || s === only));
  if (only) run = 'staged';            // re-running one stage is one call on any route
  w.model = { mode: run, route, calls: 0, ms: 0, model: '', started: Date.now(), repairs: 0 };
  if (run === 'engine') return w;

  if (run === 'staged') {
    // json:false so a reply that is not JSON stays on this route; we parse and repair it here
    const ask = (prompt) => LLM.complete({
      system: SYSTEM + '\nReply with one JSON object and nothing else.', prompt, temperature: 0.7, seed: w.seed,
      fallback: () => '{}', maxWaitMs: only ? 50000 : 0, signal, timeoutMs,
    });
    for (const s of live) {
      onStage(s, 'active', { route });
      const prompt = stagePrompt(w, s);
      let r = await ask(prompt);
      w.model.calls++; w.model.ms += r.ms; w.model.model = r.model; w.model.route = r.source;
      if (r.source === 'offline' || (r.source === 'pollinations' && !only)) {
        // the fast route dropped: keep the engine for the rest (a public call per stage would stall)
        w.trace.push({ stage: s, route: r.source, ms: r.ms, status: 'engine', note: r.errors.slice(-1)[0] || 'no fast route' });
        if (r.source === 'pollinations') { const res = validateStage(s, extractJSON(r.text), w); applyPatch(w, s, res); }
        onStage(s, 'done', { route: 'engine', note: 'fast route dropped' });
        for (const rest of live.slice(live.indexOf(s) + 1)) onStage(rest, 'done', { route: 'engine' });
        break;
      }
      let json = extractJSON(r.text);
      let res = validateStage(s, json, w);
      // one repair call: when nothing parsed, or every item was rejected
      const failed = !json || (res.accepted.length === 0 && res.rejected.length > 0);
      let repairedByCall = false;
      if (failed && !only) {
        const r2 = await ask(repairPrompt(prompt, r.text, json ? res.rejected : [{ rule: 'R1 shape', reason: 'the reply was not one JSON object' }]));
        w.model.calls++; w.model.ms += r2.ms; w.model.repairs++;
        const j2 = r2.source === r.source ? extractJSON(r2.text) : null;
        const res2 = j2 ? validateStage(s, j2, w) : null;
        if (res2 && res2.accepted.length) { res.rejected.forEach((x) => (x.reason += ' (first reply; a repair call replaced it)')); res2.rejected.unshift(...res.rejected); res = res2; json = j2; repairedByCall = true; }
        else res.rejected.forEach((x) => (x.reason += ' (a repair call also failed; the engine keeps this stage)'));
      }
      applyPatch(w, s, res);
      const nm = validateName(json && json.world, w); if (nm.name) w.name = nm.name; if (nm.motto) w.motto = nm.motto;
      w.trace.push({ stage: s, route: r.source, model: r.model, ms: r.ms, status: res.rejected.length ? 'repaired' : 'done', accepted: res.accepted.length, rejected: res.rejected.length, repaired: res.repaired.length, repairCall: repairedByCall });
      onStage(s, res.rejected.length || res.repaired.length ? 'repaired' : 'done', { route: r.source, ms: r.ms, accepted: res.accepted.length, rejected: res.rejected.length, repaired: res.repaired.length });
    }
  } else {
    live.forEach((s) => onStage(s, 'queued', { route }));
    const r = await LLM.complete({
      system: SYSTEM, prompt: batchPrompt(w), json: true, temperature: 0.7, seed: w.seed,
      fallback: () => engineBatch(w), maxWaitMs: 50000, signal, timeoutMs,
    });
    w.model.calls = 1; w.model.ms = r.ms; w.model.model = r.model; w.model.route = r.source;
    if (r.source === 'offline') {
      w.trace.push({ stage: 'all', route: 'offline', ms: r.ms, status: 'engine', note: r.errors.slice(-1)[0] || 'no route' });
      live.forEach((s) => onStage(s, 'done', { route: 'engine', note: 'no route answered' }));
    } else {
      const all = r.json || {};
      for (const s of live) {
        onStage(s, 'active', { route: r.source });
        const res = validateStage(s, all[s], w);
        applyPatch(w, s, res);
        w.trace.push({ stage: s, route: r.source, model: r.model, ms: 0, status: res.rejected.length ? 'repaired' : 'done', accepted: res.accepted.length, rejected: res.rejected.length, repaired: res.repaired.length, batched: true });
        onStage(s, res.rejected.length || res.repaired.length ? 'repaired' : 'done', { route: r.source, accepted: res.accepted.length, rejected: res.rejected.length, repaired: res.repaired.length });
        await sleep(140, signal);
      }
      const nm = validateName(all.world, w);
      if (nm.name) w.name = nm.name; if (nm.motto) w.motto = nm.motto;
      w.rejected.push(...nm.rejected.map((x) => ({ ...x, stage: 'world' })));
    }
  }
  w.ledger = ledger(w);
  w.model.done = true;
  return w;
}
