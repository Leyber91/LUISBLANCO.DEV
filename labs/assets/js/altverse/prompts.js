/* ============================================================
   altverse/prompts.js — what the model is asked, per stage and
   batched. The engine has already decided every number, the map
   and the skeleton; the model is asked for prose and for a few new
   consequences that name an existing cause. The contract below is
   what validate.js enforces, stated to the model in advance.
   ============================================================ */

import { STAGE_BY_ID, STAGE_ORDER, LIMITS, EARTH } from './config.js';
import { fmtYear } from './classify.js';

export const SYSTEM = `You write one part of an alternate history of Earth inside a deterministic worldbuilding engine.
The engine has already computed the physics, the climate, the map and a skeleton of consequences. You add prose and a few new consequences.
Contract, enforced by a validator that rejects what breaks it:
- Return one JSON object and nothing else.
- Never contradict a FIXED FACT. If you state a number, it must equal the engine's.
- Every new item names its cause by an id from the lists you are given ("dv" is the divergence itself). A cause must come before its effect.
- Tag each item ESTABLISHED, THEORETICAL, SPECULATIVE or SF, never more certain than its cause.
- Do not invent citations, people or quotations. Write plain, exact sentences of at most 40 words.`;

const short = (s, n = 150) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '.' : t; };

/* the facts the model may not contradict */
export function fixedFacts(w) {
  const k = w.knobs, ctx = w.ctx, f = [];
  f.push(`The divergence: ${w.spec.text} (read as: ${w.spec.label}; from ${fmtYear(w.spec.year)}).`);
  if (w.path.length > 1) f.push(`This world forks from a parent world at ${fmtYear(w.spec.year)}. Everything before that year is fixed.`);
  (ctx.phys.quantities || []).slice(0, 9).forEach((q) => { if (typeof q.theirs === 'number') f.push(`${q.name}: ${Number(q.theirs.toPrecision(3))}${q.unit ? ' ' + q.unit : ''} (ours ${Number(Number(q.ours).toPrecision(3))}).`); });
  if (!ctx.phys.planet) f.push('There is no planet: no carbon, oxygen, water, rock or life.');
  if (ctx.clim && !ctx.clim.runaway) f.push(`Global mean temperature ${ctx.clim.Tmean.toFixed(1)} C; permanent ice poleward of ${Math.round(ctx.clim.iceN)} degrees.`);
  if (ctx.clim && ctx.clim.runaway) f.push('The oceans boiled away; the surface is dry and hot.');
  if (ctx.clim && ctx.clim.snowball) f.push('Ice covers the whole planet.');
  if (k.iceDensity > 1) f.push('Ice is denser than water and sinks. No lake or sea has floating ice.');
  if (k.moon === 0) f.push('There is no Moon. Do not mention a moon, moonlight or lunar anything.');
  if (ctx.bio && !ctx.bio.observers && ctx.phys.planet) f.push('No toolmaking species exists. There are no people, cities or farms.');
  if (k.o2Frac < 0.15) f.push('Nothing burns: no fire, cooking, smelting or kilns.');
  if (!k.impact) f.push('The K-Pg impact never happened; non-avian dinosaurs still live.');
  return f;
}

function itemsOf(w, stage, n = 8) {
  const st = w.stages[stage]; if (!st) return [];
  if (stage === 'history') return (st.events || []).filter((e) => e.kind !== 'inherited').slice(-14).map((e) => `${e.id} (${Math.round(e.year)}): ${short(e.title, 80)}`);
  return (st.items || []).slice(0, n).map((i) => `${i.id}: ${short(i.text)}`);
}

const SHAPES = {
  default: `{"summary":"two sentences","add":[{"text":"one new consequence","cause":"an id from the lists","ladder":"SPECULATIVE"}]}`,
  geography: `{"summary":"two sentences","add":[{"text":"...","cause":"id","ladder":"SPECULATIVE"}],"regions":[{"id":"rg-1","name":"a place name","text":"one sentence"}]}`,
  history: `{"summary":"two sentences","events":[{"year":1234,"title":"short title","text":"one sentence","cause":"an id from the lists","ladder":"SPECULATIVE"}]}`,
  culture: `{"summary":"two sentences","add":[{"text":"...","cause":"id","ladder":"SPECULATIVE"}],"peoples":[{"id":"pp-1","name":"a people's name","text":"one sentence"}]}`,
  contrast: `{"items":[{"ours":"how it is in our world","theirs":"how it is here","cause":"an id from the lists","ladder":"SPECULATIVE"}]}`,
};

