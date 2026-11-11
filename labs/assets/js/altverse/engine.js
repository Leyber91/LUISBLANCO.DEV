/* ============================================================
   altverse/engine.js — the deterministic weaver.

   One function per stage of the multipath (config.js STAGES).
   Each reads the knob vector and the outputs of the stages it
   depends on, and returns that stage's output in the same shape a
   model is asked to fill, so the orchestrator can merge, validate
   and render either without branching on where it came from.

   Ids are stable keys, not counters: the same consequence carries
   the same id in every world that has it, which is what lets two
   worlds be compared and a fork path be replayed from a URL.
   ============================================================ */

import { EARTH, HORIZON_YEAR, EARTH_FORMS, STAGE_ORDER, LADDER_RANK } from './config.js';
import { BASE_KNOBS, TECH, TECH_BY_ID, CHRONO, NAME_PARTS } from './lexicon.js';
import { classify, composeKnobs, fmtYear } from './classify.js';
import { computePhysics } from './physics.js';
import { runClimate } from './climate.js';
import { buildTerrain, habitability, placeSettlements, buildRoutes, HOTSPOTS, cellLon, cellLat, TERRAIN_GRID } from './terrain.js';
import { RULES } from './rules.js';
import { makeRng, hashStr } from './rng.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- names ---------- */
function namer(seed) {
  const r = makeRng(seed ^ 0x2545f491);
  const used = new Set();
  const uniq = (fn) => { for (let i = 0; i < 40; i++) { const n = fn(); if (!used.has(n)) { used.add(n); return n; } } return fn() + ' ' + used.size; };
  return {
    world: () => uniq(() => r.pick(NAME_PARTS.head) + r.pick(NAME_PARTS.mid) + r.pick(NAME_PARTS.tail)),
    land: () => uniq(() => r.pick(NAME_PARTS.root) + r.pick(NAME_PARTS.suffix)),
    town: () => uniq(() => { const a = r.pick(NAME_PARTS.place), b = r.pick(NAME_PARTS.place); return a === b ? a : a + b.toLowerCase(); }),
    pick: (arr) => r.pick(arr),
  };
}

const MOTTOS = [
  [(k) => k.alphaFactor > 1.5, 'Hydrogen, helium, and nothing that remembers.'],
  [(k) => k.iceDensity > 1, 'The deep keeps the cold.'],
  [(k) => k.gFactor > 1.05, 'Everything keeps close to the ground.'],
  [(k) => k.gFactor < 0.95, 'Everything reaches.'],
  [(k) => k.moon === 0, 'No month, and no silver on the water.'],
  [(k) => k.tiltDeg > 54, 'The poles are where the summer lives.'],
  [(k) => k.tiltDeg < 5, 'Every day of the year is the same day.'],
  [(k) => k.solar > 1.09, 'The sky took the sea.'],
  [(k) => k.solar < 1, 'A paler sun, a thicker sky.'],
  [(k) => !k.impact, 'The sky did not fall.'],
  [(k) => !k.medFlood, 'A sea of salt between two continents.'],
  [(k) => !k.panama, 'Two Americas and an open sea.'],
  [(k) => k.dayHours > 36, 'Long days, longer nights.'],
  [(k) => k.o2Frac < 0.15, 'Nothing burns.'],
  [(k) => Object.keys(k.tech || {}).length > 0, 'The future arrived early.'],
  [() => true, 'One change, and everything after it.'],
];

/* ---------- caches ---------- */
const baseCache = new Map();
function baseStats(seed) {
  if (baseCache.has(seed)) return baseCache.get(seed);
  const k = { ...BASE_KNOBS };
  const clim = runClimate(k);
  const ter = buildTerrain(seed, k, clim);
  const s = { landFrac: ter.stats.landFrac, maxElev: ter.stats.maxElev, ter, clim };
  if (baseCache.size > 4) baseCache.delete(baseCache.keys().next().value);
  baseCache.set(seed, s);
  return s;
}
export function oursFor(seed) { return baseStats(seed); }

/* ---------- the rules runner ---------- */
function runRules(stage, k, ctx) {
  const items = [];
  for (const r of RULES) {
    if (r.stage !== stage) continue;
    let on = false;
    try { on = !!r.when(k, ctx); } catch { on = false; }
    if (!on) continue;
    const cause = typeof r.cause === 'function' ? r.cause(k, ctx) : r.cause;
    const ladder = typeof r.ladder === 'function' ? r.ladder(k, ctx) : r.ladder;
    let text = '';
    try { text = r.text(k, ctx); } catch (e) { text = ''; }
    if (!text) continue;
    const item = { id: r.key, text, ladder, cause: cause || 'dv', src: r.src, origin: 'engine' };
    const ours = typeof r.ours === 'function' ? r.ours(k, ctx) : r.ours;
    if (ours) { item.ours = ours; item.theirs = typeof r.theirs === 'function' ? r.theirs(k, ctx) : (r.theirs || text); }
    items.push(item);
  }
  return items;
}

