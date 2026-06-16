/* ============================================================
   altverse/worldstate.js — the World object + id-minting + the
   DECIDABLE (structural) consistency checks.

   "Intelligence in the system" begins here: ids are minted by the
   orchestrator (never the model), and consistency is COMPUTED from
   the graph, never self-reported. In Phase 1 (ECHO) the semantic
   causal-audit is not run (that is live-only, Phase 2), so the
   ledger honestly reports edgesAudited:0 with a note — it never
   prints a fabricated "PASS".
   ============================================================ */

import { LADDER_RANK } from './schemas.js';

export function createWorld(divergence) {
  return {
    id: 'w-' + (divergence.seed >>> 0).toString(36) + '-' + (divergence.id || 'x'),
    version: 1,
    createdAt: 0,                 // stamped by the caller (Date is unavailable in some contexts)
    partial: false,
    seed: divergence.seed >>> 0,
    tier: 'echo',
    divergence,
    premise: null,
    axioms: [],
    factIndex: {},
    effects: { firstOrder: [], secondOrder: [] },
    chronology: { eras: [], events: [] },
    map: { projection: 'equirectangular', width: 360, height: 180, regions: [], climateBands: [], notes: '' },
    civs: [],
    contrast: [],
    identity: null,
    entry: null,
    audit: { edges: [], flagged: [] },
    consistency: null,
    name: '',
    motto: '',
  };
}

/** sequential id minter — the orchestrator owns ids, not the model */
export function makeMinter() {
  const n = { fx: 0, so: 0, rg: 0, er: 0, ev: 0, civ: 0, con: 0 };
  const pad = (x) => String(x).padStart(3, '0');
  return {
    fx:  () => 'fx-' + pad(++n.fx),
    so:  () => 'so-' + pad(++n.so),
    rg:  () => 'rg-' + pad(++n.rg),
    er:  () => 'er-' + pad(++n.er),
    ev:  () => 'ev-' + pad(++n.ev),
    civ: () => 'civ-' + pad(++n.civ),
    con: () => 'con-' + pad(++n.con),
  };
}

export function addFact(world, name, fact, ladder, mag) {
  world.factIndex[name] = mag ? { fact, ladder, mag } : { fact, ladder };
}

/** Build the index of every id present, for resolution checks. */
function idSet(world) {
  const s = new Set();
  world.effects.firstOrder.forEach((e) => s.add(e.id));
  world.effects.secondOrder.forEach((e) => s.add(e.id));
  world.chronology.eras.forEach((e) => s.add(e.id));
  world.chronology.events.forEach((e) => s.add(e.id));
  world.map.regions.forEach((r) => s.add(r.id));
  world.civs.forEach((c) => s.add(c.id));
  return s;
}

function ladderOfId(world, id) {
  const all = [...world.effects.firstOrder, ...world.effects.secondOrder, ...world.chronology.events];
  const hit = all.find((x) => x.id === id);
  return hit ? hit.ladder : null;
}

/**
 * Compute the DECIDABLE structural consistency ledger. Honest:
 * counts only what pure JS can prove; semantic edge classification
 * (strong/weak/none) is reported as 0/"live-only" in ECHO.
 */
