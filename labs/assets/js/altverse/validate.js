/* ============================================================
   altverse/validate.js — what a model may add, and the ledger.

   validateStage(): every item a model returns for a stage passes
   these rules in order. A rule either repairs the item (and says
   how) or rejects it (and says why). Nothing a model writes reaches
   the world unchecked; nothing rejected disappears silently.

     R1 shape      types, lengths, no markup
     R2 ladder     one of the four tags (repair: SPECULATIVE)
     R3 cause      names an id that exists upstream (repair: re-link)
     R4 order      causes before effects, in stage order and in time
     R5 dates      an event sits after the branch point, before 2100
     R6 physics    any number it states matches the computed quantity
     R7 axioms     it does not contradict what the divergence fixed
     R8 certainty  never more certain than its cause (repair: lower)
     R9 novelty    not a restatement of an item already there
     R10 source    ESTABLISHED only with a source of record; a model line
                   has none, so it is lowered to THEORETICAL
   Every rejection and repair names the field path it concerns.

   ledger(): the same rules run over the finished world, engine and
   model items alike, plus cross-checks between independent parts of
   the engine (the terrain's tallest peak against the 1/g law).
   ============================================================ */

import { STAGE_ORDER, STAGE_BY_ID, LADDER, LADDER_RANK, LIMITS, HORIZON_YEAR, EARTH } from './config.js';
import { TECH } from './lexicon.js';