/* ---------- technology ladder ---------- */
function physicsTechShifts(k, ctx) {
  const s = {}, why = {};
  const set = (id, v, w) => { s[id] = (s[id] === 'never' ? 'never' : v === 'never' ? 'never' : (s[id] || 0) + v); why[id] = w; };
  if (k.gFactor > 1.02) { set('flight', Math.round(60 * (k.gFactor - 1)), 'bi-fliers'); const mr = ctx.q('q-mr'); if (mr) set('orbit', Math.round(80 * (mr.theirs / mr.ours - 1)), 'ph-orbit'); }
  if (k.gFactor < 0.98) { set('flight', -Math.round(80 * (1 - k.gFactor)), 'bi-fliers'); const mr = ctx.q('q-mr'); if (mr) set('orbit', -Math.round(60 * (1 - mr.theirs / mr.ours)), 'ph-orbit'); }
  if (k.o2Frac < 0.15) set('fire', 'never', 'bi-nofire');
  if (k.iceDensity > 1) set('agriculture', 800, 'ge-hearths');
  if (k.tiltDeg > 45 || k.tiltDeg < 3) set('agriculture', k.tiltDeg > 45 ? 3000 : 800, 'cl-seasons');
  return { s, why };
}

function techLadder(k, ctx, divYear, inherit) {
  const phys = physicsTechShifts(k, ctx);
  const out = {};
  for (const t of TECH) {
    if (inherit && inherit[t.id] && inherit[t.id].theirs != null && inherit[t.id].theirs < divYear) { out[t.id] = { ...inherit[t.id], inherited: true }; continue; }
    if (inherit && inherit[t.id] && inherit[t.id].theirs == null && t.year < divYear) { out[t.id] = { ...inherit[t.id], inherited: true }; continue; }
    if (!ctx.bio.observers) { out[t.id] = { id: t.id, name: t.name, ours: t.year, theirs: null, cause: ctx.lastBio || 'bi-none', why: 'no toolmakers' }; continue; }
    const own = k.tech && k.tech[t.id];
    const ph = phys.s[t.id];
    const depsNever = t.deps.filter((d) => out[d] && out[d].theirs == null);
    if (own === 'never' || ph === 'never' || depsNever.length) {
      out[t.id] = { id: t.id, name: t.name, ours: t.year, theirs: null, cause: own === 'never' ? 'dv' : ph === 'never' ? phys.why[t.id] : (out[depsNever[0]].cause || 'dv'), why: own === 'never' ? 'the divergence' : ph === 'never' ? 'physics' : `needs ${TECH_BY_ID[depsNever[0]].name}` };
      continue;
    }
    if (t.year < divYear && own == null && !inherit) { out[t.id] = { id: t.id, name: t.name, ours: t.year, theirs: t.year, cause: null, delta: 0 }; continue; }
    let shift = 0, cause = null;
    if (typeof own === 'number') { shift += own; cause = 'dv'; }
    if (typeof ph === 'number') { shift += ph; cause = cause || phys.why[t.id]; }
    if (own == null) {
      let best = 0, bestDep = null;
      // a shift passes to what is built on it at 70%, fading with the time between them in ours
      for (const d of t.deps) {
        const o = out[d]; if (!o || !o.delta) continue;
        const passed = o.delta * 0.7 * Math.exp(-(t.year - TECH_BY_ID[d].year) / 2500);
        if (Math.abs(passed) > Math.abs(best)) { best = passed; bestDep = d; }
      }
      if (bestDep && Math.abs(best) >= 1) { shift += Math.round(best); cause = cause || `ev-${bestDep}`; }
    }
    let year = t.year + shift;
    for (const d of t.deps) { const o = out[d]; if (o && o.theirs != null) { const gap = Math.max(3, Math.round(0.1 * (t.year - TECH_BY_ID[d].year))); if (year < o.theirs + gap) { year = o.theirs + gap; cause = cause || `ev-${d}`; } } }
    if (year < divYear && t.year >= divYear) year = Math.max(year, divYear);
    year = Math.min(year, 1e9);
    const delta = year - t.year;
    out[t.id] = { id: t.id, name: t.name, ours: t.year, theirs: year > HORIZON_YEAR ? null : year, delta, cause: delta ? cause : null, why: year > HORIZON_YEAR ? 'after 2100' : '' };
  }
  return out;
}