export function computeConsistency(world) {
  const ids = idSet(world);
  const checks = [];
  const pass = (rule, note) => checks.push({ rule, kind: 'structural', status: 'pass', note });
  const flag = (rule, note) => checks.push({ rule, kind: 'structural', status: 'flagged', note });

  // 1. firstOrder ids unique
  const fxIds = world.effects.firstOrder.map((e) => e.id);
  (new Set(fxIds).size === fxIds.length)
    ? pass('first-order ids unique', `${fxIds.length} effects`)
    : flag('first-order ids unique', 'duplicate id');

  // 2. eras monotonic + non-overlapping
  let eraOk = true;
  const eras = [...world.chronology.eras].sort((a, b) => a.start - b.start);
  for (let i = 0; i < eras.length; i++) {
    if (eras[i].end < eras[i].start) eraOk = false;
    if (i > 0 && eras[i].start < eras[i - 1].end) eraOk = false;
  }
  eraOk ? pass('eras monotonic, non-overlapping', `${eras.length} eras`)
        : flag('eras monotonic, non-overlapping', 'overlap or inverted era');

  // 3. every event.cause resolves to a real id
  let unresolved = 0;
  world.chronology.events.forEach((ev) => { if (ev.cause && !ids.has(ev.cause)) unresolved++; });
  unresolved === 0
    ? pass('event causes resolve', `${world.chronology.events.length} events`)
    : flag('event causes resolve', `${unresolved} dangling cause(s)`);

  // 3b. every event.eraId resolves to a real era
  const eraIds = new Set(world.chronology.eras.map((e) => e.id));
  let badEra = 0;
  world.chronology.events.forEach((ev) => { if (ev.eraId && !eraIds.has(ev.eraId)) badEra++; });
  badEra === 0
    ? pass('event eras resolve', `${world.chronology.events.length} events`)
    : flag('event eras resolve', `${badEra} dangling eraId(s)`);

  // 4. region ids unique + bbox in range AND ordered (lonMin<lonMax, latMin<latMax).
  // An inverted/degenerate bbox (incl. an antimeridian wrap, which the Stage A
  // renderer cannot draw) must be flagged, not silently normalized by the canvas.
  let bboxOk = true;
  const rgIds = world.map.regions.map((r) => r.id);
  if (new Set(rgIds).size !== rgIds.length) bboxOk = false;
  world.map.regions.forEach((r) => {
    const [lo, la, lo2, la2] = r.bbox || [];
    if (![lo, la, lo2, la2].every(Number.isFinite)) bboxOk = false;
    else if (la < -90 || la2 > 90 || lo < -180 || lo2 > 180) bboxOk = false;
    else if (lo2 <= lo || la2 <= la) bboxOk = false;
  });
  bboxOk ? pass('region bboxes valid', `${world.map.regions.length} regions, ordered + in range`)
         : flag('region bboxes valid', 'inverted, out-of-range, or duplicate region');

  // 5. contrast paths resolve
  let pathBad = 0;
  world.contrast.forEach((c) => (c.path || []).forEach((id) => { if (!ids.has(id)) pathBad++; }));
  pathBad === 0
    ? pass('contrast paths resolve', `${world.contrast.length} contrasts`)
    : flag('contrast paths resolve', `${pathBad} dangling path id(s)`);

  // 5b. every civ.regionId resolves to a real region
  if ((world.civs || []).length) {
    const regionIds = new Set(world.map.regions.map((r) => r.id));
    let badCiv = 0;
    world.civs.forEach((c) => { if (c.regionId && !regionIds.has(c.regionId)) badCiv++; });
    badCiv === 0
      ? pass('civ regions resolve', `${world.civs.length} peoples`)
      : flag('civ regions resolve', `${badCiv} dangling regionId(s)`);
  }

  // 6. ladder-not-stronger-than-parent (events vs the effect they cite)
  let inflation = 0;
  world.chronology.events.forEach((ev) => {
    const parent = ladderOfId(world, ev.cause);
    if (parent && LADDER_RANK[ev.ladder] < LADDER_RANK[parent]) inflation++;
  });
  inflation === 0
    ? pass('no certainty inflation', 'child <= parent on the ladder')
    : flag('no certainty inflation', `${inflation} over-confident claim(s)`);

  const flagged = checks.filter((c) => c.status === 'flagged').length;
  return {
    structuralTotal: checks.length,
    structuralPassed: checks.length - flagged,
    repaired: 0,
    flagged,
    edgesAudited: 0,           // ECHO: semantic causal-audit is live-only (Phase 2)
    edgesStrong: 0, edgesWeak: 0, edgesNone: 0,
    note: world.tier === 'echo' ? 'offline sample — semantic causal-audit runs live (Phase 2)' : '',
    checks,
  };
}
