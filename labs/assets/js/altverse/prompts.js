/* ============================================================
   altverse/prompts.js — the slot-filler contract + per-stage
   templates/profiles for the live Nemotron path. The orchestrator
   injects prior world-state for consistency; the model fills one
   typed slot at a time. (Live; the echo path uses authored content.)
   ============================================================ */

const CONTRACT =
`You are a generation engine inside a deterministic worldbuilding pipeline. Return ONLY a JSON object
conforming to the requested schema — no prose, no markdown fences. Begin '{' and end '}'.
Ground every causal claim physically. Tag each claim on the ladder ESTABLISHED|THEORETICAL|SPECULATIVE|SF.
Never invent a citation; name mechanisms by category (e.g. "thermohaline circulation"). Reference earlier
facts by the provided id. Stay consistent with the WORLD-SO-FAR and the AXIOMS — contradicting an axiom is
the one unforgivable error. A child claim may not be tagged MORE certain than the facts it depends on.
GENERATION SEED: 0x{seed}.`;

export const sys = (seed) => CONTRACT.replace('{seed}', (seed >>> 0).toString(16));

export const STAGE_PROFILES = {
  premise:    { temperature: 0.35, maxTokens: 4096, enableThinking: true, reasoningBudget: 4096 },
  firstOrder: { temperature: 0.55, maxTokens: 3072, enableThinking: true, reasoningBudget: 3072 },
  geography:  { temperature: 0.45, maxTokens: 3072, enableThinking: true, reasoningBudget: 3072 },
  chronology: { temperature: 0.50, maxTokens: 4096, enableThinking: true, reasoningBudget: 4096 },
  contrast:   { temperature: 0.65, maxTokens: 2048, enableThinking: true, reasoningBudget: 2048 },
  civilizations: { temperature: 0.80, maxTokens: 1536, enableThinking: true, reasoningBudget: 1536 },
  entry:      { temperature: 0.80, maxTokens: 1536, enableThinking: true, reasoningBudget: 1536 },
};

const axioms = (w) => (w.axioms || []).map((a) => `- ${a}`).join('\n');

export const STAGE_PROMPTS = {
  premise: (w) =>
`DIVERGENCE: ${w.divergence.statement}
BASELINE (our reality): ${w.divergence.baseline || '-'}
Write the premise. Return JSON:
{"text":"one paragraph","firstMechanism":"the single first-order mechanism","ladder":"...",
 "axioms":["4-8 binding rules the rest of the world must obey"]}`,

  firstOrder: (w) =>
`WORLD SO FAR
PREMISE: ${w.premise.text}
AXIOMS:
${axioms(w)}
List 5-7 DIRECT consequences. Return JSON:
{"firstOrder":[{"id":"fx-001","text":"...","mechanism":"...","ladder":"..."}]}  (ids fx-001, fx-002, ...)`,

  geography: (w) =>
`WORLD SO FAR
PREMISE: ${w.premise.text}
KEY EFFECTS: ${w.effects.firstOrder.map((e) => `${e.id}:${e.text}`).join(' | ')}
Design 4-6 regions of the alternate world map. Return JSON:
{"regions":[{"id":"rg-001","name":"...","bbox":[lonMin,latMin,lonMax,latMax],"dominantBiome":"...",
 "climate":"...","rationale":"why the divergence puts it here","ladder":"..."}]}
bbox: lon in [-180,180], lat in [-90,90], lonMin<lonMax, latMin<latMax.`,

  chronology: (w) =>
`WORLD SO FAR
EFFECTS: ${w.effects.firstOrder.map((e) => e.id).join(', ')}
Build the alternate chronology: 4-6 eras (monotonic, non-overlapping) and their turning points. Return JSON:
{"eras":[{"id":"er-1","name":"...","start":-4000000000,"end":-540000000}],
 "events":[{"id":"ev-001","eraId":"er-1","year":-1000,"title":"...","cause":"fx-001 or ev-id","ladder":"..."}]}`,

  contrast: (w) =>
`WORLD SO FAR
EFFECTS: ${w.effects.firstOrder.map((e) => `${e.id}:${e.text}`).join(' | ')}
Write 4-6 contrasts with our reality. Return JSON:
{"contrast":[{"id":"con-001","ours":"...","theirs":"...","path":["fx-001",...ids],"ladder":"..."}]}`,

  civilizations: (w) =>
`WORLD SO FAR
REGIONS: ${w.map.regions.map((r) => `${r.id}:${r.name}`).join(', ')}
EVENTS: ${w.chronology.events.map((e) => `${e.id}:${e.title}`).join(' | ')}
Place 4-5 peoples in REAL region ids; rises/falls cite REAL event ids. Return JSON:
{"civs":[{"id":"civ-001","name":"...","regionId":"rg-00X","rises":"ev-id","falls":"ev-id (or omit)","traits":["...","...","..."]}]}`,

  entry: (w) =>
`WORLD SO FAR
NAME: ${w.name || '(give it one)'}  REGIONS: ${w.map.regions.map((r) => r.id + ':' + r.name).join(', ')}
Write a second-person ARRIVAL into this world (2-4 sentences) and 3 threads, each anchored to a real
region+civ+event id. Return JSON:
{"name":"WORLD NAME","motto":"a short line","vignette":"...","threads":[{"title":"...","regionId":"rg-00X","civId":"civ-00X","eventId":"ev-id"}]}`,
};

export const repairPrompt = (prior, errors) =>
`Your previous output failed validation.
ERRORS:
${errors.map((e) => `- ${e}`).join('\n')}
PRIOR OUTPUT:
${JSON.stringify(prior)}
Return the corrected, complete JSON only.`;