/* ---------- stage functions ---------- */
export const STAGE_FNS = {
  divergence(w) {
    const s = w.spec;
    return {
      summary: `${cap(s.label)}. Read as ${s.family.join(' + ')}, dated ${fmtYear(s.year)}${s.sudden ? ', arriving suddenly' : ''}.`,
      items: [{ id: 'dv', text: s.text, ladder: 'ESTABLISHED', cause: null, origin: 'engine' }],
      notes: w.specs.flatMap((x) => x.notes),
      reading: { family: s.family, label: s.label, year: s.year, confidence: s.confidence, matched: s.matched, knobs: s.knobs },
    };
  },

  physics(w, ctx) {
    const items = runRules('physics', w.knobs, ctx);
    const n = ctx.phys.quantities.length;
    return {
      summary: n ? `${n} quantities change. ${items[0] ? items[0].text : ''}` : 'Physics is ours.',
      items, quantities: ctx.phys.quantities, nuclides: ctx.phys.nuclides, chemistry: ctx.phys.chemistry,
      notModelled: ctx.phys.notModelled,
    };
  },

  climate(w, ctx) {
    if (!ctx.phys.planet) return { pruned: 'No rock or water forms, so there is no surface to have a climate.', items: [] };
    const items = runRules('climate', w.knobs, ctx);
    const c = ctx.clim;
    const quantities = [
      { id: 'q-tmean', name: 'global mean temperature', ours: 14.5, theirs: c.Tmean, unit: 'C', how: 'energy-balance model, calibrated to ours', tag: 'ILLUSTRATIVE', src: 'budyko1969', digits: 3 },
      { id: 'q-iceline', name: 'permanent ice line', ours: 67, theirs: c.snowball ? 0 : c.iceFree ? 90 : c.iceN, unit: 'deg', how: 'band where the ice albedo takes over', tag: 'ILLUSTRATIVE', src: 'sellers1969', digits: 3 },
      { id: 'q-teq', name: 'equator / pole temperature', ours: '28.0 / -24.5', theirs: `${c.Teq.toFixed(1)} / ${c.Tpole.toFixed(1)}`, unit: 'C', how: 'energy-balance model', tag: 'ILLUSTRATIVE', src: 'north1981' },
    ];
    if (c.thermostat) quantities.push({ id: 'q-thermo', name: 'CO2 after the weathering thermostat', ours: 280, theirs: c.co2, unit: 'ppm', how: 'solved so the ice-free belt keeps its old mean', tag: 'ILLUSTRATIVE', src: 'walker1981', digits: 3 });
    if (ctx.ter) quantities.push({ id: 'q-land', name: 'land fraction of the surface', ours: ctx.base.landFrac, theirs: ctx.ter.stats.landFrac, unit: '', how: 'counted on this map', tag: 'ILLUSTRATIVE', src: 'record' });
    if (ctx.seaShift) quantities.push({ id: 'q-seashift', name: 'sea level change from sunken ice', ours: 0, theirs: ctx.seaShift, unit: 'm', how: 'frozen ocean share x 3.68 km x (1 - rho_w / rho_ice)', tag: 'ILLUSTRATIVE', src: 'petrenko1999', digits: 3 });
    return { summary: items.slice(0, 2).map((i) => i.text).join(' '), items, quantities, bands: c.bands.filter((b, i) => i % 3 === 1).map((b) => ({ lat: b.lat, T: +b.T.toFixed(1), ice: b.ice })) };
  },

  biosphere(w, ctx) {
    const items = runRules('biosphere', w.knobs, ctx);
    const b = ctx.bio;
    const outcome = !b.any ? 'none' : !b.complex ? 'microbial' : !b.observers ? 'animals, no toolmakers' : 'toolmakers';
    return { summary: `Outcome: ${outcome}. ${items[0] ? items[0].text : ''}`, items, outcome };
  },

  geography(w, ctx) {
    if (!ctx.ter) return { pruned: ctx.phys.planet ? 'No surface to map.' : 'There is no ground to map. The view shows what does exist: the nuclei that hold together.', items: [] };
    const items = runRules('geography', w.knobs, ctx);
    return { summary: items.slice(0, 2).map((i) => i.text).join(' '), items, regions: ctx.geo.regions, settlements: ctx.geo.settlements.map(({ id, name, lon, lat, rank, founded, hot }) => ({ id, name, lon, lat, rank, founded, hot })), routes: ctx.geo.routes.map(({ id, a, b, sea }) => ({ id, a, b, sea })), stats: ctx.ter.stats };
  },

  history(w, ctx) {
    const k = w.knobs;
    const divYear = w.specs[0].year;
    const lastYear = w.spec.year;
    const parent = w.parentWorld;
    const ladder = techLadder(k, ctx, lastYear, parent ? parent.stages.history.tech : null);
    const gate = (need) => !ctx.phys.planet ? false : need === 'moon' ? k.moon > 0 : need === 'water' ? ctx.phys.planet && !(ctx.clim && ctx.clim.runaway) : need === 'life' ? ctx.bio.any : need === 'complex' ? ctx.bio.complex : need === 'observers' ? ctx.bio.observers : true;
    const events = [], removed = [];
    const dino = !k.impact && ctx.bio.observers;
    const physicsWorld = w.specs.some((s) => s.scope !== 'history');

    // a fork keeps its parent's past
    if (parent) {
      for (const e of parent.stages.history.events) if (e.year < lastYear) events.push({ ...e, kind: e.kind === 'divergence' ? 'divergence' : 'inherited' });
    }
    for (const b of CHRONO) {
      if (parent && b.year < lastYear) continue;
      const ev = { id: 'ev-' + (b.tech || b.id.replace(/^b-/, '')), base: b.id, year: b.year, title: b.title, text: '', cause: 'dv', ladder: 'ESTABLISHED', kind: 'kept', src: b.src };
      const before = b.year < divYear;
      if (!gate(b.needs)) {
        if (before && !physicsWorld) { events.push({ ...ev, kind: 'inherited' }); continue; }
        removed.push({ ...ev, why: !ctx.phys.planet ? 'there is no planet' : b.needs === 'observers' ? 'no toolmakers in this world' : b.needs === 'complex' ? 'no complex life' : b.needs === 'moon' ? 'there is no Moon' : 'no oceans or life', cause: ctx.lastBio || 'dv' });
        continue;
      }
      if (before) { events.push({ ...ev, kind: 'inherited' }); continue; }
      if ((k.removed || []).includes(b.id)) { removed.push({ ...ev, why: 'the divergence', cause: 'dv' }); continue; }
      if (b.id === 'b-kpg' && !k.impact) { removed.push({ ...ev, why: 'the impactor misses', cause: 'ph-kpg' }); continue; }
      if (b.id === 'b-panama' && !k.panama) { removed.push({ ...ev, why: 'the seaway stays open', cause: 'ph-panama' }); continue; }
      if (b.id === 'b-zanclean' && !k.medFlood) { removed.push({ ...ev, why: 'Gibraltar never breaches', cause: 'ph-med' }); continue; }
      if (b.id === 'b-moon' && k.moon === 0) { removed.push({ ...ev, why: 'there is no Moon', cause: 'dv' }); continue; }
      if (b.tech) {
        const t = ladder[b.tech];
        if (!t || t.theirs == null) { removed.push({ ...ev, why: t && t.why ? t.why : 'never invented', cause: t && t.cause ? t.cause : 'dv' }); continue; }
        if (t.theirs !== b.year) { ev.year = t.theirs; ev.kind = 'shifted'; ev.cause = t.cause || 'dv'; ev.ladder = 'SPECULATIVE'; ev.text = `${t.delta < 0 ? Math.abs(t.delta) + ' years earlier' : t.delta + ' years later'} than ours (${fmtYear(b.year)}).`; }
      }
      if (ev.kind === 'kept') {
        ev.text = 'Kept as in ours: no rule in the engine moves it.';
        if (b.domain === 'planet' || b.domain === 'climate') { ev.cause = 'dv'; ev.ladder = 'THEORETICAL'; }
        else if (b.domain === 'life') { ev.cause = ctx.lastBio || 'dv'; ev.ladder = 'SPECULATIVE'; }
        else { ev.cause = (w.stages.biosphere && w.stages.biosphere.items.some((i) => i.id === 'bi-people')) ? 'bi-people' : (ctx.lastBio || 'dv'); ev.ladder = 'SPECULATIVE'; }
      }
      if (b.id === 'b-snow' && k.iceDensity > 1) { ev.title = 'The Cryogenian cold nearly freezes the oceans from the floor'; ev.kind = 'changed'; ev.cause = 'bi-cryo'; ev.ladder = 'SPECULATIVE'; ev.text = 'With ice that sinks, a cold this deep fills the oceans from the floor; the engine assumes it stopped short.'; }
      if (b.id === 'b-lgm' && !k.panama) { ev.title = 'A milder glacial maximum'; ev.kind = 'changed'; ev.cause = 'cl-panama'; ev.ladder = 'SPECULATIVE'; ev.text = 'Less northern ice without the closed isthmus.'; }
      if (b.id === 'b-agri' && k.iceDensity > 1) { ev.title = 'Farming begins on rivers in the warm belt'; ev.kind = 'changed'; ev.cause = 'ge-hearths'; ev.text = `${ev.year - b.year} years later than ours: fewer places keep liquid water through winter.`; }
      if (dino && b.domain === 'people') {
        if (b.id === 'b-homo') { ev.title = 'Toolmakers appear among small theropods'; ev.kind = 'changed'; ev.cause = 'bi-thinker'; }
        if (b.id === 'b-sapiens') { removed.push({ ...ev, why: 'no primates of our line', cause: 'bi-dinos' }); continue; }
      }
      if (dino && b.year > -6.6e7) ev.ladder = 'SF';
      events.push(ev);
    }

    // the divergence itself, and family events
    const add = (id, year, title, cause, ladder, text = '') => { if (year >= lastYear || id === 'ev-dv') events.push({ id, year, title, text, cause, ladder, kind: id === 'ev-dv' ? 'divergence' : 'new' }); };
    const dvYear = Math.max(w.spec.year, EARTH_FORMS - 9.3e9);
    add('ev-dv', dvYear, cap(w.spec.label.split(' + ')[0].replace(/\s*\(.*$/, '').replace(/:.*$/, '')), 'dv', 'ESTABLISHED', w.spec.text);
    if (!ctx.phys.planet) {
      add('ev-x-bbn', -1.38e10 + 3e4, 'The first minutes make hydrogen and helium; nothing heavier holds', 'ph-nuclei', 'THEORETICAL');
      add('ev-x-stars', -1.36e10, 'Clouds collapse; whether stars ignite is not computed here', 'ph-fusion', 'SPECULATIVE');
      add('ev-x-noplanet', EARTH_FORMS, 'No rocky planet forms around the young Sun', 'ph-nuclei', 'THEORETICAL');
    }
    if (k.iceDensity > 1 && ctx.phys.planet) add('ev-x-fill', -4.3e9, 'Polar basins fill with sunken ice for the first time', 'ph-icefill', 'SPECULATIVE');
    if (k.moon === 0 && ctx.phys.planet) {
      const r = makeRng(w.seed ^ 0x51);
      add('ev-x-tilt1', -2.1e9 + r.int(0, 3e8), `The axis swings to ${r.int(55, 80)} degrees; climate belts trade places`, 'ph-wobble', 'SPECULATIVE');
      add('ev-x-tilt2', -4.3e8 + r.int(0, 6e7), `The axis swings back to ${r.int(8, 30)} degrees`, 'ph-wobble', 'SPECULATIVE');
    }
    if (ctx.clim && ctx.clim.runaway) add('ev-x-boil', -3.6e9, 'The oceans boil into the sky', 'cl-runaway', 'SPECULATIVE');
    if (ctx.clim && ctx.clim.snowball) add('ev-x-freeze', -4.0e9, 'Ice reaches the equator and stays', 'cl-snowball', 'THEORETICAL');
    if (!k.medFlood) add('ev-x-salt', -5.0e6, 'The Mediterranean basin stays dry; salt piles kilometres deep', 'ph-med', 'THEORETICAL');
    if (!k.impact && !ctx.bio.observers) add('ev-x-reign', -1e6, 'Dinosaurs still hold every large land niche', 'bi-dinos', 'SPECULATIVE');
    if (k.generic && ctx.bio.observers) {
      const g = k.generic, y = w.spec.year;
      const T = GENERIC_EVENTS[g.domain] || GENERIC_EVENTS.society;
      T.forEach((title, i) => add(`ev-x-g${i + 1}`, Math.min(HORIZON_YEAR - 5, y + [40, 160, 420][i]), title, i ? `ev-x-g${i}` : 'ev-dv', 'SPECULATIVE'));
    }
    if (k.unity > 0.3 && ctx.bio.observers && w.spec.eventId === 'rome') add('ev-x-endure', 600, 'A western empire still rules from Italy to Britain', 'ev-dv', 'SPECULATIVE');
    if (k.popFactor > 1.15 && ctx.bio.observers && w.spec.eventId === 'plague') add('ev-x-crowd', 1400, 'Europe passes 100 million people a century early', 'ev-dv', 'SPECULATIVE');

    events.sort((a, b) => a.year - b.year || (a.kind === 'divergence' ? -1 : 1));
    // eras from what happened
    const eras = buildEras(events, w, ctx);
    const n = events.filter((e) => e.kind !== 'inherited').length;
    return {
      summary: `${events.length} events on the record, ${n} of them after the divergence; ${removed.length} of ours do not happen.`,
      items: [], events, removed, eras, tech: ladder,
    };
  },

  technology(w, ctx, stages) {
    if (!ctx.bio.observers) return { pruned: 'No toolmakers, so there is no technology to move.', items: [] };
    const ladder = stages.history.tech;
    const evIds = new Set(stages.history.events.map((e) => e.id));
    const rows = TECH.map((t) => {
      const l = ladder[t.id];
      return { id: 'tk-' + t.id, tech: t.id, name: t.name, ours: t.year, theirs: l.theirs, delta: l.theirs == null ? null : l.theirs - t.year, cause: evIds.has('ev-' + t.id) ? 'ev-' + t.id : (l.cause || 'dv'), inherited: !!l.inherited };
    });
    const moved = rows.filter((r) => r.theirs == null || r.delta);
    const items = moved.slice(0, 8).map((r) => (Object.assign({
      id: r.id, cause: r.cause, ladder: 'SPECULATIVE', origin: 'engine',
      text: r.theirs == null ? `${cap(r.name)} never arrives (ours ${fmtYear(r.ours)}).` : `${cap(r.name)} arrives in ${fmtYear(r.theirs)}, ${Math.abs(r.delta)} years ${r.delta < 0 ? 'earlier' : 'later'} than ours.`,
    }, r.theirs == null || Math.abs(r.delta) >= 100 ? { ours: `${cap(r.name)} in ${fmtYear(r.ours)}.`, theirs: r.theirs == null ? `${cap(r.name)} never arrives.` : `${cap(r.name)} in ${fmtYear(r.theirs)}.` } : {})));
    const never = rows.filter((r) => r.theirs == null).length;
    return {
      summary: moved.length ? `${moved.length} of ${rows.length} inventions move${never ? `, ${never} never arrive` : ''}. Shifts pass down the ladder at 70% strength and no invention comes before what it is built on.` : 'Every invention arrives when it did in ours.',
      items, ladder: rows,
    };
  },

  culture(w, ctx) {
    if (!ctx.bio.observers || !ctx.ter) return { pruned: 'No people, so no culture.', items: [] };
    const items = runRules('culture', w.knobs, ctx);
    return { summary: items[0] ? items[0].text : `${ctx.geo.peoples.length} peoples, each shaped by where it settled.`, items, peoples: ctx.geo.peoples };
  },

  contrast(w, ctx, stages) {
    const all = STAGE_ORDER.flatMap((s) => (stages[s] && stages[s].items) || []).filter((i) => i.ours);
    const pick = [];
    const seenStage = new Set();
    for (const it of all) { const st = it.id.split('-')[0]; if (!seenStage.has(st)) { pick.push(it); seenStage.add(st); } }
    for (const it of all) { if (pick.length >= 6) break; if (!pick.includes(it)) pick.push(it); }
    const removed = (stages.history && stages.history.removed) || [];
    const items = pick.slice(0, 6).map((it) => ({ id: 'ct-' + it.id, ours: it.ours, theirs: it.theirs || it.text, text: it.theirs || it.text, cause: it.id, ladder: it.ladder, src: it.src, origin: 'engine' }));
    if (items.length < 6 && removed.length) {
      const r = removed.find((x) => x.base && !/b-earth/.test(x.base)) || removed[0];
      items.push({ id: 'ct-' + r.id, ours: `${r.title} (${fmtYear(r.year)}).`, theirs: `It does not happen: ${r.why}.`, text: `It does not happen: ${r.why}.`, cause: r.cause || 'dv', ladder: 'THEORETICAL', origin: 'engine' });
    }
    return { summary: items.length ? `${items.length} differences a visitor from our world would notice first.` : 'No difference reaches the surface.', items };
  },
};

const GENERIC_EVENTS = {
  science: ['Learning compounds sooner; scholars cite the change within a generation', 'Instruments improve a generation early', 'The change is taught as the start of a new science'],
  war: ['The balance of power shifts along new lines', 'Borders settle where the change left them', 'A generation later, the alliances that follow look nothing like ours'],
  religion: ['Calendars and law follow a different creed', 'Pilgrim roads move with the new holy places', 'The creed outlasts the state that adopted it'],
  trade: ['Exchange networks widen early', 'Credit and coinage follow the new routes', 'Ports that were minor in ours become capitals'],
  disease: ['Population follows a different curve', 'Labour and land change price', 'Medicine organises around the change'],
  climate: ['Harvests fail or flourish on new lines', 'People move toward the better land', 'Settlement maps redraw within a century'],
  politics: ['Power changes hands on a different date', 'Institutions form around the new order', 'The new order becomes the default of its region'],
  exploration: ['Coasts are charted earlier', 'Contact between distant peoples comes sooner', 'Maps of the world fill in a generation ahead of ours'],
  society: ['Daily life reorganises around the change', 'Its effects reach law and custom', 'It outlives the generation that made it'],
};

function buildEras(events, w, ctx) {
  const find = (re) => events.find((e) => re.test(e.base || e.id));
  const marks = [
    { at: Math.min(EARTH_FORMS - (ctx.phys.planet ? 0 : 9.3e9), events.length ? events[0].year : 0), name: ctx.phys.planet ? 'Formation' : 'The Cooling' },
    find(/b-life/) && { at: find(/b-life/).year, name: 'The Microbial Ages' },
    find(/b-cambrian/) && { at: find(/b-cambrian/).year, name: 'The Animal Ages' },
    find(/b-homo/) && { at: find(/b-homo/).year, name: 'The Toolmakers' },
    find(/b-agri|ev-agriculture/) && { at: find(/b-agri|ev-agriculture/).year, name: 'The Fields' },
    events.find((e) => e.id === 'ev-printing') && { at: events.find((e) => e.id === 'ev-printing').year, name: 'The Press and the Engine' },
    events.find((e) => e.id === 'ev-transistor') && { at: events.find((e) => e.id === 'ev-transistor').year, name: 'The Signal' },
  ].filter(Boolean).sort((a, b) => a.at - b.at);
  return marks.map((m, i) => ({
    id: 'er-' + (i + 1), name: m.name,
    start: m.at, end: i < marks.length - 1 ? marks[i + 1].at : HORIZON_YEAR,
  }));
}

/* ---------- context: the computation every stage shares ---------- */
export function buildContext(w) {
  const k = w.knobs;
  const phys = computePhysics(k);
  const qmap = new Map(phys.quantities.map((q) => [q.id, q]));
  const base = baseStats(w.seed);
  const longTerm = w.specs.every((s) => s.scope === 'history' || s.year <= -1e6);
  let clim = null, ter = null, seaShift = 0;
  if (phys.planet) {
    // long-term changes get the weathering thermostat; later sudden ones act on its result
    const longSpecs = w.specs.filter((s) => s.scope !== 'history' && s.year <= -1e6);
    if (k.solar >= 1.1) clim = runClimate({ ...k, longTerm: false });
    else if (longTerm || !longSpecs.length) clim = runClimate({ ...k, longTerm: true });
    else {
      const lk = composeKnobs(BASE_KNOBS, longSpecs);
      const c0 = runClimate({ ...lk, longTerm: true });
      clim = runClimate({ ...k, co2ppm: k.co2ppm !== EARTH.co2ppm ? k.co2ppm : c0.co2, longTerm: false });
    }
    ter = buildTerrain(w.seed, k, clim);
    if (k.iceDensity > 1 && !clim.snowball) {
      seaShift = -ter.stats.frozenOceanFrac * EARTH.oceanDepthKm * 1000 * (1 - EARTH.waterDensity / k.iceDensity);
      ter = buildTerrain(w.seed, k, clim, { seaShiftM: seaShift });
    }
    if (clim.runaway) ter = buildTerrain(w.seed, k, clim, { noOceans: true });
  }
  const any = phys.planet && !(clim && clim.runaway);
  const complex = any && !(clim && clim.snowball) && k.o2Frac >= 0.05;
  let observers = complex && phys.observersPossible;
  if (observers && !k.impact) observers = makeRng((w.seed ^ 0xd1d0) >>> 0).next() < 0.35;
  const bio = { any, complex, observers };
  const ctx = { k, spec: w.spec, phys, clim, ter, base, seaShift, bio, q: (id) => qmap.get(id), fmtYear, world: w };
  return ctx;
}

/* geography needs the stages before it; computed when geography runs */
export function buildGeo(w, ctx) {
  const k = w.knobs;
  const geo = { settlements: [], routes: [], regions: [], peoples: [], hotCount: 0, hotNames: '' };
  if (!ctx.ter) return geo;
  const nm = namer(w.seed);
  const hab = habitability(ctx.ter, k, { observers: ctx.bio.observers });
  const count = ctx.bio.observers ? Math.round(Math.max(8, Math.min(40, 24 * k.popFactor))) : 0;
  const st = placeSettlements(ctx.ter, hab, count, w.seed, () => nm.town());
  const agri = -9000;
  st.forEach((s, r) => {
    s.founded = Math.round(agri + (r / Math.max(1, st.length - 1)) ** 1.6 * 10500);
    const near = HOTSPOTS.find((h) => Math.hypot((h.lon - s.lon) * Math.cos(s.lat * Math.PI / 180), h.lat - s.lat) < 6.5);
    s.hot = near ? near.name : '';
  });
  geo.settlements = st;
  geo.routes = buildRoutes(ctx.ter, st, k.gFactor);
  st.forEach((s) => { s.frost = ctx.ter.Tw[s.i] < 0; s.river = ctx.ter.acc[s.i] > 18; });
  geo.frost = st.filter((s) => s.frost);
  geo.hotCount = geo.frost.filter((s) => s.hot).length;
  geo.hotNames = [...new Set(geo.frost.filter((s) => s.hot).map((s) => s.hot))].slice(0, 4).join(', ');

  // regions: the large landmasses, labelled with seeded names
  const { W, H } = TERRAIN_GRID;
  const comp = new Int32Array(W * H).fill(-1);
  const sizes = [];
  for (let i = 0; i < W * H; i++) {
    if (ctx.ter.water[i] || comp[i] >= 0) continue;
    const id = sizes.length; let n = 0, sx = 0, sy = 0, cx = 0;
    const q = [i]; comp[i] = id;
    while (q.length) {
      const j = q.pop(); n++; const x = j % W, y = (j / W) | 0; sy += y;
      cx += Math.cos((x / W) * 2 * Math.PI); sx += Math.sin((x / W) * 2 * Math.PI);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        const jj = yy * W + ((x + dx + W) % W);
        if (!ctx.ter.water[jj] && comp[jj] < 0) { comp[jj] = id; q.push(jj); }
      }
    }
    const ang = Math.atan2(sx / n, cx / n); const mx = ((ang / (2 * Math.PI)) * W + W) % W;
    sizes.push({ id, n, x: mx, y: sy / n });
  }
  sizes.sort((a, b) => b.n - a.n);
  const big = sizes.filter((s) => s.n > 900).slice(0, 7);
  geo.regions = big.map((s, i) => {
    const lat = cellLat(Math.round(s.y));
    const ice = lat < -60 ? 'ice' : 'land';
    return { id: 'rg-' + (i + 1), name: ice === 'ice' ? 'The ' + nm.pick(['Standing', 'Long', 'Pale', 'Old']) + ' Ice' : nm.land(), kind: ice === 'ice' ? 'ice sheet' : 'continent', lon: cellLon(Math.round(s.x)), lat, cells: s.n, comp: s.id };
  });
  st.forEach((s) => { const c = comp[s.i]; const r = geo.regions.find((g) => g.comp === c); s.region = r ? r.id : null; });

  // peoples: the four most settled regions
  const counts = geo.regions.map((r) => ({ r, n: st.filter((s) => s.region === r.id).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
  geo.peoples = counts.map(({ r, n }, i) => {
    const towns = st.filter((s) => s.region === r.id);
    const meanT = towns.reduce((a, s) => a + ctx.ter.T[s.i], 0) / towns.length;
    const coast = towns.filter((s) => s.coast).length / towns.length;
    const traits = [];
    traits.push(coast > 0.5 ? 'seafaring' : 'river and road');
    traits.push(meanT < 6 ? 'cold-adapted' : meanT > 22 ? 'heat-adapted' : 'temperate farming');
    if (k.iceDensity > 1) traits.push(towns.some((t) => t.hot) ? 'keepers of hot springs' : 'river-bound');
    if (k.gFactor > 1.1) traits.push('low architecture');
    if (k.moon === 0) traits.push('no lunar calendar');
    if (k.tiltDeg > 45) traits.push('seasonal migrants');
    const nameRoot = r.name.replace(/^The /, '');
    return { id: 'pp-' + (i + 1), name: `the ${nameRoot}${/[aeiou]$/i.test(nameRoot) ? 'ns' : 'i'}`, regionId: r.id, region: r.name, towns: n, traits, text: `${n} of the ${st.length} settlements; mean temperature ${meanT.toFixed(0)} C; ${Math.round(coast * 100)}% of them on a coast.`, cause: 'ge-land', ladder: 'SPECULATIVE', origin: 'engine' };
  });
  return geo;
}

/* ---------- the deterministic weave of one world ---------- */
export function worldId(seed, path) { return 'w' + (hashStr(seed + '|' + path.map((p) => (p.eventId || '') + '~' + p.text).join('|')) >>> 0).toString(36); }

export function newWorld(seed, path, parentWorld = null) {
  const specs = [];
  path.forEach((p, i) => specs.push(classify(p.text, { forkYear: i === 0 ? null : p.year })));
  const knobs = composeKnobs(BASE_KNOBS, specs);
  const w = {
    id: worldId(seed, path), seed, path, specs, spec: specs[specs.length - 1], knobs,
    parentId: parentWorld ? parentWorld.id : null, parentWorld,
    stages: {}, trace: [], origin: {}, name: '', motto: '',
  };
  const nm = namer(hashStr(seed + '|' + path.map((p) => p.text).join('|')));
  w.name = nm.world();
  w.motto = MOTTOS.find(([t]) => t(knobs))[1];
  return w;
}

/* run one stage deterministically, given the context and earlier stages */
export function runStage(id, w, ctx) {
  if (id === 'geography' && !ctx.geo) ctx.geo = buildGeo(w, ctx);
  // rules name their causes by the last item of an earlier stage
  ctx.firstPhys = (w.stages.physics && w.stages.physics.items[0] && w.stages.physics.items[0].id) || 'dv';
  const lastOf = (s) => { const it = w.stages[s] && w.stages[s].items; return it && it.length ? it[it.length - 1].id : null; };
  ctx.lastClim = lastOf('climate') || ctx.firstPhys;
  ctx.lastBio = lastOf('biosphere') || ctx.lastClim;
  if (!ctx.geo && (id === 'history' || id === 'culture' || id === 'contrast')) ctx.geo = buildGeo(w, ctx);
  const out = STAGE_FNS[id](w, ctx, w.stages);
  out.items = (out.items || []).map((it) => ({ ...it, origin: it.origin || 'engine' }));
  // the engine holds itself to rule R8: no claim more certain than its cause
  const lad = new Map([['dv', 'ESTABLISHED']]);
  for (const s of Object.values(w.stages)) { (s.items || []).forEach((i) => lad.set(i.id, i.ladder)); (s.events || []).forEach((e) => lad.set(e.id, e.ladder)); }
  const lower = (x) => { const p = lad.get(x.cause); if (p && LADDER_RANK[x.ladder] < LADDER_RANK[p]) x.ladder = p; lad.set(x.id, x.ladder); };
  out.items.forEach(lower);
  if (out.events) out.events.forEach(lower);
  return out;
}

/* weave every stage with the engine alone (no model) */
export function weave(seed, path, parentWorld = null) {
  const w = newWorld(seed, path, parentWorld);
  const ctx = buildContext(w);
  for (const id of STAGE_ORDER) {
    const t0 = performance.now();
    w.stages[id] = runStage(id, w, ctx);
    w.trace.push({ stage: id, route: 'engine', ms: Math.round(performance.now() - t0), status: w.stages[id].pruned ? 'pruned' : 'done' });
  }
  w.ctx = ctx;
  return w;
}

export { fmtYear, LADDER_RANK };