function stageAsk(w, stage) {
  const st = w.stages[stage];
  const lines = [];
  lines.push(`STAGE: ${stage}. ${STAGE_BY_ID[stage].role}`);
  lines.push('ENGINE ITEMS FOR THIS STAGE:');
  lines.push(...(itemsOf(w, stage).length ? itemsOf(w, stage) : ['(none)']));
  if (stage === 'geography') lines.push('REGIONS: ' + (st.regions || []).map((r) => `${r.id} ${r.kind} at ${Math.round(r.lat)} lat`).join('; '));
  if (stage === 'culture') lines.push('PEOPLES: ' + (st.peoples || []).map((p) => `${p.id} in ${p.region}: ${p.traits.join(', ')}`).join('; '));
  if (stage === 'history') lines.push(`Add at most ${LIMITS.eventsAdded} events dated between ${Math.round(w.spec.year)} and 2100, each after its cause.`);
  else if (stage === 'contrast') lines.push('Write up to 4 contrasts a visitor from our world would notice.');
  else lines.push(`Add at most 3 consequences the engine missed.`);
  return lines.join('\n');
}

export function stagePrompt(w, stage) {
  const up = STAGE_ORDER.filter((s) => s !== stage && s !== 'divergence' && w.stages[s] && !w.stages[s].pruned && STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage));
  return [
    'FIXED FACTS:', ...fixedFacts(w).map((x) => '- ' + x),
    '', 'UPSTREAM ITEMS (ids you may cite):', 'dv: the divergence',
    ...up.flatMap((s) => itemsOf(w, s, 5).map((x) => `[${s}] ${x}`)),
    '', stageAsk(w, stage),
    '', 'Return JSON shaped like:', SHAPES[stage] || SHAPES.default,
  ].join('\n');
}

export function batchPrompt(w) {
  const live = STAGE_ORDER.filter((s) => s !== 'divergence' && w.stages[s] && !w.stages[s].pruned);
  const shape = {};
  live.forEach((s) => { shape[s] = JSON.parse((SHAPES[s] || SHAPES.default)); });
  shape.world = { name: 'ONE WORD NAME', motto: 'a short line' };
  return [
    'FIXED FACTS:', ...fixedFacts(w).map((x) => '- ' + x),
    '', 'THE ENGINE\'S WORLD, STAGE BY STAGE (ids you may cite; "dv" is the divergence):',
    ...live.flatMap((s) => [`[${s}] ${STAGE_BY_ID[s].role}`, ...itemsOf(w, s, 6).map((x) => '  ' + x)]),
    w.stages.geography && w.stages.geography.regions ? 'REGIONS: ' + w.stages.geography.regions.map((r) => `${r.id} ${r.kind}`).join('; ') : '',
    w.stages.culture && w.stages.culture.peoples ? 'PEOPLES: ' + w.stages.culture.peoples.map((p) => `${p.id} in ${p.region}`).join('; ') : '',
    '', `Write every stage in one reply. For each stage: a two-sentence summary and at most 2 new items (history: at most 4 events dated after ${Math.round(w.spec.year)}). Later stages may cite items you add in earlier stages only by the engine ids above. Also give the world a name and a motto.`,
    'Return one JSON object with exactly these keys:', JSON.stringify(shape),
  ].filter((x) => x !== '').join('\n');
}

export function repairPrompt(prompt, reply, rejected) {
  return [prompt, '', 'YOUR PREVIOUS REPLY:', String(reply || '').slice(0, 2500), '', 'THE VALIDATOR REJECTED IT:',
    ...rejected.slice(0, 8).map((r) => `- ${r.rule}: ${r.reason}${r.item ? ` ("${String(r.item).slice(0, 80)}")` : ''}`),
    '', 'Return the corrected JSON object only, keeping the same shape.'].join('\n');
}

/* what the engine returns in place of a model (llm.js fallback) */
export function engineReply(w, stage) {
  const st = w.stages[stage] || {};
  return { summary: st.summary || '', add: [], events: [], items: [] };
}
export function engineBatch(w) {
  const o = {};
  STAGE_ORDER.forEach((s) => { if (s !== 'divergence') o[s] = engineReply(w, s); });
  o.world = { name: w.name, motto: w.motto };
  return o;
}

export { EARTH };
