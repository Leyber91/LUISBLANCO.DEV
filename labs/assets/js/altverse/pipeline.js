/* ============================================================
   altverse/pipeline.js — THE LOOM (Phase 2 orchestrator).
   One entry, two backends, same World shape + same Loom events:
     - ECHO  : authored offline world, replayed as staged theatre
     - LIVE  : the Nemotron spine (premise -> firstOrder -> geography
               -> chronology -> contrast) through the rate-limited
               client, each slot schema-guarded + one repair pass,
               then a think-OFF semantic causal-audit.
   Live activates only when a worker is deployed (config.worker.base
   set + provider.detect()==='worker'); otherwise ECHO. The renderers
   never branch on source.
   ============================================================ */

import { generateEcho } from './echo-world.js';
import { createWorld, computeConsistency } from './worldstate.js';
import { NemotronClient } from './nemotron-client.js';
import { AI_CONFIG } from '../ai/config.js';
import { sys, STAGE_PROMPTS, STAGE_PROFILES, repairPrompt } from './prompts.js';
import { guardKeys, guardItems, SPINE } from './schemas.js';

const SPINE_ORDER = ['premise', 'firstOrder', 'geography', 'chronology', 'civilizations', 'contrast', 'entry'];
const ledgerLine = {
  premise: (w) => (w.premise ? w.premise.text.split('.')[0] + '.' : 'degraded'),
  firstOrder: (w) => `${w.effects.firstOrder.length} first-order consequences`,
  geography: (w) => `${w.map.regions.length} regions mapped`,
  chronology: (w) => `${w.chronology.eras.length} eras, ${w.chronology.events.length} turning points`,
  civilizations: (w) => `${(w.civs || []).length} peoples placed`,
  contrast: (w) => `${w.contrast.length} contrasts to our reality`,
  entry: (w) => (w.entry ? 'arrival written' : '—'),
};

export async function runWorld(divergence, handlers = {}) {
  const client = new NemotronClient();
  const mode = await client.detect();
  const live = mode === 'worker' && !!AI_CONFIG.worker.base;
  return live ? runLive(divergence, client, handlers) : runEcho(divergence, handlers);
}

async function runEcho(divergence, { onStage, onReasoning, onLedger, onWorld, reduced, signal } = {}) {
  const { world, reasoning } = generateEcho(divergence);
  world.createdAt = Date.now();
  onWorld?.(world);   // whole world ready up front -> skip-to-world is instant
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  for (const s of SPINE_ORDER) {
    if (signal?.aborted) break;
    onStage?.(s, 'active');
    for (const line of (reasoning[s] || ['...'])) { if (signal?.aborted) break; onReasoning?.(s, line + '\n'); await wait(240); }
    onStage?.(s, 'done');
    onLedger?.(s, ledgerLine[s](world));
    await wait(120);
  }
  return world;
}

async function runLive(divergence, client, { onStage, onReasoning, onLedger, onWorld, signal } = {}) {
  const world = createWorld(divergence);
  world.tier = 'worker';
  world.createdAt = Date.now();
  onWorld?.(world);   // skeleton ready -> skip-to-world drops into a progressively-filling explore
  const system = sys(divergence.seed);

  const gen = async (stage, apply, validate) => {
    onStage?.(stage, 'active');
    let r = await client.generateJSON({
      system, user: STAGE_PROMPTS[stage](world), profile: STAGE_PROFILES[stage], signal,
      onReasoning: (t) => onReasoning?.(stage, t),
    });
    let errs = r.ok ? validate(r.obj) : ['invalid JSON: ' + (r.error || 'parse')];
    if (errs.length && r.ok) {                                   // one think-OFF repair pass
      const rep = await client.generateJSON({
        system, user: repairPrompt(r.obj, errs),
        profile: { ...STAGE_PROFILES[stage], enableThinking: false, reasoningBudget: 0, temperature: 0.1 }, signal,
      });
      if (rep.ok && validate(rep.obj).length === 0) { r = rep; errs = []; }
    }
    if (!r.ok || errs.length) { world.partial = true; onStage?.(stage, 'degraded'); onLedger?.(stage, 'degraded'); return null; }
    apply(r.obj); onStage?.(stage, 'done'); onLedger?.(stage, ledgerLine[stage](world));
    return r.obj;
  };

  await gen('premise',
    (o) => { world.premise = { text: o.text, firstMechanism: o.firstMechanism, ladder: o.ladder }; world.axioms = o.axioms || []; },
    (o) => guardKeys(o, SPINE.premise.keys, 'premise'));
  await gen('firstOrder',
    (o) => { world.effects.firstOrder = o.firstOrder || []; },
    (o) => guardItems(o.firstOrder, SPINE.firstOrder.item, 'firstOrder'));
  await gen('geography',
    (o) => { world.map.regions = o.regions || []; },
    (o) => guardItems(o.regions, SPINE.geography.item, 'regions'));
  await gen('chronology',
    (o) => { world.chronology = { eras: o.eras || [], events: o.events || [] }; },
    (o) => [...guardItems(o.eras, SPINE.chronology.eraItem, 'eras'), ...guardItems(o.events, SPINE.chronology.eventItem, 'events')]);
  await gen('civilizations',
    (o) => { world.civs = o.civs || []; },
    (o) => guardItems(o.civs, SPINE.civilizations.item, 'civs'));
  await gen('contrast',
    (o) => { world.contrast = o.contrast || []; },
    (o) => guardItems(o.contrast, SPINE.contrast.item, 'contrast'));
  await gen('entry',
    (o) => { world.entry = { vignette: o.vignette, threads: o.threads || [] }; if (o.name) world.name = o.name; if (o.motto) world.motto = o.motto; },
    (o) => guardKeys(o, SPINE.entry.keys, 'entry'));

  // semantic causal-audit (think-OFF), honest edge counts
  try {
    const pairs = world.contrast.map((c) => [world.premise?.firstMechanism || divergence.statement, c.theirs]);
    const verdicts = await client.classify(pairs, { signal });
    world.audit.edges = world.contrast.map((c, i) => ({ from: 'premise', to: c.id, verdict: verdicts[i] || 'none' }));
  } catch (_) { /* audit best-effort */ }

  world.consistency = computeConsistency(world);
  const v = world.audit.edges;
  world.consistency.edgesAudited = v.length;
  world.consistency.edgesStrong = v.filter((e) => e.verdict === 'strong').length;
  world.consistency.edgesWeak = v.filter((e) => e.verdict === 'weak').length;
  world.consistency.edgesNone = v.filter((e) => e.verdict === 'none').length;
  world.consistency.note = world.partial ? 'some stages degraded — partial world' : '';
  if (!world.name) world.name = (divergence.domain || 'alt').toUpperCase() + '-' + (divergence.seed >>> 0).toString(36).slice(0, 4).toUpperCase();
  return world;
}