const clean = (s, max) => String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3));
function jaccard(a, b) { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return n / (A.size + B.size - n); }
const negated = (text, idx, len = 0) => /\b(no|not|never|without|cannot|can't|isn't|aren't|nor|none|absent|lack|lacks)\b[^.]{0,22}$/i.test(text.slice(Math.max(0, idx - 40), idx))
  || /^[^.]{0,28}\b(never|cannot|can't|no longer|does not|do not|is not|are not|stops?|fails?)\b/i.test(text.slice(idx + len, idx + len + 40));

/* ---- R6: numbers a model may state, checked against the world ---- */
function physicsChecks(w) {
  const k = w.knobs, ctx = w.ctx;
  const out = [];
  out.push({ name: 'surface gravity', re: /(\d+(?:\.\d+)?)\s*m\s*\/\s*s(?:2|²|\^2)/gi, want: EARTH.g * k.gFactor, tol: 0.12, unit: 'm/s2' });
  out.push({ name: 'speed of light', re: /(\d[\d,]*(?:\.\d+)?)\s*(?:km\/s|kilomet(?:er|re)s per second)/gi, near: /light|\bc\b/i, want: EARTH.cKms * k.cFactor, tol: 0.12, unit: 'km/s' });
  out.push({ name: 'day length', re: /(\d+(?:\.\d+)?)[- ]hours?[- ]days?|days? (?:of|lasts?|is) (?:about |around )?(\d+(?:\.\d+)?) hours/gi, want: k.dayHours, tol: 0.15, unit: 'h' });
  out.push({ name: 'axial tilt', re: /(?:tilt|obliquity)[^.]{0,30}?(\d+(?:\.\d+)?)\s*(?:°|degrees?)/gi, want: k.tiltDeg, tol: 0.12, unit: 'deg', moonless: k.moon === 0 });
  if (ctx && ctx.clim) out.push({ name: 'global mean temperature', re: /(?:global|mean|average)[^.]{0,30}?(-?\d+(?:\.\d+)?)\s*(?:°\s?C|degrees C|C\b)/gi, want: ctx.clim.Tmean, tolAbs: 4, unit: 'C' });
  if (k.gFactor !== 1) out.push({ name: 'surface pressure', re: /(\d+(?:\.\d+)?)\s*(?:bar|atm)\b/gi, want: EARTH.pressureBar * k.gFactor, tol: 0.2, unit: 'bar' });
  out.push({ name: 'fine-structure constant', re: /1\s*\/\s*(\d+(?:\.\d+)?)/g, near: /alpha|fine[- ]structure/i, want: EARTH.alphaInv / k.alphaFactor, tol: 0.08, unit: '1/alpha' });
  return out;
}

export function checkPhysics(text, w) {
  for (const c of physicsChecks(w)) {
    if (c.near && !c.near.test(text)) continue;
    if (c.moonless) continue;   // a Moonless world's tilt wanders: any value is possible over time
    c.re.lastIndex = 0;
    let m;
    while ((m = c.re.exec(text))) {
      const v = Number(String(m[1] || m[2]).replace(/,/g, ''));
      if (!Number.isFinite(v)) continue;
      const bad = c.tolAbs != null ? Math.abs(v - c.want) > c.tolAbs : Math.abs(v - c.want) / Math.max(1e-9, Math.abs(c.want)) > c.tol;
      if (bad) return `states ${c.name} ${v} ${c.unit}; this world computes ${Number(c.want.toPrecision(3))}`;
    }
  }
  return null;
}

/* ---- R7: what the divergence fixed ---- */
function axioms(w) {
  const k = w.knobs, ctx = w.ctx || {};
  const bio = ctx.bio || {};
  const list = [];
  if (k.iceDensity > 1) list.push({ re: /\bice\b[^.]{0,25}\bfloat|\bfloating ice|\b(beneath|under) (the |a )?(lake |sea |river )?ice\b|ice[- ]covered lakes?/i, why: 'ice sinks in this world' });
  if (k.moon === 0) list.push({ re: /\b(moon|moons|moonlight|moonlit|moonrise|lunar)\b/i, why: 'this world has no Moon' });
  if (ctx.phys && !ctx.phys.planet) list.push({ re: /\b(water|oceans?|seas?|life|living|organisms?|plants?|animals?|carbon|oxygen|rock|soil)\b/i, why: 'no carbon, oxygen or water exist here', stages: ['climate', 'geography', 'history', 'technology', 'culture'] });
  if (ctx.phys && ctx.phys.planet && !bio.observers) list.push({ re: /\b(people|humans?|cities|city|civili[sz]ations?|empires?|kingdoms?|farm(s|ing|ers)?|villages?)\b/i, why: 'no toolmakers live here', stages: ['history', 'technology', 'culture', 'contrast', 'geography'] });
  if (ctx.clim && ctx.clim.runaway) list.push({ re: /\b(oceans? (cover|teem|fill)|rainforests?|seas teem|lush)\b/i, why: 'the oceans are gone' });
  if (ctx.clim && ctx.clim.snowball) list.push({ re: /\b(forests?|grasslands?|savannas?|meadows?|rainforests?)\b/i, why: 'ice covers the whole surface' });
  // direction of the climate: a line may not warm a world the climate stage computes colder, or the reverse
  if (ctx.clim && !ctx.clim.runaway && ctx.clim.Tmean < 12.5) list.push({ re: /\b(warmer|warming|hotter|heats? up|melts? away|less ice|reduced albedo|lower albedo|temperature (increase|rise)s?|rising temperatures?)\b/i, why: `the climate stage computes a colder world (mean ${ctx.clim.Tmean.toFixed(1)} C against our 14.5)`, stages: ['physics', 'climate', 'biosphere', 'geography'] });
  if (ctx.clim && !ctx.clim.runaway && ctx.clim.Tmean > 16.5) list.push({ re: /\b(colder|cooler|cooling|ice age|glaciation spreads|more ice)\b/i, why: `the climate stage computes a warmer world (mean ${ctx.clim.Tmean.toFixed(1)} C against our 14.5)`, stages: ['physics', 'climate', 'biosphere', 'geography'] });
  if (ctx.ter && ctx.ter.sea < -20) list.push({ re: /\b(sea[- ]level (rise|rises|rising)|rising seas?|seas? rise|flooded coasts?)\b/i, why: `sea level here stands ${Math.round(-ctx.ter.sea)} m lower than ours` });
  if (ctx.ter && ctx.ter.sea > 20) list.push({ re: /\b(sea[- ]level (falls?|drops?|lower)|falling seas?|exposed shelves)\b/i, why: `sea level here stands ${Math.round(ctx.ter.sea)} m higher than ours` });
  if (k.iceDensity > 1) list.push({ re: /\b((no|lack of|without) ((seasonal|sea|winter) )+ice|(no|lack of|without) ice cover(age)?|ice[- ]free (polar )?seas?|year[- ]round (open|liquid) (polar )?(water|seas?))\b/i, why: 'seas that freeze here keep their ice and fill solid' });
  // what the divergence left alone may not be claimed to change
  if (k.dayHours === 24 && k.moon !== 0) list.push({ re: /\b((faster|slower|more rapid|rapid|quicker) (rotation|spin)|longer days|shorter days|days? (grows?|becomes?) (longer|shorter)|day length (changes|increases|decreases|grows|shrinks))\b/i, why: 'the day here is 24 hours, as in ours' });
  if (k.moon === 1 && k.moonDist === 1) list.push({ re: /\b((more extreme|extreme|larger|stronger|higher|weaker|smaller|lower) tid(es|al ranges?)|tid(es|al ranges?) (grow|rise|increase|weaken|shrink))\b/i, why: 'tides here are as in ours' });
  if (k.tiltDeg === 23.44 && k.moon !== 0) list.push({ re: /\b((more|less) extreme seasons|(axial )?tilt (changes|increases|decreases|shifts))\b/i, why: 'the axial tilt here is 23.4 degrees, as in ours' });
  if (!k.impact) list.push({ re: /\bmammals? (dominate|rule|took over|inherit)/i, why: 'the impact never happened, dinosaurs keep the land' });
  if (k.o2Frac < 0.15) list.push({ re: /\b(fires?|burn(s|ing|ed)?|smelt(s|ing|ed)?|forges?|kilns?|furnaces?|cook(s|ing|ed)?)\b/i, why: 'fire cannot burn below 15% oxygen', stages: ['history', 'technology', 'culture'] });
  if (k.gFactor > 1.1) list.push({ re: /\b(skyscrapers?|towering forests?|giant trees)\b/i, why: 'gravity caps how tall things stand' });
  return list;
}

export function checkAxioms(text, w, stage) {
  for (const a of axioms(w)) {
    if (a.stages && !a.stages.includes(stage)) continue;
    const m = a.re.exec(text);
    if (m && !negated(text, m.index, m[0].length)) return `contradicts the divergence: ${a.why} ("${m[0]}")`;
  }
  return null;
}

/* every id in the world, with the stage it belongs to and its year */
export function indexWorld(w) {
  const idx = new Map();
  idx.set('dv', { stage: 'divergence', year: w.spec.year, ladder: 'ESTABLISHED' });
  for (const s of STAGE_ORDER) {
    const st = w.stages[s]; if (!st) continue;
    (st.items || []).forEach((it) => idx.set(it.id, { stage: s, ladder: it.ladder, year: null, text: it.text }));
    if (s === 'history') (st.events || []).forEach((e) => idx.set(e.id, { stage: s, ladder: e.ladder, year: e.year, text: e.title }));
    if (s === 'technology') (st.ladder || []).forEach((r) => { if (!idx.has(r.id)) idx.set(r.id, { stage: s, ladder: 'SPECULATIVE', year: r.theirs }); });
  }
  return idx;
}

const stageRank = (s) => STAGE_ORDER.indexOf(s);
function upstreamOf(stage) {
  const out = new Set([stage]);
  const walk = (s) => STAGE_BY_ID[s].deps.forEach((d) => { if (!out.has(d)) { out.add(d); walk(d); } });
  walk(stage);
  return out;
}
function defaultCause(w, stage) {
  for (const d of STAGE_BY_ID[stage].deps.slice().reverse()) {
    const it = w.stages[d] && w.stages[d].items;
    if (it && it.length) return it[it.length - 1].id;
  }
  return 'dv';
}

/**
 * validateStage(stage, raw, w) -> { patch, accepted, rejected, repaired }
 * raw: what the model returned for this stage (already parsed JSON).
 */
export function validateStage(stage, raw, w) {
  const rejected = [], repaired = [], accepted = [];
  const st = w.stages[stage];
  const patch = { items: [], events: [], names: {}, summary: null };
  if (!raw || typeof raw !== 'object') { rejected.push({ rule: 'R1 shape', reason: 'not a JSON object', item: String(raw).slice(0, 80) }); return { patch, accepted, rejected, repaired }; }
  if (st && st.pruned) {
    const n = (raw.add || raw.events || raw.items || []).length;
    if (n || raw.summary) rejected.push({ rule: 'R7 axioms', reason: `stage pruned: ${st.pruned}`, item: clean(raw.summary || JSON.stringify(raw.add || raw.events || []), 120) });
    return { patch, accepted, rejected, repaired };
  }
  const idx = indexWorld(w);
  const up = upstreamOf(stage);
  const existing = [...idx.values()].map((v) => v.text || '').filter(Boolean);
  const divYear = w.spec.year;

  // summary
  if (raw.summary != null) {
    const s = clean(raw.summary, LIMITS.summary);
    const why = !s ? 'empty' : checkPhysics(s, w) || checkAxioms(s, w, stage);
    if (why) rejected.push({ rule: !s ? 'R1 shape' : /states/.test(why) ? 'R6 physics' : 'R7 axioms', reason: why, item: s || '(empty)' });
    else patch.summary = s;
  }

  const list = stage === 'history' ? (Array.isArray(raw.events) ? raw.events : []) : stage === 'contrast' ? (Array.isArray(raw.items) ? raw.items : []) : (Array.isArray(raw.add) ? raw.add : []);
  const max = stage === 'history' ? LIMITS.eventsAdded : stage === 'contrast' ? LIMITS.contrastItems : LIMITS.addPerStage;
  if (list.length > max) rejected.push({ rule: 'R1 shape', reason: `${list.length - max} item(s) over the limit of ${max}`, item: '(trimmed)' });
  const prefix = { physics: 'ph', climate: 'cl', biosphere: 'bi', geography: 'ge', history: 'ev', technology: 'tk', culture: 'pp', contrast: 'ct' }[stage];
  let n = (st && st.modelCount) || 0;

  const listKey = stage === 'history' ? 'events' : stage === 'contrast' ? 'items' : 'add';
  let pos = -1;
  for (const rawIt of list.slice(0, max)) {
    pos++;
    const at = `${stage}.${listKey}[${pos}]`;
    if (!rawIt || typeof rawIt !== 'object') { rejected.push({ rule: 'R1 shape', at, reason: 'item is not an object', item: String(rawIt).slice(0, 80) }); continue; }
    const badType = ['text', 'title', 'ours', 'theirs', 'cause', 'ladder'].find((k) => rawIt[k] != null && typeof rawIt[k] !== 'string') || (stage === 'history' && rawIt.year != null && typeof rawIt.year !== 'number' && !/^-?\d+$/.test(String(rawIt.year)) ? 'year' : null);
    if (badType) { rejected.push({ rule: 'R1 shape', at: `${at}.${badType}`, reason: `${badType} has the wrong type (${typeof rawIt[badType]})`, item: JSON.stringify(rawIt).slice(0, 100) }); continue; }
    const text = clean(stage === 'contrast' ? rawIt.theirs : rawIt.text, LIMITS.text);
    const title = clean(rawIt.title, LIMITS.title);
    const ours = clean(rawIt.ours, LIMITS.text);
    const show = title || text;
    if (!show || (stage === 'history' && !title) || (stage === 'contrast' && !ours)) { rejected.push({ rule: 'R1 shape', at, reason: stage === 'history' ? 'event needs a title' : stage === 'contrast' ? 'needs ours and theirs' : 'empty text', item: JSON.stringify(rawIt).slice(0, 100) }); continue; }
    const notes = [];
    let ladder = String(rawIt.ladder || '').toUpperCase().trim();
    if (!LADDER.includes(ladder)) { notes.push({ rule: 'R2 ladder', note: `"${rawIt.ladder || ''}" is not a tag; set to SPECULATIVE` }); ladder = 'SPECULATIVE'; }

    let cause = clean(rawIt.cause, 40);
    const c = idx.get(cause);
    if (!c) { const to = defaultCause(w, stage); notes.push({ rule: 'R3 cause', note: `"${cause || 'none'}" does not exist; linked to ${to}` }); cause = to; }
    else if (!up.has(c.stage) || stageRank(c.stage) > stageRank(stage)) { const to = defaultCause(w, stage); notes.push({ rule: 'R4 order', note: `${cause} is downstream of ${stage}; linked to ${to}` }); cause = to; }

    let year = null;
    if (stage === 'history') {
      year = Math.round(Number(rawIt.year));
      if (!Number.isFinite(year)) { rejected.push({ rule: 'R5 dates', at, reason: 'no numeric year', item: show }); continue; }
      if (year < divYear) { rejected.push({ rule: 'R5 dates', at, reason: `dated ${year}, before the branch point (${Math.round(divYear)}); the past before it is fixed`, item: show }); continue; }
      if (year > HORIZON_YEAR) { rejected.push({ rule: 'R5 dates', at, reason: `dated ${year}, after the ${HORIZON_YEAR} horizon`, item: show }); continue; }
      const cy = idx.get(cause) && idx.get(cause).year;
      if (cy != null && cy > year) { rejected.push({ rule: 'R4 order', at, reason: `its cause ${cause} happens in ${Math.round(cy)}, after it`, item: show }); continue; }
    }
    const phys = checkPhysics(`${title} ${text}`, w);   // the 'ours' half describes our world, not this one
    if (phys) { rejected.push({ rule: 'R6 physics', at, reason: phys, item: show }); continue; }
    const ax = checkAxioms(`${title} ${text}`, w, stage);
    if (ax) { rejected.push({ rule: 'R7 axioms', at, reason: ax, item: show }); continue; }
    const pl = idx.get(cause) ? idx.get(cause).ladder : null;
    if (pl && LADDER_RANK[ladder] < LADDER_RANK[pl]) { notes.push({ rule: 'R8 certainty', note: `${ladder} is more certain than its cause (${pl}); lowered to ${pl}` }); ladder = pl; }
    if (ladder === 'ESTABLISHED') { notes.push({ rule: 'R10 source', note: 'ESTABLISHED needs a source of record and a model line carries none; set to THEORETICAL' }); ladder = 'THEORETICAL'; }
    const dup = existing.find((e) => jaccard(e, show) > 0.6);
    if (dup) { rejected.push({ rule: 'R9 novelty', at, reason: `restates "${dup.slice(0, 60)}"`, item: show }); continue; }
    existing.push(show);

    n++;
    const id = `${prefix}-m${n}`;
    const it = stage === 'history'
      ? { id, year, title, text, cause, ladder, kind: 'model', origin: 'model' }
      : stage === 'contrast' ? { id, ours, theirs: text, text, cause, ladder, origin: 'model' }
      : { id, text, cause, ladder, origin: 'model' };
    if (stage === 'history') patch.events.push(it); else patch.items.push(it);
    accepted.push(it);
    notes.forEach((x) => repaired.push({ ...x, at, item: show, id }));
    idx.set(id, { stage, ladder, year, text: show });
  }

  // names the model may give
  const nameOk = (s) => /^[A-Za-z][A-Za-z' -]{1,23}$/.test(s);
  const nameList = stage === 'geography' ? raw.regions : stage === 'culture' ? raw.peoples : null;
  if (Array.isArray(nameList)) {
    const own = stage === 'geography' ? (st.regions || []) : (st.peoples || []);
    nameList.slice(0, 8).forEach((r) => {
      if (!r || !own.some((o) => o.id === r.id)) { rejected.push({ rule: 'R3 cause', reason: `names "${r && r.id}", which is not a ${stage === 'geography' ? 'region' : 'people'} of this world`, item: clean(r && r.name, 30) }); return; }
      const nm = clean(r.name, LIMITS.name);
      if (!nameOk(nm)) { rejected.push({ rule: 'R1 shape', reason: 'a name is 2 to 24 letters', item: nm || '(empty)' }); return; }
      const why = checkAxioms(`${nm} ${clean(r.text, LIMITS.text)}`, w, stage);
      if (why) { rejected.push({ rule: 'R7 axioms', reason: why, item: nm }); return; }
      patch.names[r.id] = { name: nm, text: clean(r.text, LIMITS.text) };
    });
  }
  return { patch, accepted, rejected, repaired, count: n };
}

/* the world's own name, from a batched or final call */
export function validateName(raw, w) {
  const out = { rejected: [] };
  if (!raw) return out;
  const nm = clean(raw.name, 18).toUpperCase();
  if (nm && /^[A-Z][A-Z' -]{2,17}$/.test(nm) && !checkAxioms(nm, w, 'culture')) out.name = nm;
  else if (raw.name) out.rejected.push({ rule: 'R1 shape', reason: 'a world name is 3 to 18 letters', item: clean(raw.name, 30) });
  const mo = clean(raw.motto, 80);
  if (mo && !checkAxioms(mo, w, 'culture') && !checkPhysics(mo, w)) out.motto = mo;
  else if (raw.motto) out.rejected.push({ rule: 'R7 axioms', reason: checkAxioms(mo, w, 'culture') || 'motto failed a check', item: mo });
  return out;
}

/* ---- the consistency ledger over a finished world ---- */
export function ledger(w) {
  const checks = [];
  const add = (rule, ok, note) => checks.push({ rule, status: ok ? 'pass' : 'flag', note });
  const idx = indexWorld(w);
  const all = [];
  STAGE_ORDER.forEach((s) => { const st = w.stages[s]; if (!st) return; (st.items || []).forEach((i) => all.push({ ...i, stage: s })); if (s === 'history') (st.events || []).forEach((e) => all.push({ ...e, stage: s })); });

  const ids = all.map((i) => i.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  add('ids unique', dupIds.length === 0, dupIds.length ? `duplicate: ${[...new Set(dupIds)].join(', ')}` : `${ids.length} items`);

  const dangling = all.filter((i) => i.cause && !idx.has(i.cause));
  add('every cause resolves', dangling.length === 0, dangling.length ? dangling.map((d) => `${d.id} <- ${d.cause}`).slice(0, 4).join('; ') : `${all.filter((i) => i.cause).length} links`);

  const backwards = all.filter((i) => { const c = idx.get(i.cause); return c && stageRank(c.stage) > stageRank(i.stage); });
  add('causes upstream of effects', backwards.length === 0, backwards.length ? backwards.map((d) => `${d.id} <- ${d.cause}`).slice(0, 4).join('; ') : 'stage order holds');

  const ev = (w.stages.history && w.stages.history.events) || [];
  const late = ev.filter((e) => { const c = idx.get(e.cause); return c && c.year != null && c.year > e.year + 0.5; });
  add('causes before effects in time', late.length === 0, late.length ? late.map((e) => `${e.id} (${Math.round(e.year)}) <- ${e.cause}`).slice(0, 4).join('; ') : `${ev.length} events`);

  const sorted = ev.every((e, i) => i === 0 || ev[i - 1].year <= e.year);
  const range = ev.every((e) => e.year <= HORIZON_YEAR);
  add('dates in order, before 2100', sorted && range, sorted && range ? `${ev.length} events` : 'out of order or past the horizon');

  const eras = (w.stages.history && w.stages.history.eras) || [];
  add('eras ordered, no overlap', eras.every((e, i) => e.end >= e.start && (i === 0 || eras[i - 1].end <= e.start + 0.5)), `${eras.length} eras`);

  const infl = all.filter((i) => { const c = idx.get(i.cause); return c && c.ladder && i.ladder && LADDER_RANK[i.ladder] < LADDER_RANK[c.ladder]; });
  add('no claim more certain than its cause', infl.length === 0, infl.length ? infl.map((i) => `${i.id} ${i.ladder} <- ${i.cause} ${idx.get(i.cause).ladder}`).slice(0, 3).join('; ') : 'ladder holds');

  const tech = (w.stages.history && w.stages.history.tech) || {};
  const techBad = TECH.filter((t) => tech[t.id] && tech[t.id].theirs != null && t.deps.some((d) => !tech[d] || tech[d].theirs == null || tech[d].theirs > tech[t.id].theirs));
  add('no invention before what it needs', techBad.length === 0, techBad.length ? techBad.map((t) => t.id).join(', ') : `${TECH.filter((t) => tech[t.id] && tech[t.id].theirs != null).length} dated inventions`);

  const modelText = all.filter((i) => i.origin === 'model');
  const physBad = modelText.map((i) => ({ i, why: checkPhysics(`${i.title || ''} ${i.text || ''}`, w) })).filter((x) => x.why);
  add('stated numbers match the physics', physBad.length === 0, physBad.length ? physBad[0].why : `${modelText.length} model items checked`);

  const ctx = w.ctx;
  if (ctx && ctx.ter && w.knobs.gFactor !== 1) {
    const law = EARTH.everestKm / w.knobs.gFactor, map = ctx.ter.stats.maxElev / 1000;
    add('map peak against the 1/g law', Math.abs(map - law) / law < 0.15, `terrain ${map.toFixed(2)} km, law ${law.toFixed(2)} km`);
  }
  if (ctx && ctx.ter && w.knobs.iceDensity > 1) {
    const want = -ctx.ter.stats.frozenOceanFrac * 3680 * (1 - 1 / w.knobs.iceDensity);
    add('sea level against frozen ocean volume', Math.abs(ctx.ter.sea - (w.knobs.seaLevelM || 0) - ctx.seaShift) < 1 && Math.abs(ctx.seaShift - want) < 25, `map ${Math.round(ctx.ter.sea)} m, volume estimate ${Math.round(want)} m (frozen share measured before the shift)`);
  }
  const regionIds = new Set(((w.stages.geography && w.stages.geography.regions) || []).map((r) => r.id));
  const peoples = (w.stages.culture && w.stages.culture.peoples) || [];
  const setts = (w.stages.geography && w.stages.geography.settlements) || [];
  const strayP = peoples.filter((p) => !regionIds.has(p.regionId));
  add('peoples live in regions on the map', strayP.length === 0, strayP.length ? strayP.map((p) => `${p.name} in ${p.regionId}`).join('; ') : `${peoples.length} peoples, ${regionIds.size} regions exist`);

  const inEra = ev.filter((e) => !eras.some((er) => e.year >= er.start - 0.5 && e.year <= er.end + 0.5));
  add('every event lies inside an era', inEra.length === 0 || !eras.length, inEra.length ? inEra.slice(0, 3).map((e) => `${e.id} (${Math.round(e.year)})`).join('; ') : `${ev.length} events in ${eras.length} eras`);

  const untagged = all.filter((i) => !LADDER.includes(i.ladder));
  add('every claim carries a tag', untagged.length === 0, untagged.length ? untagged.slice(0, 3).map((i) => i.id).join(', ') : `${all.length} claims tagged`);

  const unsourced = all.filter((i) => i.ladder === 'ESTABLISHED' && i.origin !== 'model' && !i.src && i.id !== 'dv' && i.id !== 'ev-dv' && i.kind !== 'divergence');
  const modelEst = all.filter((i) => i.ladder === 'ESTABLISHED' && i.origin === 'model');
  add('ESTABLISHED claims cite a source', unsourced.length === 0 && modelEst.length === 0, unsourced.length || modelEst.length ? [...unsourced, ...modelEst].slice(0, 3).map((i) => i.id).join(', ') : 'each has a source of record');

  const reach = (id) => { let c = id, g = 0; while (c && g++ < 20) { if (c === 'dv') return true; const n = idx.get(c); if (!n) return false; const it = all.find((x) => x.id === c); c = it ? it.cause : null; } return false; };
  const ct = (w.stages.contrast && w.stages.contrast.items) || [];
  const orphan = ct.filter((c) => !reach(c.cause));
  add('every contrast traces back to the divergence', orphan.length === 0, orphan.length ? orphan.map((c) => c.id).join(', ') : `${ct.length} contrasts`);

  const contra = all.map((i) => ({ i, why: checkAxioms(`${i.title || ''} ${i.text || ''}`, w, i.stage) })).filter((x) => x.why && x.i.id !== 'dv');
  add('no claim contradicts the divergence', contra.length === 0, contra.length ? `${contra[0].i.id}: ${contra[0].why}` : `${all.length} claims read against ${axioms(w).length} fixed facts`);

  const pruned = STAGE_ORDER.filter((s) => w.stages[s] && w.stages[s].pruned);
  add('pruned stages hold nothing', pruned.every((s) => !(w.stages[s].items || []).length), pruned.length ? `pruned: ${pruned.join(', ')}` : 'no stage pruned');

  return { checks, passed: checks.filter((c) => c.status === 'pass').length, total: checks.length };
}
